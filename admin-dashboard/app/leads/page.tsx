"use client"

import * as React from "react"
import useSWR from "swr"

import { AppSidebar } from "@/components/app-sidebar"
import { ExportCsvButton } from "@/components/export-csv-button"
import { ImportCsvSheet } from "@/components/import-csv-sheet"
import { AddLeadSheet } from "@/components/add-lead-sheet"
import { Lead, LeadsTable } from "@/components/leads-table"
import { SiteHeader } from "@/components/site-header"
import { SyncStatus } from "@/components/sync-status"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchApi } from "@/lib/api"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"

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

  // Debounce search for API calls
  const [debouncedSearch, setDebouncedSearch] = React.useState(search)
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500)
    return () => clearTimeout(timer)
  }, [search])

  const queryStatus = status === "ALL" ? "" : status
  const queryTier = tier === "ALL" ? "" : tier
  const queryHeatStatus = heatStatus === "ALL" ? "" : heatStatus
  const leadsPath = React.useMemo(() => {
    const params = new URLSearchParams()
    params.set("page", String(page))
    params.set("page_size", String(pageSize))
    params.set("q", debouncedSearch)
    params.set("status", queryStatus)
    params.set("sort", sort)
    params.set("order", order)

    if (segment.trim()) params.set("segment", segment.trim())
    if (queryTier) params.set("tier", queryTier)
    if (queryHeatStatus) params.set("heat_status", queryHeatStatus)
    if (company.trim()) params.set("company", company.trim())
    if (industry.trim()) params.set("industry", industry.trim())
    if (location.trim()) params.set("location", location.trim())
    if (tag.trim()) params.set("tag", tag.trim())
    if (minScore.trim()) params.set("min_score", minScore.trim())
    if (maxScore.trim()) params.set("max_score", maxScore.trim())
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
    debouncedSearch,
    queryStatus,
    sort,
    order,
    segment,
    queryTier,
    queryHeatStatus,
    company,
    industry,
    location,
    tag,
    minScore,
    maxScore,
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
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-3xl font-bold tracking-tight">Leads</h2>
            <div className="flex flex-wrap items-center gap-2">
              <AddLeadSheet />
              <ExportCsvButton entity="leads" />
              <ImportCsvSheet onImported={() => void mutate()} />
            </div>
          </div>
          <SyncStatus updatedAt={updatedAt} onRefresh={() => void mutate()} />
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <ErrorState
              title="Erreur de chargement des leads."
              onRetry={() => void mutate()}
            />
          ) : (data?.total || 0) === 0 ? (
            <EmptyState
              title="Aucun lead disponible"
              description="Utilisez 'Creation rapide de lead' ou importez un CSV pour demarrer."
            />
          ) : (
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
              onSearchChange={(val) => { setSearch(val); setPage(1); }}
              onStatusChange={(val) => { setStatus(val); setPage(1); }}
              onSegmentChange={(val) => { setSegment(val); setPage(1); }}
              onTierChange={(val) => { setTier(val); setPage(1); }}
              onHeatStatusChange={(val) => { setHeatStatus(val); setPage(1); }}
              onCompanyChange={(val) => { setCompany(val); setPage(1); }}
              onIndustryChange={(val) => { setIndustry(val); setPage(1); }}
              onLocationChange={(val) => { setLocation(val); setPage(1); }}
              onTagChange={(val) => { setTag(val); setPage(1); }}
              onMinScoreChange={(val) => { setMinScore(val); setPage(1); }}
              onMaxScoreChange={(val) => { setMaxScore(val); setPage(1); }}
              onCreatedFromChange={(val) => { setCreatedFrom(val); setPage(1); }}
              onCreatedToChange={(val) => { setCreatedTo(val); setPage(1); }}
              onHasEmailChange={(val) => { setHasEmail(val as TriStateFilter); setPage(1); }}
              onHasPhoneChange={(val) => { setHasPhone(val as TriStateFilter); setPage(1); }}
              onHasLinkedinChange={(val) => { setHasLinkedin(val as TriStateFilter); setPage(1); }}
              onPageChange={setPage}
              onSortChange={(s, o) => { setSort(s); setOrder(o); }}
              onDataChanged={() => void mutate()}
            />
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
