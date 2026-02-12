"use client"

import * as React from "react"
import Link from "next/link"
import { IconDotsVertical, IconFolderPlus, IconPlus, IconRocket, IconEye, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"
import { Checkbox } from "@/components/ui/checkbox"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

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

type TriStateFilter = "ANY" | "YES" | "NO"

const statusColors: Record<string, string> = {
  NEW: "bg-blue-600 hover:bg-blue-700 border-none text-white",
  CONTACTED: "bg-yellow-600 hover:bg-yellow-700 border-none text-white",
  INTERESTED: "bg-purple-600 hover:bg-purple-700 border-none text-white",
  CONVERTED: "bg-green-600 hover:bg-green-700 border-none text-white",
  LOST: "bg-red-600 hover:bg-red-700 border-none text-white",
  SCORED: "bg-cyan-600 hover:bg-cyan-700 border-none text-white"
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
  segment,
  tier,
  heatStatus,
  company,
  industry,
  location,
  tag,
  minScore,
  maxScore,
  createdFrom,
  createdTo,
  hasEmail,
  hasPhone,
  hasLinkedin,
  sort,
  order,
  onSearchChange,
  onStatusChange,
  onSegmentChange,
  onTierChange,
  onHeatStatusChange,
  onCompanyChange,
  onIndustryChange,
  onLocationChange,
  onTagChange,
  onMinScoreChange,
  onMaxScoreChange,
  onCreatedFromChange,
  onCreatedToChange,
  onHasEmailChange,
  onHasPhoneChange,
  onHasLinkedinChange,
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
  segment: string
  tier: string
  heatStatus: string
  company: string
  industry: string
  location: string
  tag: string
  minScore: string
  maxScore: string
  createdFrom: string
  createdTo: string
  hasEmail: TriStateFilter
  hasPhone: TriStateFilter
  hasLinkedin: TriStateFilter
  sort: string
  order: string
  onSearchChange: (value: string) => void
  onStatusChange: (value: string) => void
  onSegmentChange: (value: string) => void
  onTierChange: (value: string) => void
  onHeatStatusChange: (value: string) => void
  onCompanyChange: (value: string) => void
  onIndustryChange: (value: string) => void
  onLocationChange: (value: string) => void
  onTagChange: (value: string) => void
  onMinScoreChange: (value: string) => void
  onMaxScoreChange: (value: string) => void
  onCreatedFromChange: (value: string) => void
  onCreatedToChange: (value: string) => void
  onHasEmailChange: (value: TriStateFilter) => void
  onHasPhoneChange: (value: TriStateFilter) => void
  onHasLinkedinChange: (value: TriStateFilter) => void
  onPageChange: (page: number) => void
  onSortChange: (sort: string, order: string) => void
  onDataChanged?: () => void
}) {
  const { openProjectForm } = useModalSystem()
  const maxPage = Math.ceil(total / pageSize) || 1

  const [selectedLeads, setSelectedLeads] = React.useState<Set<string>>(new Set())
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [leadToDelete, setLeadToDelete] = React.useState<string | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)

  // Reset selection on page change or search change
  React.useEffect(() => {
    setSelectedLeads(new Set())
  }, [page, search, status, segment, tier, heatStatus, company, industry, location, tag, minScore, maxScore, createdFrom, createdTo, hasEmail, hasPhone, hasLinkedin])

  const toggleSelectAll = () => {
    if (selectedLeads.size === data.length) {
      setSelectedLeads(new Set())
    } else {
      setSelectedLeads(new Set(data.map(l => l.id)))
    }
  }

  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedLeads)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedLeads(next)
  }

  const confirmDelete = (id: string) => {
    setLeadToDelete(id)
    setDeleteDialogOpen(true)
  }

  const executeDelete = async () => {
    if (!leadToDelete && selectedLeads.size === 0) return

    setIsDeleting(true)
    try {
      if (leadToDelete) {
        // Single delete
        await requestApi(`/api/v1/admin/leads/${leadToDelete}`, { method: "DELETE" })
        toast.success("Lead supprime avec succes")
      } else {
        // Bulk delete
        await requestApi("/api/v1/admin/leads/bulk-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: Array.from(selectedLeads) })
        })
        toast.success(`${selectedLeads.size} leads supprimes`)
        setSelectedLeads(new Set())
      }
      onDataChanged?.()
    } catch {
      toast.error("Erreur lors de la suppression")
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
      setLeadToDelete(null)
    }
  }

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
      {selectedLeads.size > 0 && (
        <div className="bg-muted/50 p-2 rounded-md flex items-center justify-between border border-blue-200">
          <span className="text-sm font-medium ml-2">{selectedLeads.size} selectionne(s)</span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <IconTrash className="size-4 mr-2" />
              Supprimer la selection
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-1">
          <Input
            placeholder="Rechercher..."
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="sm:max-w-xs"
          />
          <Select
            value={status}
              onValueChange={(val) => {
                onStatusChange(val)
                toast.info(`Filtre applique: ${val === "ALL" ? "Tous" : val}`)
              }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les statuts</SelectItem>
              <SelectItem value="NEW">New</SelectItem>
              <SelectItem value="SCORED">Scored</SelectItem>
              <SelectItem value="CONTACTED">Contacted</SelectItem>
              <SelectItem value="INTERESTED">Interested</SelectItem>
              <SelectItem value="CONVERTED">Converted</SelectItem>
              <SelectItem value="LOST">Lost</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground">{total} lead(s)</p>
      </div>

      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">Filtres avances</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Input
            placeholder="Segment"
            value={segment}
            onChange={(event) => onSegmentChange(event.target.value)}
          />
          <Select value={tier} onValueChange={onTierChange}>
            <SelectTrigger>
              <SelectValue placeholder="Tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les tiers</SelectItem>
              <SelectItem value="Tier A">Tier A</SelectItem>
              <SelectItem value="Tier B">Tier B</SelectItem>
              <SelectItem value="Tier C">Tier C</SelectItem>
              <SelectItem value="Tier D">Tier D</SelectItem>
            </SelectContent>
          </Select>
          <Select value={heatStatus} onValueChange={onHeatStatusChange}>
            <SelectTrigger>
              <SelectValue placeholder="Heat status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les heat status</SelectItem>
              <SelectItem value="Hot">Hot</SelectItem>
              <SelectItem value="Warm">Warm</SelectItem>
              <SelectItem value="Cold">Cold</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Entreprise"
            value={company}
            onChange={(event) => onCompanyChange(event.target.value)}
          />
          <Input
            placeholder="Industrie"
            value={industry}
            onChange={(event) => onIndustryChange(event.target.value)}
          />
          <Input
            placeholder="Localisation"
            value={location}
            onChange={(event) => onLocationChange(event.target.value)}
          />
          <Input
            placeholder="Tag"
            value={tag}
            onChange={(event) => onTagChange(event.target.value)}
          />
          <Input
            type="number"
            min={0}
            max={100}
            placeholder="Score min"
            value={minScore}
            onChange={(event) => onMinScoreChange(event.target.value)}
          />
          <Input
            type="number"
            min={0}
            max={100}
            placeholder="Score max"
            value={maxScore}
            onChange={(event) => onMaxScoreChange(event.target.value)}
          />
          <Input
            type="date"
            value={createdFrom}
            onChange={(event) => onCreatedFromChange(event.target.value)}
          />
          <Input
            type="date"
            value={createdTo}
            onChange={(event) => onCreatedToChange(event.target.value)}
          />
          <Select value={hasEmail} onValueChange={(value) => onHasEmailChange(value as TriStateFilter)}>
            <SelectTrigger>
              <SelectValue placeholder="Email" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ANY">Email: tous</SelectItem>
              <SelectItem value="YES">Email: oui</SelectItem>
              <SelectItem value="NO">Email: non</SelectItem>
            </SelectContent>
          </Select>
          <Select value={hasPhone} onValueChange={(value) => onHasPhoneChange(value as TriStateFilter)}>
            <SelectTrigger>
              <SelectValue placeholder="Telephone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ANY">Telephone: tous</SelectItem>
              <SelectItem value="YES">Telephone: oui</SelectItem>
              <SelectItem value="NO">Telephone: non</SelectItem>
            </SelectContent>
          </Select>
          <Select value={hasLinkedin} onValueChange={(value) => onHasLinkedinChange(value as TriStateFilter)}>
            <SelectTrigger>
              <SelectValue placeholder="LinkedIn" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ANY">LinkedIn: tous</SelectItem>
              <SelectItem value="YES">LinkedIn: oui</SelectItem>
              <SelectItem value="NO">LinkedIn: non</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </details>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">
                <Checkbox
                  checked={data.length > 0 && selectedLeads.size === data.length}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Tout selectionner"
                />
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort("first_name")}
              >
                Lead <SortIcon column="first_name" sort={sort} order={order} />
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
              <TableRow key={lead.id} data-state={selectedLeads.has(lead.id) && "selected"}>
                <TableCell>
                  <Checkbox
                    checked={selectedLeads.has(lead.id)}
                    onCheckedChange={() => toggleSelectRow(lead.id)}
                    aria-label="Selectionner le lead"
                  />
                </TableCell>
                <TableCell>
                  <Link href={`/leads/${encodeURIComponent(lead.id)}`} className="block hover:underline font-medium text-primary">
                    {lead.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{lead.email}</div>
                </TableCell>
                <TableCell>{lead.company.name}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={statusColors[lead.status] || "bg-gray-500 text-white border-none"}
                  >
                    {lead.status}
                  </Badge>
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
                      <DropdownMenuItem asChild>
                        <Link href={`/leads/${encodeURIComponent(lead.id)}`} className="flex items-center cursor-pointer">
                          <IconEye className="size-4 mr-2" />
                          Voir details
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => createProjectFromLead(lead)}>
                        <IconFolderPlus className="size-4 mr-2" />
                        Creer un projet
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => createTaskFromLead(lead)}>
                        <IconPlus className="size-4 mr-2" />
                        Creer une tache
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => confirmDelete(lead.id)} className="text-red-600 focus:text-red-600">
                        <IconTrash className="size-4 mr-2" />
                        Supprimer
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => toast.info("Flow audit disponible prochainement")}>
                        <IconRocket className="size-4 mr-2" />
                        Generer un audit
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
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
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Etes-vous absolument sur ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irreversible.
              {leadToDelete ? " Ce lead sera definitivement supprime." : ` ${selectedLeads.size} leads seront definitivement supprimes.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void executeDelete()
              }}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {isDeleting ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
