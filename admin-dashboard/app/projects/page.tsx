"use client"

import * as React from "react"
import useSWR from "swr"
import { IconCalendar, IconFolder, IconPencil, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"

import { AppSidebar } from "@/components/app-sidebar"
import { ExportCsvButton } from "@/components/export-csv-button"
import { useModalSystem } from "@/components/modal-system-provider"
import { SiteHeader } from "@/components/site-header"
import { SyncStatus } from "@/components/sync-status"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
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
import { formatDateFr } from "@/lib/format"
import { requestApi } from "@/lib/api"

type Project = {
  id: string
  name: string
  description?: string | null
  status: string
  lead_id?: string | null
  due_date?: string | null
  created_at?: string | null
}

const PROJECT_STATUSES = ["all", "Planning", "In Progress", "On Hold", "Completed", "Cancelled"]
const fetcher = <T,>(path: string) => requestApi<T>(path)

export default function ProjectsPage() {
  const { openProjectForm, openConfirm } = useModalSystem()
  const { data: projects, error, isLoading, mutate } = useSWR<Project[]>(
    "/api/v1/admin/projects",
    fetcher,
  )
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null)

  const [statusFilter, setStatusFilter] = React.useState("all")
  const [sortMode, setSortMode] = React.useState("newest")

  React.useEffect(() => {
    if (!projects) return
    setUpdatedAt(new Date())
  }, [projects])

  const displayedProjects = React.useMemo(() => {
    const source = projects || []
    const filtered = source.filter((project) => {
      if (statusFilter === "all") return true
      return project.status === statusFilter
    })

    const sorted = [...filtered]
    if (sortMode === "due_asc") {
      sorted.sort((a, b) => {
        const left = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER
        const right = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER
        return left - right
      })
      return sorted
    }
    if (sortMode === "due_desc") {
      sorted.sort((a, b) => {
        const left = a.due_date ? new Date(a.due_date).getTime() : 0
        const right = b.due_date ? new Date(b.due_date).getTime() : 0
        return right - left
      })
      return sorted
    }
    sorted.sort((a, b) => {
      const left = a.created_at ? new Date(a.created_at).getTime() : 0
      const right = b.created_at ? new Date(b.created_at).getTime() : 0
      return right - left
    })
    return sorted
  }, [projects, sortMode, statusFilter])

  function createProject() {
    openProjectForm({
      mode: "create",
      onSuccess: () => void mutate(),
    })
  }

  function editProject(project: Project) {
    openProjectForm({
      mode: "edit",
      project,
      onSuccess: () => void mutate(),
    })
  }

  function deleteProject(project: Project) {
    openConfirm({
      title: "Supprimer ce projet ?",
      description: `Le projet '${project.name}' sera supprime definitivement.`,
      confirmLabel: "Supprimer",
      onConfirm: async () => {
        await requestApi(`/api/v1/admin/projects/${project.id}`, { method: "DELETE" })
        toast.success("Projet supprime.")
        await mutate()
      },
    })
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
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 md:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-3xl font-bold tracking-tight">Projets</h2>
            <div className="flex flex-wrap gap-2">
              <ExportCsvButton entity="projects" />
              <Button onClick={createProject}>Nouveau projet</Button>
            </div>
          </div>
          <SyncStatus updatedAt={updatedAt} />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-52">
                <SelectValue placeholder="Filtrer par statut" />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_STATUSES.map((statusValue) => (
                  <SelectItem key={statusValue} value={statusValue}>
                    {statusValue === "all" ? "Tous les statuts" : statusValue}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortMode} onValueChange={setSortMode}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Tri" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Recents</SelectItem>
                <SelectItem value="due_asc">Echeance proche</SelectItem>
                <SelectItem value="due_desc">Echeance lointaine</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : error ? (
            <ErrorState
              title="Impossible de charger les projets."
              onRetry={() => void mutate()}
            />
          ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {displayedProjects.length > 0 ? (
                displayedProjects.map((project) => (
                  <Card key={project.id} className="overflow-hidden rounded-xl border shadow-sm">
                    <div className="h-1 w-full bg-primary" />
                    <CardHeader className="space-y-2 pb-4">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="line-clamp-1 text-xl">{project.name}</CardTitle>
                        <Badge variant="outline">{project.status}</Badge>
                      </div>
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {project.description || "Aucune description"}
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-0">
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <IconCalendar className="size-4" />
                        <span>{formatDateFr(project.due_date)}</span>
                      </div>
                      <div className="flex items-center justify-between border-t pt-3">
                        <div className="flex items-center gap-2 text-primary">
                          <IconFolder className="size-4" />
                          <span className="text-sm font-medium">Projet</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" onClick={() => editProject(project)}>
                            <IconPencil className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteProject(project)}>
                            <IconTrash className="size-4 text-red-600" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="col-span-full">
                  <EmptyState
                    title="Aucun projet"
                    description="Creez votre premier projet pour structurer vos actions commerciales."
                    action={<Button onClick={createProject}>Creer un projet</Button>}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
