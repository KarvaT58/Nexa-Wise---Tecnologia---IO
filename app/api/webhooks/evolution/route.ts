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
    readString(root, "instanceName") ??
    readString(root, "instance_name")
  const candidates = collectRealtimeCandidates(payload)
  const events = new Map<string, WhatsAppRealtimeEvent>()

  for (const candidate of candidates) {
    const key = readRecord(candidate, "key")
    const remoteJid =
      readString(key, "remoteJid") ??
      readString(candidate, "remoteJid") ??
      readString(candidate, "jid")
    const messageId =
      readString(key, "id") ??
      readString(candidate, "messageId") ??
      readString(candidate, "message_id") ??
      readString(candidate, "id")
    const instanceName =
      readString(candidate, "instance") ??
      readString(candidate, "instanceName") ??
      readString(candidate, "instance_name") ??
      rootInstance
    const fromMe = readBoolean(key, "fromMe") ?? readBoolean(candidate, "fromMe")
    const event: WhatsAppRealtimeEvent = {
      eventName,
      fromMe,
      id: `wre_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      instanceName,
      messageId,
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
        readString(current, "remoteJid")
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
