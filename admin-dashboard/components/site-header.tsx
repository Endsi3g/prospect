"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { IconHelp, IconSearch } from "@tabler/icons-react"

import { useModalSystem } from "@/components/modal-system-provider"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

const TITLES: Record<string, string> = {
  "/dashboard": "Tableau de bord",
  "/leads": "Leads",
  "/tasks": "Taches",
  "/analytics": "Analytique",
  "/projects": "Projets",
  "/campaigns": "Campagnes",
  "/research": "Recherche",
  "/systems": "Systemes",
  "/settings": "Parametres",
  "/settings/team": "Equipe & roles",
  "/help": "Aide",
  "/library": "Bibliotheque",
  "/reports": "Rapports",
  "/assistant": "Assistant",
  "/account": "Compte",
  "/billing": "Facturation",
  "/notifications": "Notifications",
}

export function SiteHeader() {
  const pathname = usePathname()
  const { openHelp, openSearch } = useModalSystem()
  const title = React.useMemo(() => {
    if (pathname in TITLES) return TITLES[pathname]
    if (pathname.startsWith("/leads/")) return "Fiche lead"
    if (pathname.startsWith("/projects/")) return "Fiche projet"
    if (pathname.startsWith("/tasks/")) return "Fiche tache"
    return "Prospect"
  }, [pathname])

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={openSearch}>
            <IconSearch className="size-4" />
            Recherche
          </Button>
          <Button variant="ghost" size="sm" onClick={openHelp}>
            <IconHelp className="size-4" />
            Aide
          </Button>
          <Button variant="ghost" asChild size="sm" className="hidden sm:flex">
            <Link href="/settings">Parametres</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}

