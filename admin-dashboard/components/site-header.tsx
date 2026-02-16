"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { IconAlertTriangle, IconHelp, IconSearch } from "@tabler/icons-react"

import { useApiSource } from "@/components/app-providers"
import { useModalSystem } from "@/components/modal-system-provider"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useI18n } from "@/lib/i18n"

const TITLE_PATHS: Record<string, string> = {
  "/dashboard": "header.titles.dashboard",
  "/leads": "header.titles.leads",
  "/tasks": "header.titles.tasks",
  "/analytics": "header.titles.analytics",
  "/projects": "header.titles.projects",
  "/campaigns": "header.titles.campaigns",
  "/research": "header.titles.research",
  "/systems": "header.titles.systems",
  "/settings": "header.titles.settings",
  "/settings/team": "header.titles.settingsTeam",
  "/help": "header.titles.help",
  "/library": "header.titles.library",
  "/reports": "header.titles.reports",
  "/assistant": "header.titles.assistant",
  "/account": "header.titles.account",
  "/billing": "header.titles.billing",
  "/notifications": "header.titles.notifications",
}

export function SiteHeader() {
  const pathname = usePathname()
  const { openHelp, openSearch } = useModalSystem()
  const { dataSource } = useApiSource()
  const { locale, setLocale, messages, t } = useI18n()

  const title = React.useMemo(() => {
    const exactPath = TITLE_PATHS[pathname]
    if (exactPath) return t(exactPath)
    if (pathname.startsWith("/leads/")) return messages.header.titleLeadDetail
    if (pathname.startsWith("/projects/")) return messages.header.titleProjectDetail
    if (pathname.startsWith("/tasks/")) return messages.header.titleTaskDetail
    return messages.header.titleDefault
  }, [messages, pathname, t])

  const nextLocale = locale === "fr" ? "en" : "fr"

  return (
    <>
      <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
        <div className="flex w-full items-center gap-1 px-3 sm:px-4 lg:gap-2 lg:px-6">
          <SidebarTrigger className="-ml-1 size-9 sm:size-7" />
          <Separator
            orientation="vertical"
            className="mx-1 hidden data-[orientation=vertical]:h-4 sm:mx-2 sm:block"
          />
          <h1 className="min-w-0 truncate text-sm font-medium sm:text-base">{title}</h1>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={openSearch}
              className="h-9 w-9 px-0 sm:h-8 sm:w-auto sm:px-3"
              aria-label={messages.header.search}
            >
              <IconSearch className="size-4" />
              <span className="sr-only sm:not-sr-only">{messages.header.search}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={openHelp}
              className="h-9 w-9 px-0 sm:h-8 sm:w-auto sm:px-3"
              aria-label={messages.header.help}
            >
              <IconHelp className="size-4" />
              <span className="sr-only sm:not-sr-only">{messages.header.help}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setLocale(nextLocale)}
              aria-label={messages.locale.switchAriaLabel}
              className="h-9 min-w-9 px-2 sm:h-8"
            >
              {nextLocale.toUpperCase()}
            </Button>
            <Button variant="ghost" asChild size="sm" className="hidden md:flex">
              <Link href="/settings">{messages.header.settings}</Link>
            </Button>
          </div>
        </div>
      </header>
      {dataSource === "dev-fallback" ? (
        <div
          className="flex items-center gap-2 border-b border-amber-600/45 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950 sm:px-4 lg:px-6 dark:border-amber-500/40 dark:bg-amber-900/20 dark:text-amber-100"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <IconAlertTriangle className="size-4 shrink-0" />
          <span className="truncate">
            Source fallback locale active. Les donnees peuvent diverger de l&apos;API distante.
          </span>
        </div>
      ) : null}
    </>
  )
}

