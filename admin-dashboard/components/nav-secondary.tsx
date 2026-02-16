"use client"

import * as React from "react"
import { type Icon } from "@tabler/icons-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useI18n } from "@/lib/i18n"

export function NavSecondary({
  items,
  ...props
}: {
  items: {
    title: string
    url?: string
    icon: Icon
    onClick?: () => void
  }[]
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const pathname = usePathname()
  const { messages } = useI18n()

  return (
    <SidebarGroup {...props}>
      <SidebarGroupLabel>{messages.sidebar.support}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const url = item.url || ""
            const renderAsButton = Boolean(item.onClick && (!url || url === "#"))
            const isActive = !renderAsButton && Boolean(url) && pathname === url

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  className="focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-1"
                >
                  {renderAsButton ? (
                    <button
                      type="button"
                      onClick={item.onClick}
                      aria-haspopup="dialog"
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </button>
                  ) : (
                    <Link
                      href={url}
                      onClick={() => {
                        if (!item.onClick) return
                        item.onClick()
                      }}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
