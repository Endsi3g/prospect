"use client"

import * as React from "react"
import Link from "next/link"
import { IconDotsVertical, IconFolderPlus, IconPlus, IconRocket } from "@tabler/icons-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requestApi } from "@/lib/api"

export type Lead = {
  id: string
  name: string
  company: {
    name: string
  }
  email: string
  phone: string
  status: string
  score: number
  segment: string
}

function scoreClass(score: number): string {
  if (score >= 80) return "text-green-600"
  if (score >= 50) return "text-orange-600"
  return "text-muted-foreground"
}

function SortIcon({ column, sort, order }: { column: string; sort: string; order: string }) {
  if (sort !== column) return null
  return order === "asc" ? <span className="ml-1">^</span> : <span className="ml-1">v</span>
}

export function LeadsTable({
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
  data: Lead[]
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
  const { openProjectForm } = useModalSystem()
  const maxPage = Math.ceil(total / pageSize) || 1

  async function createTaskFromLead(lead: Lead) {
    const payload = {
      title: `Suivi lead - ${lead.name}`,
      status: "To Do",
      priority: "Medium",
      assigned_to: "Vous",
      lead_id: lead.id,
    }
    try {
      await requestApi("/api/v1/admin/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      toast.success("Tache creee depuis le lead.")
      onDataChanged?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Creation de tache impossible")
    }
  }

  function createProjectFromLead(lead: Lead) {
    openProjectForm({
      mode: "create",
      project: {
        name: `Projet - ${lead.company.name}`,
        description: `Projet cree depuis le lead ${lead.name}`,
        status: "Planning",
        lead_id: lead.id,
      },
      onSuccess: () => {
        toast.success("Projet cree depuis le lead.")
        onDataChanged?.()
      },
    })
  }

  const handleSort = (column: string) => {
    if (sort === column) {
      onSortChange(column, order === "asc" ? "desc" : "asc")
    } else {
      onSortChange(column, "asc")
    }
  }



  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-1">
          <Input
            placeholder="Rechercher..."
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="sm:max-w-xs"
          />
          <Select value={status} onValueChange={onStatusChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les statuts</SelectItem>
              <SelectItem value="NEW">New</SelectItem>
              <SelectItem value="CONTACTED">Contacted</SelectItem>
              <SelectItem value="INTERESTED">Interested</SelectItem>
              <SelectItem value="CONVERTED">Converted</SelectItem>
              <SelectItem value="LOST">Lost</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground">{total} lead(s)</p>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort("name")}
              >
                Lead <SortIcon column="name" sort={sort} order={order} />
              </TableHead>
              <TableHead>Entreprise</TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort("status")}
              >
                Statut <SortIcon column="status" sort={sort} order={order} />
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort("total_score")}
              >
                Score <SortIcon column="total_score" sort={sort} order={order} />
              </TableHead>
              <TableHead>Segment</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell>
                  <Link href={`/leads/${lead.id}`} className="block hover:underline">
                    <div className="font-medium">{lead.name}</div>
                  </Link>
                  <div className="text-xs text-muted-foreground">{lead.email}</div>
                </TableCell>
                <TableCell>{lead.company.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{lead.status}</Badge>
                </TableCell>
                <TableCell>
                  <span className={`font-semibold ${scoreClass(lead.score)}`}>{lead.score}</span>
                </TableCell>
                <TableCell>{lead.segment}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <IconDotsVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem onClick={() => createProjectFromLead(lead)}>
                        <IconFolderPlus className="size-4" />
                        Creer un projet
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => createTaskFromLead(lead)}>
                        <IconPlus className="size-4" />
                        Creer une tache
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => toast.info("Flow audit disponible prochainement")}>
                        <IconRocket className="size-4" />
                        Generer un audit
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Aucun lead ne correspond a votre recherche.
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
    </div>
  )
}

