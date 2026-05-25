import { WhatsAppSettingsPanel } from "./_components/whatsapp-settings-panel"
import { requireCurrentUser } from "@/lib/auth"

export default async function ConfiguracoesPage() {
  const user = await requireCurrentUser()

  return <WhatsAppSettingsPanel user={user} />
}
