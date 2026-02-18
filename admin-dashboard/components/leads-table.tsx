"use client"

import * as React from "react"
import Link from "next/link"
import { IconDotsVertical, IconFolderPlus, IconPlus, IconRocket, IconEye, IconTrash, IconPhone, IconCopy } from "@tabler/icons-react"
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { IconInfoCircle } from "@tabler/icons-react"
import { ResponsiveDataView } from "@/components/responsive/responsive-data-view"
import { requestApi, fetchApi } from "@/lib/api"
import useSWR from "swr"

const fetcher = <T,>(path: string) => fetchApi<T>(path)

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
  personalized_hook?: string
}

const SALON_PARTNER_SCRIPT = "Bonjour {name}, j'ai analysé votre site {company} avec notre IA chez Uprising Studio. {hook} On en discute au salon ?"

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

const LeadRow = React.memo(({
  lead,
  isSelected,
  onSelect,
  onDelete,
  onCreateProject,
  onCreateTask,
}: {
  lead: Lead
  isSelected: boolean
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onCreateProject: (lead: Lead) => void
  onCreateTask: (lead: Lead) => void
}) => {
  return (
    <TableRow data-state={isSelected && "selected"}>
      <TableCell>
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onSelect(lead.id)}
          aria-label="Selectionner le lead"
        />
      </TableCell>
      <TableCell>
        <Link
          href={`/leads/${encodeURIComponent(lead.id)}`}
          className="block font-medium text-primary hover:underline"
        >
          {lead.name}
        </Link>
        <div className="text-xs text-muted-foreground">{lead.email}</div>
      </TableCell>
      <TableCell>{lead.company.name}</TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={statusColors[lead.status] || "bg-gray-500 border-none text-white"}
        >
          {lead.status}
        </Badge>
      </TableCell>
      <TableCell className="max-w-[200px]">
        <p className="truncate text-[11px] italic text-muted-foreground" title={lead.personalized_hook}>
          {lead.personalized_hook || "En attente IA..."}
        </p>
      </TableCell>
      <TableCell>
        <span className={`font-semibold ${scoreClass(lead.score)}`}>{lead.score}</span>
      </TableCell>
      <TableCell>{lead.segment}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          {lead.phone && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8" asChild>
                  <a href={`tel:${lead.phone}`}>
                    <IconPhone className="size-4 text-green-600" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Appeler {lead.phone}</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => {
                  const text = SALON_PARTNER_SCRIPT
                    .replace("{name}", lead.name.split(' ')[0])
                    .replace("{company}", lead.company.name)
                    .replace("{hook}", lead.personalized_hook || "")
                  void navigator.clipboard.writeText(text)
                  toast.success("Script copié dans le presse-papier !")
                }}
              >
                <IconCopy className="size-4 text-blue-600" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copier le script &quot;Salon&quot;</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <IconDotsVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <Link
                  href={`/leads/${encodeURIComponent(lead.id)}`}
                  className="flex cursor-pointer items-center"
                >
                  <IconEye className="size-4 mr-2" />
                  Voir details
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onCreateProject(lead)}>
                <IconFolderPlus className="size-4 mr-2" />
                Creer un projet
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCreateTask(lead)}>
                <IconPlus className="size-4 mr-2" />
                Creer une tache
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(lead.id)}
                className="text-red-600 focus:text-red-600"
              >
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
        </div>
      </TableCell>
    </TableRow>
  )
})
LeadRow.displayName = "LeadRow"

const LeadCard = React.memo(({
  lead,
  isSelected,
  onSelect,
  onDelete,
  onCreateProject,
  onCreateTask,
}: {
  lead: Lead
  isSelected: boolean
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onCreateProject: (lead: Lead) => void
  onCreateTask: (lead: Lead) => void
}) => {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onSelect(lead.id)}
          aria-label="Selectionner le lead"
        />
        <div className="min-w-0 flex-1">
          <Link
            href={`/leads/${encodeURIComponent(lead.id)}`}
            className="block truncate font-medium text-primary hover:underline"
          >
            {lead.name}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{lead.email}</p>
          <p className="truncate text-xs text-muted-foreground">{lead.company.name}</p>
        </div>
        <Badge
          variant="outline"
          className={statusColors[lead.status] || "bg-gray-500 border-none text-white"}
        >
          {lead.status}
        </Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Score</p>
          <p className={`font-semibold ${scoreClass(lead.score)}`}>{lead.score}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Segment</p>
          <p className="truncate">{lead.segment}</p>
        </div>
      </div>
      {lead.personalized_hook && (
        <div className="mt-2 rounded bg-muted/30 p-2 text-[10px] italic text-muted-foreground border-l-2 border-primary/20">
          &quot;{lead.personalized_hook}&quot;
        </div>
      )}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex gap-1">
          {lead.phone && (
            <Button variant="outline" size="sm" className="h-8 px-2" asChild>
              <a href={`tel:${lead.phone}`}>
                <IconPhone className="size-3.5 mr-1 text-green-600" />
                Appeler
              </a>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2"
            onClick={() => {
              const text = SALON_PARTNER_SCRIPT
                .replace("{name}", lead.name.split(' ')[0])
                .replace("{company}", lead.company.name)
                .replace("{hook}", lead.personalized_hook || "")
              void navigator.clipboard.writeText(text)
              toast.success("Script copié !")
            }}
          >
            <IconCopy className="size-3.5 mr-1 text-blue-600" />
            Script
          </Button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-9">
              <IconDotsVertical className="size-4" />
              <span className="sr-only">Actions du lead</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem asChild>
              <Link
                href={`/leads/${encodeURIComponent(lead.id)}`}
                className="flex cursor-pointer items-center"
              >
                <IconEye className="size-4 mr-2" />
                Voir details
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onCreateProject(lead)}>
              <IconFolderPlus className="size-4 mr-2" />
              Creer un projet
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCreateTask(lead)}>
              <IconPlus className="size-4 mr-2" />
              Creer une tache
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(lead.id)}
              className="text-red-600 focus:text-red-600"
            >
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
      </div>
    </div>
  )
})
LeadCard.displayName = "LeadCard"


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

  const [enrollCampaignId, setEnrollCampaignId] = React.useState("")
  const [isEnrolling, setIsEnrolling] = React.useState(false)
  const { data: campaignsData } = useSWR<{ items: { id: string; name: string; status: string }[] }>("/api/v1/admin/campaigns?limit=100", fetcher)
  const activeCampaigns = React.useMemo(() => (campaignsData?.items || []).filter(c => c.status === "active"), [campaignsData])

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

  const executeBulkEnroll = async () => {
    if (!enrollCampaignId || selectedLeads.size === 0) return
    setIsEnrolling(true)
    try {
      const result = await requestApi<{ created: number; skipped: number }>(`/api/v1/admin/campaigns/${enrollCampaignId}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: Array.from(selectedLeads) })
      })
      toast.success(`${result.created} leads ajoutés à la campagne, ${result.skipped} déjà présents.`)
      setSelectedLeads(new Set())
      setEnrollCampaignId("")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de l'ajout")
    } finally {
      setIsEnrolling(false)
    }
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
    <TooltipProvider>
      <div className="space-y-4">
        {selectedLeads.size > 0 && (
          <div className="bg-muted/50 rounded-md border border-blue-200 p-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <span className="ml-2 text-sm font-medium">{selectedLeads.size} selectionne(s)</span>
                <div className="flex items-center gap-2 ml-4">
                  <Select value={enrollCampaignId} onValueChange={setEnrollCampaignId} disabled={activeCampaigns.length === 0}>
                    <SelectTrigger className="h-8 w-[200px]">
                      <SelectValue placeholder={activeCampaigns.length === 0 ? "Aucune campagne active" : "Choisir campagne"} />
                    </SelectTrigger>
                    <SelectContent>
                      {activeCampaigns.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={executeBulkEnroll} disabled={!enrollCampaignId || isEnrolling || activeCampaigns.length === 0}>
                    {isEnrolling ? "Ajout..." : "Lancer automation"}
                  </Button>
                </div>
              </div>
              <Button
                size="sm"
                variant="destructive"
                className="w-full sm:w-auto"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <IconTrash className="size-4 mr-2" />
                Supprimer
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid flex-1 gap-2 sm:flex sm:items-center">
            <Input
              placeholder="Rechercher..."
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              className="w-full sm:max-w-xs"
            />
            <Select
              value={status}
              onValueChange={(val) => {
                onStatusChange(val)
                toast.info(`Filtre applique: ${val === "ALL" ? "Tous" : val}`)
              }}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les statuts</SelectItem>
                <SelectItem value="NEW">À contacter (Nouveau)</SelectItem>
                <SelectItem value="SCORED">Qualifié (Score &gt; 40)</SelectItem>
                <SelectItem value="CONTACTED">En cours</SelectItem>
                <SelectItem value="INTERESTED">RDV pris / Intéressé</SelectItem>
                <SelectItem value="CONVERTED">Signé (Won)</SelectItem>
                <SelectItem value="LOST">Pas intéressé / Perdu</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground sm:text-right">{total} lead(s)</p>
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

        <ResponsiveDataView
          mobileCards={
            data.length === 0 ? (
              <div className="rounded-lg border py-8 text-center text-sm text-muted-foreground">
                Aucun lead ne correspond a votre recherche.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span className="text-sm font-medium">Selection</span>
                  <Checkbox
                    checked={data.length > 0 && selectedLeads.size === data.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Tout selectionner"
                  />
                </div>
                {data.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    isSelected={selectedLeads.has(lead.id)}
                    onSelect={toggleSelectRow}
                    onDelete={confirmDelete}
                    onCreateProject={createProjectFromLead}
                    onCreateTask={createTaskFromLead}
                  />
                ))}
              </>
            )
          }
          desktopTable={
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
                    <TableHead className="w-[200px]">Accroche IA</TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort("total_score")}
                    >
                      <div className="flex items-center gap-1">
                        Score
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <IconInfoCircle className="size-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-[200px]">
                              Le score de qualite (0-100) calcule par l&apos;IA en fonction de l&apos;interet et du profil du lead.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                        <SortIcon column="total_score" sort={sort} order={order} />
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center gap-1">
                        Segment
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <IconInfoCircle className="size-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-[200px]">
                              Groupe de leads ayant des caracteristiques similaires (secteur, taille, etc.).
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((lead) => (
                    <LeadRow
                      key={lead.id}
                      lead={lead}
                      isSelected={selectedLeads.has(lead.id)}
                      onSelect={toggleSelectRow}
                      onDelete={confirmDelete}
                      onCreateProject={createProjectFromLead}
                      onCreateTask={createTaskFromLead}
                    />
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
    </TooltipProvider>
  )
}
