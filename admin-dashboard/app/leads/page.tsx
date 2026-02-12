"use client"

import * as React from "react"
import useSWR from "swr"

import { AppSidebar } from "@/components/app-sidebar"
import { ExportCsvButton } from "@/components/export-csv-button"
import { ImportCsvSheet } from "@/components/import-csv-sheet"
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
  company_name?: string | null
  status: string
  segment?: string | null
  total_score?: number
}

type LeadsResponse = {
  page: number
  page_size: number
  total: number
  items: ApiLead[]
}

const fetcher = <T,>(path: string) => fetchApi<T>(path)

export default function LeadsPage() {
  const [page, setPage] = React.useState(1)
  const pageSize = 25
  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState("ALL")
  const [sort, setSort] = React.useState("created_at")
  const [order, setOrder] = React.useState("desc")

  // Debounce search for API calls
  const [debouncedSearch, setDebouncedSearch] = React.useState(search)
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500)
    return () => clearTimeout(timer)
  }, [search])

  const queryStatus = status === "ALL" ? "" : status
  const { data, error, isLoading, mutate } = useSWR<LeadsResponse>(
    `/api/v1/admin/leads?page=${page}&page_size=${pageSize}&q=${encodeURIComponent(debouncedSearch)}&status=${encodeURIComponent(queryStatus)}&sort=${sort}&order=${order}`,
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
      phone: "",
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
              <ExportCsvButton entity="leads" />
              <ImportCsvSheet onImported={() => void mutate()} />
            </div>
          </div>
          <SyncStatus updatedAt={updatedAt} />
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
              sort={sort}
              order={order}
              onSearchChange={(val) => { setSearch(val); setPage(1); }}
              onStatusChange={(val) => { setStatus(val); setPage(1); }}
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
