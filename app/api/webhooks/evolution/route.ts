import { handleEvolutionCampaignWebhook } from "@/lib/whatsapp-campaigns"
import {
  publishWhatsAppRealtimeEvent,
  type WhatsAppRealtimeEvent,
} from "@/lib/whatsapp-realtime"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  const configuredSecret = process.env.EVOLUTION_WEBHOOK_SECRET?.trim()

  if (configuredSecret) {
    const url = new URL(request.url)
    const receivedSecret =
      url.searchParams.get("secret") ??
      request.headers.get("x-webhook-secret") ??
      request.headers.get("x-evolution-webhook-secret")

    if (receivedSecret !== configuredSecret) {
      return Response.json({ message: "Webhook invalido." }, { status: 401 })
    }
  }

  let payload: unknown

  try {
    payload = await request.json()
  } catch {
    return Response.json(
      { message: "Payload da Evolution invalido." },
      { status: 400 }
    )
  }

  const realtimeEvents = extractRealtimeEvents(payload)

  for (const event of realtimeEvents) {
    publishWhatsAppRealtimeEvent(event)
  }

  const result = await handleEvolutionCampaignWebhook(payload)

  return Response.json({
    ok: true,
    realtimeEvents: realtimeEvents.length,
    ...result,
  })
}

type JsonRecord = Record<string, unknown>

function extractRealtimeEvents(payload: unknown): WhatsAppRealtimeEvent[] {
  const root = isRecord(payload) ? payload : {}
  const eventName =
    readString(root, "event") ??
    readString(root, "eventName") ??
    readString(root, "type")
  const rootInstance =
    readString(root, "instance") ??
    readString(readRecord(root, "instance"), "name") ??
    readString(readRecord(root, "instance"), "instanceName") ??
    readString(readRecord(root, "instance"), "instance_name") ??
    readString(root, "instanceName") ??
    readString(root, "instance_name")
  const candidates = collectRealtimeCandidates(payload)
  const events = new Map<string, WhatsAppRealtimeEvent>()

  for (const event of collectPresenceRealtimeEvents({
    eventName,
    payload,
    rootInstance,
  })) {
    const mapKey = `${event.instanceName ?? ""}:${event.remoteJid ?? ""}:${event.presence ?? ""}:${event.eventName ?? ""}`

    events.set(mapKey, event)
  }

  for (const candidate of candidates) {
    const key = readRecord(candidate, "key")
    const remoteJid =
      readString(key, "remoteJid") ??
      readString(key, "remoteJidAlt") ??
      readString(candidate, "remoteJid") ??
      readString(candidate, "remoteJidAlt") ??
      readString(candidate, "jid") ??
      readString(candidate, "id") ??
      readString(candidate, "participant") ??
      readString(candidate, "chatId") ??
      readString(candidate, "from") ??
      readString(candidate, "sender") ??
      readString(candidate, "senderJid")
    const messageId =
      readString(key, "id") ??
      readString(candidate, "messageId") ??
      readString(candidate, "message_id") ??
      readString(candidate, "id")
    const instanceName =
      readString(candidate, "instance") ??
      readString(readRecord(candidate, "instance"), "name") ??
      readString(readRecord(candidate, "instance"), "instanceName") ??
      readString(readRecord(candidate, "instance"), "instance_name") ??
      readString(candidate, "instanceName") ??
      readString(candidate, "instance_name") ??
      rootInstance
    const fromMe = readBoolean(key, "fromMe") ?? readBoolean(candidate, "fromMe")
    const presence = extractPresenceValue(candidate)
    const event: WhatsAppRealtimeEvent = {
      eventName,
      fromMe,
      id: `wre_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      instanceName,
      messageId,
      presence,
      receivedAt: new Date().toISOString(),
      remoteJid,
      type: "sync",
    }
    const mapKey = `${instanceName ?? ""}:${remoteJid ?? ""}:${messageId ?? ""}:${eventName ?? ""}`

    events.set(mapKey, event)
  }

  if (!events.size) {
    events.set("fallback", {
      eventName,
      id: `wre_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      instanceName: rootInstance,
      receivedAt: new Date().toISOString(),
      type: "sync",
    })
  }

  return [...events.values()]
}

function collectPresenceRealtimeEvents({
  eventName,
  payload,
  rootInstance,
}: {
  eventName?: string | null
  payload: unknown
  rootInstance?: string | null
}) {
  const events: WhatsAppRealtimeEvent[] = []
  const stack = [payload]

  while (stack.length) {
    const current = stack.pop()

    if (Array.isArray(current)) {
      stack.push(...current)
      continue
    }

    if (!isRecord(current)) {
      continue
    }

    const instanceName =
      readString(current, "instance") ??
      readString(readRecord(current, "instance"), "name") ??
      readString(readRecord(current, "instance"), "instanceName") ??
      readString(readRecord(current, "instance"), "instance_name") ??
      readString(current, "instanceName") ??
      readString(current, "instance_name") ??
      rootInstance
    const currentJid =
      readString(current, "remoteJid") ??
      readString(current, "remoteJidAlt") ??
      readString(current, "jid") ??
      readString(current, "id") ??
      readString(current, "participant") ??
      readString(current, "chatId") ??
      readString(current, "from") ??
      readString(current, "sender") ??
      readString(current, "senderJid")
    const directPresence = extractPresenceValue(current)

    if (directPresence && currentJid) {
      events.push({
        eventName,
        id: `wre_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        instanceName,
        presence: directPresence,
        receivedAt: new Date().toISOString(),
        remoteJid: currentJid,
        type: "sync",
      })
    }

    const presencesValue = current.presences
    const presences = isRecord(presencesValue) ? presencesValue : null
    const presenceEntries = Array.isArray(presencesValue)
      ? presencesValue.map((presenceRecord, index) => [String(index), presenceRecord] as const)
      : presences
        ? Object.entries(presences)
        : []

    if (presenceEntries.length) {
      for (const [jid, presenceRecord] of presenceEntries) {
        if (!isRecord(presenceRecord)) {
          continue
        }

        const presence = extractPresenceValue(presenceRecord)
        const remoteJid =
          readString(presenceRecord, "remoteJid") ??
          readString(presenceRecord, "remoteJidAlt") ??
          readString(presenceRecord, "jid") ??
          readString(presenceRecord, "id") ??
          readString(presenceRecord, "participant") ??
          readString(presenceRecord, "chatId") ??
          readString(presenceRecord, "from") ??
          readString(presenceRecord, "sender") ??
          readString(presenceRecord, "senderJid") ??
          (jid.includes("@") ? jid : null) ??
          currentJid

        if (!presence || !remoteJid) {
          continue
        }

        events.push({
          eventName,
          id: `wre_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          instanceName,
          presence,
          receivedAt: new Date().toISOString(),
          remoteJid,
          type: "sync",
        })
      }
    }

    for (const value of Object.values(current)) {
      if (Array.isArray(value) || isRecord(value)) {
        stack.push(value)
      }
    }
  }

  return events
}

function collectRealtimeCandidates(payload: unknown) {
  const records: JsonRecord[] = []
  const stack = [payload]

  while (stack.length) {
    const current = stack.pop()

    if (Array.isArray(current)) {
      stack.push(...current)
      continue
    }

    if (!isRecord(current)) {
      continue
    }

    const key = readRecord(current, "key")
    const hasMessageMarker = Boolean(
      (key && (readString(key, "id") || readString(key, "remoteJid"))) ||
        readString(current, "messageId") ||
        readString(current, "message_id") ||
        readString(current, "remoteJid") ||
        extractPresenceValue(current)
    )

    if (hasMessageMarker) {
      records.push(current)
    }

    for (const value of Object.values(current)) {
      if (Array.isArray(value) || isRecord(value)) {
        stack.push(value)
      }
    }
  }

  return records
}

function extractPresenceValue(record: unknown) {
  const rawPresence =
    readString(record, "lastKnownPresence") ??
    readString(record, "presence") ??
    readString(record, "status") ??
    readString(record, "state")
  const normalized = rawPresence?.trim().toLowerCase()

  if (!normalized) {
    return null
  }

  if (normalized.includes("compos") || normalized.includes("typing")) {
    return "typing"
  }

  if (normalized.includes("record")) {
    return "recording"
  }

  if (normalized.includes("unavailable") || normalized.includes("offline")) {
    return "offline"
  }

  if (
    normalized.includes("available") ||
    normalized.includes("online") ||
    normalized.includes("paused")
  ) {
    return "online"
  }

  return null
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
