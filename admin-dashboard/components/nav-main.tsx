"use client"

import { type Icon } from "@tabler/icons-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { AddLeadSheet } from "@/components/add-lead-sheet"

export function NavMain({
  items,
  sections,
  showQuickLead = true,
}: {
  items?: {
    title: string
    url: string
    icon?: Icon
  }[]
  sections?: {
    label: string
    items: {
      title: string
      url: string
      icon?: Icon
    }[]
  }[]
  showQuickLead?: boolean
}) {
  const pathname = usePathname()
  const groups =
    sections && sections.length > 0
      ? sections
      : [{ label: "Menu principal", items: items || [] }]

  return (
    <SidebarGroup className="space-y-2">
      <SidebarGroupLabel>Menu principal</SidebarGroupLabel>
      <SidebarGroupContent className="flex flex-col gap-4">
        {showQuickLead ? (
          <SidebarMenu>
            <SidebarMenuItem>
              <AddLeadSheet />
            </SidebarMenuItem>
          </SidebarMenu>
        ) : null}
        {groups.map((group) => (
          <div key={group.label} className="space-y-1">
            {groups.length > 1 ? <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</p> : null}
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    isActive={pathname === item.url}
                    className="h-10 rounded-lg px-3 transition-colors hover:bg-accent/50"
                  >
                    <Link href={item.url} className="flex items-center gap-3">
                      {item.icon ? <item.icon className="!size-5" /> : null}
                      <span className="font-medium">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </div>
        ))}
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
