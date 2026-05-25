import { getCurrentUser } from "@/lib/auth"
import { requestWhatsAppConversationPresence, WhatsAppChatError } from "@/lib/evolution-whatsapp-chat"
import { getEvolutionInstancePrefix } from "@/lib/evolution-whatsapp-local-store"
import { getLatestWhatsAppPresenceEvent } from "@/lib/whatsapp-realtime"

type PresenceRequest = {
  instanceName?: string
  number?: string
  remoteJid?: string
}

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  let body: PresenceRequest

  try {
    body = (await request.json()) as PresenceRequest
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

  const instanceName = body.instanceName ?? ""
  const remoteJid = body.remoteJid ?? ""

  if (!instanceName.startsWith(getEvolutionInstancePrefix(currentUser.email))) {
    return Response.json({ message: "Instancia invalida." }, { status: 403 })
  }

  try {
    await requestWhatsAppConversationPresence({
      instanceName,
      number: body.number,
      remoteJid,
    })

    const event = getLatestWhatsAppPresenceEvent({
      instanceName,
      remoteJids: getPresenceLookupJids(remoteJid, body.number),
    })

    return Response.json({ event, ok: true })
  } catch (error) {
    if (error instanceof WhatsAppChatError) {
      return Response.json(
        { message: error.message },
        { status: error.status }
      )
    }

    return Response.json(
      { message: "Nao foi possivel sincronizar a presenca." },
      { status: 500 }
    )
  }
}

function getPresenceLookupJids(remoteJid: string, number?: string | null) {
  const digits = normalizePhone(number ?? "")
  const values = [remoteJid]

  if (digits) {
    values.push(`${digits}@s.whatsapp.net`, digits)
  }

  return [...new Set(values.filter(Boolean))]
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "")
}
