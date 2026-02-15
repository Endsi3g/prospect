"use client"

import * as React from "react"
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
import { messages } from "@/lib/i18n"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const data = {
  user: {
    name: "shadcn",
    email: "m@example.com",
    avatar: "/globe.svg",
  },
  navMainSections: [
    {
      label: "Pilotage",
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
      label: "Analyse",
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
  documents: [
    {
      name: "Bibliotheque",
      url: "/library",
      icon: IconDatabase,
      badge: "Nouveau",
    },
    {
      name: "Rapports",
      url: "/reports",
      icon: IconReport,
      badge: "Live",
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { openHelp, openSearch } = useModalSystem()
  const navSecondary = [
    {
      title: messages.sidebar.settings,
      url: "/settings",
      icon: IconSettings,
    },
    {
      title: "Equipe",
      url: "/settings/team",
      icon: IconUsers,
    },
    {
      title: "Dev",
      url: "/settings/dev",
      icon: IconSettings,
    },
    {
      title: messages.sidebar.getHelp,
      url: "#",
      icon: IconHelp,
      onClick: openHelp,
    },
    {
      title: messages.sidebar.search,
      url: "#",
      icon: IconSearch,
      onClick: openSearch,
    },
  ]

  return (
    <Sidebar collapsible="offcanvas" {...props}>
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
        <NavMain sections={data.navMainSections} />
        <NavDocuments items={data.documents} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
