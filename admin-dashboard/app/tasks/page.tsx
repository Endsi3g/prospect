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

const fetcher = <T,>(path: string) => fetchApi<T>(path)

export default function TasksPage() {
  const { data, error, isLoading, mutate } = useSWR<ApiTask[]>(
    "/api/v1/admin/tasks",
    fetcher,
  )
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null)

  React.useEffect(() => {
    if (!data) return
    setUpdatedAt(new Date())
  }, [data])

  const tasks: Task[] = data
    ? data.map((task) => ({
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
          <SyncStatus updatedAt={updatedAt} />
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <ErrorState
              title="Erreur de chargement des taches."
              onRetry={() => void mutate()}
            />
          ) : tasks.length === 0 ? (
            <EmptyState
              title="Aucune tache disponible"
              description="Les taches apparaissent ici apres creation ou conversion depuis les leads."
            />
          ) : (
            <TasksTable data={tasks} onDataChanged={() => void mutate()} />
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
