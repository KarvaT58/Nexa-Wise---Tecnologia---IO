"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

const routeLabels: Record<string, { title: string; parent?: string }> = {
  "/dashboard": { title: "Dashboard" },
  "/fazer-upgrade": { title: "Fazer upgrade" },
  "/perfil": { title: "Perfil" },
  "/relatorios": { title: "Relatórios" },
  "/notificacoes": { title: "Notificações" },
  "/whatsapp": { title: "WhatsApp" },
  "/whatsapp/chat": { title: "Chat do WhatsApp", parent: "/whatsapp" },
  "/whatsapp/grupos": { title: "Grupos do WhatsApp", parent: "/whatsapp" },
  "/whatsapp/campanhas": {
    title: "Campanhas do WhatsApp",
    parent: "/whatsapp",
  },
  "/instagram": { title: "Instagram" },
  "/instagram/chat": { title: "Chat do Instagram", parent: "/instagram" },
  "/instagram/campanha": {
    title: "Campanha no Instagram",
    parent: "/instagram",
  },
  "/sms": { title: "SMS" },
  "/sms/chat": { title: "Chat por SMS", parent: "/sms" },
  "/sms/campanhas": { title: "Campanhas por SMS", parent: "/sms" },
  "/email": { title: "E-mail" },
  "/email/chat": { title: "Chat por e-mail", parent: "/email" },
  "/email/campanhas": { title: "Campanhas por e-mail", parent: "/email" },
  "/contatos": { title: "Contatos" },
  "/sistema-interno": { title: "Sistema interno" },
  "/equipe": { title: "Equipe", parent: "/sistema-interno" },
  "/chat-interno": { title: "Chat interno", parent: "/sistema-interno" },
  "/grupos-internos": {
    title: "Grupo interno",
    parent: "/sistema-interno",
  },
  "/estatisticas": { title: "Estatísticas", parent: "/sistema-interno" },
  "/kanban": { title: "Kanban", parent: "/sistema-interno" },
  "/n8n": { title: "N8N", parent: "/sistema-interno" },
  "/ia": { title: "IA", parent: "/sistema-interno" },
  "/sistema-engine": { title: "Sistema Engine" },
  "/guia-do-sistema": {
    title: "Guia do sistema",
    parent: "/sistema-engine",
  },
  "/ajuda": { title: "Ajuda", parent: "/sistema-engine" },
  "/configuracoes": {
    title: "Configurações",
    parent: "/sistema-engine",
  },
  "/administracao": {
    title: "Administração",
    parent: "/sistema-engine",
  },
}

type BreadcrumbItem = {
  title: string
  href?: string
}

function getBreadcrumbs(pathname: string) {
  const normalizedPath = pathname.replace(/\/$/, "") || "/dashboard"
  const current = routeLabels[normalizedPath] ?? routeLabels["/dashboard"]

  if (normalizedPath === "/dashboard") {
    return [{ title: current.title }]
  }

  const breadcrumbs: BreadcrumbItem[] = [
    { title: "Dashboard", href: "/dashboard" },
  ]

  if (current.parent) {
    const parent = routeLabels[current.parent]

    if (parent) {
      breadcrumbs.push({ title: parent.title })
    }
  }

  breadcrumbs.push({ title: current.title })

  return breadcrumbs
}

export function AppHeader() {
  const pathname = usePathname()
  const breadcrumbs = getBreadcrumbs(pathname)

  return (
    <header className="flex h-12 shrink-0 items-center justify-between rounded-t-xl bg-sidebar px-4 text-sidebar-foreground transition-[width,height] ease-linear">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 bg-primary data-vertical:h-4 data-vertical:self-auto"
        />
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((breadcrumb, index) => {
              const isCurrent = index === breadcrumbs.length - 1

              return (
                <div className="contents" key={breadcrumb.title}>
                  <BreadcrumbItem
                    className={index === 0 ? "hidden md:block" : undefined}
                  >
                    {isCurrent || !breadcrumb.href ? (
                      <BreadcrumbPage>{breadcrumb.title}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink render={<Link href={breadcrumb.href} />}>
                        {breadcrumb.title}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {!isCurrent ? (
                    <BreadcrumbSeparator className="hidden md:block" />
                  ) : null}
                </div>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
  )
}
