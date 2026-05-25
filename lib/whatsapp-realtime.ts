import { getEvolutionInstancePrefix } from "@/lib/evolution-whatsapp-local-store"

export type WhatsAppRealtimeEvent = {
  eventName?: string | null
  fromMe?: boolean | null
  id: string
  instanceName?: string | null
  messageId?: string | null
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

function formatSseMessage(eventName: string, data: unknown) {
  return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`
}
