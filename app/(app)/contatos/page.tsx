import { ContactsPanel } from "./_components/contacts-panel"
import { requireCurrentUser } from "@/lib/auth"

export default async function ContatosPage() {
  await requireCurrentUser()

  return <ContactsPanel />
}
