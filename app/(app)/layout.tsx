import * as React from "react"

import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { requireCurrentUser } from "@/lib/auth"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireCurrentUser()

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset className="h-svh overflow-hidden bg-sidebar p-2 pl-0">
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-sidebar">
          <AppHeader />
          <div className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-hidden rounded-xl bg-background px-4 pb-6 pt-5">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
