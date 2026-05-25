import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { Readable } from "node:stream"

import { getCurrentUser } from "@/lib/auth"
import { EvolutionApiError, EvolutionConfigError } from "@/lib/evolution-api"
import {
  deleteWhatsAppMessageForEveryone,
  editWhatsAppMessage,
  getWhatsAppChatMessages,
  getWhatsAppChatSnapshot,
  getWhatsAppMediaFile,
  hideWhatsAppConversationForMe,
  hideWhatsAppMessageForMe,
  markWhatsAppConversationAsRead,
  restoreWhatsAppMessageForMe,
  sendWhatsAppReaction,
  sendWhatsAppChatMedia,
  sendWhatsAppChatText,
  toggleWhatsAppMessageFavorite,
  toggleWhatsAppMessagePin,
  updateWhatsAppContactBlockStatus,
  WhatsAppChatError,
} from "@/lib/evolution-whatsapp-chat"
import {
  type WhatsAppChatMessage,
  type WhatsAppMediaPayload,
} from "@/lib/evolution-whatsapp-chat-types"

type ChatAction =
  | "clear-conversation-for-me"
  | "delete-for-everyone"
  | "delete-for-me"
  | "delete-message"
  | "edit-message"
  | "mark-read"
  | "restore-message-for-me"
  | "send-media"
  | "send-reaction"
  | "send-text"
  | "toggle-favorite"
  | "toggle-pin"
  | "update-block-status"

type ChatActionRequest = {
  action?: ChatAction
  caption?: string
  instanceName?: string
  media?: WhatsAppMediaPayload
  message?: WhatsAppChatMessage
  blocked?: boolean
  pinDurationHours?: number
  quoted?: WhatsAppChatMessage | null
  reaction?: string
  remoteJid?: string
  text?: string
}

const DEFAULT_CHAT_MESSAGE_PAGE_SIZE = 120
const MAX_CHAT_MESSAGE_PAGE_SIZE = 200

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return Response.json({ message: "Nao autenticado." }, { status: 401 })
  }

  const url = new URL(request.url)

  try {
    if (url.searchParams.get("mode") === "messages") {
      const instanceName = url.searchParams.get("instanceName")
      const remoteJid = url.searchParams.get("remoteJid")
      const limit = normalizeMessageLimit(url.searchParams.get("limit"))
      const messages = await getWhatsAppChatMessages({
        beforeId: url.searchParams.get("beforeId"),
        beforeOrderKey: normalizeMessageOrderKey(
          url.searchParams.get("beforeOrderKey")
        ),
        beforeTimestamp: normalizeMessageCursorTimestamp(
          url.searchParams.get("beforeTimestamp")
        ),
        instanceName,
        limit,
        remoteJid,
        user: currentUser,
      })

      return Response.json({
        selected: {
          hasMore: messages.length >= limit,
          instanceName,
          messages,
          remoteJid,
        },
      })
    }

    if (url.searchParams.get("mode") === "media") {
      const media = await getWhatsAppMediaFile({
        instanceName: url.searchParams.get("instanceName"),
        messageId: url.searchParams.get("messageId"),
        mimetype: url.searchParams.get("mimetype"),
        user: currentUser,
      })

      return createMediaFileResponse(media, {
        ifNoneMatch: request.headers.get("if-none-match"),
        range: request.headers.get("range"),
      })
    }

    const snapshot = await getWhatsAppChatSnapshot({
      instanceName: url.searchParams.get("instanceName"),
      remoteJid: url.searchParams.get("remoteJid"),
      user: currentUser,
    })

    return Response.json(snapshot)
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request) {
  let body: ChatActionRequest

  try {
    body = (await request.json()) as ChatActionRequest
  } catch {
    return Response.json(
      {
        error: "invalid_json",
        message: "Corpo da requisicao invalido.",
      },
      { status: 400 }
    )
  }

  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return Response.json({ message: "Nao autenticado." }, { status: 401 })
  }

  try {
    if (body.action === "send-text") {
      await sendWhatsAppChatText({
        instanceName: body.instanceName ?? "",
        quoted: body.quoted ?? null,
        remoteJid: body.remoteJid ?? "",
        text: body.text ?? "",
      })
    } else if (body.action === "send-media") {
      if (!body.media) {
        throw new WhatsAppChatError("Selecione um arquivo.")
      }

      await sendWhatsAppChatMedia({
        caption: body.caption ?? "",
        instanceName: body.instanceName ?? "",
        media: body.media,
        quoted: body.quoted ?? null,
        remoteJid: body.remoteJid ?? "",
      })
    } else if (body.action === "send-reaction") {
      if (!body.message) {
        throw new WhatsAppChatError("Selecione uma mensagem.")
      }

      await sendWhatsAppReaction({
        instanceName: body.instanceName ?? "",
        message: body.message,
        reaction: body.reaction ?? "",
      })
    } else if (body.action === "edit-message") {
      if (!body.message) {
        throw new WhatsAppChatError("Selecione uma mensagem.")
      }

      await editWhatsAppMessage({
        instanceName: body.instanceName ?? "",
        message: body.message,
        text: body.text ?? "",
      })
    } else if (body.action === "clear-conversation-for-me") {
      await hideWhatsAppConversationForMe({
        instanceName: body.instanceName ?? "",
        remoteJid: body.remoteJid ?? "",
        user: currentUser,
      })
    } else if (body.action === "mark-read") {
      await markWhatsAppConversationAsRead({
        instanceName: body.instanceName ?? "",
        remoteJid: body.remoteJid ?? "",
        user: currentUser,
      })
    } else if (body.action === "delete-for-me") {
      if (!body.message) {
        throw new WhatsAppChatError("Selecione uma mensagem.")
      }

      await hideWhatsAppMessageForMe({
        message: body.message,
        user: currentUser,
      })
    } else if (body.action === "restore-message-for-me") {
      if (!body.message) {
        throw new WhatsAppChatError("Selecione uma mensagem.")
      }

      await restoreWhatsAppMessageForMe({
        message: body.message,
        user: currentUser,
      })
    } else if (
      body.action === "delete-for-everyone" ||
      body.action === "delete-message"
    ) {
      if (!body.message) {
        throw new WhatsAppChatError("Selecione uma mensagem.")
      }

      await deleteWhatsAppMessageForEveryone({
        instanceName: body.instanceName ?? "",
        message: body.message,
      })
    } else if (body.action === "toggle-favorite") {
      if (!body.message) {
        throw new WhatsAppChatError("Selecione uma mensagem.")
      }

      await toggleWhatsAppMessageFavorite({
        message: body.message,
        user: currentUser,
      })
    } else if (body.action === "toggle-pin") {
      if (!body.message) {
        throw new WhatsAppChatError("Selecione uma mensagem.")
      }

      await toggleWhatsAppMessagePin({
        durationHours: body.pinDurationHours ?? 168,
        message: body.message,
        user: currentUser,
      })
    } else if (body.action === "update-block-status") {
      await updateWhatsAppContactBlockStatus({
        blocked: Boolean(body.blocked),
        instanceName: body.instanceName ?? "",
        remoteJid: body.remoteJid ?? "",
      })
    } else {
      throw new WhatsAppChatError("Acao de chat nao reconhecida.", 400)
    }

    await sleep(400)

    const snapshot = await getWhatsAppChatSnapshot({
      instanceName: body.instanceName ?? body.message?.instanceName,
      remoteJid: body.remoteJid ?? body.message?.remoteJid,
      user: currentUser,
    })

    return Response.json({ snapshot })
  } catch (error) {
    return toErrorResponse(error)
  }
}

function normalizeMessageLimit(value?: string | null) {
  const numeric = Number(value)

  if (!Number.isFinite(numeric)) {
    return DEFAULT_CHAT_MESSAGE_PAGE_SIZE
  }

  return Math.max(
    20,
    Math.min(MAX_CHAT_MESSAGE_PAGE_SIZE, Math.floor(numeric))
  )
}

function normalizeMessageCursorTimestamp(value?: string | null) {
  if (!value) {
    return null
  }

  const numeric = Number(value)

  if (Number.isFinite(numeric)) {
    return Math.floor(numeric)
  }

  const parsed = Date.parse(value)

  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null
}

function normalizeMessageOrderKey(value?: string | null) {
  return typeof value === "string" && /^\(\d+,\d+\)$/.test(value) ? value : null
}

function toErrorResponse(error: unknown) {
  if (error instanceof WhatsAppChatError) {
    return Response.json(
      {
        error: "whatsapp_chat_error",
        message: error.message,
      },
      { status: error.status }
    )
  }

  if (error instanceof EvolutionConfigError) {
    return Response.json(
      {
        error: "missing_evolution_config",
        message: error.message,
      },
      { status: 500 }
    )
  }

  if (error instanceof EvolutionApiError) {
    return Response.json(
      {
        error: "evolution_api_error",
        message: error.message,
      },
      { status: error.status || 502 }
    )
  }

  return Response.json(
    {
      error: "unexpected_error",
      message: "Nao foi possivel processar o chat do WhatsApp.",
    },
    { status: 500 }
  )
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function createMediaFileResponse(
  media: Awaited<ReturnType<typeof getWhatsAppMediaFile>>,
  requestHeaders: {
    ifNoneMatch: string | null
    range: string | null
  }
) {
  const fileStat = await stat(media.filePath)
  const byteLength = fileStat.size
  const range = parseByteRange(requestHeaders.range, byteLength)
  const headers = createMediaHeaders(media, byteLength)

  if (!range && requestHeaders.ifNoneMatch === `"${media.sha256}"`) {
    return new Response(null, {
      headers,
      status: 304,
    })
  }

  if (range) {
    headers.set("Content-Length", String(range.end - range.start + 1))
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${byteLength}`)

    return new Response(
      Readable.toWeb(
        createReadStream(media.filePath, {
          end: range.end,
          start: range.start,
        })
      ) as ReadableStream,
      {
        headers,
        status: 206,
      }
    )
  }

  headers.set("Content-Length", String(byteLength))

  return new Response(
    Readable.toWeb(createReadStream(media.filePath)) as ReadableStream,
    {
      headers,
    }
  )
}

function createMediaHeaders(
  media: Awaited<ReturnType<typeof getWhatsAppMediaFile>>,
  byteLength: number
) {
  return new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=31536000, immutable",
    "Content-Disposition": contentDisposition(media.fileName),
    "Content-Type": media.mimetype,
    ETag: `"${media.sha256}"`,
    "X-WhatsApp-Media-Cache": media.cacheStatus,
    "X-WhatsApp-Media-Length": String(byteLength),
  })
}

function parseByteRange(rangeHeader: string | null, byteLength: number) {
  if (!rangeHeader?.startsWith("bytes=") || byteLength <= 0) {
    return null
  }

  const [startText, endText] = rangeHeader.replace("bytes=", "").split("-")
  const start = startText ? Number(startText) : 0
  const end = endText ? Number(endText) : byteLength - 1

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= byteLength
  ) {
    return null
  }

  return {
    end: Math.min(end, byteLength - 1),
    start,
  }
}

function contentDisposition(fileName: string) {
  const safeName = fileName.replace(/["\\\r\n]/g, "_")

  return `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}
