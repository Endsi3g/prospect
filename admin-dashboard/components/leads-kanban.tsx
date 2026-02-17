"use client"

import * as React from "react"
import Link from "next/link"
import { IconDotsVertical, IconEye, IconPlus, IconTargetArrow, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { requestApi } from "@/lib/api"

type Lead = {
  id: string
  name: string
  company: { name: string }
  email: string
  status: string
  score: number
  segment: string
}

interface LeadsKanbanProps {
  data: Lead[]
  onDataChanged?: () => void
}

const KANBAN_STATUSES = ["NEW", "SCORED", "CONTACTED", "INTERESTED", "CONVERTED"]

const statusLabels: Record<string, string> = {
  NEW: "Nouveaux",
  SCORED: "Qualifiés",
  CONTACTED: "Contactés",
  INTERESTED: "Engagés",
  CONVERTED: "Gagnés",
}

export function LeadsKanban({ data, onDataChanged }: LeadsKanbanProps) {
  const [draggedLeadId, setDraggedLeadId] = React.useState<string | null>(null)

  const columns = React.useMemo(() => {
    const cols: Record<string, Lead[]> = {}
    KANBAN_STATUSES.forEach(s => cols[s] = [])
    data.forEach(lead => {
      if (cols[lead.status]) {
        cols[lead.status].push(lead)
      } else if (KANBAN_STATUSES.includes("NEW")) {
        // Fallback for statuses not in our simplified kanban list
        // (Though in reality we might want a 'Other' column)
      }
    })
    return cols
  }, [data])

  async function handleMove(leadId: string, toStatus: string) {
    try {
      await requestApi(`/api/v1/admin/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: toStatus }),
      })
      toast.success(`Statut mis à jour: ${statusLabels[toStatus]}`)
      onDataChanged?.()
    } catch (error) {
      toast.error("Erreur lors du déplacement.")
    }
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 h-[calc(100vh-300px)] min-h-[500px]">
      {KANBAN_STATUSES.map((status) => (
        <div 
          key={status} 
          className="flex flex-col w-72 shrink-0 rounded-xl bg-muted/30 border border-border/50"
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (draggedLeadId) {
              handleMove(draggedLeadId, status)
              setDraggedLeadId(null)
            }
          }}
        >
          <div className="p-3 flex items-center justify-between">
            <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">
              {statusLabels[status]}
            </h3>
            <Badge variant="secondary" className="h-5 min-w-[20px] justify-center px-1">
              {columns[status]?.length || 0}
            </Badge>
          </div>

          <div className="flex-1 overflow-y-auto px-2 space-y-2 pb-2">
            {columns[status]?.map((lead) => (
              <div
                key={lead.id}
                draggable
                onDragStart={() => setDraggedLeadId(lead.id)}
                className="group relative rounded-lg border bg-card p-3 shadow-xs hover:shadow-sm hover:border-primary/30 transition-all cursor-grab active:cursor-grabbing"
              >
                <div className="flex justify-between items-start gap-2 mb-1">
                  <Link 
                    href={`/leads/${encodeURIComponent(lead.id)}`}
                    className="text-sm font-bold leading-tight hover:underline truncate pr-4"
                  >
                    {lead.name}
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-6 absolute right-1 top-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <IconDotsVertical className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/leads/${encodeURIComponent(lead.id)}`}>
                          <IconEye className="size-4 mr-2" /> Voir
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => toast.info("Action bientôt disponible")}>
                        <IconTargetArrow className="size-4 mr-2" /> Convertir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                
                <p className="text-[11px] text-muted-foreground truncate mb-2">
                  {lead.company.name}
                </p>

                <div className="flex items-center justify-between mt-auto">
                  <div className="flex items-center gap-1.5">
                    <div className={`size-2 rounded-full ${
                      lead.score >= 80 ? "bg-green-500" : lead.score >= 50 ? "bg-orange-500" : "bg-slate-400"
                    }`} />
                    <span className="text-[10px] font-bold text-muted-foreground">
                      {lead.score}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground italic truncate max-w-[100px]">
                    {lead.segment}
                  </span>
                </div>
              </div>
            ))}
            
            {columns[status]?.length === 0 && (
              <div className="py-10 text-center border border-dashed rounded-lg border-muted-foreground/20">
                <p className="text-[10px] text-muted-foreground italic">Vide</p>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
