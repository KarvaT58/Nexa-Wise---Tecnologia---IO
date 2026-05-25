import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"

import { type CurrentUser } from "@/lib/auth"
import {
  EvolutionApiError,
  EvolutionConfigError,
} from "@/lib/evolution-api"
import { getEvolutionContactsSnapshot } from "@/lib/evolution-contacts"
import { type EvolutionContact } from "@/lib/evolution-contacts-types"
import {
  type WhatsAppChatMessage,
  type WhatsAppChatSnapshot,
  type WhatsAppConversation,
  type WhatsAppGroup,
  type WhatsAppGroupParticipant,
  type WhatsAppGroupsSnapshot,
  type WhatsAppMediaPayload,
} from "@/lib/evolution-whatsapp-chat-types"
import { prisma } from "@/lib/prisma"

type JsonRecord = Record<string, unknown>

type EvolutionConfig = {
  baseUrl: string
  apiKey: string
}

type CommandResult = {
  stdout: string
  stderr: string
}

type DatabaseConversationRow = {
  chatName?: string | null
  contactProfilePicUrl?: string | null
  contactPushName?: string | null
  instanceName: string
  lastKey?: JsonRecord | null
  lastMessage?: JsonRecord | null
  lastMessageAt?: number | null
  lastMessageId?: string | null
  lastMessageStatus?: string | null
  lastMessageType?: string | null
  lastPushName?: string | null
  remoteJid: string
  unreadMessages?: number | null
  updatedAt?: string | null
}

type DatabaseMessageRow = {
  id: string
  instanceName: string
  key?: JsonRecord | null
  message?: JsonRecord | null
  messageTimestamp?: number | null
  messageType?: string | null
  orderKey?: string | null
  participant?: string | null
  pushName?: string | null
  remoteJid?: string | null
  status?: string | null
}

type DatabaseMediaSourceRow = {
  id: string
  instanceName: string
  key?: JsonRecord | null
  message?: JsonRecord | null
  messageType?: string | null
  remoteJid?: string | null
}

type WhatsAppMediaCacheRow = {
  byteLength: number
  fileName: string | null
  id: string
  mediaType: string | null
  messageId: string
  mimetype: string
  remoteJid: string | null
  sha256: string
  source: string
  storagePath: string
}

type WhatsAppCachedMediaFile = {
  byteLength: number
  cacheStatus: "hit" | "miss"
  fileName: string
  filePath: string
  mediaType: string
  mimetype: string
  sha256: string
}

type WhatsAppMediaSource = {
  fileName: string | null
  key?: JsonRecord | null
  mediaType: string
  message?: JsonRecord | null
  mimetype: string | null
  remoteJid: string | null
  thumbnail: string | null
  url: string | null
}

type DatabaseGroupRow = {
  instanceName: string
  name?: string | null
  profilePicUrl?: string | null
  remoteJid: string
  unreadMessages?: number | null
  updatedAt?: string | null
}

type FavoriteRow = {
  createdAt: Date | string
  keyId: string | null
  messageId: string
}

type PinRow = {
  createdAt: Date | string
  expiresAt: Date | string
  keyId: string | null
  messageId: string
}

type HiddenMessageRow = {
  keyId: string | null
  messageId: string
}

type ConversationReadMarkerRow = {
  instanceName: string
  lastReadAt?: Date | string | null
  lastReadMessageAt?: Date | string | null
  remoteJid: string
}

type ConversationUnreadCountRow = {
  instanceName: string
  remoteJid: string
  unreadCount: number | string
}

const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000
const DEFAULT_CHAT_MESSAGE_PAGE_SIZE = 120
const MAX_CHAT_MESSAGE_PAGE_SIZE = 200
const REALTIME_WEBHOOK_EVENTS = [
  "MESSAGES_SET",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "MESSAGES_DELETE",
  "SEND_MESSAGE",
  "CHATS_SET",
  "CHATS_UPSERT",
  "CHATS_UPDATE",
  "CHATS_DELETE",
  "CONTACTS_SET",
  "CONTACTS_UPSERT",
  "CONTACTS_UPDATE",
  "PRESENCE_UPDATE",
  "CONNECTION_UPDATE",
  "CALL",
] as const
const configuredRealtimeWebhookInstances = new Set<string>()

export class WhatsAppChatError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "WhatsAppChatError"
    this.status = status
  }
}

export async function getWhatsAppChatSnapshot({
  instanceName,
  remoteJid,
  user,
}: {
  instanceName?: string | null
  remoteJid?: string | null
  user: CurrentUser
}): Promise<WhatsAppChatSnapshot> {
  const contactsSnapshot = await getEvolutionContactsSnapshot({
    userId: user.email,
  })
  const instances = contactsSnapshot.instances
  const instanceNames = instances.map((instance) => instance.instanceName)
  const rows = await fetchDatabaseConversations(instanceNames).catch(() => [])
  const contactMaps = createContactMaps(contactsSnapshot.contacts)
  const normalizedConversations = normalizeConversations(rows, instances, contactMaps)
  const conversations = await applyConversationReadMarkers(
    normalizedConversations,
    user.id
  ).catch(() => normalizedConversations)
  const selectedConversation =
    conversations.find(
      (conversation) =>
        conversation.instanceName === instanceName &&
        conversation.remoteJid === remoteJid
    ) ??
    conversations[0] ??
    null
  const messages = selectedConversation
    ? await fetchDatabaseMessages({
        instanceName: selectedConversation.instanceName,
        remoteJid: selectedConversation.remoteJid,
      }).catch(() => [])
    : []
  const visibleMessages = await filterHiddenMessages(messages, user.id)
  const messagesWithFavorites = await applyFavoriteFlags(visibleMessages, user.id)
  const messagesWithFlags = await applyPinFlags(messagesWithFavorites, user.id)

  return {
    contacts: contactsSnapshot.contacts,
    conversations,
    instances,
    selected: selectedConversation
      ? {
          instanceName: selectedConversation.instanceName,
          hasMore: messages.length >= DEFAULT_CHAT_MESSAGE_PAGE_SIZE,
          messages: messagesWithFlags,
          remoteJid: selectedConversation.remoteJid,
        }
      : null,
    totals: {
      contacts: conversations.filter(
        (conversation) => conversation.kind === "contact"
      ).length,
      conversations: conversations.length,
      groups: conversations.filter((conversation) => conversation.kind === "group")
        .length,
      instances: instances.length,
      unread: conversations.reduce(
        (sum, conversation) => sum + conversation.unreadMessages,
        0
      ),
    },
    updatedAt: new Date().toISOString(),
  }
}

export async function getWhatsAppChatMessages({
  beforeId,
  beforeOrderKey,
  beforeTimestamp,
  instanceName,
  limit,
  remoteJid,
  user,
}: {
  beforeId?: string | null
  beforeOrderKey?: string | null
  beforeTimestamp?: number | null
  instanceName?: string | null
  limit?: number | null
  remoteJid?: string | null
  user: CurrentUser
}) {
  if (!instanceName || !remoteJid) {
    throw new WhatsAppChatError("Selecione uma conversa.")
  }

  const messages = await fetchDatabaseMessages({
    beforeId,
    beforeOrderKey,
    beforeTimestamp,
    instanceName,
    limit,
    remoteJid,
  }).catch(() => [])

  const visibleMessages = await filterHiddenMessages(messages, user.id)

  return applyPinFlags(await applyFavoriteFlags(visibleMessages, user.id), user.id)
}

export async function getWhatsAppMediaFile({
  instanceName,
  messageId,
  mimetype,
  user,
}: {
  instanceName?: string | null
  messageId?: string | null
  mimetype?: string | null
  user: CurrentUser
}) {
  if (!instanceName || !messageId) {
    throw new WhatsAppChatError("Selecione uma midia.")
  }

  const cached = await getCachedWhatsAppMedia({
    instanceName,
    messageId,
    userId: user.id,
  })

  if (cached) {
    return cached
  }

  const source = await fetchDatabaseMediaSource({
    instanceName,
    messageId,
  }).catch(() => null)
  const resolved = await fetchWhatsAppMediaFromEvolution({
    instanceName,
    messageId,
    mimetype: source?.mimetype ?? mimetype,
    source,
  })
  const normalized = normalizeCachedMedia({
    buffer: resolved.buffer,
    fileName: source?.fileName,
    mediaType: source?.mediaType,
    messageId,
    mimetype: resolved.mimetype,
  })
  const saved = await saveWhatsAppMediaCache({
    byteLength: normalized.buffer.byteLength,
    buffer: normalized.buffer,
    fileName: normalized.fileName,
    instanceName,
    mediaType: normalized.mediaType,
    messageId,
    mimetype: normalized.mimetype,
    remoteJid: source?.remoteJid ?? null,
    sha256: normalized.sha256,
    source: resolved.source,
    sourceUrl: resolved.sourceUrl ?? source?.url ?? null,
    userId: user.id,
  })

  return {
    ...saved,
    cacheStatus: "miss" as const,
  }
}

export async function ensureWhatsAppRealtimeWebhooks({
  user,
}: {
  user: CurrentUser
}) {
  const contactsSnapshot = await getEvolutionContactsSnapshot({
    userId: user.email,
  })

  await Promise.all(
    contactsSnapshot.instances.map((instance) =>
      ensureRealtimeWebhook(instance.instanceName).catch(() => undefined)
    )
  )
}

export async function getWhatsAppGroupsSnapshot(
  user: CurrentUser
): Promise<WhatsAppGroupsSnapshot> {
  const contactsSnapshot = await getEvolutionContactsSnapshot({
    userId: user.email,
  })
  const contactMaps = createContactMaps(contactsSnapshot.contacts)
  const apiGroups = await Promise.all(
    contactsSnapshot.instances.map((instance) =>
      fetchEvolutionGroups(instance.instanceName)
        .then((groups) =>
          groups.map((group) => normalizeApiGroup(group, instance, contactMaps))
        )
        .catch(() => [])
    )
  )
  const databaseGroups = await fetchDatabaseGroups(
    contactsSnapshot.instances.map((instance) => instance.instanceName)
  ).catch(() => [])
  const groupsByKey = new Map<string, WhatsAppGroup>()

  for (const group of apiGroups.flat()) {
    groupsByKey.set(makeScopedKey(group.instanceName, group.id), group)
  }

  for (const group of normalizeDatabaseGroups(
    databaseGroups,
    contactsSnapshot.instances,
    contactMaps
  )) {
    const key = makeScopedKey(group.instanceName, group.id)
    const current = groupsByKey.get(key)

    groupsByKey.set(key, current ? { ...group, ...current } : group)
  }

  const groups = [...groupsByKey.values()].sort(compareGroups)

  return {
    contacts: contactsSnapshot.contacts,
    groups,
    instances: contactsSnapshot.instances,
    totals: {
      announcement: groups.filter((group) => group.announce).length,
      groups: groups.length,
      instances: contactsSnapshot.instances.length,
      participants: groups.reduce((sum, group) => sum + group.size, 0),
      restricted: groups.filter((group) => group.restrict).length,
    },
    updatedAt: new Date().toISOString(),
  }
}

export async function sendWhatsAppChatText({
  instanceName,
  remoteJid,
  quoted,
  text,
}: {
  instanceName: string
  remoteJid: string
  quoted?: WhatsAppChatMessage | null
  text: string
}) {
  const trimmedText = text.trim()

  if (!instanceName || !remoteJid) {
    throw new WhatsAppChatError("Selecione uma conversa.")
  }

  if (!trimmedText) {
    throw new WhatsAppChatError("Digite a mensagem.")
  }

  return sendEvolutionTextMessage({
    instanceName,
    number: remoteJid,
    quoted,
    text: trimmedText,
  })
}

export async function sendWhatsAppChatMedia({
  caption,
  instanceName,
  media,
  quoted,
  remoteJid,
}: {
  caption?: string
  instanceName: string
  media: WhatsAppMediaPayload
  quoted?: WhatsAppChatMessage | null
  remoteJid: string
}) {
  if (!instanceName || !remoteJid) {
    throw new WhatsAppChatError("Selecione uma conversa.")
  }

  if (!media.media) {
    throw new WhatsAppChatError("Selecione um arquivo.")
  }

  if (media.mediatype === "audio") {
    return sendEvolutionAudioMessage({
      audio: normalizeMediaPayload(media.media),
      instanceName,
      number: remoteJid,
      quoted,
    })
  }

  return sendEvolutionMediaMessage({
    caption: caption?.trim() ?? "",
    fileName: media.fileName,
    instanceName,
    media: normalizeMediaPayload(media.media),
    mediatype: media.mediatype,
    mimetype: media.mimetype,
    number: remoteJid,
    quoted,
  })
}

export async function sendWhatsAppReaction({
  instanceName,
  message,
  reaction,
}: {
  instanceName: string
  message: Pick<WhatsAppChatMessage, "fromMe" | "id" | "keyId" | "remoteJid">
  reaction: string
}) {
  if (!instanceName || !message.remoteJid || !message.id) {
    throw new WhatsAppChatError("Selecione uma mensagem.")
  }

  return evolutionRequest(
    `/message/sendReaction/${encodeURIComponent(instanceName)}`,
    {
      method: "POST",
      body: JSON.stringify({
        key: {
          fromMe: message.fromMe,
          id: message.keyId ?? message.id,
          remoteJid: message.remoteJid,
        },
        reaction,
      }),
    }
  )
}

export async function editWhatsAppMessage({
  instanceName,
  message,
  text,
}: {
  instanceName: string
  message: Pick<
    WhatsAppChatMessage,
    "fromMe" | "id" | "keyId" | "remoteJid" | "timestamp"
  >
  text: string
}) {
  const trimmedText = text.trim()

  if (!instanceName || !message.remoteJid || !message.id) {
    throw new WhatsAppChatError("Selecione uma mensagem.")
  }

  if (!message.fromMe) {
    throw new WhatsAppChatError(
      "Apenas mensagens enviadas por voce podem ser editadas.",
      400
    )
  }

  if (!trimmedText) {
    throw new WhatsAppChatError("Digite a nova mensagem.")
  }

  if (!canEditMessage(message)) {
    throw new WhatsAppChatError(
      "O prazo para editar esta mensagem acabou.",
      400
    )
  }

  const pathName = `/chat/updateMessage/${encodeURIComponent(instanceName)}`
  const payload = {
    key: {
      fromMe: true,
      id: message.keyId ?? message.id,
      remoteJid: message.remoteJid,
    },
    number: message.remoteJid.includes("@g.us")
      ? message.remoteJid
      : jidToNumber(message.remoteJid),
    text: trimmedText,
  }

  try {
    return await evolutionRequest(pathName, {
      method: "POST",
      body: JSON.stringify(payload),
    })
  } catch (error) {
    if (!isRetryableEvolutionShapeError(error)) {
      throw error
    }

    return evolutionRequest(pathName, {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        number: message.remoteJid,
      }),
    })
  }
}

export async function toggleWhatsAppMessageFavorite({
  message,
  user,
}: {
  message: Pick<
    WhatsAppChatMessage,
    "id" | "instanceName" | "keyId" | "remoteJid"
  >
  user: CurrentUser
}) {
  if (!message.instanceName || !message.remoteJid || !message.id) {
    throw new WhatsAppChatError("Selecione uma mensagem.")
  }

  const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`
SELECT id
FROM "WhatsAppMessageFavorite"
WHERE "userId" = ${quoteSqlLiteral(user.id)}
  AND "instanceName" = ${quoteSqlLiteral(message.instanceName)}
  AND "remoteJid" = ${quoteSqlLiteral(message.remoteJid)}
  AND (
    "messageId" = ${quoteSqlLiteral(message.id)}
    ${message.keyId ? `OR "messageId" = ${quoteSqlLiteral(message.keyId)}` : ""}
    ${message.keyId ? `OR "keyId" = ${quoteSqlLiteral(message.keyId)}` : ""}
    OR "keyId" = ${quoteSqlLiteral(message.id)}
  )
LIMIT 1
`)

  if (existing[0]) {
    await prisma.$executeRawUnsafe(`
DELETE FROM "WhatsAppMessageFavorite"
WHERE id = ${quoteSqlLiteral(existing[0].id)}
`)

    return { isFavorite: false }
  }

  await prisma.$executeRawUnsafe(`
INSERT INTO "WhatsAppMessageFavorite" (
  "id",
  "userId",
  "instanceName",
  "remoteJid",
  "messageId",
  "keyId",
  "createdAt"
)
VALUES (
  ${quoteSqlLiteral(randomFavoriteId())},
  ${quoteSqlLiteral(user.id)},
  ${quoteSqlLiteral(message.instanceName)},
  ${quoteSqlLiteral(message.remoteJid)},
  ${quoteSqlLiteral(message.id)},
  ${message.keyId ? quoteSqlLiteral(message.keyId) : "NULL"},
  CURRENT_TIMESTAMP
)
ON CONFLICT ("userId", "instanceName", "remoteJid", "messageId") DO NOTHING
`)

  return { isFavorite: true }
}

export async function toggleWhatsAppMessagePin({
  durationHours,
  message,
  user,
}: {
  durationHours: number
  message: Pick<
    WhatsAppChatMessage,
    "id" | "instanceName" | "keyId" | "remoteJid"
  >
  user: CurrentUser
}) {
  if (!message.instanceName || !message.remoteJid || !message.id) {
    throw new WhatsAppChatError("Selecione uma mensagem.")
  }

  const hours = normalizePinDurationHours(durationHours)

  await prisma.$executeRawUnsafe(`
DELETE FROM "WhatsAppMessagePin"
WHERE "userId" = ${quoteSqlLiteral(user.id)}
  AND "expiresAt" <= CURRENT_TIMESTAMP
`)

  const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`
SELECT id
FROM "WhatsAppMessagePin"
WHERE "userId" = ${quoteSqlLiteral(user.id)}
  AND "instanceName" = ${quoteSqlLiteral(message.instanceName)}
  AND "remoteJid" = ${quoteSqlLiteral(message.remoteJid)}
  AND "expiresAt" > CURRENT_TIMESTAMP
  AND (
    "messageId" = ${quoteSqlLiteral(message.id)}
    ${message.keyId ? `OR "messageId" = ${quoteSqlLiteral(message.keyId)}` : ""}
    ${message.keyId ? `OR "keyId" = ${quoteSqlLiteral(message.keyId)}` : ""}
    OR "keyId" = ${quoteSqlLiteral(message.id)}
  )
LIMIT 1
`)

  if (existing[0]) {
    await prisma.$executeRawUnsafe(`
DELETE FROM "WhatsAppMessagePin"
WHERE id = ${quoteSqlLiteral(existing[0].id)}
`)

    return { isPinned: false }
  }

  const activePins = await prisma.$queryRawUnsafe<Array<{ count: string }>>(`
SELECT COUNT(*)::text AS count
FROM "WhatsAppMessagePin"
WHERE "userId" = ${quoteSqlLiteral(user.id)}
  AND "instanceName" = ${quoteSqlLiteral(message.instanceName)}
  AND "remoteJid" = ${quoteSqlLiteral(message.remoteJid)}
  AND "expiresAt" > CURRENT_TIMESTAMP
`)
  const activePinCount = Number(activePins[0]?.count ?? 0)

  if (activePinCount >= 3) {
    throw new WhatsAppChatError(
      "Este chat ja tem 3 mensagens fixadas. Desafixe uma para adicionar outra.",
      400
    )
  }

  await prisma.$executeRawUnsafe(`
INSERT INTO "WhatsAppMessagePin" (
  "id",
  "userId",
  "instanceName",
  "remoteJid",
  "messageId",
  "keyId",
  "expiresAt",
  "createdAt",
  "updatedAt"
)
VALUES (
  ${quoteSqlLiteral(randomPinId())},
  ${quoteSqlLiteral(user.id)},
  ${quoteSqlLiteral(message.instanceName)},
  ${quoteSqlLiteral(message.remoteJid)},
  ${quoteSqlLiteral(message.id)},
  ${message.keyId ? quoteSqlLiteral(message.keyId) : "NULL"},
  CURRENT_TIMESTAMP + (${hours} * INTERVAL '1 hour'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("userId", "instanceName", "remoteJid", "messageId")
DO UPDATE SET
  "keyId" = EXCLUDED."keyId",
  "expiresAt" = EXCLUDED."expiresAt",
  "updatedAt" = CURRENT_TIMESTAMP
`)

  return { isPinned: true }
}

export async function deleteWhatsAppMessageForEveryone({
  instanceName,
  message,
}: {
  instanceName: string
  message: Pick<
    WhatsAppChatMessage,
    "fromMe" | "id" | "keyId" | "participant" | "remoteJid" | "timestamp"
  >
}) {
  if (!instanceName || !message.remoteJid || !message.id) {
    throw new WhatsAppChatError("Selecione uma mensagem.")
  }

  if (!message.fromMe) {
    throw new WhatsAppChatError(
      "Mensagens recebidas podem ser apagadas apenas para voce.",
      400
    )
  }

  if (!canDeleteForEveryone(message)) {
    throw new WhatsAppChatError(
      "O prazo para apagar esta mensagem para todos acabou.",
      400
    )
  }

  return evolutionRequest(
    `/chat/deleteMessageForEveryone/${encodeURIComponent(instanceName)}`,
    {
      method: "DELETE",
      body: JSON.stringify({
        fromMe: message.fromMe,
        id: message.keyId ?? message.id,
        participant: message.participant ?? undefined,
        remoteJid: message.remoteJid,
      }),
    }
  )
}

export async function hideWhatsAppMessageForMe({
  message,
  user,
}: {
  message: Pick<
    WhatsAppChatMessage,
    "id" | "instanceName" | "keyId" | "remoteJid"
  >
  user: CurrentUser
}) {
  if (!message.instanceName || !message.remoteJid || !message.id) {
    throw new WhatsAppChatError("Selecione uma mensagem.")
  }

  await prisma.$executeRawUnsafe(`
INSERT INTO "WhatsAppMessageHidden" (
  "id",
  "userId",
  "instanceName",
  "remoteJid",
  "messageId",
  "keyId",
  "createdAt"
)
VALUES (
  ${quoteSqlLiteral(randomHiddenMessageId())},
  ${quoteSqlLiteral(user.id)},
  ${quoteSqlLiteral(message.instanceName)},
  ${quoteSqlLiteral(message.remoteJid)},
  ${quoteSqlLiteral(message.id)},
  ${message.keyId ? quoteSqlLiteral(message.keyId) : "NULL"},
  CURRENT_TIMESTAMP
)
ON CONFLICT ("userId", "instanceName", "remoteJid", "messageId") DO NOTHING
`)

  return { isHidden: true }
}

export async function restoreWhatsAppMessageForMe({
  message,
  user,
}: {
  message: Pick<
    WhatsAppChatMessage,
    "id" | "instanceName" | "keyId" | "remoteJid"
  >
  user: CurrentUser
}) {
  if (!message.instanceName || !message.remoteJid || !message.id) {
    throw new WhatsAppChatError("Selecione uma mensagem.")
  }

  await prisma.$executeRawUnsafe(`
DELETE FROM "WhatsAppMessageHidden"
WHERE "userId" = ${quoteSqlLiteral(user.id)}
  AND "instanceName" = ${quoteSqlLiteral(message.instanceName)}
  AND "remoteJid" = ${quoteSqlLiteral(message.remoteJid)}
  AND (
    "messageId" = ${quoteSqlLiteral(message.id)}
    ${message.keyId ? `OR "messageId" = ${quoteSqlLiteral(message.keyId)}` : ""}
    ${message.keyId ? `OR "keyId" = ${quoteSqlLiteral(message.keyId)}` : ""}
    OR "keyId" = ${quoteSqlLiteral(message.id)}
  )
`)

  return { isHidden: false }
}

export async function hideWhatsAppConversationForMe({
  instanceName,
  remoteJid,
  user,
}: {
  instanceName: string
  remoteJid: string
  user: CurrentUser
}) {
  if (!instanceName || !remoteJid) {
    throw new WhatsAppChatError("Selecione uma conversa.")
  }

  const messages = await fetchDatabaseMessages({
    instanceName,
    remoteJid,
  }).catch(() => [])

  if (!messages.length) {
    return { hiddenCount: 0 }
  }

  const values = messages
    .filter((message) => message.id)
    .map(
      (message) => `(
  ${quoteSqlLiteral(randomHiddenMessageId())},
  ${quoteSqlLiteral(user.id)},
  ${quoteSqlLiteral(message.instanceName)},
  ${quoteSqlLiteral(message.remoteJid)},
  ${quoteSqlLiteral(message.id)},
  ${message.keyId ? quoteSqlLiteral(message.keyId) : "NULL"},
  CURRENT_TIMESTAMP
)`
    )

  if (!values.length) {
    return { hiddenCount: 0 }
  }

  await prisma.$executeRawUnsafe(`
INSERT INTO "WhatsAppMessageHidden" (
  "id",
  "userId",
  "instanceName",
  "remoteJid",
  "messageId",
  "keyId",
  "createdAt"
)
VALUES ${values.join(",\n")}
ON CONFLICT ("userId", "instanceName", "remoteJid", "messageId") DO NOTHING
`)

  return { hiddenCount: values.length }
}

export async function updateWhatsAppContactBlockStatus({
  blocked,
  instanceName,
  remoteJid,
}: {
  blocked: boolean
  instanceName: string
  remoteJid: string
}) {
  if (!instanceName || !remoteJid) {
    throw new WhatsAppChatError("Selecione uma conversa.")
  }

  if (remoteJid.includes("@g.us")) {
    throw new WhatsAppChatError("Bloqueio so esta disponivel para contatos.", 400)
  }

  return evolutionRequest(
    `/message/updateBlockStatus/${encodeURIComponent(instanceName)}`,
    {
      method: "POST",
      body: JSON.stringify({
        number: jidToNumber(remoteJid),
        status: blocked ? "block" : "unblock",
      }),
    }
  )
}

export async function markWhatsAppConversationAsRead({
  instanceName,
  remoteJid,
  user,
}: {
  instanceName: string
  remoteJid: string
  user: CurrentUser
}) {
  if (!instanceName || !remoteJid) {
    throw new WhatsAppChatError("Selecione uma conversa.")
  }

  const messages = await fetchDatabaseMessages({
    instanceName,
    remoteJid,
  })
  const readMessages = messages
    .filter(
      (message) =>
        !message.fromMe &&
        !message.isDeletedForEveryone &&
        (message.keyId || message.id)
    )
    .slice(-50)
    .map((message) => ({
      fromMe: false,
      id: message.keyId ?? message.id,
      remoteJid: message.remoteJid,
    }))

  const lastIncomingMessage =
    messages.filter((message) => !message.fromMe).at(-1) ?? messages.at(-1) ?? null
  await saveConversationReadMarker({
    instanceName,
    message: lastIncomingMessage,
    remoteJid,
    userId: user.id,
  })

  if (!readMessages.length) {
    return { read: "local" }
  }

  try {
    return await evolutionRequest(
      `/chat/markMessageAsRead/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        body: JSON.stringify({
          readMessages,
        }),
      }
    )
  } catch {
    return { read: "local" }
  }
}

export async function createWhatsAppGroup({
  description,
  instanceName,
  participants,
  subject,
}: {
  description: string
  instanceName: string
  participants: string[]
  subject: string
}) {
  const cleanSubject = subject.trim()
  const cleanParticipants = uniqueClean(participants.map(normalizePhone))

  if (!instanceName) {
    throw new WhatsAppChatError("Selecione uma instancia.")
  }

  if (!cleanSubject) {
    throw new WhatsAppChatError("Informe o nome do grupo.")
  }

  if (!cleanParticipants.length) {
    throw new WhatsAppChatError("Selecione pelo menos um participante.")
  }

  return evolutionRequest(`/group/create/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({
      description: description.trim(),
      participants: cleanParticipants,
      subject: cleanSubject,
    }),
  })
}

export async function updateWhatsAppGroupDetails({
  addParticipants = [],
  description,
  groupJid,
  instanceName,
  subject,
}: {
  addParticipants?: string[]
  description: string
  groupJid: string
  instanceName: string
  subject: string
}) {
  const cleanSubject = subject.trim()

  if (!instanceName || !groupJid) {
    throw new WhatsAppChatError("Selecione um grupo.")
  }

  if (!cleanSubject) {
    throw new WhatsAppChatError("Informe o nome do grupo.")
  }

  await evolutionRequest(
    `/group/updateGroupSubject/${encodeURIComponent(instanceName)}?groupJid=${encodeURIComponent(groupJid)}`,
    {
      method: "POST",
      body: JSON.stringify({ subject: cleanSubject }),
    }
  )

  await evolutionRequest(
    `/group/updateGroupDescription/${encodeURIComponent(instanceName)}?groupJid=${encodeURIComponent(groupJid)}`,
    {
      method: "POST",
      body: JSON.stringify({ description: description.trim() }),
    }
  ).catch((error) => {
    if (error instanceof EvolutionApiError && error.status === 404) {
      return undefined
    }

    throw error
  })

  const cleanParticipants = uniqueClean(addParticipants.map(normalizePhone))

  if (cleanParticipants.length) {
    await updateWhatsAppGroupParticipants({
      action: "add",
      groupJid,
      instanceName,
      participants: cleanParticipants,
    })
  }
}

export async function updateWhatsAppGroupParticipants({
  action,
  groupJid,
  instanceName,
  participants,
}: {
  action: "add" | "remove" | "promote" | "demote"
  groupJid: string
  instanceName: string
  participants: string[]
}) {
  const cleanParticipants = uniqueClean(participants.map(normalizePhone))

  if (!instanceName || !groupJid) {
    throw new WhatsAppChatError("Selecione um grupo.")
  }

  if (!cleanParticipants.length) {
    throw new WhatsAppChatError("Selecione pelo menos um participante.")
  }

  return evolutionRequest(
    `/group/updateParticipant/${encodeURIComponent(instanceName)}?groupJid=${encodeURIComponent(groupJid)}`,
    {
      method: "POST",
      body: JSON.stringify({
        action,
        participants: cleanParticipants,
      }),
    }
  )
}

async function fetchDatabaseConversations(instanceNames: string[]) {
  if (!instanceNames.length) {
    return []
  }

  return runEvolutionJsonQuery<DatabaseConversationRow>(`
WITH chat_rows AS (
SELECT
  inst.name AS "instanceName",
  chat."remoteJid" AS "remoteJid",
  chat.name AS "chatName",
  chat."unreadMessages" AS "unreadMessages",
  chat."updatedAt" AS "updatedAt",
  contact."pushName" AS "contactPushName",
  contact."profilePicUrl" AS "contactProfilePicUrl",
  msg.id AS "lastMessageId",
  msg.key AS "lastKey",
  msg."pushName" AS "lastPushName",
  msg."messageType" AS "lastMessageType",
  msg.message AS "lastMessage",
  msg."messageTimestamp" AS "lastMessageAt",
  COALESCE(msg_update.status, msg.status) AS "lastMessageStatus"
FROM "Chat" chat
JOIN "Instance" inst ON inst.id = chat."instanceId"
LEFT JOIN "Contact" contact
  ON contact."instanceId" = chat."instanceId"
  AND contact."remoteJid" = chat."remoteJid"
LEFT JOIN LATERAL (
  SELECT message.*
  FROM "Message" message
  WHERE message."instanceId" = chat."instanceId"
    AND COALESCE(message."messageType", '') <> 'protocolMessage'
    AND COALESCE(message."messageType", '') <> 'reactionMessage'
    AND NOT (message.message ? 'reactionMessage')
    AND (
      message.key->>'remoteJid' = chat."remoteJid"
      OR message.key->>'remoteJidAlt' = chat."remoteJid"
    )
  ORDER BY message."messageTimestamp" DESC NULLS LAST, message.ctid DESC
  LIMIT 1
) msg ON TRUE
LEFT JOIN LATERAL (
  SELECT mu.status
  FROM "MessageUpdate" mu
  WHERE mu."instanceId" = chat."instanceId"
    AND (
      mu."messageId" = msg.id
      OR mu."keyId" = msg.id
      OR mu."keyId" = msg.key->>'id'
    )
  ORDER BY CASE
    WHEN UPPER(mu.status) IN ('READ', 'PLAYED', 'READ_ACK', 'MESSAGE_READ') THEN 50
    WHEN UPPER(mu.status) IN ('DELIVERY_ACK', 'DELIVERED', 'MESSAGE_DELIVERED') THEN 40
    WHEN UPPER(mu.status) IN ('SERVER_ACK', 'SENT', 'MESSAGE_SENT') THEN 30
    WHEN UPPER(mu.status) IN ('PENDING') THEN 20
    WHEN UPPER(mu.status) IN ('ERROR', 'FAILED') THEN 10
    ELSE 0
  END DESC
  LIMIT 1
) msg_update ON TRUE
WHERE inst.name IN (${instanceNames.map(quoteSqlLiteral).join(", ")})
  AND chat."remoteJid" <> 'status@broadcast'
),
message_rows AS (
SELECT DISTINCT ON (
  inst.name,
  COALESCE(NULLIF(message.key->>'remoteJidAlt', ''), message.key->>'remoteJid')
)
  inst.name AS "instanceName",
  COALESCE(NULLIF(message.key->>'remoteJidAlt', ''), message.key->>'remoteJid') AS "remoteJid",
  NULL::text AS "chatName",
  CASE
    WHEN COALESCE((message.key->>'fromMe')::boolean, false) = false THEN 1
    ELSE 0
  END AS "unreadMessages",
  to_timestamp(message."messageTimestamp") AS "updatedAt",
  contact."pushName" AS "contactPushName",
  contact."profilePicUrl" AS "contactProfilePicUrl",
  message.id AS "lastMessageId",
  message.key AS "lastKey",
  message."pushName" AS "lastPushName",
  message."messageType" AS "lastMessageType",
  message.message AS "lastMessage",
  message."messageTimestamp" AS "lastMessageAt",
  COALESCE(msg_update.status, message.status) AS "lastMessageStatus"
FROM "Message" message
JOIN "Instance" inst ON inst.id = message."instanceId"
LEFT JOIN LATERAL (
  SELECT contact.*
  FROM "Contact" contact
  WHERE contact."instanceId" = message."instanceId"
    AND contact."remoteJid" IN (
      message.key->>'remoteJidAlt',
      message.key->>'remoteJid'
    )
  ORDER BY CASE
    WHEN contact."remoteJid" = message.key->>'remoteJidAlt' THEN 0
    ELSE 1
  END
  LIMIT 1
) contact ON TRUE
LEFT JOIN LATERAL (
  SELECT mu.status
  FROM "MessageUpdate" mu
  WHERE mu."instanceId" = message."instanceId"
    AND (
      mu."messageId" = message.id
      OR mu."keyId" = message.id
      OR mu."keyId" = message.key->>'id'
    )
  ORDER BY CASE
    WHEN UPPER(mu.status) IN ('READ', 'PLAYED', 'READ_ACK', 'MESSAGE_READ') THEN 50
    WHEN UPPER(mu.status) IN ('DELIVERY_ACK', 'DELIVERED', 'MESSAGE_DELIVERED') THEN 40
    WHEN UPPER(mu.status) IN ('SERVER_ACK', 'SENT', 'MESSAGE_SENT') THEN 30
    WHEN UPPER(mu.status) IN ('PENDING') THEN 20
    WHEN UPPER(mu.status) IN ('ERROR', 'FAILED') THEN 10
    ELSE 0
  END DESC
  LIMIT 1
) msg_update ON TRUE
WHERE inst.name IN (${instanceNames.map(quoteSqlLiteral).join(", ")})
  AND COALESCE(NULLIF(message.key->>'remoteJidAlt', ''), message.key->>'remoteJid') IS NOT NULL
  AND COALESCE(NULLIF(message.key->>'remoteJidAlt', ''), message.key->>'remoteJid') <> 'status@broadcast'
  AND COALESCE(message."messageType", '') <> 'protocolMessage'
  AND COALESCE(message."messageType", '') <> 'reactionMessage'
  AND NOT (message.message ? 'reactionMessage')
  AND NOT EXISTS (
    SELECT 1
    FROM "Chat" chat
    WHERE chat."instanceId" = message."instanceId"
      AND chat."remoteJid" IN (
        message.key->>'remoteJid',
        message.key->>'remoteJidAlt'
      )
  )
ORDER BY
  inst.name,
  COALESCE(NULLIF(message.key->>'remoteJidAlt', ''), message.key->>'remoteJid'),
  message."messageTimestamp" DESC NULLS LAST,
  message.ctid DESC
)
SELECT *
FROM (
  SELECT * FROM chat_rows
  UNION ALL
  SELECT * FROM message_rows
) conversations
ORDER BY COALESCE(
  GREATEST(
    COALESCE(to_timestamp(conversations."lastMessageAt"), 'epoch'::timestamptz),
    COALESCE(conversations."updatedAt"::timestamptz, 'epoch'::timestamptz)
  ),
  conversations."updatedAt"::timestamptz,
  to_timestamp(conversations."lastMessageAt")
) DESC NULLS LAST
LIMIT 600
`)
}

function normalizeMessagePageSize(limit?: number | null) {
  if (!Number.isFinite(limit ?? Number.NaN)) {
    return DEFAULT_CHAT_MESSAGE_PAGE_SIZE
  }

  return Math.max(
    20,
    Math.min(MAX_CHAT_MESSAGE_PAGE_SIZE, Math.floor(Number(limit)))
  )
}

function isPostgresTupleId(value?: string | null) {
  return /^\(\d+,\d+\)$/.test(String(value ?? ""))
}

async function fetchDatabaseMessages({
  beforeId,
  beforeOrderKey,
  beforeTimestamp,
  instanceName,
  limit,
  remoteJid,
}: {
  beforeId?: string | null
  beforeOrderKey?: string | null
  beforeTimestamp?: number | null
  instanceName: string
  limit?: number | null
  remoteJid: string
}) {
  const pageSize = normalizeMessagePageSize(limit)
  const cursorTimestamp =
    typeof beforeTimestamp === "number" && Number.isFinite(beforeTimestamp)
      ? Math.floor(beforeTimestamp)
      : null
  const cursorOrderKey = isPostgresTupleId(beforeOrderKey)
    ? beforeOrderKey
    : null
  const cursorClause =
    cursorTimestamp === null
      ? ""
      : cursorOrderKey
        ? `AND (
    message."messageTimestamp" < ${cursorTimestamp}
    OR (
      message."messageTimestamp" = ${cursorTimestamp}
      AND message.ctid < ${quoteSqlLiteral(cursorOrderKey)}::tid
    )
  )`
      : beforeId
        ? `AND (
    message."messageTimestamp" < ${cursorTimestamp}
    OR (
      message."messageTimestamp" = ${cursorTimestamp}
      AND message.id < ${quoteSqlLiteral(beforeId)}
    )
  )`
        : `AND message."messageTimestamp" < ${cursorTimestamp}`
  const rows = await runEvolutionJsonQuery<DatabaseMessageRow>(`
WITH alias_jids AS (
  SELECT ${quoteSqlLiteral(remoteJid)}::text AS jid
  UNION
  SELECT message.key->>'remoteJidAlt' AS jid
  FROM "Message" message
  JOIN "Instance" alias_inst ON alias_inst.id = message."instanceId"
  WHERE alias_inst.name = ${quoteSqlLiteral(instanceName)}
    AND message.key->>'remoteJid' = ${quoteSqlLiteral(remoteJid)}
    AND COALESCE(message.key->>'remoteJidAlt', '') <> ''
  UNION
  SELECT message.key->>'remoteJid' AS jid
  FROM "Message" message
  JOIN "Instance" alias_inst ON alias_inst.id = message."instanceId"
  WHERE alias_inst.name = ${quoteSqlLiteral(instanceName)}
    AND message.key->>'remoteJidAlt' = ${quoteSqlLiteral(remoteJid)}
    AND COALESCE(message.key->>'remoteJid', '') <> ''
)
SELECT
  inst.name AS "instanceName",
  message.id,
  message.key,
  message."pushName",
  message.participant,
  message."messageType",
  message.message,
  message."messageTimestamp",
  message.ctid::text AS "orderKey",
  COALESCE(message_update.status, message.status) AS status,
  COALESCE(message.key->>'remoteJid', ${quoteSqlLiteral(remoteJid)}) AS "remoteJid"
FROM "Message" message
JOIN "Instance" inst ON inst.id = message."instanceId"
LEFT JOIN LATERAL (
  SELECT mu.status
  FROM "MessageUpdate" mu
  WHERE mu."instanceId" = message."instanceId"
    AND (
      mu."messageId" = message.id
      OR mu."keyId" = message.id
      OR mu."keyId" = message.key->>'id'
    )
  ORDER BY CASE
    WHEN UPPER(mu.status) IN ('READ', 'PLAYED', 'READ_ACK', 'MESSAGE_READ') THEN 50
    WHEN UPPER(mu.status) IN ('DELIVERY_ACK', 'DELIVERED', 'MESSAGE_DELIVERED') THEN 40
    WHEN UPPER(mu.status) IN ('SERVER_ACK', 'SENT', 'MESSAGE_SENT') THEN 30
    WHEN UPPER(mu.status) IN ('PENDING') THEN 20
    WHEN UPPER(mu.status) IN ('ERROR', 'FAILED') THEN 10
    ELSE 0
  END DESC
  LIMIT 1
) message_update ON TRUE
WHERE inst.name = ${quoteSqlLiteral(instanceName)}
  AND (
    message.key->>'remoteJid' IN (SELECT jid FROM alias_jids)
    OR message.key->>'remoteJidAlt' IN (SELECT jid FROM alias_jids)
  )
  ${cursorClause}
ORDER BY message."messageTimestamp" DESC NULLS LAST, message.id DESC
LIMIT ${pageSize}
`)

  const messages = rows.map(normalizeMessage)
  const editMessages = messages
    .filter(
      (message) =>
        message.isEditProtocol && message.editTargetKeyId && message.text
    )
    .sort(compareMessages)
  const editMap = new Map<string, WhatsAppChatMessage>()

  for (const editMessage of editMessages) {
    if (editMessage.editTargetKeyId) {
      editMap.set(editMessage.editTargetKeyId, editMessage)
    }
  }
  const revokedMessageIds = new Set(
    messages
      .map((message) => message.deletedTargetKeyId)
      .filter(Boolean) as string[]
  )

  return messages
    .filter(
      (message) =>
        message.isDeletedForEveryone ||
        (!message.isEditProtocol &&
          !(
          revokedMessageIds.has(message.id) ||
          (message.keyId ? revokedMessageIds.has(message.keyId) : false)
          ))
    )
    .map((message) => {
      const editMessage =
        editMap.get(message.id) ||
        (message.keyId ? editMap.get(message.keyId) : null)

      if (!editMessage) {
        return message
      }

      return {
        ...message,
        editedAt: editMessage.timestamp,
        isEdited: true,
        text: editMessage.text,
      }
    })
    .sort(compareMessages)
}

async function filterHiddenMessages(
  messages: WhatsAppChatMessage[],
  userId: string
) {
  if (!messages.length) {
    return messages
  }

  const clauses = messages.map((message) => {
    const ids = [message.id, message.keyId].filter(Boolean) as string[]
    const idChecks = ids.flatMap((id) => [
      `"messageId" = ${quoteSqlLiteral(id)}`,
      `"keyId" = ${quoteSqlLiteral(id)}`,
    ])

    return `("instanceName" = ${quoteSqlLiteral(message.instanceName)} AND "remoteJid" = ${quoteSqlLiteral(message.remoteJid)} AND (${idChecks.join(" OR ")}))`
  })

  if (!clauses.length) {
    return messages
  }

  const hiddenMessages = await prisma.$queryRawUnsafe<HiddenMessageRow[]>(`
SELECT "messageId", "keyId"
FROM "WhatsAppMessageHidden"
WHERE "userId" = ${quoteSqlLiteral(userId)}
  AND (${clauses.join(" OR ")})
`)
  const hiddenIds = new Set<string>()

  for (const hiddenMessage of hiddenMessages) {
    hiddenIds.add(hiddenMessage.messageId)

    if (hiddenMessage.keyId) {
      hiddenIds.add(hiddenMessage.keyId)
    }
  }

  return messages.filter(
    (message) =>
      !hiddenIds.has(message.id) &&
      !(message.keyId ? hiddenIds.has(message.keyId) : false)
  )
}

async function applyFavoriteFlags(
  messages: WhatsAppChatMessage[],
  userId: string
) {
  if (!messages.length) {
    return messages
  }

  const clauses = messages.map((message) => {
    const ids = [message.id, message.keyId].filter(Boolean) as string[]
    const idChecks = ids.flatMap((id) => [
      `"messageId" = ${quoteSqlLiteral(id)}`,
      `"keyId" = ${quoteSqlLiteral(id)}`,
    ])

    return `("instanceName" = ${quoteSqlLiteral(message.instanceName)} AND "remoteJid" = ${quoteSqlLiteral(message.remoteJid)} AND (${idChecks.join(" OR ")}))`
  })

  if (!clauses.length) {
    return messages
  }

  const favorites = await prisma.$queryRawUnsafe<FavoriteRow[]>(`
SELECT "messageId", "keyId", "createdAt"
FROM "WhatsAppMessageFavorite"
WHERE "userId" = ${quoteSqlLiteral(userId)}
  AND (${clauses.join(" OR ")})
`)
  const favoriteMap = new Map<string, FavoriteRow>()

  for (const favorite of favorites) {
    favoriteMap.set(favorite.messageId, favorite)

    if (favorite.keyId) {
      favoriteMap.set(favorite.keyId, favorite)
    }
  }

  return messages.map((message) => {
    const favorite =
      favoriteMap.get(message.id) ||
      (message.keyId ? favoriteMap.get(message.keyId) : null)

    if (!favorite) {
      return {
        ...message,
        favoritedAt: null,
        isFavorite: false,
      }
    }

    return {
      ...message,
      favoritedAt: normalizeDate(favorite.createdAt),
      isFavorite: true,
    }
  })
}

async function applyPinFlags(messages: WhatsAppChatMessage[], userId: string) {
  if (!messages.length) {
    return messages
  }

  const clauses = messages.map((message) => {
    const ids = [message.id, message.keyId].filter(Boolean) as string[]
    const idChecks = ids.flatMap((id) => [
      `"messageId" = ${quoteSqlLiteral(id)}`,
      `"keyId" = ${quoteSqlLiteral(id)}`,
    ])

    return `("instanceName" = ${quoteSqlLiteral(message.instanceName)} AND "remoteJid" = ${quoteSqlLiteral(message.remoteJid)} AND (${idChecks.join(" OR ")}))`
  })

  if (!clauses.length) {
    return messages
  }

  const pins = await prisma.$queryRawUnsafe<PinRow[]>(`
SELECT "messageId", "keyId", "createdAt", "expiresAt"
FROM "WhatsAppMessagePin"
WHERE "userId" = ${quoteSqlLiteral(userId)}
  AND "expiresAt" > CURRENT_TIMESTAMP
  AND (${clauses.join(" OR ")})
`)
  const pinMap = new Map<string, PinRow>()

  for (const pin of pins) {
    pinMap.set(pin.messageId, pin)

    if (pin.keyId) {
      pinMap.set(pin.keyId, pin)
    }
  }

  return messages.map((message) => {
    const pin =
      pinMap.get(message.id) || (message.keyId ? pinMap.get(message.keyId) : null)

    if (!pin) {
      return {
        ...message,
        isPinned: false,
        pinnedAt: null,
        pinnedExpiresAt: null,
      }
    }

    return {
      ...message,
      isPinned: true,
      pinnedAt: normalizeDate(pin.createdAt),
      pinnedExpiresAt: normalizeDate(pin.expiresAt),
    }
  })
}

async function applyConversationReadMarkers(
  conversations: WhatsAppConversation[],
  userId: string
) {
  if (!conversations.length) {
    return conversations
  }

  const markers = await prisma.$queryRawUnsafe<ConversationReadMarkerRow[]>(`
SELECT "instanceName", "remoteJid", "lastReadAt", "lastReadMessageAt"
FROM "WhatsAppConversationRead"
WHERE "userId" = ${quoteSqlLiteral(userId)}
`)
  const markerMap = new Map<string, ConversationReadMarkerRow>()

  for (const marker of markers) {
    markerMap.set(makeScopedKey(marker.instanceName, marker.remoteJid), marker)
  }

  const markedConversations = conversations.filter((conversation) =>
    markerMap.has(makeScopedKey(conversation.instanceName, conversation.remoteJid))
  )
  const unreadCountMap = await fetchUnreadCountsSinceReadMarkers(
    markedConversations,
    markerMap
  )

  return conversations.map((conversation) => {
    if (conversation.lastMessageFromMe) {
      return {
        ...conversation,
        unreadMessages: 0,
      }
    }

    const key = makeScopedKey(conversation.instanceName, conversation.remoteJid)

    if (!markerMap.has(key)) {
      return conversation
    }

    return {
      ...conversation,
      unreadMessages: unreadCountMap.get(key) ?? 0,
    }
  })
}

async function fetchUnreadCountsSinceReadMarkers(
  conversations: WhatsAppConversation[],
  markerMap: Map<string, ConversationReadMarkerRow>
) {
  const values = conversations.flatMap((conversation) => {
    const marker = markerMap.get(
      makeScopedKey(conversation.instanceName, conversation.remoteJid)
    )
    const markerDate = normalizeDate(
      marker?.lastReadMessageAt ?? marker?.lastReadAt
    )

    if (!markerDate) {
      return []
    }

    return [
      `(${quoteSqlLiteral(conversation.instanceName)}, ${quoteSqlLiteral(conversation.remoteJid)}, ${quoteSqlLiteral(markerDate)}::timestamptz)`,
    ]
  })

  if (!values.length) {
    return new Map<string, number>()
  }

  const rows = await runEvolutionJsonQuery<ConversationUnreadCountRow>(`
WITH markers("instanceName", "remoteJid", "lastReadAt") AS (
  VALUES ${values.join(",\n  ")}
),
alias_jids AS (
  SELECT
    markers."instanceName",
    markers."remoteJid",
    markers."lastReadAt",
    markers."remoteJid" AS jid
  FROM markers
  UNION
  SELECT
    markers."instanceName",
    markers."remoteJid",
    markers."lastReadAt",
    message.key->>'remoteJidAlt' AS jid
  FROM markers
  JOIN "Instance" inst ON inst.name = markers."instanceName"
  JOIN "Message" message ON message."instanceId" = inst.id
  WHERE message.key->>'remoteJid' = markers."remoteJid"
    AND COALESCE(message.key->>'remoteJidAlt', '') <> ''
  UNION
  SELECT
    markers."instanceName",
    markers."remoteJid",
    markers."lastReadAt",
    message.key->>'remoteJid' AS jid
  FROM markers
  JOIN "Instance" inst ON inst.name = markers."instanceName"
  JOIN "Message" message ON message."instanceId" = inst.id
  WHERE message.key->>'remoteJidAlt' = markers."remoteJid"
    AND COALESCE(message.key->>'remoteJid', '') <> ''
)
SELECT
  alias_jids."instanceName" AS "instanceName",
  alias_jids."remoteJid" AS "remoteJid",
  COUNT(DISTINCT message.id)::int AS "unreadCount"
FROM alias_jids
JOIN "Instance" inst ON inst.name = alias_jids."instanceName"
JOIN "Message" message ON message."instanceId" = inst.id
WHERE COALESCE((message.key->>'fromMe')::boolean, false) = false
  AND COALESCE(message.key->>'remoteJid', '') <> 'status@broadcast'
  AND (
    message.key->>'remoteJid' = alias_jids.jid
    OR message.key->>'remoteJidAlt' = alias_jids.jid
  )
  AND message."messageTimestamp" IS NOT NULL
  AND COALESCE(message."messageType", '') <> 'protocolMessage'
  AND to_timestamp(message."messageTimestamp") > alias_jids."lastReadAt"
GROUP BY alias_jids."instanceName", alias_jids."remoteJid"
`)
  const countMap = new Map<string, number>()

  for (const row of rows) {
    const count =
      typeof row.unreadCount === "number"
        ? row.unreadCount
        : Number.parseInt(row.unreadCount, 10)

    countMap.set(
      makeScopedKey(row.instanceName, row.remoteJid),
      Number.isFinite(count) ? count : 0
    )
  }

  return countMap
}

async function saveConversationReadMarker({
  instanceName,
  message,
  remoteJid,
  userId,
}: {
  instanceName: string
  message: WhatsAppChatMessage | null
  remoteJid: string
  userId: string
}) {
  const messageAt = normalizeDate(message?.timestamp) ?? new Date().toISOString()
  const messageId = message?.keyId ?? message?.id ?? null

  await prisma.$executeRawUnsafe(`
INSERT INTO "WhatsAppConversationRead" (
  "id",
  "userId",
  "instanceName",
  "remoteJid",
  "lastReadAt",
  "lastReadMessageId",
  "lastReadMessageAt",
  "createdAt",
  "updatedAt"
) VALUES (
  ${quoteSqlLiteral(randomConversationReadId())},
  ${quoteSqlLiteral(userId)},
  ${quoteSqlLiteral(instanceName)},
  ${quoteSqlLiteral(remoteJid)},
  CURRENT_TIMESTAMP,
  ${messageId ? quoteSqlLiteral(messageId) : "NULL"},
  ${quoteSqlLiteral(messageAt)}::timestamptz,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("userId", "instanceName", "remoteJid")
DO UPDATE SET
  "lastReadAt" = GREATEST("WhatsAppConversationRead"."lastReadAt", EXCLUDED."lastReadAt"),
  "lastReadMessageAt" = GREATEST(
    COALESCE("WhatsAppConversationRead"."lastReadMessageAt", '-infinity'::timestamp),
    EXCLUDED."lastReadMessageAt"
  ),
  "lastReadMessageId" = COALESCE(EXCLUDED."lastReadMessageId", "WhatsAppConversationRead"."lastReadMessageId"),
  "updatedAt" = CURRENT_TIMESTAMP
`)
}

async function fetchDatabaseGroups(instanceNames: string[]) {
  if (!instanceNames.length) {
    return []
  }

  return runEvolutionJsonQuery<DatabaseGroupRow>(`
SELECT
  inst.name AS "instanceName",
  chat."remoteJid" AS "remoteJid",
  chat.name,
  chat."unreadMessages" AS "unreadMessages",
  chat."updatedAt" AS "updatedAt",
  contact."profilePicUrl" AS "profilePicUrl"
FROM "Chat" chat
JOIN "Instance" inst ON inst.id = chat."instanceId"
LEFT JOIN "Contact" contact
  ON contact."instanceId" = chat."instanceId"
  AND contact."remoteJid" = chat."remoteJid"
WHERE inst.name IN (${instanceNames.map(quoteSqlLiteral).join(", ")})
  AND chat."remoteJid" LIKE '%@g.us'
ORDER BY chat."updatedAt" DESC NULLS LAST
LIMIT 500
`)
}

async function fetchEvolutionGroups(instanceName: string) {
  const data = await evolutionRequest<unknown>(
    `/group/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=true`
  )

  if (Array.isArray(data)) {
    return data.filter(isRecord)
  }

  if (isRecord(data)) {
    const groups = readArray(data, "groups") ?? readArray(data, "data")

    return groups?.filter(isRecord) ?? []
  }

  return []
}

function normalizeConversations(
  rows: DatabaseConversationRow[],
  instances: WhatsAppChatSnapshot["instances"],
  contactMaps: ReturnType<typeof createContactMaps>
) {
  const conversations = new Map<string, WhatsAppConversation>()

  for (const row of rows) {
    const instance = instances.find(
      (item) => item.instanceName === row.instanceName
    )
    const remoteJid = getCanonicalConversationJid(row.remoteJid, row.lastKey)
    const contact =
      findContactForJid(contactMaps, row.instanceName, remoteJid) ??
      findContactForJid(contactMaps, row.instanceName, row.remoteJid)
    const lastText = extractMessageText(row.lastMessage, row.lastMessageType)
    const isGroup = remoteJid.includes("@g.us")
    const number = contact?.number || jidToNumber(remoteJid)
    const name =
      normalizeDisplayName(row.chatName) ||
      normalizeDisplayName(contact?.name) ||
      normalizeDisplayName(row.contactPushName) ||
      normalizeDisplayName(row.lastPushName) ||
      (isGroup ? "Grupo sem nome" : formatPhoneNumber(number))
    const conversation: WhatsAppConversation = {
      formattedNumber: isGroup ? `${row.unreadMessages ?? 0} nao lidas` : formatPhoneNumber(number),
      id: makeScopedKey(row.instanceName, remoteJid),
      instanceDisplayName: instance?.displayName ?? row.instanceName,
      instanceName: row.instanceName,
      kind: isGroup ? "group" : "contact",
      lastMessageAt: toIsoFromTimestamp(row.lastMessageAt),
      lastMessageFromMe: Boolean(readBoolean(row.lastKey, "fromMe")),
      lastMessageStatus: row.lastMessageStatus,
      lastMessageText: lastText || messageTypeLabel(row.lastMessageType),
      lastMessageType: row.lastMessageType ?? "conversation",
      name,
      number,
      profilePicUrl: contact?.profilePicUrl ?? row.contactProfilePicUrl ?? undefined,
      remoteJid,
      unreadMessages: row.unreadMessages ?? 0,
      updatedAt: normalizeDate(row.updatedAt),
    }
    const key = makeScopedKey(row.instanceName, remoteJid)
    const existing = conversations.get(key)

    conversations.set(
      key,
      existing ? mergeConversations(existing, conversation) : conversation
    )
  }

  return [...conversations.values()].sort(compareConversations)
}

function normalizeMessage(row: DatabaseMessageRow): WhatsAppChatMessage {
  const remoteJid = getCanonicalConversationJid(
    row.remoteJid ?? readString(row.key, "remoteJid") ?? "",
    row.key
  )
  const fromMe = Boolean(readBoolean(row.key, "fromMe"))
  const keyId = readString(row.key, "id")
  const media = extractMedia(row.message, row.messageType)
  const contextInfo = extractMessageContextInfo(row.message)
  const forwardingScore = readNumber(contextInfo, "forwardingScore")
  const protocolMessage = extractProtocolMessage(row.message)
  const isDeletedForEveryone = isRevokeProtocolMessage(protocolMessage)
  const isEditProtocol = isEditProtocolMessage(protocolMessage)
  const deletedTargetKeyId = readString(readRecord(protocolMessage, "key"), "id")
  const editTargetKeyId = isEditProtocol
    ? readString(readRecord(protocolMessage, "key"), "id")
    : null
  const editedMessage = isEditProtocol
    ? readRecord(protocolMessage, "editedMessage")
    : null
  const text = isDeletedForEveryone
    ? fromMe
      ? "Voce apagou esta mensagem."
      : "Esta mensagem foi apagada."
    : isEditProtocol
      ? extractMessageText(editedMessage, row.messageType)
    : extractMessageText(row.message, row.messageType)

  return {
    deletedTargetKeyId,
    editTargetKeyId,
    audioSeconds: media.audioSeconds,
    fileName: media.fileName,
    fileSize: media.fileSize,
    forwardingScore,
    fromMe,
    id: row.id,
    instanceName: row.instanceName,
    isForwarded: Boolean(
      readBoolean(contextInfo, "isForwarded") || (forwardingScore ?? 0) > 0
    ),
    keyId,
    orderKey: row.orderKey,
    mediaUrl: media.type
      ? createMediaProxyUrl({
          instanceName: row.instanceName,
          messageId: keyId ?? row.id,
          mimetype: media.mimetype,
        })
      : media.url,
    mimetype: media.mimetype,
    participant: row.participant,
    quoted: extractQuotedMessage(row.message),
    reaction: extractReaction(row.message),
    remoteJid,
    senderName: fromMe
      ? "Voce"
      : normalizeDisplayName(row.pushName) ||
        normalizeDisplayName(row.participant) ||
        jidToNumber(remoteJid),
    status: row.status,
    isDeletedForEveryone,
    isEditProtocol,
    isEdited: false,
    text,
    timestamp: toIsoFromTimestamp(row.messageTimestamp),
    type: row.messageType ?? "conversation",
  }
}

function normalizeApiGroup(
  record: JsonRecord,
  instance: WhatsAppGroupsSnapshot["instances"][number],
  contactMaps: ReturnType<typeof createContactMaps>
): WhatsAppGroup {
  const id = readString(record, "id") ?? readString(record, "remoteJid") ?? ""
  const participants = normalizeParticipants(
    readArray(record, "participants") ?? [],
    instance.instanceName,
    contactMaps
  )
  const size = readNumber(record, "size") ?? participants.length

  return {
    announce: Boolean(readBoolean(record, "announce")),
    creation: toIsoFromTimestamp(readNumber(record, "creation")),
    description: readString(record, "desc") ?? readString(record, "description"),
    id,
    instanceDisplayName: instance.displayName,
    instanceName: instance.instanceName,
    owner: readString(record, "owner"),
    participants,
    pictureUrl: readString(record, "pictureUrl") ?? undefined,
    restrict: Boolean(readBoolean(record, "restrict")),
    size,
    subject: readString(record, "subject") ?? "Grupo sem nome",
    unreadMessages: 0,
    updatedAt: null,
  }
}

function normalizeDatabaseGroups(
  rows: DatabaseGroupRow[],
  instances: WhatsAppGroupsSnapshot["instances"],
  contactMaps: ReturnType<typeof createContactMaps>
) {
  return rows.map((row) => {
    const instance = instances.find(
      (item) => item.instanceName === row.instanceName
    )
    const contact = findContactForJid(contactMaps, row.instanceName, row.remoteJid)

    return {
      announce: false,
      creation: null,
      description: null,
      id: row.remoteJid,
      instanceDisplayName: instance?.displayName ?? row.instanceName,
      instanceName: row.instanceName,
      owner: null,
      participants: [],
      pictureUrl: row.profilePicUrl ?? contact?.profilePicUrl,
      restrict: false,
      size: 0,
      subject:
        normalizeDisplayName(row.name) ||
        normalizeDisplayName(contact?.name) ||
        "Grupo sem nome",
      unreadMessages: row.unreadMessages ?? 0,
      updatedAt: normalizeDate(row.updatedAt),
    } satisfies WhatsAppGroup
  })
}

function normalizeParticipants(
  rows: unknown[],
  instanceName: string,
  contactMaps: ReturnType<typeof createContactMaps>
) {
  return rows
    .filter(isRecord)
    .map((participant): WhatsAppGroupParticipant => {
      const id =
        readString(participant, "id") ??
        readString(participant, "jid") ??
        readString(participant, "remoteJid") ??
        ""
      const contact = findContactForJid(contactMaps, instanceName, id)
      const number = contact?.number || jidToNumber(id)

      return {
        id,
        isAdmin: Boolean(
          readBoolean(participant, "isAdmin") ??
            readBoolean(participant, "admin")
        ),
        isSuperAdmin: Boolean(
          readBoolean(participant, "isSuperAdmin") ??
            readBoolean(participant, "superAdmin")
        ),
        name:
          normalizeDisplayName(contact?.name) ||
          normalizeDisplayName(readString(participant, "name")) ||
          formatPhoneNumber(number),
        number,
        profilePicUrl: contact?.profilePicUrl,
      }
    })
    .filter((participant) => participant.id)
}

function createContactMaps(contacts: EvolutionContact[]) {
  const byScopedJid = new Map<string, EvolutionContact>()
  const byScopedNumber = new Map<string, EvolutionContact>()

  for (const contact of contacts) {
    byScopedJid.set(makeScopedKey(contact.instanceName, contact.remoteJid), contact)
    byScopedNumber.set(
      makeScopedKey(contact.instanceName, contact.number.replace(/\D/g, "")),
      contact
    )
  }

  return {
    byScopedJid,
    byScopedNumber,
  }
}

function findContactForJid(
  contactMaps: ReturnType<typeof createContactMaps>,
  instanceName: string,
  jid: string
) {
  return (
    contactMaps.byScopedJid.get(makeScopedKey(instanceName, jid)) ??
    contactMaps.byScopedNumber.get(
      makeScopedKey(instanceName, jidToNumber(jid).replace(/\D/g, ""))
    )
  )
}

async function sendEvolutionTextMessage({
  instanceName,
  number,
  quoted,
  text,
}: {
  instanceName: string
  number: string
  quoted?: WhatsAppChatMessage | null
  text: string
}) {
  const pathName = `/message/sendText/${encodeURIComponent(instanceName)}`

  try {
    return await evolutionRequest(pathName, {
      method: "POST",
      body: JSON.stringify({
        delay: 1200,
        linkPreview: true,
        number,
        quoted: quoted ? toQuotedPayload(quoted) : undefined,
        text,
      }),
    })
  } catch (error) {
    if (!isRetryableEvolutionShapeError(error)) {
      throw error
    }

    return evolutionRequest(pathName, {
      method: "POST",
      body: JSON.stringify({
        number,
        options: {
          delay: 1200,
          linkPreview: true,
          presence: "composing",
        },
        quoted: quoted ? toQuotedPayload(quoted) : undefined,
        textMessage: {
          text,
        },
      }),
    })
  }
}

async function sendEvolutionMediaMessage({
  caption,
  fileName,
  instanceName,
  media,
  mediatype,
  mimetype,
  number,
  quoted,
}: {
  caption: string
  fileName: string
  instanceName: string
  media: string
  mediatype: string
  mimetype: string
  number: string
  quoted?: WhatsAppChatMessage | null
}) {
  const pathName = `/message/sendMedia/${encodeURIComponent(instanceName)}`

  try {
    return await evolutionRequest(pathName, {
      method: "POST",
      body: JSON.stringify({
        caption,
        delay: 1200,
        fileName,
        linkPreview: true,
        media,
        mediatype,
        mimetype,
        number,
        quoted: quoted ? toQuotedPayload(quoted) : undefined,
      }),
    })
  } catch (error) {
    if (!isRetryableEvolutionShapeError(error)) {
      throw error
    }

    return evolutionRequest(pathName, {
      method: "POST",
      body: JSON.stringify({
        mediaMessage: {
          caption,
          fileName,
          media,
          mediaType: mediatype,
        },
        number,
        options: {
          delay: 1200,
          presence: "composing",
        },
        quoted: quoted ? toQuotedPayload(quoted) : undefined,
      }),
    })
  }
}

async function sendEvolutionAudioMessage({
  audio,
  instanceName,
  number,
  quoted,
}: {
  audio: string
  instanceName: string
  number: string
  quoted?: WhatsAppChatMessage | null
}) {
  const pathName = `/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`

  try {
    return await evolutionRequest(pathName, {
      method: "POST",
      body: JSON.stringify({
        audio,
        delay: 1200,
        number,
        quoted: quoted ? toQuotedPayload(quoted) : undefined,
      }),
    })
  } catch (error) {
    if (!isRetryableEvolutionShapeError(error)) {
      throw error
    }

    return evolutionRequest(
      `/message/sendMedia/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        body: JSON.stringify({
          mediaMessage: {
            fileName: "audio.webm",
            media: audio,
            mediaType: "audio",
          },
          number,
          options: {
            delay: 1200,
            presence: "recording",
          },
          quoted: quoted ? toQuotedPayload(quoted) : undefined,
        }),
      }
    )
  }
}

async function ensureRealtimeWebhook(instanceName: string) {
  if (!instanceName || configuredRealtimeWebhookInstances.has(instanceName)) {
    return
  }

  const payload = {
    enabled: true,
    events: [...REALTIME_WEBHOOK_EVENTS],
    url: getEvolutionRealtimeWebhookUrl(),
    webhookBase64: false,
    webhookByEvents: false,
  }
  const pathName = `/webhook/set/${encodeURIComponent(instanceName)}`

  try {
    await evolutionRequest(pathName, {
      method: "POST",
      body: JSON.stringify(payload),
    })
  } catch (error) {
    if (!isRetryableEvolutionShapeError(error)) {
      throw error
    }

    await evolutionRequest(pathName, {
      method: "POST",
      body: JSON.stringify({ webhook: payload }),
    })
  }

  configuredRealtimeWebhookInstances.add(instanceName)
}

function getEvolutionRealtimeWebhookUrl() {
  const explicitUrl = process.env.EVOLUTION_WEBHOOK_URL?.trim()

  if (explicitUrl) {
    return explicitUrl
  }

  const appUrl = (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "")
  const url = new URL("/api/webhooks/evolution", appUrl)

  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    url.hostname = "host.docker.internal"
  }

  const secret = process.env.EVOLUTION_WEBHOOK_SECRET?.trim()

  if (secret) {
    url.searchParams.set("secret", secret)
  }

  return url.toString()
}

async function evolutionRequest<T = unknown>(
  path: string,
  init: RequestInit = {}
) {
  const config = getEvolutionConfig()
  const headers = new Headers(init.headers)

  headers.set("apikey", config.apiKey)

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers,
  })
  const responseText = await response.text()

  if (!response.ok) {
    throw new EvolutionApiError(
      `Evolution API returned ${response.status}`,
      response.status,
      responseText
    )
  }

  if (!responseText) {
    return undefined as T
  }

  return JSON.parse(responseText) as T
}

function getEvolutionConfig(): EvolutionConfig {
  const baseUrl = (
    process.env.EVOLUTION_API_URL ||
    process.env.NEXT_PRIVATE_EVOLUTION_API_URL ||
    "http://localhost:8080"
  ).replace(/\/+$/, "")
  const apiKey =
    process.env.EVOLUTION_API_KEY || process.env.AUTHENTICATION_API_KEY || ""

  if (!apiKey) {
    throw new EvolutionConfigError(
      "Configure EVOLUTION_API_KEY in .env.local para conectar a Evolution API."
    )
  }

  return {
    apiKey,
    baseUrl,
  }
}

async function runEvolutionJsonQuery<T>(query: string) {
  const postgresContainer =
    process.env.EVOLUTION_POSTGRES_CONTAINER || "evo_postgres"
  const postgresUser = process.env.EVOLUTION_POSTGRES_USER || "evolution"
  const postgresDatabase =
    process.env.EVOLUTION_POSTGRES_DATABASE || "evolution"
  const sql = `
SELECT COALESCE(jsonb_agg(to_jsonb(result)), '[]'::jsonb)::text
FROM (
${query}
) result;
`
  const result = await runCommand(
    "docker",
    [
      "exec",
      "-i",
      postgresContainer,
      "psql",
      "-U",
      postgresUser,
      "-d",
      postgresDatabase,
      "-t",
      "-A",
    ],
    sql,
    20_000
  )
  const text = result.stdout.trim()

  return text ? (JSON.parse(text) as T[]) : []
}

async function getCachedWhatsAppMedia({
  instanceName,
  messageId,
  userId,
}: {
  instanceName: string
  messageId: string
  userId: string
}): Promise<WhatsAppCachedMediaFile | null> {
  const [row] = await prisma.$queryRawUnsafe<WhatsAppMediaCacheRow[]>(`
SELECT id, "messageId", "remoteJid", "mediaType", mimetype, "fileName",
  "byteLength", sha256, "storagePath", source
FROM "WhatsAppMediaCache"
WHERE "userId" = ${quoteSqlLiteral(userId)}
  AND "instanceName" = ${quoteSqlLiteral(instanceName)}
  AND "messageId" = ${quoteSqlLiteral(messageId)}
LIMIT 1
`)

  if (!row) {
    return null
  }

  const filePath = getMediaCacheAbsolutePath(row.storagePath)
  const fileStat = await statCacheFile(filePath).catch(() => null)

  if (!fileStat?.isFile() || fileStat.size !== Number(row.byteLength)) {
    await prisma.$executeRawUnsafe(`
DELETE FROM "WhatsAppMediaCache"
WHERE id = ${quoteSqlLiteral(row.id)}
`).catch(() => undefined)
    return null
  }

  await prisma.$executeRawUnsafe(`
UPDATE "WhatsAppMediaCache"
SET "lastAccessedAt" = NOW(), "updatedAt" = NOW()
WHERE id = ${quoteSqlLiteral(row.id)}
`).catch(() => undefined)

  return {
    byteLength: fileStat.size,
    cacheStatus: "hit",
    fileName:
      row.fileName ||
      fallbackCachedFileName(row.messageId, row.mimetype, row.mediaType),
    filePath,
    mediaType: row.mediaType || inferMediaTypeFromMime(row.mimetype),
    mimetype: row.mimetype,
    sha256: row.sha256,
  }
}

async function saveWhatsAppMediaCache({
  byteLength,
  buffer,
  fileName,
  instanceName,
  mediaType,
  messageId,
  mimetype,
  remoteJid,
  sha256,
  source,
  sourceUrl,
  userId,
}: {
  byteLength: number
  buffer: Buffer
  fileName: string
  instanceName: string
  mediaType: string
  messageId: string
  mimetype: string
  remoteJid: string | null
  sha256: string
  source: string
  sourceUrl: string | null
  userId: string
}): Promise<Omit<WhatsAppCachedMediaFile, "cacheStatus">> {
  const extension = extensionFromMimeType(mimetype) || "bin"
  const storagePath = `${sanitizePathSegment(userId)}/${sha256}.${extension}`
  const filePath = getMediaCacheAbsolutePath(storagePath)

  await ensureCacheDirectory(getCacheDirectory(filePath))
  await writeCacheFile(filePath, buffer).catch((error: unknown) => {
    if (!isFileAlreadyExistsError(error)) {
      throw error
    }
  })

  await prisma.$queryRawUnsafe<WhatsAppMediaCacheRow[]>(`
INSERT INTO "WhatsAppMediaCache" (
  id, "userId", "instanceName", "messageId", "remoteJid", "mediaType",
  mimetype, "fileName", "byteLength", sha256, "storagePath", source,
  "sourceUrl", "lastAccessedAt", "createdAt", "updatedAt"
)
VALUES (
  ${quoteSqlLiteral(randomMediaCacheId())},
  ${quoteSqlLiteral(userId)},
  ${quoteSqlLiteral(instanceName)},
  ${quoteSqlLiteral(messageId)},
  ${quoteSqlNullable(remoteJid)},
  ${quoteSqlLiteral(mediaType)},
  ${quoteSqlLiteral(mimetype)},
  ${quoteSqlLiteral(fileName)},
  ${byteLength},
  ${quoteSqlLiteral(sha256)},
  ${quoteSqlLiteral(storagePath)},
  ${quoteSqlLiteral(source)},
  ${quoteSqlNullable(sourceUrl)},
  NOW(),
  NOW(),
  NOW()
)
ON CONFLICT ("userId", "instanceName", "messageId")
DO UPDATE SET
  "remoteJid" = EXCLUDED."remoteJid",
  "mediaType" = EXCLUDED."mediaType",
  mimetype = EXCLUDED.mimetype,
  "fileName" = EXCLUDED."fileName",
  "byteLength" = EXCLUDED."byteLength",
  sha256 = EXCLUDED.sha256,
  "storagePath" = EXCLUDED."storagePath",
  source = EXCLUDED.source,
  "sourceUrl" = EXCLUDED."sourceUrl",
  "lastAccessedAt" = NOW(),
  "updatedAt" = NOW()
RETURNING id, "messageId", "remoteJid", "mediaType", mimetype, "fileName",
  "byteLength", sha256, "storagePath", source
`)

  return {
    byteLength,
    fileName,
    filePath,
    mediaType,
    mimetype,
    sha256,
  }
}

async function fetchDatabaseMediaSource({
  instanceName,
  messageId,
}: {
  instanceName: string
  messageId: string
}): Promise<WhatsAppMediaSource | null> {
  const [row] = await runEvolutionJsonQuery<DatabaseMediaSourceRow>(`
SELECT
  inst.name AS "instanceName",
  message.id,
  message.key,
  message.message,
  message."messageType",
  COALESCE(
    NULLIF(message.key->>'remoteJidAlt', ''),
    message.key->>'remoteJid'
  ) AS "remoteJid"
FROM "Message" message
JOIN "Instance" inst ON inst.id = message."instanceId"
WHERE inst.name = ${quoteSqlLiteral(instanceName)}
  AND (
    message.id = ${quoteSqlLiteral(messageId)}
    OR message.key->>'id' = ${quoteSqlLiteral(messageId)}
  )
LIMIT 1
`)

  if (!row) {
    return null
  }

  const media = extractMedia(row.message, row.messageType)
  const mediaType =
    messageTypeToMediaType(row.messageType) ||
    inferMediaTypeFromMime(media.mimetype)

  return {
    fileName: media.fileName ?? null,
    key: row.key,
    mediaType,
    message: row.message,
    mimetype: media.mimetype ?? null,
    remoteJid: row.remoteJid ?? null,
    thumbnail: media.thumbnail ?? null,
    url: media.url ?? null,
  }
}

async function fetchWhatsAppMediaFromEvolution({
  instanceName,
  messageId,
  mimetype,
  source,
}: {
  instanceName: string
  messageId: string
  mimetype?: string | null
  source: WhatsAppMediaSource | null
}): Promise<{
  buffer: Buffer
  mimetype: string
  source: string
  sourceUrl?: string | null
}> {
  const convertToMp4 =
    Boolean(mimetype?.startsWith("video/")) || source?.mediaType === "video"
  const bodies = createEvolutionMediaDownloadBodies({
    convertToMp4,
    messageId,
    source,
  })
  let lastError: unknown

  for (const body of bodies) {
    try {
      const response = await evolutionRequest<unknown>(
        `/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      )
      const base64 = extractBase64Payload(response)
      const buffer = bufferFromBase64(base64)

      if (buffer?.byteLength) {
        return {
          buffer,
          mimetype: getBase64MimeType(base64) || mimetype || "",
          source: "evolution-base64",
        }
      }
    } catch (error) {
      lastError = error
    }
  }

  if (source?.url) {
    try {
      return await fetchRemoteMediaUrl(source.url, mimetype)
    } catch (error) {
      lastError = error
    }
  }

  if (source?.thumbnail) {
    const thumbnail = bufferFromBase64(source.thumbnail)

    if (thumbnail?.byteLength) {
      return {
        buffer: thumbnail,
        mimetype: getBase64MimeType(source.thumbnail) || "image/jpeg",
        source: "evolution-thumbnail",
      }
    }
  }

  throw new WhatsAppChatError(
    getMediaDownloadErrorMessage(lastError),
    lastError instanceof EvolutionApiError ? lastError.status : 404
  )
}

function createEvolutionMediaDownloadBodies({
  convertToMp4,
  messageId,
  source,
}: {
  convertToMp4: boolean
  messageId: string
  source: WhatsAppMediaSource | null
}) {
  const keyId = readString(source?.key, "id") || messageId
  const key = source?.key ?? { id: keyId }
  const bodies: Array<Record<string, unknown>> = [
    {
      convertToMp4,
      message: {
        key: {
          id: messageId,
        },
      },
    },
  ]

  if (source?.message) {
    bodies.push(
      {
        convertToMp4,
        message: {
          key,
          message: source.message,
        },
      },
      {
        convertToMp4,
        message: {
          key: {
            id: keyId,
            remoteJid: source.remoteJid,
          },
          message: source.message,
        },
      }
    )
  }

  const seen = new Set<string>()

  return bodies.filter((body) => {
    const key = JSON.stringify(body)

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

async function fetchRemoteMediaUrl(
  url: string,
  fallbackMimetype?: string | null
) {
  if (url.startsWith("data:")) {
    const buffer = bufferFromBase64(url)

    if (buffer?.byteLength) {
      return {
        buffer,
        mimetype: getBase64MimeType(url) || fallbackMimetype || "",
        source: "data-url",
        sourceUrl: null,
      }
    }
  }

  const headers = new Headers()

  if (isEvolutionApiUrl(url)) {
    headers.set("apikey", getEvolutionConfig().apiKey)
  }

  const response = await fetch(url, {
    cache: "no-store",
    headers,
  })

  if (!response.ok) {
    throw new EvolutionApiError(
      `Media URL returned ${response.status}`,
      response.status,
      await response.text().catch(() => "")
    )
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimetype:
      normalizeHeaderMimeType(response.headers.get("Content-Type")) ||
      fallbackMimetype ||
      "",
    source: "remote-url",
    sourceUrl: url,
  }
}

function normalizeCachedMedia({
  buffer,
  fileName,
  mediaType,
  messageId,
  mimetype,
}: {
  buffer: Buffer
  fileName?: string | null
  mediaType?: string | null
  messageId: string
  mimetype?: string | null
}) {
  const detectedMimetype = detectMimeType(buffer)
  const normalizedMediaType =
    mediaType ||
    inferMediaTypeFromMime(detectedMimetype || mimetype || "") ||
    "document"
  const normalizedMimetype =
    chooseMimetype({
      detectedMimetype,
      mediaType: normalizedMediaType,
      mimetype,
    }) || defaultMediaMimetype(normalizedMediaType)
  const normalizedFileName = normalizeCachedFileName({
    fileName,
    mediaType: normalizedMediaType,
    messageId,
    mimetype: normalizedMimetype,
  })

  return {
    buffer,
    fileName: normalizedFileName,
    mediaType: normalizedMediaType,
    mimetype: normalizedMimetype,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  }
}

function runCommand(
  command: string,
  args: string[],
  input?: string,
  timeoutMs = 10_000
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true })
    let stdout = ""
    let stderr = ""
    let settled = false

    const settle = () => {
      if (settled) {
        return false
      }

      settled = true
      clearTimeout(timer)
      return true
    }

    const timer = setTimeout(() => {
      if (!settle()) {
        return
      }

      child.kill()
      reject(new Error(`Command timed out: ${command} ${args.join(" ")}`))
    }, timeoutMs)

    collectChildOutput(child, {
      onStderr: (chunk) => {
        stderr += chunk
      },
      onStdout: (chunk) => {
        stdout += chunk
      },
    })

    child.on("error", (error) => {
      if (settle()) {
        reject(error)
      }
    })
    child.on("close", (code) => {
      if (!settle()) {
        return
      }

      if (code === 0) {
        resolve({ stderr, stdout })
        return
      }

      reject(
        new Error(stderr.trim() || stdout.trim() || `Command exited ${code}`)
      )
    })

    if (input) {
      child.stdin.write(input)
    }

    child.stdin.end()
  })
}

function collectChildOutput(
  child: ChildProcessWithoutNullStreams,
  handlers: {
    onStderr: (chunk: string) => void
    onStdout: (chunk: string) => void
  }
) {
  child.stdout.on("data", (data: Buffer) => {
    handlers.onStdout(data.toString())
  })
  child.stderr.on("data", (data: Buffer) => {
    handlers.onStderr(data.toString())
  })
}

function extractMessageText(message: unknown, messageType?: string | null) {
  const record = isRecord(message) ? message : {}

  return (
    readString(readRecord(record, "reactionMessage"), "text") ??
    readString(record, "conversation") ??
    readString(readRecord(record, "extendedTextMessage"), "text") ??
    readString(readRecord(record, "imageMessage"), "caption") ??
    readString(readRecord(record, "videoMessage"), "caption") ??
    readString(readRecord(record, "documentMessage"), "caption") ??
    readString(readRecord(record, "buttonsResponseMessage"), "selectedDisplayText") ??
    readString(readRecord(record, "listResponseMessage"), "title") ??
    messageTypeLabel(messageType)
  )
}

function extractQuotedMessage(message: unknown) {
  const contextInfo = extractMessageContextInfo(message)

  if (!contextInfo) {
    return null
  }

  const quotedMessage = readRecord(contextInfo, "quotedMessage")
  const text = extractMessageText(quotedMessage)

  if (!text) {
    return null
  }

  return {
    fromMe: undefined,
    id: readString(contextInfo, "stanzaId") ?? undefined,
    senderName: normalizeDisplayName(readString(contextInfo, "participant")),
    text,
  }
}

function extractReaction(message: unknown) {
  const record = isRecord(message) ? message : {}

  return readString(readRecord(record, "reactionMessage"), "text")
}

function extractProtocolMessage(message: unknown) {
  const record = isRecord(message) ? message : {}

  return readRecord(record, "protocolMessage")
}

function isRevokeProtocolMessage(protocolMessage: JsonRecord | null) {
  if (!protocolMessage) {
    return false
  }

  const typeText = readString(protocolMessage, "type")?.toUpperCase()
  const typeNumber = readNumber(protocolMessage, "type")

  return typeText === "REVOKE" || typeText === "0" || typeNumber === 0
}

function isEditProtocolMessage(protocolMessage: JsonRecord | null) {
  if (!protocolMessage) {
    return false
  }

  const typeText = readString(protocolMessage, "type")?.toUpperCase()
  const typeNumber = readNumber(protocolMessage, "type")

  return typeText === "MESSAGE_EDIT" || typeText === "14" || typeNumber === 14
}

function extractMessageContextInfo(message: unknown) {
  const record = isRecord(message) ? message : {}

  return (
    readRecord(readRecord(record, "extendedTextMessage"), "contextInfo") ??
    readRecord(readRecord(record, "imageMessage"), "contextInfo") ??
    readRecord(readRecord(record, "videoMessage"), "contextInfo") ??
    readRecord(readRecord(record, "documentMessage"), "contextInfo") ??
    readRecord(readRecord(record, "audioMessage"), "contextInfo") ??
    readRecord(readRecord(record, "stickerMessage"), "contextInfo") ??
    readRecord(record, "contextInfo")
  )
}

function toQuotedPayload(message: WhatsAppChatMessage) {
  return {
    key: {
      fromMe: message.fromMe,
      id: message.keyId ?? message.id,
      remoteJid: message.remoteJid,
    },
    message: {
      conversation: message.text || messageTypeLabel(message.type),
    },
  }
}

function extractMedia(message: unknown, messageType?: string | null) {
  const record = isRecord(message) ? message : {}
  const typedRecord =
    readRecord(record, "imageMessage") ??
    readRecord(record, "videoMessage") ??
    readRecord(record, "documentMessage") ??
    readRecord(record, "audioMessage") ??
    readRecord(record, "stickerMessage")

  return {
    fileName: readString(typedRecord, "fileName"),
    fileSize:
      readString(typedRecord, "fileLength") ??
      readString(typedRecord, "fileSize") ??
      null,
    audioSeconds: readNumber(typedRecord, "seconds"),
    mimetype: readString(typedRecord, "mimetype"),
    thumbnail: readString(typedRecord, "jpegThumbnail"),
    url: readString(typedRecord, "url"),
    type: typedRecord ? messageType : null,
  }
}

function messageTypeToMediaType(messageType?: string | null) {
  const normalized = messageType?.toLowerCase() ?? ""

  if (normalized.includes("image") || normalized.includes("sticker")) {
    return "image"
  }

  if (normalized.includes("video")) {
    return "video"
  }

  if (normalized.includes("audio")) {
    return "audio"
  }

  if (normalized.includes("document")) {
    return "document"
  }

  return ""
}

function createMediaProxyUrl({
  instanceName,
  messageId,
  mimetype,
}: {
  instanceName: string
  messageId: string
  mimetype?: string | null
}) {
  const params = new URLSearchParams({
    instanceName,
    messageId,
    mode: "media",
  })

  if (mimetype) {
    params.set("mimetype", mimetype)
  }

  return `/api/evolution-whatsapp/chat?${params}`
}

function messageTypeLabel(messageType?: string | null) {
  if (!messageType) {
    return ""
  }

  if (messageType.includes("image")) {
    return "Imagem"
  }

  if (messageType.includes("video")) {
    return "Video"
  }

  if (messageType.includes("audio")) {
    return "Audio"
  }

  if (messageType.includes("document")) {
    return "Documento"
  }

  if (messageType.includes("sticker")) {
    return "Figurinha"
  }

  return ""
}

function isRetryableEvolutionShapeError(error: unknown) {
  return (
    error instanceof EvolutionApiError &&
    (error.status === 400 || error.status === 422)
  )
}

function normalizeMediaPayload(media: string) {
  if (!media.startsWith("data:")) {
    return media
  }

  return media.split(",")[1] ?? media
}

function extractBase64Payload(value: unknown): string {
  if (typeof value === "string") {
    return value
  }

  if (!isRecord(value)) {
    return ""
  }

  return (
    readString(value, "base64") ??
    readString(value, "media") ??
    readString(value, "data") ??
    readString(readRecord(value, "response"), "base64") ??
    readString(readRecord(value, "response"), "media") ??
    readString(readRecord(value, "message"), "base64") ??
    ""
  )
}

function stripBase64Prefix(value: string) {
  return value.includes(",") ? value.split(",").at(-1) ?? value : value
}

function getBase64MimeType(value: string) {
  const match = /^data:([^;]+);base64,/.exec(value)

  return match?.[1] ?? ""
}

function bufferFromBase64(value: string) {
  const payload = stripBase64Prefix(value).replace(/\s/g, "")

  if (!payload) {
    return null
  }

  try {
    const buffer = Buffer.from(payload, "base64")

    return buffer.byteLength ? buffer : null
  } catch {
    return null
  }
}

function detectMimeType(buffer: Buffer) {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return "image/jpeg"
  }

  if (
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png"
  }

  if (
    buffer.subarray(0, 6).toString("ascii") === "GIF87a" ||
    buffer.subarray(0, 6).toString("ascii") === "GIF89a"
  ) {
    return "image/gif"
  }

  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp"
  }

  if (buffer.subarray(0, 4).toString("ascii") === "%PDF") {
    return "application/pdf"
  }

  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    return "video/mp4"
  }

  if (buffer.subarray(0, 4).toString("ascii") === "OggS") {
    return "audio/ogg"
  }

  if (buffer.subarray(0, 3).toString("ascii") === "ID3") {
    return "audio/mpeg"
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    return "audio/mpeg"
  }

  if (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return "video/webm"
  }

  if (buffer.subarray(0, 2).toString("ascii") === "PK") {
    return "application/zip"
  }

  return ""
}

function chooseMimetype({
  detectedMimetype,
  mediaType,
  mimetype,
}: {
  detectedMimetype: string
  mediaType: string
  mimetype?: string | null
}) {
  const normalized = normalizeHeaderMimeType(mimetype)

  if (
    detectedMimetype &&
    (!normalized ||
      normalized === "application/octet-stream" ||
      !isMimeCompatibleWithMediaType(normalized, mediaType))
  ) {
    return detectedMimetype
  }

  if (normalized && normalized !== "application/octet-stream") {
    return normalized
  }

  return detectedMimetype
}

function normalizeHeaderMimeType(value?: string | null) {
  return value?.split(";")[0]?.trim().toLowerCase() || ""
}

function inferMediaTypeFromMime(mimetype?: string | null) {
  const normalized = normalizeHeaderMimeType(mimetype)

  if (normalized.startsWith("image/")) {
    return "image"
  }

  if (normalized.startsWith("video/")) {
    return "video"
  }

  if (normalized.startsWith("audio/")) {
    return "audio"
  }

  return "document"
}

function isMimeCompatibleWithMediaType(mimetype: string, mediaType: string) {
  if (mediaType === "image") {
    return mimetype.startsWith("image/")
  }

  if (mediaType === "video") {
    return mimetype.startsWith("video/")
  }

  if (mediaType === "audio") {
    return mimetype.startsWith("audio/")
  }

  return true
}

function defaultMediaMimetype(mediaType: string) {
  if (mediaType === "image") {
    return "image/jpeg"
  }

  if (mediaType === "video") {
    return "video/mp4"
  }

  if (mediaType === "audio") {
    return "audio/ogg"
  }

  return "application/octet-stream"
}

function normalizeCachedFileName({
  fileName,
  mediaType,
  messageId,
  mimetype,
}: {
  fileName?: string | null
  mediaType: string
  messageId: string
  mimetype: string
}) {
  const extension =
    extensionFromMimeType(mimetype) || extensionFromMediaType(mediaType)
  const sanitized = sanitizeFileName(fileName || "")
  const baseName = sanitized || fallbackCachedFileName(messageId, mimetype, mediaType)
  const currentExtension = getFileExtension(baseName)

  if (currentExtension) {
    return baseName
  }

  return `${baseName}.${extension}`
}

function fallbackCachedFileName(
  messageId: string,
  mimetype?: string | null,
  mediaType?: string | null
) {
  const extension =
    extensionFromMimeType(mimetype || "") ||
    extensionFromMediaType(mediaType || inferMediaTypeFromMime(mimetype))

  return `whatsapp-${messageId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "media"}.${extension}`
}

function extensionFromMediaType(mediaType: string) {
  if (mediaType === "image") {
    return "jpg"
  }

  if (mediaType === "video") {
    return "mp4"
  }

  if (mediaType === "audio") {
    return "ogg"
  }

  return "bin"
}

function extensionFromMimeType(mimetype?: string | null) {
  switch (normalizeHeaderMimeType(mimetype)) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg"
    case "image/png":
      return "png"
    case "image/gif":
      return "gif"
    case "image/webp":
      return "webp"
    case "video/mp4":
      return "mp4"
    case "video/webm":
      return "webm"
    case "audio/mpeg":
      return "mp3"
    case "audio/mp4":
    case "audio/m4a":
      return "m4a"
    case "audio/ogg":
    case "audio/opus":
      return "ogg"
    case "application/pdf":
      return "pdf"
    case "application/zip":
      return "zip"
    case "application/msword":
      return "doc"
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "docx"
    case "application/vnd.ms-excel":
      return "xls"
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return "xlsx"
    default:
      return ""
  }
}

function sanitizeFileName(value: string) {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160)
}

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_") || "media"
}

async function statCacheFile(filePath: string) {
  const { stat } = await import("node:fs/promises")

  return stat(filePath)
}

async function ensureCacheDirectory(directoryPath: string) {
  const { mkdir } = await import("node:fs/promises")

  await mkdir(directoryPath, { recursive: true })
}

async function writeCacheFile(filePath: string, buffer: Buffer) {
  const { writeFile } = await import("node:fs/promises")

  await writeFile(filePath, buffer, { flag: "wx" })
}

function getCacheDirectory(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/")
  const index = normalized.lastIndexOf("/")

  return index >= 0 ? normalized.slice(0, index) : "."
}

function getFileExtension(fileName: string) {
  const lastSegment = fileName.split(/[\\/]+/).at(-1) ?? fileName
  const index = lastSegment.lastIndexOf(".")

  return index > 0 ? lastSegment.slice(index + 1) : ""
}

function getWhatsAppMediaCacheRoot() {
  return `${process.cwd().replace(/\\/g, "/")}/storage/whatsapp-media`
}

function getMediaCacheAbsolutePath(storagePath: string) {
  const root = getWhatsAppMediaCacheRoot()
  const segments = storagePath.split(/[\\/]+/).filter(Boolean)

  if (
    !segments.length ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    throw new WhatsAppChatError("Caminho de midia invalido.", 400)
  }

  return `${root}/${segments.join("/")}`
}

function isFileAlreadyExistsError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "EEXIST"
  )
}

function isEvolutionApiUrl(url: string) {
  try {
    const mediaUrl = new URL(url)
    const baseUrl = new URL(getEvolutionConfig().baseUrl)

    return mediaUrl.origin === baseUrl.origin
  } catch {
    return false
  }
}

function getMediaDownloadErrorMessage(error: unknown) {
  if (error instanceof EvolutionApiError) {
    return "Nao foi possivel baixar esta midia da Evolution."
  }

  if (error instanceof Error && error.message) {
    return "Nao foi possivel carregar esta midia antiga."
  }

  return "Nao foi possivel carregar a midia."
}

function normalizeDisplayName(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : ""
}

function normalizeDate(value: unknown) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }

  if (typeof value !== "string" || !value) {
    return null
  }

  const parsed = new Date(value)

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function randomFavoriteId() {
  return `wmf_${randomUUID().replace(/-/g, "")}`
}

function randomPinId() {
  return `wmp_${randomUUID().replace(/-/g, "")}`
}

function randomHiddenMessageId() {
  return `wmh_${randomUUID().replace(/-/g, "")}`
}

function randomConversationReadId() {
  return `wcr_${randomUUID().replace(/-/g, "")}`
}

function randomMediaCacheId() {
  return `wmc_${randomUUID().replace(/-/g, "")}`
}

function canDeleteForEveryone(
  message: Pick<WhatsAppChatMessage, "fromMe" | "timestamp">
) {
  if (!message.fromMe || !message.timestamp) {
    return false
  }

  const sentAt = Date.parse(message.timestamp)

  if (!Number.isFinite(sentAt)) {
    return false
  }

  return Date.now() - sentAt <= 48 * 60 * 60 * 1000
}

function canEditMessage(
  message: Pick<WhatsAppChatMessage, "fromMe" | "timestamp">
) {
  if (!message.fromMe || !message.timestamp) {
    return false
  }

  const sentAt = Date.parse(message.timestamp)

  if (!Number.isFinite(sentAt)) {
    return false
  }

  return Date.now() - sentAt <= MESSAGE_EDIT_WINDOW_MS
}

function compareMessages(left: WhatsAppChatMessage, right: WhatsAppChatMessage) {
  const leftTime = Date.parse(left.timestamp ?? "")
  const rightTime = Date.parse(right.timestamp ?? "")

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    const diff = leftTime - rightTime

    if (diff !== 0) {
      return diff
    }
  }

  const orderDiff = compareMessageOrderKey(left.orderKey, right.orderKey)

  if (orderDiff !== 0) {
    return orderDiff
  }

  return left.id.localeCompare(right.id)
}

function compareMessageOrderKey(left?: string | null, right?: string | null) {
  const leftParts = parsePostgresTupleId(left)
  const rightParts = parsePostgresTupleId(right)

  if (!leftParts || !rightParts) {
    return 0
  }

  const blockDiff = leftParts.block - rightParts.block

  if (blockDiff !== 0) {
    return blockDiff
  }

  return leftParts.offset - rightParts.offset
}

function parsePostgresTupleId(value?: string | null) {
  const match = String(value ?? "").match(/^\((\d+),(\d+)\)$/)

  if (!match) {
    return null
  }

  return {
    block: Number(match[1]),
    offset: Number(match[2]),
  }
}

function normalizePinDurationHours(value: number) {
  if (value === 24 || value === 168 || value === 720) {
    return value
  }

  return 168
}

function toIsoFromTimestamp(timestamp?: number | null) {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return null
  }

  return new Date(timestamp * 1000).toISOString()
}

function jidToNumber(jid: string) {
  return jid.split("@")[0]?.replace(/\D/g, "") ?? ""
}

function formatPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "")

  if (digits.length === 13 && digits.startsWith("55")) {
    return `+55 ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`
  }

  if (digits.length === 12 && digits.startsWith("55")) {
    return `+55 ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`
  }

  return digits ? `+${digits}` : value
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "")
}

function uniqueClean(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function makeScopedKey(instanceName: string, key: string) {
  return `${instanceName}::${key}`
}

function getCanonicalConversationJid(jid: string, key?: JsonRecord | null) {
  if (jid.includes("@g.us")) {
    return jid
  }

  const candidates = [
    jid,
    readString(key, "remoteJid"),
    readString(key, "remoteJidAlt"),
  ].filter(Boolean) as string[]
  const whatsappJid = candidates.find((candidate) =>
    candidate.endsWith("@s.whatsapp.net")
  )

  return whatsappJid ?? candidates.at(-1) ?? jid
}

function mergeConversations(
  existing: WhatsAppConversation,
  next: WhatsAppConversation
) {
  const existingTime = getConversationActivityTime(existing)
  const nextTime = getConversationActivityTime(next)
  const latest =
    Number.isFinite(nextTime) &&
    (!Number.isFinite(existingTime) || nextTime >= existingTime)
      ? next
      : existing
  const previous = latest === next ? existing : next
  const bestName = pickConversationName(latest, previous)
  const bestNumber = latest.number || previous.number

  return {
    ...latest,
    formattedNumber:
      latest.kind === "group"
        ? latest.formattedNumber
        : latest.formattedNumber || previous.formattedNumber,
    name: bestName,
    number: bestNumber,
    profilePicUrl: latest.profilePicUrl ?? previous.profilePicUrl,
    unreadMessages: Math.max(existing.unreadMessages, next.unreadMessages),
  }
}

function pickConversationName(
  primary: WhatsAppConversation,
  fallback: WhatsAppConversation
) {
  if (isFriendlyConversationName(primary)) {
    return primary.name
  }

  if (isFriendlyConversationName(fallback)) {
    return fallback.name
  }

  return primary.name || fallback.name
}

function isFriendlyConversationName(conversation: WhatsAppConversation) {
  const name = conversation.name.trim()

  if (!name) {
    return false
  }

  return name.replace(/\D/g, "") !== conversation.number.replace(/\D/g, "")
}

function compareConversations(left: WhatsAppConversation, right: WhatsAppConversation) {
  const leftTime = getConversationActivityTime(left)
  const rightTime = getConversationActivityTime(right)

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    const diff = rightTime - leftTime

    if (diff !== 0) {
      return diff
    }
  }

  if (Number.isFinite(rightTime)) {
    return 1
  }

  if (Number.isFinite(leftTime)) {
    return -1
  }

  return left.name.localeCompare(right.name, "pt-BR", {
    numeric: true,
    sensitivity: "base",
  })
}

function getConversationActivityTime(conversation: WhatsAppConversation) {
  const timestamps = [
    Date.parse(conversation.lastMessageAt ?? ""),
    Date.parse(conversation.updatedAt ?? ""),
  ].filter((value) => Number.isFinite(value))

  return timestamps.length ? Math.max(...timestamps) : Number.NaN
}

function compareGroups(left: WhatsAppGroup, right: WhatsAppGroup) {
  return left.subject.localeCompare(right.subject)
}

function quoteSqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

function quoteSqlNullable(value?: string | null) {
  return value ? quoteSqlLiteral(value) : "NULL"
}

function readArray(record: unknown, key: string) {
  if (!isRecord(record)) {
    return null
  }

  const value = record[key]

  return Array.isArray(value) ? value : null
}

function readRecord(record: unknown, key: string) {
  if (!isRecord(record)) {
    return null
  }

  const value = record[key]

  return isRecord(value) ? value : null
}

function readString(record: unknown, key: string) {
  if (!isRecord(record)) {
    return null
  }

  const value = record[key]

  return typeof value === "string" && value.trim() ? value.trim() : null
}

function readNumber(record: unknown, key: string) {
  if (!isRecord(record)) {
    return null
  }

  const value = record[key]

  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function readBoolean(record: unknown, key: string) {
  if (!isRecord(record)) {
    return null
  }

  const value = record[key]

  return typeof value === "boolean" ? value : null
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}
