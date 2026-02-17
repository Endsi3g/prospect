"use client"

import * as React from "react"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

type AppShellProps = {
  children: React.ReactNode
  contentClassName?: string
  insetClassName?: string
  providerStyle?: React.CSSProperties
  withHeader?: boolean
}

export function AppShell({
  children,
  contentClassName,
  insetClassName,
  providerStyle,
  withHeader = true,
}: AppShellProps) {
  return (
    <SidebarProvider
      style={providerStyle}
    >
      <AppSidebar variant="inset" />
      <SidebarInset className={insetClassName}>
        {withHeader ? <SiteHeader /> : null}
        <div
          className={cn(
            "flex flex-1 flex-col gap-4 p-3 pt-0 sm:p-4 sm:pt-0 lg:p-6",
            contentClassName
          )}
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
