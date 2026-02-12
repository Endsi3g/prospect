"use client"

import * as React from "react"
import { IconDotsVertical, IconFolderUp, IconPencil, IconTrash } from "@tabler/icons-react"
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
}

const TASK_STATUSES: Task["status"][] = ["To Do", "In Progress", "Done"]
const TASK_PRIORITIES: Task["priority"][] = ["Low", "Medium", "High", "Critical"]
const TASK_STATUS_FILTERS: string[] = ["ALL", ...TASK_STATUSES]

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

export function TasksTable({
  data,
  total,
  page,
  pageSize,
  search,
  status,
  sort,
  order,
  onSearchChange,
  onStatusChange,
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
  sort: string
  order: string
  onSearchChange: (value: string) => void
  onStatusChange: (value: string) => void
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
        <div className="flex flex-1 items-center gap-2">
          <Input
            placeholder="Rechercher une tache..."
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="sm:max-w-xs"
          />
          <Select value={status} onValueChange={onStatusChange}>
            <SelectTrigger className="w-[180px]">
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
        </div>
        <p className="text-sm text-muted-foreground">{total} tache(s)</p>
      </div>

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
                Priorite <SortIcon column="priority" sort={sort} order={order} />
              </TableHead>
              <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("due_date")}>
                Echeance <SortIcon column="due_date" sort={sort} order={order} />
              </TableHead>
              <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("assigned_to")}>
                Assigne a <SortIcon column="assigned_to" sort={sort} order={order} />
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((task) => (
              <TableRow key={task.id}>
                <TableCell>
                  <div className="font-medium">{task.title}</div>
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
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <IconDotsVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem onClick={() => convertTaskToProject(task)}>
                        <IconFolderUp className="size-4" />
                        Convertir en projet
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => openEdit(task)}>
                        <IconPencil className="size-4" />
                        Modifier
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => deleteTask(task)}>
                        <IconTrash className="size-4" />
                        Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Aucune tache ne correspond a votre recherche.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end space-x-2 py-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          Precedent
        </Button>
        <div className="flex-1 text-center text-sm text-muted-foreground">
          Page {page} sur {maxPage}
        </div>
        <Button
          variant="outline"
          size="sm"
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
