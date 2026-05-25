"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  BellIcon,
  ChartNoAxesColumnIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  LogOutIcon,
  SparklesIcon,
  UserRoundIcon,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { type AppPlanCode } from "@/lib/plans"

const PLAN_BADGES: Record<AppPlanCode, { code: string; name: string }> = {
  basic: {
    code: "Basico",
    name: "Basico",
  },
  pro: {
    code: "Pro",
    name: "Profissional",
  },
  master: {
    code: "Master",
    name: "Master",
  },
}

export function NavUser({
  user,
}: {
  user: {
    name: string
    email: string
    avatar: string
    plan: AppPlanCode
  }
}) {
  const { isMobile } = useSidebar()
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [showLogoutConfirmation, setShowLogoutConfirmation] =
    React.useState(false)

  React.useEffect(() => {
    if (!showLogoutConfirmation) {
      return
    }

    const focusTimer = window.setTimeout(() => {
      document.getElementById("logout-confirm-button")?.focus()
    }, 0)

    return () => window.clearTimeout(focusTimer)
  }, [showLogoutConfirmation])

  function closeLogoutConfirmation() {
    setShowLogoutConfirmation(false)
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", {
      method: "POST",
    })
    setShowLogoutConfirmation(false)
    toast.success("Você saiu da conta.", {
      description: "Sua sessão foi encerrada com segurança.",
    })
    router.replace("/login")
    router.refresh()
  }

  function handleLogoutDialogKeyDown(
    event: React.KeyboardEvent<HTMLDivElement>
  ) {
    if (event.key === "Escape") {
      event.preventDefault()
      closeLogoutConfirmation()
      return
    }

    if (event.key === "Enter") {
      event.preventDefault()
      handleLogout()
      return
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault()
      document.getElementById("logout-cancel-button")?.focus()
      return
    }

    if (event.key === "ArrowRight") {
      event.preventDefault()
      document.getElementById("logout-confirm-button")?.focus()
    }
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  size="lg"
                  className="aria-expanded:bg-muted"
                />
              }
            >
              <Avatar>
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback>CN</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">
                    {user.name}
                  </span>
                  <PlanBadge plan={user.plan} />
                </div>
                <span className="truncate text-xs">{user.email}</span>
              </div>
              {open ? (
                <ChevronUpIcon className="ml-auto size-4" />
              ) : (
                <ChevronDownIcon className="ml-auto size-4" />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="min-w-56 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar>
                      <AvatarImage src={user.avatar} alt={user.name} />
                      <AvatarFallback>CN</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-medium">
                          {user.name}
                        </span>
                        <PlanBadge plan={user.plan} />
                      </div>
                      <span className="truncate text-xs">{user.email}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  render={<Link href="/fazer-upgrade" />}
                  onClick={() => setOpen(false)}
                >
                  <SparklesIcon className="text-primary" />
                  Fazer upgrade
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  render={<Link href="/perfil" />}
                  onClick={() => setOpen(false)}
                >
                  <UserRoundIcon />
                  Perfil
                </DropdownMenuItem>
                <DropdownMenuItem
                  render={<Link href="/relatorios" />}
                  onClick={() => setOpen(false)}
                >
                  <ChartNoAxesColumnIcon />
                  Relatórios
                </DropdownMenuItem>
                <DropdownMenuItem
                  render={<Link href="/notificacoes" />}
                  onClick={() => setOpen(false)}
                >
                  <BellIcon />
                  Notificações
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                className="text-destructive focus:text-destructive"
                onClick={() => setShowLogoutConfirmation(true)}
              >
                <LogOutIcon className="text-destructive" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      {showLogoutConfirmation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeLogoutConfirmation()
            }
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="logout-title"
            aria-describedby="logout-description"
            className="w-full max-w-sm rounded-xl border bg-popover p-5 text-popover-foreground shadow-xl"
            onKeyDown={handleLogoutDialogKeyDown}
          >
            <div className="flex flex-col gap-2">
              <h2 id="logout-title" className="text-lg font-semibold">
                Deseja sair?
              </h2>
              <p
                id="logout-description"
                className="text-sm text-muted-foreground"
              >
                Você será desconectado e voltará para a tela de login.
              </p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                id="logout-cancel-button"
                type="button"
                variant="outline"
                onClick={closeLogoutConfirmation}
              >
                Cancelar
              </Button>
              <Button
                id="logout-confirm-button"
                type="button"
                variant="destructive"
                className="bg-destructive px-4 font-semibold text-white hover:bg-destructive/90 focus-visible:ring-destructive/40 dark:text-white"
                onClick={handleLogout}
              >
                Sair
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function PlanBadge({ plan }: { plan: AppPlanCode }) {
  const currentPlan = PLAN_BADGES[plan]

  return (
    <span
      className="shrink-0 text-xs font-semibold leading-none text-primary"
      title={`${currentPlan.code} - ${currentPlan.name}`}
    >
      {currentPlan.code}
    </span>
  )
}
