"use client"

import * as React from "react"
import Link from "next/link"
import useSWR from "swr"
import { IconCalendar, IconFolder, IconPencil, IconTrash, IconSearch } from "@tabler/icons-react"
import { toast } from "sonner"

import { ExportCsvButton } from "@/components/export-csv-button"
import { AppShell } from "@/components/layout/app-shell"
import { useModalSystem } from "@/components/modal-system-provider"
import { SyncStatus } from "@/components/sync-status"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

const ProjectCard = React.memo(({
  project,
  onEdit,
  onDelete
}: {
  project: Project;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
}) => (
  <Card className="overflow-hidden rounded-xl border shadow-sm">
    <div className="h-1 w-full bg-primary" />
    <CardHeader className="space-y-2 pb-4">
      <div className="flex items-start justify-between gap-2">
        <CardTitle className="line-clamp-1 text-xl">
          <Link href={`/projects/${project.id}`} className="hover:underline">
            {project.name}
          </Link>
        </CardTitle>
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
        <Button variant="ghost" size="sm" asChild className="text-primary">
          <Link href={`/projects/${project.id}`}>
            <IconFolder className="size-4" />
            Ouvrir
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => onEdit(project)}>
            <IconPencil className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(project)}>
            <IconTrash className="size-4 text-red-600" />
          </Button>
        </div>
      </div>
    </CardContent>
  </Card>
))

ProjectCard.displayName = "ProjectCard"

const PROJECT_STATUSES = ["all", "Planning", "In Progress", "On Hold", "Completed", "Cancelled"]
const fetcher = <T,>(path: string) => requestApi<T>(path)

export default function ProjectsPage() {
  const { openProjectForm, openConfirm } = useModalSystem()
  const [page, setPage] = React.useState(1)
  const pageSize = 24
  
  const { data, error, isLoading, mutate } = useSWR<{
    page: number
    page_size: number
    total: number
    items: Project[]
  }>(
    `/api/v1/admin/projects?page=${page}&page_size=${pageSize}`,
    fetcher,
  )
  const loadingTimedOut = useLoadingTimeout(isLoading, 12_000)
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null)

  const [statusFilter, setStatusFilter] = React.useState("all")
  const [sortMode, setSortMode] = React.useState("newest")
  const [search, setSearch] = React.useState("")

  React.useEffect(() => {
    if (!data) return
    setUpdatedAt(new Date())
  }, [data])

  const projects = data?.items || []
  const total = data?.total || 0
  const maxPage = Math.ceil(total / pageSize) || 1

  const displayedProjects = React.useMemo(() => {
    const source = projects || []
    const filtered = source.filter((project) => {
      const matchesStatus = statusFilter === "all" || project.status === statusFilter
      const matchesSearch = !search.trim() ||
        project.name.toLowerCase().includes(search.toLowerCase()) ||
        project.description?.toLowerCase().includes(search.toLowerCase())

      return matchesStatus && matchesSearch
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
  }, [projects, sortMode, statusFilter, search])

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
    <AppShell>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Projets</h2>
        <div className="flex flex-wrap gap-2">
          <ExportCsvButton entity="projects" />
          <Button onClick={createProject}>Nouveau projet</Button>
        </div>
      </div>
      <SyncStatus updatedAt={updatedAt} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <Input
            placeholder="Rechercher un projet..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:max-w-xs"
          />
        </div>
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

      {isLoading && !loadingTimedOut ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : error || loadingTimedOut ? (
        <ErrorState
          title="Impossible de charger les projets."
          description={
            loadingTimedOut
              ? "Le chargement prend trop de temps. Vérifiez la connectivite API et reessayez."
              : error instanceof Error
                ? error.message
                : "La liste des projets est indisponible pour le moment."
          }
          onRetry={() => void mutate()}
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {displayedProjects.length > 0 ? (
              displayedProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onEdit={editProject}
                  onDelete={deleteProject}
                />
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

          <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-end sm:space-x-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => {
                setPage(page - 1)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              disabled={page <= 1}
            >
              Precedent
            </Button>
            <div className="text-center text-sm text-muted-foreground sm:flex-1">
              Page {page} sur {maxPage} ({total} projets)
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => {
                setPage(page + 1)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              disabled={page >= maxPage}
            >
              Suivant
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  )
}
