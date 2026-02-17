"use client"

import * as React from "react"
import useSWR from "swr"

import { ExportCsvButton } from "@/components/export-csv-button"
import { ImportCsvSheet } from "@/components/import-csv-sheet"
import { AppShell } from "@/components/layout/app-shell"
import { Lead, LeadsTable } from "@/components/leads-table"
import { LeadsKanban } from "@/components/leads-kanban"
import { SyncStatus } from "@/components/sync-status"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useLoadingTimeout } from "@/hooks/use-loading-timeout"
import { fetchApi } from "@/lib/api"

type ApiLead = {
  id: string
  email: string
  first_name?: string
  last_name?: string
  phone?: string | null
  linkedin_url?: string | null
  company_name?: string | null
  company_industry?: string | null
  company_location?: string | null
  status: string
  segment?: string | null
  tier?: string | null
  heat_status?: string | null
  tags?: string[]
  total_score?: number
}

type LeadsResponse = {
  page: number
  page_size: number
  total: number
  items: ApiLead[]
}

const fetcher = <T,>(path: string) => fetchApi<T>(path)

type TriStateFilter = "ANY" | "YES" | "NO"

function toBooleanQueryValue(value: TriStateFilter): string {
  if (value === "YES") return "true"
  if (value === "NO") return "false"
  return ""
}

export default function LeadsPage() {
  const [view, setView] = React.useState<"table" | "kanban">("table")
  const [page, setPage] = React.useState(1)
  const pageSize = 25
  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState("ALL")
  const [segment, setSegment] = React.useState("")
  const [tier, setTier] = React.useState("ALL")
  const [heatStatus, setHeatStatus] = React.useState("ALL")
  const [company, setCompany] = React.useState("")
  const [industry, setIndustry] = React.useState("")
  const [location, setLocation] = React.useState("")
  const [tag, setTag] = React.useState("")
  const [minScore, setMinScore] = React.useState("")
  const [maxScore, setMaxScore] = React.useState("")
  const [createdFrom, setCreatedFrom] = React.useState("")
  const [createdTo, setCreatedTo] = React.useState("")
  const [hasEmail, setHasEmail] = React.useState<TriStateFilter>("ANY")
  const [hasPhone, setHasPhone] = React.useState<TriStateFilter>("ANY")
  const [hasLinkedin, setHasLinkedin] = React.useState<TriStateFilter>("ANY")
  const [sort, setSort] = React.useState("created_at")
  const [order, setOrder] = React.useState("desc")

  // Debounce text filters for API calls
  const [debounced, setDebounced] = React.useState({
    search,
    segment,
    company,
    industry,
    location,
    tag,
    minScore,
    maxScore,
  })

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced({
        search,
        segment,
        company,
        industry,
        location,
        tag,
        minScore,
        maxScore,
      })
    }, 500)
    return () => clearTimeout(timer)
  }, [search, segment, company, industry, location, tag, minScore, maxScore])

  const queryStatus = status === "ALL" ? "" : status
  const queryTier = tier === "ALL" ? "" : tier
  const queryHeatStatus = heatStatus === "ALL" ? "" : heatStatus
  const leadsPath = React.useMemo(() => {
    const params = new URLSearchParams()
    params.set("page", String(page))
    params.set("page_size", String(pageSize))
    params.set("q", debounced.search)
    params.set("status", queryStatus)
    params.set("sort", sort)
    params.set("order", order)

    if (debounced.segment.trim()) params.set("segment", debounced.segment.trim())
    if (queryTier) params.set("tier", queryTier)
    if (queryHeatStatus) params.set("heat_status", queryHeatStatus)
    if (debounced.company.trim()) params.set("company", debounced.company.trim())
    if (debounced.industry.trim()) params.set("industry", debounced.industry.trim())
    if (debounced.location.trim()) params.set("location", debounced.location.trim())
    if (debounced.tag.trim()) params.set("tag", debounced.tag.trim())
    if (debounced.minScore.trim()) params.set("min_score", debounced.minScore.trim())
    if (debounced.maxScore.trim()) params.set("max_score", debounced.maxScore.trim())
    if (createdFrom) params.set("created_from", createdFrom)
    if (createdTo) params.set("created_to", createdTo)

    const hasEmailValue = toBooleanQueryValue(hasEmail)
    const hasPhoneValue = toBooleanQueryValue(hasPhone)
    const hasLinkedinValue = toBooleanQueryValue(hasLinkedin)
    if (hasEmailValue) params.set("has_email", hasEmailValue)
    if (hasPhoneValue) params.set("has_phone", hasPhoneValue)
    if (hasLinkedinValue) params.set("has_linkedin", hasLinkedinValue)

    return `/api/v1/admin/leads?${params.toString()}`
  }, [
    page,
    pageSize,
    debounced,
    queryStatus,
    sort,
    order,
    queryTier,
    queryHeatStatus,
    createdFrom,
    createdTo,
    hasEmail,
    hasPhone,
    hasLinkedin,
  ])

  const { data, error, isLoading, mutate } = useSWR<LeadsResponse>(
    leadsPath,
    fetcher,
  )
  const loadingTimedOut = useLoadingTimeout(isLoading, 12_000)
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null)

  React.useEffect(() => {
    const handler = () => {
      void mutate()
    }
    window.addEventListener("prospect:lead-created", handler)
    return () => window.removeEventListener("prospect:lead-created", handler)
  }, [mutate])

  React.useEffect(() => {
    if (!data) return
    setUpdatedAt(new Date())
  }, [data])

  const leads: Lead[] = data?.items
    ? data.items.map((item) => ({
      id: item.id,
      name: `${item.first_name || ""} ${item.last_name || ""}`.trim() || item.email,
      company: { name: item.company_name || "Inconnu" },
      email: item.email,
      phone: item.phone || "",
      status: item.status,
      score: Number(item.total_score || 0),
      segment: item.segment || "General",
    }))
    : []

  return (
    <AppShell>
      <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Leads</h2>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as "table" | "kanban")} className="mr-2">
            <TabsList>
              <TabsTrigger value="table">Liste</TabsTrigger>
              <TabsTrigger value="kanban">Kanban</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap items-center gap-2">
            <ExportCsvButton entity="leads" />
            <ImportCsvSheet onImported={() => void mutate()} />
          </div>
        </div>
      </div>
      <SyncStatus updatedAt={updatedAt} onRefresh={() => void mutate()} />
      {isLoading && !loadingTimedOut ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : error || loadingTimedOut ? (
        <ErrorState
          title="Impossible de charger les leads."
          description={
            loadingTimedOut
              ? "Le chargement prend trop de temps. Vérifiez la connectivité API et réessayez."
              : error instanceof Error
                ? error.message
                : "La liste des leads est indisponible pour le moment."
          }
          secondaryLabel="Ouvrir Parametres"
          secondaryHref="/settings"
          onRetry={() => void mutate()}
        />
      ) : (data?.total || 0) === 0 ? (
        <EmptyState
          title="Aucun lead disponible"
          description="Utilisez 'Creation rapide de lead' dans la sidebar ou importez un CSV pour demarrer."
        />
      ) : (
        <div className="mt-4">
          {view === "table" ? (
            <LeadsTable
              data={leads}
              total={data?.total || 0}
              page={page}
              pageSize={pageSize}
              search={search}
              status={status}
              segment={segment}
              tier={tier}
              heatStatus={heatStatus}
              company={company}
              industry={industry}
              location={location}
              tag={tag}
              minScore={minScore}
              maxScore={maxScore}
              createdFrom={createdFrom}
              createdTo={createdTo}
              hasEmail={hasEmail}
              hasPhone={hasPhone}
              hasLinkedin={hasLinkedin}
              sort={sort}
              order={order}
              onSearchChange={(val) => {
                setSearch(val)
                setPage(1)
              }}
              onStatusChange={(val) => {
                setStatus(val)
                setPage(1)
              }}
              onSegmentChange={(val) => {
                setSegment(val)
                setPage(1)
              }}
              onTierChange={(val) => {
                setTier(val)
                setPage(1)
              }}
              onHeatStatusChange={(val) => {
                setHeatStatus(val)
                setPage(1)
              }}
              onCompanyChange={(val) => {
                setCompany(val)
                setPage(1)
              }}
              onIndustryChange={(val) => {
                setIndustry(val)
                setPage(1)
              }}
              onLocationChange={(val) => {
                setLocation(val)
                setPage(1)
              }}
              onTagChange={(val) => {
                setTag(val)
                setPage(1)
              }}
              onMinScoreChange={(val) => {
                setMinScore(val)
                setPage(1)
              }}
              onMaxScoreChange={(val) => {
                setMaxScore(val)
                setPage(1)
              }}
              onCreatedFromChange={(val) => {
                setCreatedFrom(val)
                setPage(1)
              }}
              onCreatedToChange={(val) => {
                setCreatedTo(val)
                setPage(1)
              }}
              onHasEmailChange={(val) => {
                setHasEmail(val as TriStateFilter)
                setPage(1)
              }}
              onHasPhoneChange={(val) => {
                setHasPhone(val as TriStateFilter)
                setPage(1)
              }}
              onHasLinkedinChange={(val) => {
                setHasLinkedin(val as TriStateFilter)
                setPage(1)
              }}
              onPageChange={setPage}
              onSortChange={(s, o) => {
                setSort(s)
                setOrder(o)
              }}
              onDataChanged={() => void mutate()}
            />
          ) : (
            <LeadsKanban data={leads} onDataChanged={() => void mutate()} />
          )}
        </div>
      )}
    </AppShell>
  )
}
