"use client"

import * as React from "react"
import {
  IconBook,
  IconChecklist,
  IconFileAnalytics,
  IconSparkles,
} from "@tabler/icons-react"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"

const LIBRARY_ITEMS = [
  {
    title: "Guide d'audit pipeline",
    description: "Checklist de qualification et signaux de friction commerciale.",
    icon: IconChecklist,
    category: "Playbook",
  },
  {
    title: "Script de demarrage discovery",
    description: "Trame de questions pour qualifier vite et sans biais.",
    icon: IconBook,
    category: "Script",
  },
  {
    title: "Modele de rapport hebdomadaire",
    description: "Structure standard pour partager les performances d'equipe.",
    icon: IconFileAnalytics,
    category: "Template",
  },
  {
    title: "Prompt assistant outbound",
    description: "Prompt de base pour generer des sequences de prospection.",
    icon: IconSparkles,
    category: "Assistant",
  },
]

export default function LibraryPage() {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 md:p-8">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-bold tracking-tight">Bibliotheque</h2>
            <Badge variant="outline">4 ressources</Badge>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {LIBRARY_ITEMS.map((item) => (
              <Card key={item.title} className="rounded-xl border shadow-sm">
                <CardHeader className="space-y-3">
                  <div className="flex items-center justify-between">
                    <item.icon className="size-5 text-primary" />
                    <Badge variant="secondary">{item.category}</Badge>
                  </div>
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Disponible pour consultation dans la prochaine iteration de contenu.
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
