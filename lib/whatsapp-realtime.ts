import { getEvolutionInstancePrefix } from "@/lib/evolution-whatsapp-local-store"

export type WhatsAppRealtimeEvent = {
  eventName?: string | null
  fromMe?: boolean | null
  id: string
  instanceName?: string | null
  messageId?: string | null
  presence?: string | null
  receivedAt: string
  remoteJid?: string | null
  type: "sync"
}

type RealtimeClient = {
  emit: (event: WhatsAppRealtimeEvent) => void
  id: string
  userInstancePrefix: string
}

const clients = new Set<RealtimeClient>()
const latestPresenceEvents = new Map<string, WhatsAppRealtimeEvent>()
const ACTIVE_PRESENCE_EVENT_MAX_AGE_MS = 15_000
const ONLINE_PRESENCE_EVENT_MAX_AGE_MS = 75_000

export function createWhatsAppRealtimeStream({
  signal,
  userId,
}: {
  signal: AbortSignal
  userId: string
}) {
  const encoder = new TextEncoder()
  const userInstancePrefix = getEvolutionInstancePrefix(userId)
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let client: RealtimeClient | null = null

  function cleanup() {
    if (client) {
      clients.delete(client)
      client = null
    }

    if (heartbeat) {
      clearInterval(heartbeat)
      heartbeat = null
    }
  }

  return new ReadableStream<Uint8Array>({
    cancel() {
      cleanup()
    },
    start(controller) {
      client = {
        emit(event) {
          controller.enqueue(
            encoder.encode(formatSseMessage("sync", event))
          )
        },
        id: `client_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        userInstancePrefix,
      }
      clients.add(client)
      controller.enqueue(
        encoder.encode(
          formatSseMessage("ready", {
            connectedAt: new Date().toISOString(),
          })
        )
      )

      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`))
      }, 25000)

      signal.addEventListener("abort", cleanup, { once: true })
    },
  })
}

export function publishWhatsAppRealtimeEvent(event: WhatsAppRealtimeEvent) {
  recordWhatsAppPresenceEvent(event)

  for (const client of clients) {
    if (
      event.instanceName &&
      !event.instanceName.startsWith(client.userInstancePrefix)
    ) {
      continue
    }

    client.emit(event)
  }
}

export function getLatestWhatsAppPresenceEvent({
  instanceName,
  remoteJids,
}: {
  instanceName: string
  remoteJids: string[]
}) {
  for (const remoteJid of remoteJids) {
    const key = makePresenceKey(instanceName, remoteJid)
    const event = latestPresenceEvents.get(key)

    if (event && isFreshPresenceEvent(event)) {
      return event
    }

    if (event) {
      latestPresenceEvents.delete(key)
    }
  }

  return null
}

function isFreshPresenceEvent(event: WhatsAppRealtimeEvent) {
  const presence = event.presence?.trim().toLowerCase()

  if (!presence || presence.includes("offline") || presence.includes("unavailable")) {
    return true
  }

  const receivedAt = Date.parse(event.receivedAt)

  if (!Number.isFinite(receivedAt)) {
    return false
  }

  const maxAge =
    presence.includes("compos") ||
    presence.includes("typing") ||
    presence.includes("record")
      ? ACTIVE_PRESENCE_EVENT_MAX_AGE_MS
      : ONLINE_PRESENCE_EVENT_MAX_AGE_MS

  return Date.now() - receivedAt <= maxAge
}

function recordWhatsAppPresenceEvent(event: WhatsAppRealtimeEvent) {
  if (!event.instanceName || !event.remoteJid || !event.presence) {
    return
  }

  latestPresenceEvents.set(
    makePresenceKey(event.instanceName, event.remoteJid),
    event
  )
}

function makePresenceKey(instanceName: string, remoteJid: string) {
  return `${instanceName}::${remoteJid}`
}

function formatSseMessage(eventName: string, data: unknown) {
  return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`
}
