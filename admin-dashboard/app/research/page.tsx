"use client"

import * as React from "react"
import useSWR from "swr"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { useLoadingTimeout } from "@/hooks/use-loading-timeout"
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

const fetcher = <T,>(path: string) => fetchApi<T>(path)

export default function ResearchPage() {
  const [query, setQuery] = React.useState("")
  const [webQuery, setWebQuery] = React.useState("")
  const [webProvider, setWebProvider] = React.useState("auto")
  const [webLimit, setWebLimit] = React.useState("8")

  const { data: search, error: searchError, isLoading: searchLoading, mutate: mutateSearch } = useSWR<SearchResponse>(
    query.trim() ? `/api/v1/admin/search?q=${encodeURIComponent(query.trim())}&limit=10` : null,
    fetcher,
  )
  const {
    data: webResearch,
    error: webError,
    isLoading: webLoading,
    mutate: mutateWebResearch,
  } = useSWR<WebResearchResponse>(
    webQuery.trim()
      ? `/api/v1/admin/research/web?q=${encodeURIComponent(webQuery.trim())}&provider=${encodeURIComponent(webProvider)}&limit=${encodeURIComponent(webLimit)}`
      : null,
    fetcher,
  )
  const searchTimedOut = useLoadingTimeout(searchLoading, 10_000)
  const webTimedOut = useLoadingTimeout(webLoading, 12_000)

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
          <h2 className="text-3xl font-bold tracking-tight">Recherche</h2>

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
              {searchLoading && !searchTimedOut ? <p className="text-sm text-muted-foreground">Recherche en cours...</p> : null}
              {searchError || searchTimedOut ? (
                <ErrorState
                  title="Impossible de lancer la recherche guidee."
                  description={
                    searchTimedOut
                      ? "La recherche prend trop de temps. Essayez un terme plus precis ou relancez."
                      : searchError instanceof Error
                        ? searchError.message
                        : "La recherche guidee est indisponible."
                  }
                  retryLabel="Relancer"
                  secondaryLabel="Ouvrir Parametres"
                  secondaryHref="/settings"
                  onRetry={() => void mutateSearch()}
                />
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
              {webLoading && !webTimedOut ? <p className="text-sm text-muted-foreground">Recherche web en cours...</p> : null}
              {webError || webTimedOut ? (
                <ErrorState
                  title="Recherche web indisponible."
                  description={
                    webTimedOut
                      ? "La recherche web depasse le delai attendu. Verifiez vos integrations et relancez."
                      : webError instanceof Error
                        ? webError.message
                        : "Impossible de contacter les providers web."
                  }
                  retryLabel="Relancer"
                  secondaryLabel="Configurer Integrations"
                  secondaryHref="/settings"
                  onRetry={() => void mutateWebResearch()}
                />
              ) : null}
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
                    {webResearch.warnings.map((warning, index) => (
                      <li key={`${warning}-${index}`}>{warning}</li>
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
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
