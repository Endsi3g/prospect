"use client"

import * as React from "react"
import Link from "next/link"
import useSWR from "swr"
import { IconPlus, IconWorld, IconEdit, IconExternalLink } from "@tabler/icons-react"
import { toast } from "sonner"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { fetchApi, requestApi } from "@/lib/api"
import { formatDateTimeFr } from "@/lib/format"
import { useI18n } from "@/lib/i18n"

type LandingPage = {
  id: string
  name: string
  slug: string
  title: string
  is_published: boolean
  updated_at: string
}

const fetcher = <T,>(path: string) => fetchApi<T>(path)

export default function BuilderPage() {
  const { messages } = useI18n()
  const { data: pages, error, isLoading, mutate } = useSWR<LandingPage[]>("/api/v1/builder/pages", fetcher)

  const [isCreating, setIsCreating] = React.useState(false)

  async function createNewPage() {
    try {
      setIsCreating(true)
      const newPage = {
        name: "Nouvelle Page",
        slug: `page-${Math.random().toString(36).substring(7)}`,
        title: "Titre de la Landing Page",
        description: "Description de la page",
        content: {
          hero_title: "Solution IA pour votre business",
          hero_subtitle: "Automatisez vos processus dès aujourd'hui.",
          cta_text: "En savoir plus"
        },
        theme: {
          primary_color: "#2563eb"
        },
        is_published: false
      }

      await requestApi("/api/v1/builder/pages", {
        method: "POST",
        body: JSON.stringify(newPage)
      })

      toast.success("Page créée avec succès.")
      await mutate()
    } catch {
      toast.error("Échec de la création de la page.")
    } finally {
      setIsCreating(false)
    }
  }

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
        <div className="flex flex-1 flex-col gap-4 p-3 pt-0 sm:p-4 sm:pt-0 lg:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-bold tracking-tight">{messages.sidebar.siteBuilder}</h2>
            <Button onClick={createNewPage} disabled={isCreating}>
              <IconPlus className="mr-2 size-4" />
              {isCreating ? "Création..." : "Nouvelle Page"}
            </Button>
          </div>

          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : error ? (
            <ErrorState
              title="Erreur lors du chargement des pages"
              description="Veuillez réessayer plus tard."
              onRetry={() => void mutate()}
            />
          ) : pages?.length === 0 ? (
            <EmptyState
              icon={IconWorld}
              title="Aucune landing page"
              description="Commencez par créer votre première page pour capturer des leads."
              action={
                <Button onClick={createNewPage} disabled={isCreating}>
                  Créer ma première page
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pages?.map((page) => (
                <Card key={page.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>{page.name}</CardTitle>
                      <Badge variant={page.is_published ? "default" : "secondary"}>
                        {page.is_published ? "Publié" : "Brouillon"}
                      </Badge>
                    </div>
                    <CardDescription>/{page.slug}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm font-medium">{page.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Modifié le {formatDateTimeFr(page.updated_at)}
                    </p>
                  </CardContent>
                  <CardFooter className="flex justify-between">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/builder/${page.id}`}>
                        <IconEdit className="mr-2 size-4" />
                        Editer
                      </Link>
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <a href={`/p/${page.slug}`} target="_blank" rel="noopener noreferrer">
                        <IconExternalLink className="mr-2 size-4" />
                        Voir
                      </a>
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
