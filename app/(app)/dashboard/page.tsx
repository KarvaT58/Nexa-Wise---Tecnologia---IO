import { AppPageContent } from "@/components/app-page-content"

export default function DashboardPage() {
  return (
    <AppPageContent
      title="Dashboard"
      description="Visão geral das métricas, atendimentos e campanhas da plataforma."
      actions={[
        {
          title: "Chat do WhatsApp",
          href: "/whatsapp/chat",
          description: "Acompanhe as conversas recebidas pelo WhatsApp.",
        },
        {
          title: "Chat por SMS",
          href: "/sms/chat",
          description: "Acesse as conversas recebidas por SMS.",
        },
        {
          title: "Chat por e-mail",
          href: "/email/chat",
          description: "Gerencie conversas recebidas por e-mail.",
        },
      ]}
    />
  )
}
