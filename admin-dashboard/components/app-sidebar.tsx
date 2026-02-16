"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import useSWR from "swr"
import {
  IconChartBar,
  IconDashboard,
  IconDatabase,
  IconFolder,
  IconHelp,
  IconInnerShadowTop,
  IconListDetails,
  IconReport,
  IconSearch,
  IconSettings,
  IconSparkles,
  IconTarget,
  IconUsers,
} from "@tabler/icons-react"

import { NavDocuments } from "@/components/nav-documents"
import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import { useModalSystem } from "@/components/modal-system-provider"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { fetchApi } from "@/lib/api"
import { useI18n } from "@/lib/i18n"

type AccountPayload = {
  full_name?: string | null
  email?: string | null
  avatar_url?: string | null
}

const BADGE_RULES = {
  library: {
    source: "catalog_v1",
    effectiveDate: "2026-01-15",
  },
  reports: {
    source: "pipeline_stream_v1",
    effectiveDate: "2026-01-15",
  },
} as const

const fetcher = <T,>(path: string) => fetchApi<T>(path)

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const { openHelp, openSearch } = useModalSystem()
  const { isMobile, setOpenMobile } = useSidebar()
  const { messages } = useI18n()

  const { data: account } = useSWR<AccountPayload>("/api/v1/admin/account", fetcher)

  React.useEffect(() => {
    if (!isMobile) return
    setOpenMobile(false)
  }, [isMobile, pathname, setOpenMobile])

  const navMainSections = React.useMemo(
    () => [
      {
        label: messages.sidebar.pilotage,
        items: [
          {
            title: messages.sidebar.dashboard,
            url: "/dashboard",
            icon: IconDashboard,
          },
          {
            title: messages.sidebar.leads,
            url: "/leads",
            icon: IconUsers,
          },
          {
            title: messages.sidebar.tasks,
            url: "/tasks",
            icon: IconListDetails,
          },
          {
            title: messages.sidebar.opportunities,
            url: "/opportunities",
            icon: IconTarget,
          },
          {
            title: messages.sidebar.projects,
            url: "/projects",
            icon: IconFolder,
          },
          {
            title: messages.sidebar.campaigns,
            url: "/campaigns",
            icon: IconDatabase,
          },
        ],
      },
      {
        label: messages.sidebar.analysis,
        items: [
          {
            title: messages.sidebar.analytics,
            url: "/analytics",
            icon: IconChartBar,
          },
          {
            title: messages.sidebar.research,
            url: "/research",
            icon: IconSearch,
          },
          {
            title: messages.sidebar.systems,
            url: "/systems",
            icon: IconSettings,
          },
          {
            title: messages.sidebar.assistantAi,
            url: "/assistant",
            icon: IconSparkles,
          },
        ],
      },
    ],
    [messages]
  )

  const documents = React.useMemo(
    () => [
      {
        name: messages.sidebar.library,
        url: "/library",
        icon: IconDatabase,
        badge: messages.sidebar.badgeNew,
        badgeTooltip: messages.sidebar.badgeNewHint,
        badgeSource: BADGE_RULES.library.source,
        badgeDate: BADGE_RULES.library.effectiveDate,
      },
      {
        name: messages.sidebar.reports,
        url: "/reports",
        icon: IconReport,
        badge: messages.sidebar.badgeLive,
        badgeTooltip: messages.sidebar.badgeLiveHint,
        badgeSource: BADGE_RULES.reports.source,
        badgeDate: BADGE_RULES.reports.effectiveDate,
      },
    ],
    [messages]
  )

  const navSecondary = React.useMemo(
    () => [
      {
        title: messages.sidebar.settings,
        url: "/settings",
        icon: IconSettings,
      },
      {
        title: messages.sidebar.team,
        url: "/settings/team",
        icon: IconUsers,
      },
      {
        title: messages.sidebar.dev,
        url: "/settings/dev",
        icon: IconSettings,
      },
      {
        title: messages.sidebar.getHelp,
        icon: IconHelp,
        onClick: openHelp,
      },
      {
        title: messages.sidebar.search,
        icon: IconSearch,
        onClick: openSearch,
      },
    ],
    [messages, openHelp, openSearch]
  )

  const user = React.useMemo(
    () => ({
      name: account?.full_name?.trim() || messages.sidebar.userFallbackName,
      email: account?.email?.trim() || messages.sidebar.userFallbackEmail,
      avatar: account?.avatar_url?.trim() || undefined,
    }),
    [account, messages]
  )

  return (
    <Sidebar id="app-sidebar" collapsible="offcanvas" {...props}>
      <SidebarHeader className="pt-4 px-4 pb-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5 hover:bg-transparent"
            >
              <a href="/dashboard">
                <div className="flex aspect-square size-6 items-center justify-center rounded-lg bg-black text-white">
                  <IconInnerShadowTop className="size-4" />
                </div>
                <span className="text-lg font-bold tracking-tight">{messages.appName}</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain sections={navMainSections} />
        <NavDocuments items={documents} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}

