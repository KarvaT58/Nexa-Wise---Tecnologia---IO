"use client"

import * as React from "react"
import {
  BookOpenTextIcon,
  CameraIcon,
  ChartLineIcon,
  CircleHelpIcon,
  Columns3Icon,
  ContactIcon,
  LayoutDashboardIcon,
  MailIcon,
  MicrochipIcon,
  MessageCircleIcon,
  MessagesSquareIcon,
  PhoneIcon,
  SettingsIcon,
  ShieldUserIcon,
  UsersIcon,
  WorkflowIcon,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { NexaWiseLogo, TeamSwitcher } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar"
import { type CurrentUser } from "@/lib/auth"

const data = {
  teams: [
    {
      name: "Nexa Wise",
      logo: <NexaWiseLogo />,
      plan: "Tecnologia IO",
    },
  ],
  navExternal: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: <LayoutDashboardIcon />,
    },
    {
      title: "WhatsApp",
      url: "/whatsapp",
      icon: <MessageCircleIcon />,
      items: [
        {
          title: "Chat do WhatsApp",
          url: "/whatsapp/chat",
        },
        {
          title: "Grupos do WhatsApp",
          url: "/whatsapp/grupos",
        },
        {
          title: "Campanhas do WhatsApp",
          url: "/whatsapp/campanhas",
        },
      ],
    },
    {
      title: "Instagram",
      url: "/instagram",
      icon: <CameraIcon />,
      items: [
        {
          title: "Chat do Instagram",
          url: "/instagram/chat",
        },
        {
          title: "Campanha no Instagram",
          url: "/instagram/campanha",
        },
      ],
    },
    {
      title: "SMS",
      url: "/sms",
      icon: <PhoneIcon />,
      items: [
        {
          title: "Chat por SMS",
          url: "/sms/chat",
        },
        {
          title: "Campanhas por SMS",
          url: "/sms/campanhas",
        },
      ],
    },
    {
      title: "E-mail",
      url: "/email",
      icon: <MailIcon />,
      items: [
        {
          title: "Chat por e-mail",
          url: "/email/chat",
        },
        {
          title: "Campanhas por e-mail",
          url: "/email/campanhas",
        },
      ],
    },
    {
      title: "Contatos",
      url: "/contatos",
      icon: <ContactIcon />,
    },
  ],
  navInternal: [
    {
      title: "Equipe",
      url: "/equipe",
      icon: <UsersIcon />,
    },
    {
      title: "Chat interno",
      url: "/chat-interno",
      icon: <MessagesSquareIcon />,
    },
    {
      title: "Grupo interno",
      url: "/grupos-internos",
      icon: <UsersIcon />,
    },
    {
      title: "Estatisticas",
      url: "/estatisticas",
      icon: <ChartLineIcon />,
    },
    {
      title: "Kanban",
      url: "/kanban",
      icon: <Columns3Icon />,
    },
    {
      title: "N8N",
      url: "/n8n",
      icon: <WorkflowIcon />,
    },
    {
      title: "IA",
      url: "/ia",
      icon: <MicrochipIcon />,
    },
  ],
  navEngine: [
    {
      title: "Ajuda",
      url: "/ajuda",
      icon: <CircleHelpIcon />,
    },
    {
      title: "Guia do sistema",
      url: "/guia-do-sistema",
      icon: <BookOpenTextIcon />,
    },
    {
      title: "Configuracoes",
      url: "/configuracoes",
      icon: <SettingsIcon />,
    },
    {
      title: "Administracao",
      url: "/administracao",
      icon: <ShieldUserIcon />,
      separatorBefore: true,
    },
  ],
}

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: CurrentUser
}) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain label="Sistema externo" items={data.navExternal} />
        <NavMain label="Sistema interno" items={data.navInternal} />
      </SidebarContent>
      <SidebarFooter>
        <NavMain
          className="p-0"
          label="Sistema Engine"
          items={data.navEngine}
        />
        <NavUser
          user={{
            avatar: user.image ?? "",
            email: user.email,
            name: user.name,
            plan: user.plan,
          }}
        />
      </SidebarFooter>
    </Sidebar>
  )
}
