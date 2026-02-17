"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { IconCalendar, IconGripVertical, IconPlus } from "@tabler/icons-react"
import { toast } from "sonner"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLoadingTimeout } from "@/hooks/use-loading-timeout"
import { useModalSystem } from "@/components/modal-system-provider"
import { fetchApi, requestApi } from "@/lib/api"
import { formatDateFr, formatNumberFr } from "@/lib/format"
import { sanitizeExternalUrl } from "@/lib/utils"

type TaskStatus = "Todo" | "In Progress" | "Done"
const TASK_COLUMNS: TaskStatus[] = ["Todo", "In Progress", "Done"]

type Project = {
  id: string
  name: string
  description?: string
  status: string
  budget_total?: number
  budget_spent?: number
  due_date: string
}

type Task = {
  id: string
  title: string
  status: TaskStatus
  priority: string
  assigned_to?: string
  due_date?: string
}

type TimelineItem = {
  id: string
  title: string
  start_date: string | null
  end_date: string | null
  depends_on: string[]
  milestone?: boolean
}

type Deliverable = {
  id: string
  title: string
  owner: string
  due_date?: string
  file_url?: string
  completed: boolean
}

const fetcher = <T,>(path: string) => fetchApi<T>(path)

export default function ProjectDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params)
  const [tab, setTab] = React.useState("kanban")
  const { openProjectForm } = useModalSystem()

  const { data: project, error: projectError, isLoading: loadingProject, mutate: mutateProject } = useSWR<Project>(`/api/v1/admin/projects/${id}`, fetcher)
  const { data: tasks, error: taskError, isLoading: loadingTasks, mutate: mutateTasks } = useSWR<Task[]>(`/api/v1/admin/tasks?project_id=${id}`, fetcher)
  const { data: activity, mutate: mutateActivity } = useSWR(`/api/v1/admin/activity?project_id=${id}`, fetcher)

  const [dragTaskId, setDragTaskId] = React.useState<string | null>(null)
  const [taskTitle, setTaskTitle] = React.useState("")
  const [taskStatus, setTaskStatus] = React.useState<TaskStatus>("Todo")

  const [budgetTotal, setBudgetTotal] = React.useState("")
  const [budgetSpent, setBudgetSpent] = React.useState("")

  const [timeline, setTimeline] = React.useState<TimelineItem[]>([])
  const [newTimeline, setNewTimeline] = React.useState({ title: "", start: "", end: "", deps: "", milestone: false })

  const [deliverables, setDeliverables] = React.useState<Deliverable[]>([])
  const [newDeliverable, setNewDeliverable] = React.useState({ title: "", owner: "", due: "", file_url: "" })

  React.useEffect(() => {
    async function loadProjectData() {
      try {
        const [tl, dl] = await Promise.all([
          requestApi<TimelineItem[]>(`/api/v1/admin/projects/${id}/timeline`),
          requestApi<Deliverable[]>(`/api/v1/admin/projects/${id}/deliverables`),
        ])
        setTimeline(tl || [])
        setDeliverables(dl || [])
      } catch (e) {
        console.error("Failed to load project sub-resources", e)
      }
    }
    if (project) {
      setBudgetTotal(String(project.budget_total || 0))
      setBudgetSpent(String(project.budget_spent || 0))
      void loadProjectData()
    }
  }, [project, id])

  const byStatus = React.useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = { Todo: [], "In Progress": [], Done: [] }
    if (tasks) tasks.forEach((t) => grouped[t.status].push(t))
    return grouped
  }, [tasks])

  const progress = React.useMemo(() => {
    if (!tasks || tasks.length === 0) return 0
    const done = tasks.filter((t) => t.status === "Done").length
    return Math.round((done / tasks.length) * 100)
  }, [tasks])

  const toIso = (v: string) => {
    if (!v) return null
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d.toISOString()
  }

  async function createTask() {
    if (!taskTitle.trim()) return
    try {
      await requestApi("/api/v1/admin/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: taskTitle.trim(), status: taskStatus, project_id: id, priority: "Medium" }),
      })
      setTaskTitle("")
      await mutateTasks()
      await mutateActivity()
    } catch (e) {
      toast.error("Erreur creation tache.")
    }
  }

  async function moveTask(nextStatus: TaskStatus) {
    if (!dragTaskId) return
    const task = tasks?.find((t) => t.id === dragTaskId)
    if (!task || task.status === nextStatus) return
    try {
      await requestApi(`/api/v1/admin/tasks/${dragTaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      })
      await mutateTasks()
    } catch (e) {
      toast.error("Erreur deplacement.")
    } finally {
      setDragTaskId(null)
    }
  }

  async function saveBudget() {
    const totalValue = Number(budgetTotal)
    const spentValue = Number(budgetSpent)
    if (Number.isNaN(totalValue) || Number.isNaN(spentValue)) {
      toast.error("Valeurs budget invalides.")
      return
    }
    try {
      await requestApi(`/api/v1/admin/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budget_total: totalValue, budget_spent: spentValue }),
      })
      toast.success("Budget mis a jour.")
      void mutateProject()
    } catch (error) {
      toast.error("Echec de la mise a jour budget.")
    }
  }

  async function addTimelineMilestone() {
    if (!newTimeline.title.trim() || !newTimeline.start) {
      toast.error("Titre et date de debut obligatoires.")
      return
    }
    const startDate = toIso(newTimeline.start) ?? null
    const endDate = toIso(newTimeline.end) ?? toIso(newTimeline.start) ?? null
    
    try {
      const created = await requestApi<TimelineItem>(`/api/v1/admin/projects/${id}/timeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTimeline.title.trim(),
          start_date: startDate,
          end_date: endDate,
          depends_on: newTimeline.deps.split(",").map((x) => x.trim()).filter(Boolean),
          milestone: newTimeline.milestone,
        }),
      })
      setTimeline((cur) => [...cur, created])
      setNewTimeline({ title: "", start: "", end: "", deps: "", milestone: false })
      toast.success("Jalon ajouté.")
    } catch (e) {
      toast.error("Échec de l'ajout du jalon.")
    }
  }

  async function addDeliverable() {
    if (!newDeliverable.title.trim()) {
      toast.error("Le titre du livrable est obligatoire.")
      return
    }
    const cleanedFileUrl = sanitizeExternalUrl(newDeliverable.file_url)
    if (newDeliverable.file_url.trim() && !cleanedFileUrl) {
      toast.error("URL livrable invalide (http/https uniquement).")
      return
    }

    try {
      const created = await requestApi<Deliverable>(`/api/v1/admin/projects/${id}/deliverables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newDeliverable.title.trim(),
          owner: newDeliverable.owner.trim(),
          due_date: toIso(newDeliverable.due) || undefined,
          file_url: cleanedFileUrl,
          completed: false,
        }),
      })
      setDeliverables((cur) => [...cur, created])
      setNewDeliverable({ title: "", owner: "", due: "", file_url: "" })
      toast.success("Livrable ajouté.")
    } catch (e) {
      toast.error("Échec de l'ajout du livrable.")
    }
  }

  if (loadingProject) {
    return (
      <SidebarProvider>
        <AppSidebar variant="inset" />
        <SidebarInset>
          <SiteHeader />
          <div className="p-4 sm:p-6">
            <Skeleton className="h-72 w-full" />
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }
  if (projectError || !project) {
    return (
      <SidebarProvider>
        <AppSidebar variant="inset" />
        <SidebarInset>
          <SiteHeader />
          <div className="p-4 sm:p-6">
            <ErrorState title="Projet introuvable." onRetry={() => void mutateProject()} />
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  return (
    <SidebarProvider>
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col gap-4 p-3 pt-0 sm:p-4 sm:pt-0 lg:p-6">
          <Card>
            <CardContent className="pt-6 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2"><h2 className="text-3xl font-bold tracking-tight">{project.name}</h2><Badge variant="outline">{project.status}</Badge></div>
                  <p className="text-sm text-muted-foreground">{project.description || "Aucune description"}</p>
                  <p className="text-xs text-muted-foreground inline-flex items-center gap-1 mt-1"><IconCalendar className="size-3" /> Deadline: {formatDateFr(project.due_date)}</p>
                </div>
                <Button variant="outline" onClick={() => openProjectForm({ mode: "edit", project, onSuccess: () => { void mutateProject(); void mutateActivity() } })}>Modifier</Button>
              </div>
              <div><p className="text-sm">Progression: {progress}%</p><div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${progress}%` }} /></div></div>
              {(project.budget_total || 0) > 0 ? (
                <div className="rounded-xl border bg-accent/30 p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">Suivi Budgetaire</p>
                      <p className="text-xs text-muted-foreground">
                        Total: {formatNumberFr(project.budget_total || 0)} EUR | Depense: {formatNumberFr(project.budget_spent || 0)} EUR
                      </p>
                    </div>
                    <Badge variant={Number(budgetSpent) > Number(budgetTotal) ? "destructive" : "secondary"}>
                      {Number(budgetTotal) > 0 ? Math.round((Number(budgetSpent) / Number(budgetTotal)) * 100) : 0}%
                    </Badge>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-[10px] font-medium uppercase text-muted-foreground px-1">Budget Total</p>
                      <Input value={budgetTotal} onChange={(e) => setBudgetTotal(e.target.value)} className="h-9 bg-background" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-medium uppercase text-muted-foreground px-1">Deja Depense</p>
                      <Input value={budgetSpent} onChange={(e) => setBudgetSpent(e.target.value)} className="h-9 bg-background" />
                    </div>
                  </div>
                  <Button className="mt-4 w-full sm:w-auto" variant="outline" size="sm" onClick={saveBudget}>
                    Mettre a jour le budget
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card>
              <CardContent className="pt-6">
                <Tabs value={tab} onValueChange={setTab}>
                  <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
                    <TabsTrigger value="kanban">Kanban</TabsTrigger>
                    <TabsTrigger value="timeline">Timeline</TabsTrigger>
                    <TabsTrigger value="team">Team</TabsTrigger>
                    <TabsTrigger value="deliverables">Deliverables</TabsTrigger>
                  </TabsList>

                  <TabsContent value="kanban" className="space-y-3 pt-4">
                    <div className="grid gap-2 md:grid-cols-[1fr_180px_140px]"><Input placeholder="Nouvelle tache" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} /><Select value={taskStatus} onValueChange={(v) => setTaskStatus(v as TaskStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TASK_COLUMNS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select><Button onClick={() => void createTask()}><IconPlus className="size-4" />Ajouter</Button></div>
                    {loadingTasks ? <Skeleton className="h-64 w-full" /> : taskError ? <ErrorState title="Impossible de charger les taches." onRetry={() => void mutateTasks()} /> : (
                      <div className="grid gap-4 lg:grid-cols-3">
                        {TASK_COLUMNS.map((status) => (
                          <div key={status} className="rounded-xl border bg-muted/20 p-3" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void moveTask(status) }}>
                            <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">{status}</p><Badge variant="secondary">{byStatus[status].length}</Badge></div>
                            <div className="space-y-2">{byStatus[status].map((task) => <div key={task.id} draggable onDragStart={() => setDragTaskId(task.id)} className="rounded-lg border bg-background p-3"><div className="flex items-start justify-between gap-2"><p className="text-sm font-medium">{task.title}</p><IconGripVertical className="size-4 text-muted-foreground" /></div><p className="text-xs text-muted-foreground">{task.priority} | {task.assigned_to || "-"} | {formatDateFr(task.due_date)}</p></div>)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
