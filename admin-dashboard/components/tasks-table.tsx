"use client"

import * as React from "react"
import { IconDotsVertical, IconFolderUp, IconPencil, IconTrash } from "@tabler/icons-react"
import Link from "next/link"
import { toast } from "sonner"

import { useModalSystem } from "@/components/modal-system-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ResponsiveDataView } from "@/components/responsive/responsive-data-view"
import { formatDateFr } from "@/lib/format"
import { requestApi } from "@/lib/api"

export type Task = {
  id: string
  title: string
  status: "To Do" | "In Progress" | "Done"
  priority: "Low" | "Medium" | "High" | "Critical"
  due_date: string | null
  assigned_to: string
  lead_id?: string
  channel: "email" | "linkedin" | "call"
  sequence_step: number
  source: "manual" | "auto-rule" | "assistant"
  rule_id?: string
  related_score_snapshot?: Record<string, unknown>
}

const TASK_STATUSES: Task["status"][] = ["To Do", "In Progress", "Done"]
const TASK_PRIORITIES: Task["priority"][] = ["Low", "Medium", "High", "Critical"]
const TASK_STATUS_FILTERS: string[] = ["ALL", ...TASK_STATUSES]
const TASK_CHANNEL_FILTERS = ["ALL", "email", "linkedin", "call"]
const TASK_SOURCE_FILTERS = ["ALL", "manual", "auto-rule", "assistant"]

function channelLabel(value: string): string {
  if (value === "email") return "Email"
  if (value === "linkedin") return "LinkedIn"
  if (value === "call") return "Appel"
  return value
}

function sourceLabel(value: string): string {
  if (value === "manual") return "Manuel"
  if (value === "auto-rule") return "Auto-rule"
  if (value === "assistant") return "Assistant"
  return value
}

function priorityClass(priority: Task["priority"]): string {
  if (priority === "Critical") return "border-red-500 text-red-600"
  if (priority === "High") return "border-orange-500 text-orange-600"
  return ""
}

function toDatetimeLocal(value?: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function toIsoFromDatetimeLocal(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function SortIcon({ column, sort, order }: { column: string; sort: string; order: string }) {
  if (sort !== column) return null
  return <span className="ml-1">{order === "asc" ? "^" : "v"}</span>
}

const TaskRow = React.memo(({
  task,
  onEdit,
  onDelete,
  onConvert
}: {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onConvert: (task: Task) => void;
}) => (
  <TableRow key={task.id}>
    <TableCell>
      <Link
        href={`/tasks/${encodeURIComponent(task.id)}`}
        className="font-medium text-foreground underline-offset-2 hover:underline"
      >
        {task.title}
      </Link>
      <div className="text-xs text-muted-foreground">#{task.id}</div>
    </TableCell>
    <TableCell>
      <Badge variant={task.status === "Done" ? "default" : "secondary"}>
        {task.status}
      </Badge>
    </TableCell>
    <TableCell>
      <Badge variant="outline" className={priorityClass(task.priority)}>
        {task.priority}
      </Badge>
    </TableCell>
    <TableCell>{formatDateFr(task.due_date || null)}</TableCell>
    <TableCell>{task.assigned_to}</TableCell>
    <TableCell>
      <Badge variant="outline">{channelLabel(task.channel)}</Badge>
    </TableCell>
    <TableCell>
      <Badge variant={task.source === "auto-rule" ? "default" : "secondary"}>
        {sourceLabel(task.source)}
      </Badge>
    </TableCell>
    <TableCell>
      <span className="text-sm">{task.sequence_step ?? 1}</span>
    </TableCell>
    <TableCell className="text-right">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8">
            <IconDotsVertical className="size-4" />
            <span className="sr-only">Actions de la tache</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => onConvert(task)}>
            <IconFolderUp className="size-4 mr-2" />
            Convertir en projet
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onEdit(task)}>
            <IconPencil className="size-4 mr-2" />
            Modifier
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDelete(task)}>
            <IconTrash className="size-4 mr-2" />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </TableCell>
  </TableRow>
))

TaskRow.displayName = "TaskRow"

const TaskCard = React.memo(({
  task,
  onEdit,
  onDelete,
  onConvert
}: {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onConvert: (task: Task) => void;
}) => (
  <div className="rounded-lg border p-3">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <Link
          href={`/tasks/${encodeURIComponent(task.id)}`}
          className="line-clamp-2 font-medium text-foreground underline-offset-2 hover:underline"
        >
          {task.title}
        </Link>
        <div className="text-xs text-muted-foreground">#{task.id}</div>
      </div>
      <Badge variant={task.status === "Done" ? "default" : "secondary"}>
        {task.status}
      </Badge>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
      <div>
        <p className="text-muted-foreground">Priorité</p>
        <Badge variant="outline" className={priorityClass(task.priority)}>
          {task.priority}
        </Badge>
      </div>
      <div>
        <p className="text-muted-foreground">Échéance</p>
        <p>{formatDateFr(task.due_date || null)}</p>
      </div>
      <div>
        <p className="text-muted-foreground">Assigné à</p>
        <p className="truncate">{task.assigned_to}</p>
      </div>
      <div>
        <p className="text-muted-foreground">Canal</p>
        <Badge variant="outline">{channelLabel(task.channel)}</Badge>
      </div>
      <div>
        <p className="text-muted-foreground">Source</p>
        <Badge variant={task.source === "auto-rule" ? "default" : "secondary"}>
          {sourceLabel(task.source)}
        </Badge>
      </div>
      <div>
        <p className="text-muted-foreground">Étape</p>
        <p>{task.sequence_step ?? 1}</p>
      </div>
    </div>
    <div className="mt-2 flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-9">
            <IconDotsVertical className="size-4" />
            <span className="sr-only">Actions de la tache</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => onConvert(task)}>
            <IconFolderUp className="size-4 mr-2" />
            Convertir en projet
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onEdit(task)}>
            <IconPencil className="size-4 mr-2" />
            Modifier
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDelete(task)}>
            <IconTrash className="size-4 mr-2" />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>
))

TaskCard.displayName = "TaskCard"


export function TasksTable({
  data,
  total,
  page,
  pageSize,
  search,
  status,
  channel,
  source,
  sort,
  order,
  onSearchChange,
  onStatusChange,
  onChannelChange,
  onSourceChange,
  onPageChange,
  onSortChange,
  onDataChanged,
}: {
  data: Task[]
  total: number
  page: number
  pageSize: number
  search: string
  status: string
  channel: string
  source: string
  sort: string
  order: string
  onSearchChange: (value: string) => void
  onStatusChange: (value: string) => void
  onChannelChange: (value: string) => void
  onSourceChange: (value: string) => void
  onPageChange: (page: number) => void
  onSortChange: (sort: string, order: string) => void
  onDataChanged?: () => void
}) {
  const { openProjectForm, openConfirm } = useModalSystem()
  const [editingTask, setEditingTask] = React.useState<Task | null>(null)
  const [editOpen, setEditOpen] = React.useState(false)
  const [editSubmitting, setEditSubmitting] = React.useState(false)
  const [editForm, setEditForm] = React.useState({
    title: "",
    status: "To Do" as Task["status"],
    priority: "Medium" as Task["priority"],
    due_date: "",
    assigned_to: "Vous",
    lead_id: "",
    channel: "email" as Task["channel"],
  })
  const maxPage = Math.ceil(total / pageSize) || 1

  function convertTaskToProject(task: Task) {
    openProjectForm({
      mode: "create",
      project: {
        name: `Projet - ${task.title}`,
        description: `Projet cree depuis la tache ${task.id}`,
        status: "Planning",
        lead_id: task.lead_id || "",
        due_date: task.due_date || null,
      },
      onSuccess: () => {
        toast.success("Projet cree depuis la tache.")
        onDataChanged?.()
      },
    })
  }

  function openEdit(task: Task) {
    setEditingTask(task)
    setEditForm({
      title: task.title,
      status: task.status,
      priority: task.priority,
      due_date: toDatetimeLocal(task.due_date),
      assigned_to: task.assigned_to || "Vous",
      lead_id: task.lead_id || "",
      channel: task.channel,
    })
    setEditOpen(true)
  }

  async function submitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingTask) return
    if (!editForm.title.trim()) {
      toast.error("Le titre de la tache est obligatoire.")
      return
    }
    const payload = {
      title: editForm.title.trim(),
      status: editForm.status,
      priority: editForm.priority,
      due_date: toIsoFromDatetimeLocal(editForm.due_date),
      assigned_to: editForm.assigned_to.trim() || "Vous",
      lead_id: editForm.lead_id.trim() || null,
      channel: editForm.channel,
    }
    try {
      setEditSubmitting(true)
      await requestApi(`/api/v1/admin/tasks/${editingTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      toast.success("Tache mise a jour.")
      setEditOpen(false)
      onDataChanged?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise a jour impossible")
    } finally {
      setEditSubmitting(false)
    }
  }

  function deleteTask(task: Task) {
    openConfirm({
      title: "Supprimer cette tache ?",
      description: `La tache '${task.title}' sera supprimee definitivement.`,
      confirmLabel: "Supprimer",
      onConfirm: async () => {
        await requestApi(`/api/v1/admin/tasks/${task.id}`, { method: "DELETE" })
        toast.success("Tache supprimee.")
        onDataChanged?.()
      },
    })
  }

  const handleSort = (column: string) => {
    if (sort === column) {
      onSortChange(column, order === "asc" ? "desc" : "asc")
      return
    }
    onSortChange(column, "asc")
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid flex-1 gap-2 sm:flex sm:items-center">
          <Input
            placeholder="Rechercher une tache..."
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="w-full sm:max-w-xs"
          />
          <Select value={status} onValueChange={onStatusChange}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              {TASK_STATUS_FILTERS.map((statusValue) => (
                <SelectItem key={statusValue} value={statusValue}>
                  {statusValue === "ALL" ? "Tous les statuts" : statusValue}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={channel} onValueChange={onChannelChange}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Canal" />
            </SelectTrigger>
            <SelectContent>
              {TASK_CHANNEL_FILTERS.map((value) => (
                <SelectItem key={value} value={value}>
                  {value === "ALL" ? "Tous canaux" : channelLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={source} onValueChange={onSourceChange}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              {TASK_SOURCE_FILTERS.map((value) => (
                <SelectItem key={value} value={value}>
                  {value === "ALL" ? "Toutes sources" : sourceLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground sm:text-right">{total} tache(s)</p>
      </div>

      <ResponsiveDataView
        mobileCards={
          data.length === 0 ? (
            <div className="rounded-lg border py-8 text-center text-sm text-muted-foreground">
              Aucune tache ne correspond a votre recherche.
            </div>
          ) : (
            data.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onEdit={openEdit}
                onDelete={deleteTask}
                onConvert={convertTaskToProject}
              />
            ))
          )
        }
        desktopTable={
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("title")}>
                    Tache <SortIcon column="title" sort={sort} order={order} />
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("status")}>
                    Statut <SortIcon column="status" sort={sort} order={order} />
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("priority")}>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1">
                            Priorite
                            <SortIcon column="priority" sort={sort} order={order} />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>Niveau d&apos;importance de la tâche</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("due_date")}>
                    Echeance <SortIcon column="due_date" sort={sort} order={order} />
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("assigned_to")}>
                    Assigne a <SortIcon column="assigned_to" sort={sort} order={order} />
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("channel")}>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1">
                            Canal
                            <SortIcon column="channel" sort={sort} order={order} />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>Moyen de communication (Email, LinkedIn, etc.)</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("source")}>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1">
                            Source
                            <SortIcon column="source" sort={sort} order={order} />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>Origine de la tâche (ex: Automatique, Manuel)</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("sequence_step")}>
                    Etape <SortIcon column="sequence_step" sort={sort} order={order} />
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onEdit={openEdit}
                    onDelete={deleteTask}
                    onConvert={convertTaskToProject}
                  />
                ))}
                {data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                      Aucune tache ne correspond a votre recherche.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        }
      />

      <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-end sm:space-x-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full sm:w-auto"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          Precedent
        </Button>
        <div className="text-center text-sm text-muted-foreground sm:flex-1">
          Page {page} sur {maxPage}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full sm:w-auto"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= maxPage}
        >
          Suivant
        </Button>
      </div>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent className="sm:max-w-lg">
          <form onSubmit={submitEdit}>
            <SheetHeader>
              <SheetTitle>Modifier la tache</SheetTitle>
              <SheetDescription>Mettez a jour les details de la tache.</SheetDescription>
            </SheetHeader>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="task-title">Titre</Label>
                <Input
                  id="task-title"
                  value={editForm.title}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, title: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="task-status">Statut</Label>
                  <Select
                    value={editForm.status}
                    onValueChange={(value) =>
                      setEditForm((current) => ({
                        ...current,
                        status: value as Task["status"],
                      }))
                    }
                  >
                    <SelectTrigger id="task-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_STATUSES.map((statusValue) => (
                        <SelectItem key={statusValue} value={statusValue}>
                          {statusValue}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="task-priority">Priorite</Label>
                  <Select
                    value={editForm.priority}
                    onValueChange={(value) =>
                      setEditForm((current) => ({
                        ...current,
                        priority: value as Task["priority"],
                      }))
                    }
                  >
                    <SelectTrigger id="task-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_PRIORITIES.map((priorityValue) => (
                        <SelectItem key={priorityValue} value={priorityValue}>
                          {priorityValue}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="task-due-date">Echeance</Label>
                  <Input
                    id="task-due-date"
                    type="datetime-local"
                    value={editForm.due_date}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, due_date: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="task-assigned">Assigne a</Label>
                  <Input
                    id="task-assigned"
                    value={editForm.assigned_to}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, assigned_to: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-lead-id">Lead ID</Label>
                <Input
                  id="task-lead-id"
                  value={editForm.lead_id}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, lead_id: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-channel">Canal</Label>
                <Select
                  value={editForm.channel}
                  onValueChange={(value) =>
                    setEditForm((current) => ({
                      ...current,
                      channel: value as Task["channel"],
                    }))
                  }
                >
                  <SelectTrigger id="task-channel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="call">Appel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <SheetFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={editSubmitting}>
                {editSubmitting ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  )
}
