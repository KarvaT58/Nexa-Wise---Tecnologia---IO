import { getCurrentUser } from "@/lib/auth"
import { EvolutionApiError, EvolutionConfigError } from "@/lib/evolution-api"
import {
  createWhatsAppGroup,
  getWhatsAppGroupsSnapshot,
  sendWhatsAppChatText,
  updateWhatsAppGroupDetails,
  updateWhatsAppGroupParticipants,
  WhatsAppChatError,
} from "@/lib/evolution-whatsapp-chat"

type GroupsAction =
  | "create"
  | "send-text"
  | "update-details"
  | "update-participants"

type GroupsActionRequest = {
  action?: GroupsAction
  description?: string
  groupJid?: string
  instanceName?: string
  participantAction?: "add" | "demote" | "promote" | "remove"
  participants?: string[]
  subject?: string
  text?: string
}

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return Response.json({ message: "Nao autenticado." }, { status: 401 })
  }

  try {
    return Response.json(await getWhatsAppGroupsSnapshot(currentUser))
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request) {
  let body: GroupsActionRequest

  try {
    body = (await request.json()) as GroupsActionRequest
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
    if (body.action === "create") {
      await createWhatsAppGroup({
        description: body.description ?? "",
        instanceName: body.instanceName ?? "",
        participants: body.participants ?? [],
        subject: body.subject ?? "",
      })
    } else if (body.action === "send-text") {
      await sendWhatsAppChatText({
        instanceName: body.instanceName ?? "",
        remoteJid: body.groupJid ?? "",
        text: body.text ?? "",
      })
    } else if (body.action === "update-details") {
      await updateWhatsAppGroupDetails({
        addParticipants: body.participants ?? [],
        description: body.description ?? "",
        groupJid: body.groupJid ?? "",
        instanceName: body.instanceName ?? "",
        subject: body.subject ?? "",
      })
    } else if (body.action === "update-participants") {
      await updateWhatsAppGroupParticipants({
        action: body.participantAction ?? "add",
        groupJid: body.groupJid ?? "",
        instanceName: body.instanceName ?? "",
        participants: body.participants ?? [],
      })
    } else {
      throw new WhatsAppChatError("Acao de grupos nao reconhecida.", 400)
    }

    await sleep(500)

    return Response.json({
      snapshot: await getWhatsAppGroupsSnapshot(currentUser),
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}

function toErrorResponse(error: unknown) {
  if (error instanceof WhatsAppChatError) {
    return Response.json(
      {
        error: "whatsapp_groups_error",
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
      message: "Nao foi possivel processar grupos do WhatsApp.",
    },
    { status: 500 }
  )
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
