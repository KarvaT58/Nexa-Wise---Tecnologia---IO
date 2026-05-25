import { requireCurrentUser } from "@/lib/auth"
import { WhatsAppGroupsPanel } from "./_components/whatsapp-groups-panel"

export default async function GruposWhatsappPage() {
  await requireCurrentUser()

  return <WhatsAppGroupsPanel />
}
