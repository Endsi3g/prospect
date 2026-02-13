"use client"

import * as React from "react"
import useSWR from "swr"

import { AppSidebar } from "@/components/app-sidebar"
import { ExportCsvButton } from "@/components/export-csv-button"
import { SiteHeader } from "@/components/site-header"
import { SyncStatus } from "@/components/sync-status"
import { Task, TasksTable } from "@/components/tasks-table"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useLoadingTimeout } from "@/hooks/use-loading-timeout"
import { fetchApi } from "@/lib/api"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"

type ApiTask = {
  id: string
  title: string
  status: "To Do" | "In Progress" | "Done"
  priority: "Low" | "Medium" | "High" | "Critical"
  due_date?: string | null
  assigned_to?: string | null
  lead_id?: string | null
}

type TasksResponse = {
  page: number
  page_size: number
  total: number
  items: ApiTask[]
}

const fetcher = <T,>(path: string) => fetchApi<T>(path)

export default function TasksPage() {
  const [page, setPage] = React.useState(1)
  const pageSize = 25
  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState("ALL")
  const [sort, setSort] = React.useState("created_at")
  const [order, setOrder] = React.useState("desc")
  const [debouncedSearch, setDebouncedSearch] = React.useState(search)

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(timer)
  }, [search])

  const queryStatus = status === "ALL" ? "" : status
  const { data, error, isLoading, mutate } = useSWR<TasksResponse>(
    `/api/v1/admin/tasks?page=${page}&page_size=${pageSize}&q=${encodeURIComponent(debouncedSearch)}&status=${encodeURIComponent(queryStatus)}&sort=${sort}&order=${order}`,
    fetcher,
  )
  const loadingTimedOut = useLoadingTimeout(isLoading, 12_000)
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null)

  React.useEffect(() => {
    if (!data) return
    setUpdatedAt(new Date())
  }, [data])

  const tasks: Task[] = data?.items
    ? data.items.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      due_date: task.due_date || "",
      assigned_to: task.assigned_to || "Vous",
      lead_id: task.lead_id || undefined,
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
            <h2 className="text-3xl font-bold tracking-tight">Taches</h2>
            <ExportCsvButton entity="tasks" />
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
              title="Impossible de charger les taches."
              description={
                loadingTimedOut
                  ? "Le chargement depasse le delai attendu. Verifiez la sante de l'API puis reessayez."
                  : error instanceof Error
                    ? error.message
                    : "La liste des taches est temporairement indisponible."
              }
              secondaryLabel="Ouvrir Parametres"
              secondaryHref="/settings"
              onRetry={() => void mutate()}
            />
          ) : (data?.total || 0) === 0 ? (
            <EmptyState
              title="Aucune tache disponible"
              description="Les taches apparaissent ici apres creation ou conversion depuis les leads."
            />
          ) : (
            <TasksTable
              data={tasks}
              total={data?.total || 0}
              page={page}
              pageSize={pageSize}
              search={search}
              status={status}
              sort={sort}
              order={order}
              onSearchChange={(value) => {
                setSearch(value)
                setPage(1)
              }}
              onStatusChange={(value) => {
                setStatus(value)
                setPage(1)
              }}
              onPageChange={setPage}
              onSortChange={(nextSort, nextOrder) => {
                setSort(nextSort)
                setOrder(nextOrder)
              }}
              onDataChanged={() => void mutate()}
            />
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
