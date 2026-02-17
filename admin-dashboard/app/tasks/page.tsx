"use client"

import * as React from "react"
import useSWR from "swr"

import { ExportCsvButton } from "@/components/export-csv-button"
import { AppShell } from "@/components/layout/app-shell"
import { SyncStatus } from "@/components/sync-status"
import { Task, TasksTable } from "@/components/tasks-table"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useLoadingTimeout } from "@/hooks/use-loading-timeout"
import { fetchApi } from "@/lib/api"

type ApiTask = {
  id: string
  title: string
  status: "To Do" | "In Progress" | "Done"
  priority: "Low" | "Medium" | "High" | "Critical"
  due_date?: string | null
  assigned_to?: string | null
  lead_id?: string | null
  channel?: "email" | "linkedin" | "call" | null
  sequence_step?: number | null
  source?: "manual" | "auto-rule" | "assistant" | null
  rule_id?: string | null
  related_score_snapshot?: Record<string, unknown>
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
  const [channel, setChannel] = React.useState("ALL")
  const [source, setSource] = React.useState("ALL")
  const [sort, setSort] = React.useState("created_at")
  const [order, setOrder] = React.useState("desc")
  const [debouncedSearch, setDebouncedSearch] = React.useState(search)

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(timer)
  }, [search])

  const queryStatus = status === "ALL" ? "" : status
  const queryChannel = channel === "ALL" ? "" : channel
  const querySource = source === "ALL" ? "" : source
  const { data, error, isLoading, mutate } = useSWR<TasksResponse>(
    `/api/v1/admin/tasks?page=${page}&page_size=${pageSize}&q=${encodeURIComponent(debouncedSearch)}&status=${encodeURIComponent(queryStatus)}&channel=${encodeURIComponent(queryChannel)}&source=${encodeURIComponent(querySource)}&sort=${sort}&order=${order}`,
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
      channel: task.channel || "email",
      sequence_step: Number(task.sequence_step ?? 1),
      source: task.source || "manual",
      rule_id: task.rule_id || undefined,
      related_score_snapshot: task.related_score_snapshot || {},
    }))
    : []

  return (
    <AppShell>
      <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Tâches</h2>
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
          title="Impossible de charger les tâches."
          description={
            loadingTimedOut
              ? "Le chargement dépasse le délai attendu. Vérifiez la santé de l'API puis réessayez."
              : error instanceof Error
                ? error.message
                : "La liste des tâches est temporairement indisponible."
          }
          secondaryLabel="Ouvrir Paramètres"
          secondaryHref="/settings"
          onRetry={() => void mutate()}
        />
      ) : (data?.total || 0) === 0 ? (
        <EmptyState
          title="Aucune tâche disponible"
          description="Les tâches apparaissent ici après création ou conversion depuis les leads."
        />
      ) : (
        <TasksTable
          data={tasks}
          total={data?.total || 0}
          page={page}
          pageSize={pageSize}
          search={search}
          status={status}
          channel={channel}
          source={source}
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
          onChannelChange={(value) => {
            setChannel(value)
            setPage(1)
          }}
          onSourceChange={(value) => {
            setSource(value)
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
    </AppShell>
  )
}

