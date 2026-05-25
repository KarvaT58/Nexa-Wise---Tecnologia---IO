"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { ChevronRightIcon } from "lucide-react"

type NavMainItem = {
  title: string
  url: string
  icon?: React.ReactNode
  separatorBefore?: boolean
  items?: {
    title: string
    url: string
  }[]
}

export function NavMain({
  className,
  label = "Sistema externo",
  items,
}: {
  className?: string
  label?: string
  items: NavMainItem[]
}) {
  const pathname = usePathname()

  return (
    <SidebarGroup className={className}>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const hasSubItems = Boolean(item.items?.length)
          const isActive = isItemActive(item, pathname)

          if (!hasSubItems) {
            return (
              <React.Fragment key={item.title}>
                {item.separatorBefore ? <NavMenuSeparator /> : null}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isActive}
                    tooltip={item.title}
                    className="relative before:absolute before:left-0 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-primary before:opacity-0 data-active:before:opacity-100 group-data-[collapsible=icon]/sidebar-wrapper:before:hidden"
                    render={<Link href={item.url} />}
                  >
                    {item.icon}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </React.Fragment>
            )
          }

          return (
            <React.Fragment key={`${item.title}-${pathname}`}>
              {item.separatorBefore ? <NavMenuSeparator /> : null}
              <NavMenuBranch item={item} pathname={pathname} />
            </React.Fragment>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}

function NavMenuSeparator() {
  return (
    <SidebarMenuItem
      aria-hidden="true"
      className="px-2 py-1 group-data-[collapsible=icon]/sidebar-wrapper:hidden"
    >
      <div className="h-px rounded-full bg-linear-to-r from-transparent via-primary/85 to-transparent" />
    </SidebarMenuItem>
  )
}

function NavMenuBranch({
  item,
  pathname,
}: {
  item: NavMainItem
  pathname: string
}) {
  const isActive = isItemActive(item, pathname)
  const { setOpen: setSidebarOpen, state: sidebarState } = useSidebar()
  const [open, setOpen] = React.useState(isActive)

  function handleOpenChange(nextOpen: boolean) {
    if (sidebarState === "collapsed") {
      setSidebarOpen(true)
      setOpen(true)
      return
    }

    setOpen(nextOpen)
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={handleOpenChange}
      className="group/collapsible"
      render={<SidebarMenuItem />}
    >
      <CollapsibleTrigger
        render={
          <SidebarMenuButton
            isActive={isActive}
            tooltip={item.title}
            className="relative before:absolute before:left-0 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-primary before:opacity-0 data-active:before:opacity-100 group-data-[collapsible=icon]/sidebar-wrapper:before:hidden"
          />
        }
      >
        {item.icon}
        <span>{item.title}</span>
        <ChevronRightIcon className="ml-auto size-4 transition-transform duration-200 group-data-open/collapsible:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenuSub>
          {item.items?.map((subItem) => {
            const subItemActive = pathname === subItem.url

            return (
              <SidebarMenuSubItem key={subItem.title}>
                <SidebarMenuSubButton
                  isActive={subItemActive}
                  className="relative before:absolute before:left-0 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-primary before:opacity-0 data-active:before:opacity-100"
                  render={<Link href={subItem.url} />}
                >
                  <span>{subItem.title}</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            )
          })}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  )
}

function isItemActive(item: NavMainItem, pathname: string) {
  return (
    pathname === item.url ||
    Boolean(item.items?.some((subItem) => pathname === subItem.url))
  )
}
