import { getCurrentUser } from "@/lib/auth"
import { ensureWhatsAppRealtimeWebhooks } from "@/lib/evolution-whatsapp-chat"
import { createWhatsAppRealtimeStream } from "@/lib/whatsapp-realtime"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return Response.json({ message: "Nao autenticado." }, { status: 401 })
  }

  void ensureWhatsAppRealtimeWebhooks({ user: currentUser }).catch(() => undefined)

  return new Response(
    createWhatsAppRealtimeStream({
      signal: request.signal,
      userId: currentUser.email,
    }),
    {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      },
    }
  )
}
