import { requireCurrentUser } from "@/lib/auth"
import { WhatsAppChatPanel } from "./_components/whatsapp-chat-panel"

export default async function ChatWhatsappPage() {
  await requireCurrentUser()

  return <WhatsAppChatPanel />
}
