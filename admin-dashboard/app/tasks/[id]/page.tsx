"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import useSWR from "swr"
import { IconArrowLeft } from "@tabler/icons-react"
import { toast } from "sonner"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { useModalSystem } from "@/components/modal-system-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchApi, requestApi } from "@/lib/api"
import { formatDateFr, formatDateTimeFr } from "@/lib/format"

type TaskStatus = "To Do" | "In Progress" | "Done"
type TaskPriority = "Low" | "Medium" | "High" | "Critical"

type TaskSubtask = {
  id: string
  title: string
  done: boolean
  created_at?: string | null
  updated_at?: string | null
}

type TaskComment = {
  id: string
  body: string
  author: string
  mentions: string[]
  created_at: string
}

type TaskAttachment = {
  id: string
  name: string
  url?: string | null
  size_kb?: number
  created_at?: string | null
}

type TaskTimelineItem = {
  id: string
  event_type: string
  message: string
  actor: string
  created_at: string
  metadata?: Record<string, unknown>
}

type TaskLeadSummary = {
  id: string
  name: string
  email: string
  status: string
  company_name?: string | null
  total_score?: number
  tier?: string
  heat_status?: string
}

type TaskProjectSummary = {
  id?: string | null
  name?: string | null
  status?: string | null
  due_date?: string | null
}

type TaskDetail = {
  id: string
  title: string
  description?: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date?: string | null
  assigned_to?: string | null
  lead_id?: string | null
  project_id?: string | null
  project_name?: string | null
  channel?: "email" | "linkedin" | "call" | null
  sequence_step?: number | null
  source?: "manual" | "auto-rule" | "assistant" | null
  rule_id?: string | null
  related_score_snapshot?: Record<string, unknown>
  subtasks?: TaskSubtask[]
  comments?: TaskComment[]
  attachments?: TaskAttachment[]
  timeline?: TaskTimelineItem[]
  lead?: TaskLeadSummary
  project?: TaskProjectSummary
  created_at?: string | null
  updated_at?: string | null
  closed_at?: string | null
}

type UserListResponse = {
  items: Array<{
    id: string
    email: string
    display_name?: string | null
  }>
}

type LeadDetail = {
  id: string
  first_name: string
  last_name: string
  email: string
  status: string
  total_score?: number
  score?: {
    tier?: string
    heat_status?: string
  }
  company?: {
    name?: string
  }
}

type LeadProject = {
  id: string
  name: string
  status: string
  due_date?: string | null
}

const TASK_STATUSES: TaskStatus[] = ["To Do", "In Progress", "Done"]
const TASK_PRIORITIES: TaskPriority[] = ["Low", "Medium", "High", "Critical"]

const fetcher = <T,>(path: string) => fetchApi<T>(path)

function mentionHandlesFromText(text: string): string[] {
  const matches = text.match(/@([a-zA-Z0-9._-]+)/g) || []
  return Array.from(new Set(matches.map((item) => item.slice(1).toLowerCase())))
}

function renderCommentBody(text: string): React.ReactNode {
  const parts = text.split(/(@[a-zA-Z0-9._-]+)/g)
  return (
    <p className="text-sm leading-relaxed">
      {parts.map((part, index) => (
        <span
          key={`${part}-${index}`}
          className={part.startsWith("@") ? "font-medium text-primary" : ""}
        >
          {part}
        </span>
      ))}
    </p>
  )
}

export default function TaskDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { openConfirm } = useModalSystem()
  const idParam = params.id
  const id = Array.isArray(idParam) ? idParam[0] : String(idParam || "")

  const { data: task, error, isLoading, mutate } = useSWR<TaskDetail>(
    id ? `/api/v1/admin/tasks/${encodeURIComponent(id)}` : null,
    fetcher,
  )
  const { data: users } = useSWR<UserListResponse>("/api/v1/admin/users", fetcher)

  const leadId = task?.lead?.id || task?.lead_id || null
  const { data: linkedLead } = useSWR<LeadDetail>(
    leadId ? `/api/v1/admin/leads/${encodeURIComponent(leadId)}` : null,
    fetcher,
  )
  const { data: leadProjects } = useSWR<LeadProject[]>(
    leadId ? `/api/v1/admin/leads/${encodeURIComponent(leadId)}/projects` : null,
    fetcher,
  )

  const [headerForm, setHeaderForm] = React.useState({
    status: "To Do" as TaskStatus,
    priority: "Medium" as TaskPriority,
    assigned_to: "Vous",
  })
  const [description, setDescription] = React.useState("")
  const [subtasks, setSubtasks] = React.useState<TaskSubtask[]>([])
  const [newSubtask, setNewSubtask] = React.useState("")
  const [commentDraft, setCommentDraft] = React.useState("")
  const [attachments, setAttachments] = React.useState<TaskAttachment[]>([])
  const [attachmentName, setAttachmentName] = React.useState("")
  const [attachmentUrl, setAttachmentUrl] = React.useState("")

  const [savingHeader, setSavingHeader] = React.useState(false)
  const [savingDescription, setSavingDescription] = React.useState(false)
  const [savingSubtasks, setSavingSubtasks] = React.useState(false)
  const [savingComment, setSavingComment] = React.useState(false)
  const [savingAttachments, setSavingAttachments] = React.useState(false)

  React.useEffect(() => {
    if (!task) return
    setHeaderForm({
      status: task.status || "To Do",
      priority: task.priority || "Medium",
      assigned_to: task.assigned_to || "Vous",
    })
    setDescription(task.description || "")
    setSubtasks(Array.isArray(task.subtasks) ? task.subtasks : [])
    setAttachments(Array.isArray(task.attachments) ? task.attachments : [])
  }, [task])

  const mentionUsers = React.useMemo(() => {
    return (users?.items || []).map((user) => {
      const label = (user.display_name || user.email || user.id).trim()
      const handle = (user.display_name || user.email.split("@")[0] || user.id)
        .toLowerCase()
        .replace(/\s+/g, "")
      return { id: user.id, label, handle }
    })
  }, [users?.items])

  const mentionQuery = React.useMemo(() => {
    const match = commentDraft.match(/(?:^|\s)@([a-zA-Z0-9._-]*)$/)
    return match ? match[1].toLowerCase() : null
  }, [commentDraft])

  const mentionCandidates = React.useMemo(() => {
    if (!mentionQuery && mentionQuery !== "") return []
    return mentionUsers
      .filter((user) => user.handle.includes(String(mentionQuery)) || user.label.toLowerCase().includes(String(mentionQuery)))
      .slice(0, 5)
  }, [mentionQuery, mentionUsers])

  const timelineItems = React.useMemo(() => {
    return [...(task?.timeline || [])].sort((a, b) => {
      return Date.parse(String(b.created_at || 0)) - Date.parse(String(a.created_at || 0))
    })
  }, [task?.timeline])

  const comments = React.useMemo(() => {
    return [...(task?.comments || [])].sort((a, b) => {
      return Date.parse(String(b.created_at || 0)) - Date.parse(String(a.created_at || 0))
    })
  }, [task?.comments])

  const effectiveProject = task?.project || (leadProjects && leadProjects.length > 0
    ? {
      id: leadProjects[0].id,
      name: leadProjects[0].name,
      status: leadProjects[0].status,
      due_date: leadProjects[0].due_date,
    }
    : null)

  async function patchTask(payload: Record<string, unknown>) {
    if (!id) return
    const updated = await requestApi<TaskDetail>(`/api/v1/admin/tasks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    await mutate(updated, { revalidate: false })
  }

  async function saveHeaderSection() {
    if (!id) return
    try {
      setSavingHeader(true)
      await patchTask({
        status: headerForm.status,
        priority: headerForm.priority,
        assigned_to: headerForm.assigned_to.trim() || "Vous",
      })
      toast.success("En-tete de la tache mis a jour.")
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Mise a jour impossible.")
    } finally {
      setSavingHeader(false)
    }
  }

  async function saveDescriptionSection() {
    if (!id) return
    try {
      setSavingDescription(true)
      await patchTask({ description: description.trim() || null })
      toast.success("Description enregistree.")
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Enregistrement impossible.")
    } finally {
      setSavingDescription(false)
    }
  }

  async function saveSubtasks(nextSubtasks: TaskSubtask[]) {
    if (!id) return
    try {
      setSavingSubtasks(true)
      setSubtasks(nextSubtasks)
      await patchTask({ subtasks: nextSubtasks })
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Checklist non mise a jour.")
      await mutate()
    } finally {
      setSavingSubtasks(false)
    }
  }

  async function toggleSubtask(subtaskId: string, done: boolean) {
    const nowIso = new Date().toISOString()
    const nextSubtasks = subtasks.map((item) =>
      item.id === subtaskId ? { ...item, done, updated_at: nowIso } : item,
    )
    await saveSubtasks(nextSubtasks)
  }

  async function addSubtask() {
    const title = newSubtask.trim()
    if (!title) return
    const nowIso = new Date().toISOString()
    const nextSubtasks: TaskSubtask[] = [
      ...subtasks,
      {
        id: `subtask-${Date.now()}`,
        title,
        done: false,
        created_at: nowIso,
        updated_at: nowIso,
      },
    ]
    setNewSubtask("")
    await saveSubtasks(nextSubtasks)
  }

  async function submitComment() {
    if (!id) return
    const body = commentDraft.trim()
    if (!body) return
    const mentions = mentionHandlesFromText(body)
    try {
      setSavingComment(true)
      const updated = await requestApi<TaskDetail>(`/api/v1/admin/tasks/${encodeURIComponent(id)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          mentions,
          author: "Vous",
        }),
      })
      setCommentDraft("")
      await mutate(updated, { revalidate: false })
      toast.success("Commentaire ajoute.")
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Commentaire non ajoute.")
    } finally {
      setSavingComment(false)
    }
  }

  function insertMention(handle: string) {
    setCommentDraft((current) => current.replace(/(?:^|\s)@[a-zA-Z0-9._-]*$/, ` @${handle} `).trimStart())
  }

  async function addAttachment() {
    const name = attachmentName.trim()
    const url = attachmentUrl.trim()
    if (!name && !url) return
    const nowIso = new Date().toISOString()
    const nextAttachments = [
      ...attachments,
      {
        id: `attachment-${Date.now()}`,
        name: name || url,
        url: url || null,
        created_at: nowIso,
      },
    ]
    try {
      setSavingAttachments(true)
      setAttachments(nextAttachments)
      await patchTask({ attachments: nextAttachments })
      setAttachmentName("")
      setAttachmentUrl("")
      toast.success("Piece jointe ajoutee.")
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Ajout de piece jointe impossible.")
      await mutate()
    } finally {
      setSavingAttachments(false)
    }
  }

  function closeTask() {
    if (!id) return
    openConfirm({
      title: "Fermer cette tache ?",
      description: "Le statut passera a Done et l'action sera tracee dans la timeline.",
      confirmLabel: "Fermer la tache",
      onConfirm: async () => {
        const updated = await requestApi<TaskDetail>(`/api/v1/admin/tasks/${encodeURIComponent(id)}/close`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
        await mutate(updated, { revalidate: false })
        setHeaderForm((current) => ({ ...current, status: "Done" }))
        toast.success("Tache fermee.")
      },
    })
  }

  if (isLoading) {
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
          <div className="space-y-3 p-4 pt-0">
            <Skeleton className="h-12 w-1/2" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  if (error || !task) {
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
          <div className="p-4 pt-0">
            <Card>
              <CardHeader>
                <CardTitle>Tache introuvable</CardTitle>
                <CardDescription>
                  {error instanceof Error ? error.message : "Impossible de charger cette tache."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => router.push("/tasks")}>Retour aux taches</Button>
              </CardContent>
            </Card>
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
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
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <nav className="mb-1 flex items-center text-sm text-muted-foreground">
            <Link href="/tasks" className="transition-colors hover:text-foreground">
              Taches
            </Link>
            <span className="mx-2">/</span>
            <span className="font-medium text-foreground">{task.title}</span>
          </nav>

          <div className="sticky top-2 z-20 rounded-xl border bg-background/95 p-3 backdrop-blur">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <div className="flex min-w-0 items-start gap-2">
                <Button variant="ghost" size="icon" onClick={() => router.push("/tasks")}>
                  <IconArrowLeft className="size-4" />
                </Button>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">#{task.id}</p>
                  <h1 className="truncate text-xl font-semibold">{task.title}</h1>
                </div>
              </div>
              <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
                <Select
                  value={headerForm.status}
                  onValueChange={(value) =>
                    setHeaderForm((current) => ({ ...current, status: value as TaskStatus }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Statut" />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={headerForm.priority}
                  onValueChange={(value) =>
                    setHeaderForm((current) => ({ ...current, priority: value as TaskPriority }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Priorite" />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITIES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={headerForm.assigned_to}
                  onChange={(event) =>
                    setHeaderForm((current) => ({ ...current, assigned_to: event.target.value }))
                  }
                  placeholder="Assigne a"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => void saveHeaderSection()} disabled={savingHeader}>
                  {savingHeader ? "Enregistrement..." : "Enregistrer"}
                </Button>
                <Button
                  variant="destructive"
                  onClick={closeTask}
                  disabled={task.status === "Done"}
                >
                  {task.status === "Done" ? "Tache fermee" : "Fermer tache"}
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <div>
                    <CardTitle>Description</CardTitle>
                    <CardDescription>Contexte et objectif de la tache.</CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void saveDescriptionSection()}
                    disabled={savingDescription}
                  >
                    {savingDescription ? "Sauvegarde..." : "Sauvegarder"}
                  </Button>
                </CardHeader>
                <CardContent>
                  <textarea
                    className="min-h-32 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                    placeholder="Ajoutez une description claire de la tache..."
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Subtasks</CardTitle>
                  <CardDescription>Checklist d&apos;execution de la tache.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(subtasks || []).map((item) => (
                    <div key={item.id} className="flex items-center gap-3 rounded-md border p-2">
                      <Checkbox
                        checked={item.done}
                        disabled={savingSubtasks}
                        onCheckedChange={(checked) => {
                          void toggleSubtask(item.id, checked === true)
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm ${item.done ? "text-muted-foreground line-through" : ""}`}>
                          {item.title}
                        </p>
                      </div>
                    </div>
                  ))}
                  {subtasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucune subtask pour cette tache.</p>
                  ) : null}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Nouvelle subtask..."
                      value={newSubtask}
                      onChange={(event) => setNewSubtask(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          void addSubtask()
                        }
                      }}
                    />
                    <Button onClick={() => void addSubtask()} disabled={savingSubtasks}>
                      Ajouter
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Commentaires</CardTitle>
                  <CardDescription>@mentions utilisateurs supportees.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    {comments.map((item) => (
                      <div key={item.id} className="rounded-md border p-3">
                        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{item.author || "Utilisateur"}</span>
                          <span>{formatDateTimeFr(item.created_at)}</span>
                          {(item.mentions || []).map((mention) => (
                            <Badge key={`${item.id}-${mention}`} variant="secondary">
                              @{mention}
                            </Badge>
                          ))}
                        </div>
                        {renderCommentBody(item.body)}
                      </div>
                    ))}
                    {comments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Aucun commentaire pour le moment.</p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <textarea
                      className="min-h-24 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                      placeholder="Ajouter un commentaire... Utilisez @utilisateur pour mentionner."
                      value={commentDraft}
                      onChange={(event) => setCommentDraft(event.target.value)}
                    />
                    {mentionCandidates.length > 0 ? (
                      <div className="rounded-md border bg-muted/30 p-2">
                        <p className="mb-2 text-xs text-muted-foreground">Mentions suggerees</p>
                        <div className="flex flex-wrap gap-2">
                          {mentionCandidates.map((user) => (
                            <button
                              key={user.id}
                              type="button"
                              className="rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent"
                              onClick={() => insertMention(user.handle)}
                            >
                              @{user.handle} - {user.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <Button onClick={() => void submitComment()} disabled={savingComment}>
                      {savingComment ? "Publication..." : "Publier"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Timeline des modifications</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {timelineItems.map((item) => (
                    <div key={item.id} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">{item.message}</p>
                        <Badge variant="outline">{item.event_type}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.actor} - {formatDateTimeFr(item.created_at)}
                      </p>
                    </div>
                  ))}
                  {timelineItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucun evenement enregistre.</p>
                  ) : null}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Lead lie</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {leadId ? (
                    <>
                      <p className="font-medium">
                        {task.lead?.name || `${linkedLead?.first_name || ""} ${linkedLead?.last_name || ""}`.trim() || leadId}
                      </p>
                      <p className="text-muted-foreground">{task.lead?.email || linkedLead?.email || "-"}</p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{task.lead?.status || linkedLead?.status || "-"}</Badge>
                        {task.lead?.tier || linkedLead?.score?.tier ? (
                          <Badge variant="secondary">{task.lead?.tier || linkedLead?.score?.tier}</Badge>
                        ) : null}
                        {task.lead?.total_score || linkedLead?.total_score ? (
                          <Badge>Score {Math.round(Number(task.lead?.total_score || linkedLead?.total_score || 0))}</Badge>
                        ) : null}
                      </div>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/leads/${encodeURIComponent(leadId)}`}>Ouvrir le lead</Link>
                      </Button>
                    </>
                  ) : (
                    <p className="text-muted-foreground">Aucun lead associe.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Infos tache</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Projet</span>
                    <span className="text-right">
                      {effectiveProject?.name || task.project_name || task.project_id || "Aucun"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Assigne</span>
                    <span>{headerForm.assigned_to || "-"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Creation</span>
                    <span>{formatDateFr(task.created_at)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Maj</span>
                    <span>{formatDateFr(task.updated_at)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Echeance</span>
                    <span>{formatDateFr(task.due_date)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Fermeture</span>
                    <span>{formatDateFr(task.closed_at)}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Attachments</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    {attachments.map((item) => (
                      <div key={item.id} className="rounded-md border p-2 text-sm">
                        {item.url ? (
                          <a href={item.url} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                            {item.name}
                          </a>
                        ) : (
                          <p className="font-medium">{item.name}</p>
                        )}
                        <p className="text-xs text-muted-foreground">{formatDateTimeFr(item.created_at || null)}</p>
                      </div>
                    ))}
                    {attachments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Aucune piece jointe.</p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Input
                      placeholder="Nom du fichier"
                      value={attachmentName}
                      onChange={(event) => setAttachmentName(event.target.value)}
                    />
                    <Input
                      placeholder="URL (optionnel)"
                      value={attachmentUrl}
                      onChange={(event) => setAttachmentUrl(event.target.value)}
                    />
                    <Button onClick={() => void addAttachment()} disabled={savingAttachments}>
                      {savingAttachments ? "Ajout..." : "Ajouter attachment"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
