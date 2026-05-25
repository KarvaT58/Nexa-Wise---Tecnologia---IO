import { requireCurrentUser } from "@/lib/auth"
import { WhatsAppCampaignsPanel } from "./_components/whatsapp-campaigns-panel"

export default async function CampanhasWhatsappPage() {
  await requireCurrentUser()

  return <WhatsAppCampaignsPanel />
}
