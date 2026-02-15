"use client"

import * as React from "react"
import useSWR from "swr"
import { useParams } from "next/navigation"
import { IconCalendar, IconGripVertical, IconPlus, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"

import { AppSidebar } from "@/components/app-sidebar"
import { useModalSystem } from "@/components/modal-system-provider"
import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fetchApi, requestApi } from "@/lib/api"
import { formatDateFr, formatDateTimeFr, formatNumberFr } from "@/lib/format"

type TaskStatus = "To Do" | "In Progress" | "Done"
type TaskItem = { id: string; title: string; status: TaskStatus; priority: string; due_date?: string | null; assigned_to?: string | null }
type TaskResponse = { items: TaskItem[] }
type ProjectMember = { id: string; name: string; role: string; contribution: number }
type ProjectTimelineItem = { id: string; title: string; start_date: string; end_date: string; depends_on?: string[]; milestone?: boolean }
type ProjectDeliverable = { id: string; title: string; owner?: string; due_date?: string; completed?: boolean; file_url?: string }
type ProjectDetail = {
  id: string
  name: string
  description?: string | null
  status: string
  due_date?: string | null
  progress_percent: number
  budget_total?: number | null
  budget_spent?: number | null
  team: ProjectMember[]
  timeline: ProjectTimelineItem[]
  deliverables: ProjectDeliverable[]
  updated_at?: string | null
}
type ActivityItem = { id: string; title: string; actor: string; action: string; timestamp: string }
type ActivityResponse = { items: ActivityItem[] }

const TASK_COLUMNS: TaskStatus[] = ["To Do", "In Progress", "Done"]
const fetcher = <T,>(path: string) => fetchApi<T>(path)

function toIso(value: string): string | null {
  if (!value) return null
  const date = new Date(`${value}T09:00:00`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function asDate(value?: string): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>()
  const projectId = Array.isArray(params?.id) ? params.id[0] : params?.id || ""
  const { openProjectForm } = useModalSystem()

  const { data: project, error: projectError, isLoading: loadingProject, mutate: mutateProject } = useSWR<ProjectDetail>(
    projectId ? `/api/v1/admin/projects/${projectId}` : null,
    fetcher,
  )
  const { data: taskData, error: taskError, isLoading: loadingTasks, mutate: mutateTasks } = useSWR<TaskResponse>(
    projectId ? `/api/v1/admin/tasks?page=1&page_size=200&project_id=${encodeURIComponent(projectId)}` : null,
    fetcher,
  )
  const { data: activity, error: activityError, mutate: mutateActivity } = useSWR<ActivityResponse>(
    projectId ? `/api/v1/admin/projects/${projectId}/activity?limit=30` : null,
    fetcher,
  )

  const [tab, setTab] = React.useState("kanban")
  const [dragTaskId, setDragTaskId] = React.useState<string | null>(null)
  const [taskTitle, setTaskTitle] = React.useState("")
  const [taskStatus, setTaskStatus] = React.useState<TaskStatus>("To Do")
  const [team, setTeam] = React.useState<ProjectMember[]>([])
  const [timeline, setTimeline] = React.useState<ProjectTimelineItem[]>([])
  const [deliverables, setDeliverables] = React.useState<ProjectDeliverable[]>([])
  const [budgetTotal, setBudgetTotal] = React.useState("")
  const [budgetSpent, setBudgetSpent] = React.useState("")
  const [newMember, setNewMember] = React.useState({ name: "", role: "Owner", contribution: "20" })
  const [newTimeline, setNewTimeline] = React.useState({ title: "", start: "", end: "", deps: "", milestone: false })
  const [newDeliverable, setNewDeliverable] = React.useState({ title: "", owner: "", due: "", file_url: "" })

  React.useEffect(() => {
    if (!project) return
    setTeam(project.team || [])
    setTimeline(project.timeline || [])
    setDeliverables(project.deliverables || [])
    setBudgetTotal(project.budget_total != null ? String(project.budget_total) : "")
    setBudgetSpent(project.budget_spent != null ? String(project.budget_spent) : "")
  }, [project])

  const tasks = React.useMemo(() => taskData?.items ?? [], [taskData])
  const byStatus = React.useMemo(
    () => TASK_COLUMNS.reduce<Record<TaskStatus, TaskItem[]>>((acc, s) => ({ ...acc, [s]: tasks.filter((t) => t.status === s) }), { "To Do": [], "In Progress": [], "Done": [] }),
    [tasks],
  )
  const progress = React.useMemo(() => {
    if (tasks.length === 0) return Math.max(0, Math.min(100, project?.progress_percent || 0))
    return Math.round((tasks.filter((t) => t.status === "Done").length / tasks.length) * 100)
  }, [tasks, project?.progress_percent])

  const range = React.useMemo(() => {
    const points = timeline.flatMap((item) => [asDate(item.start_date), asDate(item.end_date)]).filter(Boolean) as Date[]
    if (points.length === 0) {
      const start = new Date()
      return { start, end: new Date(start.getTime() + 30 * 86400000) }
    }
    return { start: new Date(Math.min(...points.map((p) => p.getTime()))), end: new Date(Math.max(...points.map((p) => p.getTime()))) }
  }, [timeline])
  const pct = (value?: string) => {
    const date = asDate(value)
    if (!date) return 0
    const total = range.end.getTime() - range.start.getTime() || 1
    return Math.max(0, Math.min(100, ((date.getTime() - range.start.getTime()) / total) * 100))
  }

  async function patchProject(payload: Record<string, unknown>, success: string) {
    await requestApi(`/api/v1/admin/projects/${projectId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    toast.success(success)
    await mutateProject()
    await mutateActivity()
  }

  async function createTask() {
    if (!taskTitle.trim()) return
    await requestApi("/api/v1/admin/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: taskTitle.trim(), status: taskStatus, project_id: projectId, source: "manual", priority: "Medium" }),
    })
    setTaskTitle("")
    toast.success("Tache ajoutee.")
    await mutateTasks()
    await mutateActivity()
  }

  async function moveTask(status: TaskStatus) {
    if (!dragTaskId) return
    await requestApi(`/api/v1/admin/tasks/${dragTaskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    setDragTaskId(null)
    await mutateTasks()
    await mutateActivity()
  }

  if (loadingProject) {
    return <SidebarProvider style={{ "--sidebar-width": "calc(var(--spacing) * 72)", "--header-height": "calc(var(--spacing) * 12)" } as React.CSSProperties}><AppSidebar variant="inset" /><SidebarInset><SiteHeader /><div className="p-8"><Skeleton className="h-72 w-full" /></div></SidebarInset></SidebarProvider>
  }
  if (projectError || !project) {
    return <SidebarProvider style={{ "--sidebar-width": "calc(var(--spacing) * 72)", "--header-height": "calc(var(--spacing) * 12)" } as React.CSSProperties}><AppSidebar variant="inset" /><SidebarInset><SiteHeader /><div className="p-8"><ErrorState title="Projet introuvable." onRetry={() => void mutateProject()} /></div></SidebarInset></SidebarProvider>
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": "calc(var(--spacing) * 72)", "--header-height": "calc(var(--spacing) * 12)" } as React.CSSProperties}>
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 md:p-8">
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
                <div className="rounded-lg border p-3">
                  <p className="text-sm font-medium">Budget tracker</p>
                  <p className="text-xs text-muted-foreground">Total: {formatNumberFr(project.budget_total || 0)} EUR | Depense: {formatNumberFr(project.budget_spent || 0)} EUR</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2"><Input value={budgetTotal} onChange={(e) => setBudgetTotal(e.target.value)} /><Input value={budgetSpent} onChange={(e) => setBudgetSpent(e.target.value)} /></div>
                  <Button className="mt-2" variant="outline" onClick={() => void patchProject({ budget_total: budgetTotal ? Number(budgetTotal) : null, budget_spent: budgetSpent ? Number(budgetSpent) : 0 }, "Budget mis a jour.")}>Enregistrer budget</Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card>
              <CardContent className="pt-6">
                <Tabs value={tab} onValueChange={setTab}>
                  <TabsList className="grid w-full grid-cols-4">
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

                  <TabsContent value="timeline" className="space-y-3 pt-4">
                    {timeline.length === 0 ? <EmptyState title="Aucun jalon" description="Ajoutez des jalons et dependances." className="min-h-24" /> : (
                      <div className="space-y-2">{timeline.map((item) => <div key={item.id} className="grid gap-2 md:grid-cols-[200px_minmax(0,1fr)] md:items-center"><div><p className="text-sm font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{formatDateFr(item.start_date)} - {formatDateFr(item.end_date)}</p><p className="text-[11px] text-muted-foreground">{(item.depends_on || []).join(", ")}</p></div><div className="relative h-7 rounded bg-muted/40"><div className="absolute top-1/2 h-3 -translate-y-1/2 rounded bg-primary" style={{ left: `${pct(item.start_date)}%`, width: `${Math.max(2, pct(item.end_date) - pct(item.start_date))}%` }} /></div></div>)}</div>
                    )}
                    <div className="grid gap-2 md:grid-cols-4">
                      <Input placeholder="Titre" value={newTimeline.title} onChange={(e) => setNewTimeline((c) => ({ ...c, title: e.target.value }))} />
                      <Input type="date" value={newTimeline.start} onChange={(e) => setNewTimeline((c) => ({ ...c, start: e.target.value }))} />
                      <Input type="date" value={newTimeline.end} onChange={(e) => setNewTimeline((c) => ({ ...c, end: e.target.value }))} />
                      <Input placeholder="Depends on (ids)" value={newTimeline.deps} onChange={(e) => setNewTimeline((c) => ({ ...c, deps: e.target.value }))} />
                    </div>
                    <div className="flex items-center gap-2"><Button variant="outline" onClick={() => setTimeline((cur) => [...cur, { id: `m-${Date.now()}`, title: newTimeline.title.trim(), start_date: toIso(newTimeline.start) || "", end_date: toIso(newTimeline.end) || toIso(newTimeline.start) || "", depends_on: newTimeline.deps.split(",").map((x) => x.trim()).filter(Boolean), milestone: newTimeline.milestone }])}><IconPlus className="size-4" />Ajouter jalon</Button><Button onClick={() => void patchProject({ timeline }, "Timeline mise a jour.")}>Enregistrer timeline</Button></div>
                  </TabsContent>

                  <TabsContent value="team" className="space-y-3 pt-4">
                    {team.length === 0 ? <EmptyState title="Aucun membre" description="Assignez des roles et contributions." className="min-h-24" /> : <div className="space-y-2">{team.map((m) => <div key={m.id} className="rounded-lg border p-3"><div className="flex items-center justify-between"><div><p className="text-sm font-medium">{m.name}</p><p className="text-xs text-muted-foreground">{m.role}</p></div><Button variant="ghost" size="icon" onClick={() => setTeam((cur) => cur.filter((x) => x.id !== m.id))}><IconTrash className="size-4 text-red-600" /></Button></div><p className="text-xs text-muted-foreground mt-1">Contribution: {m.contribution}%</p></div>)}</div>}
                    <div className="grid gap-2 md:grid-cols-4"><Input placeholder="Nom" value={newMember.name} onChange={(e) => setNewMember((c) => ({ ...c, name: e.target.value }))} /><Input placeholder="Role" value={newMember.role} onChange={(e) => setNewMember((c) => ({ ...c, role: e.target.value }))} /><Input type="number" placeholder="Contribution %" value={newMember.contribution} onChange={(e) => setNewMember((c) => ({ ...c, contribution: e.target.value }))} /><Button variant="outline" onClick={() => setTeam((cur) => [...cur, { id: `u-${Date.now()}`, name: newMember.name.trim(), role: newMember.role.trim(), contribution: Number(newMember.contribution || 0) }])}><IconPlus className="size-4" />Ajouter</Button></div>
                    <Button onClick={() => void patchProject({ team }, "Equipe mise a jour.")}>Enregistrer equipe</Button>
                  </TabsContent>

                  <TabsContent value="deliverables" className="space-y-3 pt-4">
                    {deliverables.length === 0 ? <EmptyState title="Aucun livrable" description="Ajoutez documents/fichiers avec checklist." className="min-h-24" /> : <div className="space-y-2">{deliverables.map((d) => <div key={d.id} className="rounded-lg border p-3 flex items-start justify-between gap-2"><div className="flex items-start gap-2"><Checkbox checked={Boolean(d.completed)} onCheckedChange={(checked) => setDeliverables((cur) => cur.map((x) => x.id === d.id ? { ...x, completed: Boolean(checked) } : x))} /><div><p className={`text-sm font-medium ${d.completed ? "line-through text-muted-foreground" : ""}`}>{d.title}</p><p className="text-xs text-muted-foreground">{d.owner || "-"} | {formatDateFr(d.due_date)}</p>{d.file_url ? <a href={d.file_url} target="_blank" rel="noreferrer noopener" className="text-xs text-primary underline">Ouvrir fichier</a> : null}</div></div><Button variant="ghost" size="icon" onClick={() => setDeliverables((cur) => cur.filter((x) => x.id !== d.id))}><IconTrash className="size-4 text-red-600" /></Button></div>)}</div>}
                    <div className="grid gap-2 md:grid-cols-4"><Input placeholder="Titre livrable" value={newDeliverable.title} onChange={(e) => setNewDeliverable((c) => ({ ...c, title: e.target.value }))} /><Input placeholder="Owner" value={newDeliverable.owner} onChange={(e) => setNewDeliverable((c) => ({ ...c, owner: e.target.value }))} /><Input type="date" value={newDeliverable.due} onChange={(e) => setNewDeliverable((c) => ({ ...c, due: e.target.value }))} /><Input placeholder="URL fichier" value={newDeliverable.file_url} onChange={(e) => setNewDeliverable((c) => ({ ...c, file_url: e.target.value }))} /></div>
                    <div className="flex items-center gap-2"><Button variant="outline" onClick={() => setDeliverables((cur) => [...cur, { id: `d-${Date.now()}`, title: newDeliverable.title.trim(), owner: newDeliverable.owner.trim(), due_date: toIso(newDeliverable.due) || undefined, file_url: newDeliverable.file_url.trim() || undefined, completed: false }])}><IconPlus className="size-4" />Ajouter livrable</Button><Button onClick={() => void patchProject({ deliverables, progress_percent: deliverables.length ? Math.round((deliverables.filter((d) => d.completed).length / deliverables.length) * 100) : project.progress_percent }, "Deliverables mis a jour.")}>Enregistrer deliverables</Button></div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Activity feed</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {activityError ? <ErrorState title="Feed indisponible." onRetry={() => void mutateActivity()} /> : activity && activity.items.length > 0 ? activity.items.map((item) => <div key={item.id} className="rounded-lg border p-3"><p className="text-sm font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.actor} | {item.action}</p><p className="text-xs text-muted-foreground">{formatDateTimeFr(item.timestamp)}</p></div>) : <EmptyState title="Pas d'activite" description="Les dernieres modifications apparaitront ici." className="min-h-24" />}
              </CardContent>
            </Card>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
