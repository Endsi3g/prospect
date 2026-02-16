"use client"

import {
  type Icon,
} from "@tabler/icons-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useI18n } from "@/lib/i18n"

export function NavDocuments({
  items,
}: {
  items: {
    name: string
    url: string
    icon: Icon
    badge?: string
    badgeTooltip?: string
    badgeSource?: string
    badgeDate?: string
  }[]
}) {
  const pathname = usePathname()
  const { messages } = useI18n()

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>{messages.sidebar.resources}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.name}>
            <SidebarMenuButton asChild className="focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-1">
              <Link href={item.url} aria-current={pathname === item.url ? "page" : undefined}>
                <item.icon />
                <span>{item.name}</span>
              </Link>
            </SidebarMenuButton>
            {item.badge ? (
              <SidebarMenuBadge>
                {item.badgeTooltip || item.badgeSource || item.badgeDate ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                        {item.badge}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="right" align="end" className="max-w-52 text-xs">
                      {item.badgeTooltip ? <p>{item.badgeTooltip}</p> : null}
                      {item.badgeSource ? (
                        <p>
                          {messages.sidebar.badgeSource}: {item.badgeSource}
                        </p>
                      ) : null}
                      {item.badgeDate ? (
                        <p>
                          {messages.sidebar.badgeEffectiveDate}: {item.badgeDate}
                        </p>
                      ) : null}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                    {item.badge}
                  </Badge>
                )}
              </SidebarMenuBadge>
            ) : null}
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
