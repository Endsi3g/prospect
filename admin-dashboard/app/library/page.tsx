"use client"

import * as React from "react"
import useSWR from "swr"
import {
  IconBook,
  IconChecklist,
  IconFileAnalytics,
  IconSparkles,
  IconSearch,
  IconFileText,
  IconCircleCheck,
  IconAlertCircle,
  IconClock,
  IconDownload,
  IconExternalLink,
} from "@tabler/icons-react"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { requestApi } from "@/lib/api"
import { formatNumberFr } from "@/lib/format"

type DocItem = {
  doc_id: string
  title: string
  ext: string
  status: "processed" | "pending_conversion" | "failed" | "duplicate" | "unsupported" | "ingested"
  size_bytes: number
  updated_at: string | null
  raw_path?: string | null
  processed?: {
    markdown_path?: string | null
    json_path?: string | null
  }
}

type DocsResponse = {
  generated_at: string
  stats: Record<string, number>
  page: number
  page_size: number
  total: number
  items: DocItem[]
}

const fetcher = <T,>(path: string) => requestApi<T>(path)

function StatusBadge({ status }: { status: DocItem["status"] }) {
  switch (status) {
    case "processed":
      return <Badge className="bg-green-600 h-5 text-[10px]"><IconCircleCheck className="size-3 mr-1" /> Prêt</Badge>
    case "failed":
      return <Badge variant="destructive" className="h-5 text-[10px]"><IconAlertCircle className="size-3 mr-1" /> Échec</Badge>
    case "pending_conversion":
      return <Badge variant="outline" className="h-5 text-[10px] text-amber-600 border-amber-600"><IconClock className="size-3 mr-1" /> En attente</Badge>
    default:
      return <Badge variant="secondary" className="h-5 text-[10px]">{status}</Badge>
  }
}

export default function LibraryPage() {
  const [search, setSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [page, setPage] = React.useState(1)
  
  const queryParams = new URLSearchParams({
    page: String(page),
    page_size: "24",
  })
  if (search.trim()) queryParams.set("q", search.trim())
  if (statusFilter !== "all") queryParams.set("status", statusFilter)

  const { data, error, isLoading, mutate } = useSWR<DocsResponse>(
    `/api/v1/admin/docs/compagnie?${queryParams.toString()}`,
    fetcher
  )

  const stats = data?.stats || {}

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
        <div className="flex flex-1 flex-col gap-6 p-3 pt-0 sm:p-4 sm:pt-0 lg:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Bibliothèque Commerciale</h2>
              <p className="text-muted-foreground">Corpus de documents de référence Uprising Studio.</p>
            </div>
            <div className="flex gap-3 text-xs">
              <div className="flex flex-col items-center px-3 py-1 border rounded-lg bg-card shadow-xs">
                <span className="font-bold text-primary">{stats.processed_pdf || 0}</span>
                <span className="text-muted-foreground uppercase text-[9px] tracking-tighter">PDFs OK</span>
              </div>
              <div className="flex flex-col items-center px-3 py-1 border rounded-lg bg-card shadow-xs">
                <span className="font-bold text-amber-600">{stats.ingested || 0}</span>
                <span className="text-muted-foreground uppercase text-[9px] tracking-tighter">Figma</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <IconSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input 
                placeholder="Rechercher dans les documents..." 
                className="pl-10 h-10 shadow-xs"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
              />
            </div>
            <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1) }}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="processed">Traités (OK)</SelectItem>
                <SelectItem value="failed">Échecs</SelectItem>
                <SelectItem value="ingested">Ingérés (Figma)</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => void mutate()} className="h-10">
              Rafraîchir
            </Button>
          </div>

          {error ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-8 text-center text-destructive">
              <IconAlertCircle className="size-8 mx-auto mb-2 opacity-50" />
              <p className="font-bold">Erreur de connexion</p>
              <p className="text-sm">Le service de documentation est momentanément indisponible.</p>
              <Button variant="outline" className="mt-4 border-destructive/30 hover:bg-destructive/10" onClick={() => void mutate()}>
                Réessayer
              </Button>
            </div>
          ) : null}

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
            </div>
          ) : (
            <div className="space-y-6">
              {data && data.items.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {data.items.map((doc) => (
                    <Card key={doc.doc_id} className="rounded-xl border shadow-sm flex flex-col group overflow-hidden">
                      <div className="h-1 w-full bg-primary/20 group-hover:bg-primary transition-colors" />
                      <CardHeader className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="bg-primary/5 p-2 rounded-lg">
                            <IconFileText className="size-5 text-primary" />
                          </div>
                          <StatusBadge status={doc.status} />
                        </div>
                        <CardTitle className="text-sm font-bold line-clamp-2 min-h-[40px]" title={doc.title}>
                          {doc.title}
                        </CardTitle>
                        <CardDescription className="text-[10px] font-mono flex items-center gap-1">
                          ID: {doc.doc_id.slice(0, 16)}...
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="px-4 py-0 flex-1">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t pt-3">
                          <span>Taille: {formatNumberFr(doc.size_bytes / 1024)} KB</span>
                          <span>Format: <code className="bg-muted px-1 rounded">{doc.ext}</code></span>
                        </div>
                      </CardContent>
                      <CardFooter className="p-3 bg-muted/30 flex gap-2">
                        <Button variant="ghost" size="sm" className="flex-1 h-8 text-[10px] gap-1" disabled={!doc.raw_path}>
                          <IconDownload className="size-3" />
                          RAW
                        </Button>
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          className="flex-1 h-8 text-[10px] gap-1"
                          disabled={!doc.processed?.markdown_path}
                          onClick={() => doc.processed?.markdown_path && window.open(doc.processed.markdown_path)}
                        >
                          <IconExternalLink className="size-3" />
                          VOIR
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed py-20 text-center text-muted-foreground bg-muted/10">
                  <IconBook className="size-12 mx-auto mb-4 opacity-20" />
                  <p>Aucun document trouvé</p>
                  <p className="text-xs">Modifiez vos filtres ou effectuez une nouvelle recherche.</p>
                </div>
              )}

              {/* Pagination */}
              {data && data.total > data.page_size && (
                <div className="flex items-center justify-center gap-2 pt-4">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={page <= 1} 
                    onClick={() => setPage(page - 1)}
                  >
                    Précédent
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {data.page} sur {Math.ceil(data.total / data.page_size)}
                  </span>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={page >= Math.ceil(data.total / data.page_size)} 
                    onClick={() => setPage(page + 1)}
                  >
                    Suivant
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
