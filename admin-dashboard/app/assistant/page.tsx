"use client"

import * as React from "react"
import useSWR from "swr"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { fetchApi } from "@/lib/api"

type SearchResult = {
  type: string
  id: string
  title: string
  subtitle: string
  href: string
}

type SearchResponse = {
  query: string
  total: number
  items: SearchResult[]
}

type WebResearchItem = {
  provider: string
  source: string
  title: string
  url: string
  snippet: string
  published_at?: string | null
}

type WebResearchResponse = {
  query: string
  provider_selector: string
  providers_requested: string[]
  providers_used: string[]
  total: number
  items: WebResearchItem[]
  warnings: string[]
}

type AuditResponse = {
  items: Array<{
    id: string
    actor: string
    action: string
    entity_type: string
    entity_id?: string | null
    created_at?: string | null
  }>
}

const fetcher = <T,>(path: string) => fetchApi<T>(path)

export default function AssistantPage() {
  const [query, setQuery] = React.useState("")
  const [webQuery, setWebQuery] = React.useState("")
  const [webProvider, setWebProvider] = React.useState("auto")
  const [webLimit, setWebLimit] = React.useState("8")

  const { data: audit, error: auditError, isLoading: auditLoading, mutate: mutateAudit } = useSWR<AuditResponse>(
    "/api/v1/admin/audit-log?limit=20",
    fetcher,
  )

  const { data: search, error: searchError, isLoading: searchLoading } = useSWR<SearchResponse>(
    query.trim() ? `/api/v1/admin/search?q=${encodeURIComponent(query.trim())}&limit=10` : null,
    fetcher,
  )
  const { data: webResearch, error: webError, isLoading: webLoading } = useSWR<WebResearchResponse>(
    webQuery.trim()
      ? `/api/v1/admin/research/web?q=${encodeURIComponent(webQuery.trim())}&provider=${encodeURIComponent(webProvider)}&limit=${encodeURIComponent(webLimit)}`
      : null,
    fetcher,
  )

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
          <h2 className="text-3xl font-bold tracking-tight">Assistant</h2>

          <Card>
            <CardHeader>
              <CardTitle>Recherche guidee</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Rechercher un lead, une tache ou un projet..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {searchLoading ? <p className="text-sm text-muted-foreground">Recherche en cours...</p> : null}
              {searchError ? (
                <p className="text-sm text-red-600">Impossible de lancer la recherche.</p>
              ) : null}
              {!searchLoading && query.trim() && search && search.items.length === 0 ? (
                <EmptyState
                  title="Aucun resultat"
                  description="Essayez un terme plus court ou un nom d'entreprise."
                  className="min-h-28"
                />
              ) : null}
              {search && search.items.length > 0 ? (
                <div className="space-y-2">
                  {search.items.map((item) => (
                    <a
                      key={`${item.type}:${item.id}`}
                      href={item.href}
                      className="block rounded-lg border px-3 py-2 hover:bg-accent"
                    >
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.type.toUpperCase()} - {item.subtitle}
                      </p>
                    </a>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recherche web avancee</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 md:grid-cols-3">
                <Input
                  placeholder="Sujet web (lead gen, concurrents, signaux marche...)"
                  value={webQuery}
                  onChange={(event) => setWebQuery(event.target.value)}
                  className="md:col-span-2"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Select value={webProvider} onValueChange={setWebProvider}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto</SelectItem>
                      <SelectItem value="duckduckgo">DuckDuckGo</SelectItem>
                      <SelectItem value="perplexity">Perplexity</SelectItem>
                      <SelectItem value="firecrawl">Firecrawl</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={webLimit} onValueChange={setWebLimit}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="8">8</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="15">15</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {webLoading ? <p className="text-sm text-muted-foreground">Recherche web en cours...</p> : null}
              {webError ? <p className="text-sm text-red-600">Recherche web indisponible.</p> : null}
              {!webLoading && webResearch && webResearch.items.length === 0 && webQuery.trim() ? (
                <EmptyState
                  title="Aucun resultat web"
                  description="Essayez un autre provider ou un sujet plus precis."
                  className="min-h-24"
                />
              ) : null}
              {webResearch && webResearch.warnings.length > 0 ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <p className="text-xs font-medium text-amber-900">Provider warnings:</p>
                  <ul className="list-disc pl-5 text-xs text-amber-900">
                    {webResearch.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {webResearch && webResearch.items.length > 0 ? (
                <div className="space-y-2">
                  {webResearch.items.map((item, index) => (
                    <a
                      key={`${item.provider}:${item.url}:${index}`}
                      href={item.url || "#"}
                      target={item.url ? "_blank" : undefined}
                      rel={item.url ? "noreferrer noopener" : undefined}
                      className="block rounded-lg border px-3 py-2 hover:bg-accent"
                    >
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.provider.toUpperCase()} - {item.source}
                      </p>
                      {item.snippet ? <p className="mt-1 text-xs text-muted-foreground">{item.snippet}</p> : null}
                    </a>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dernieres actions systeme</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {auditLoading ? (
                <>
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </>
              ) : null}
              {!auditLoading && auditError ? (
                <ErrorState
                  title="Journal d'audit indisponible"
                  onRetry={() => void mutateAudit()}
                />
              ) : null}
              {!auditLoading && !auditError && audit && audit.items.length === 0 ? (
                <EmptyState
                  title="Aucune action journalisee"
                  description="Les operations critiques apparaitront ici."
                  className="min-h-28"
                />
              ) : null}
              {!auditLoading && !auditError && audit ? (
                <div className="space-y-2">
                  {audit.items.map((item) => (
                    <div key={item.id} className="rounded-lg border px-3 py-2">
                      <p className="text-sm font-medium">
                        {item.action} - {item.entity_type}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        acteur: {item.actor} | id: {item.entity_id || "-"} | {item.created_at || "-"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
