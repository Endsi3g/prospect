"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    IconCheck,
    IconX,
    IconLoader2,
    IconAlertTriangle,
    IconCircleCheck,
    IconClock,
} from "@tabler/icons-react"

type ActionItem = {
    id: string
    action_type: string
    entity_type?: string | null
    payload: Record<string, unknown>
    requires_confirm: boolean
    status: string
    result: Record<string, unknown>
    created_at?: string | null
    executed_at?: string | null
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ElementType }> = {
    pending: { label: "En attente", variant: "outline", icon: IconClock },
    confirmed: { label: "Confirmé", variant: "secondary", icon: IconCheck },
    executed: { label: "Exécuté", variant: "default", icon: IconCircleCheck },
    rejected: { label: "Rejeté", variant: "destructive", icon: IconX },
    failed: { label: "Échoué", variant: "destructive", icon: IconAlertTriangle },
}

const ACTION_LABELS: Record<string, string> = {
    source_leads: "Sourcing leads",
    create_lead: "Créer lead",
    update_lead: "MAJ lead",
    create_task: "Créer tâche",
    nurture: "Nurturing",
    rescore: "Re-scoring",
    delete_lead: "Supprimer lead",
}

export function AssistantActionPlan({
    actions,
    onConfirm,
    onReject,
    isConfirming = false,
}: {
    actions: ActionItem[]
    onConfirm?: (ids: string[]) => void
    onReject?: (ids: string[]) => void
    isConfirming?: boolean
}) {
    const pendingActions = actions.filter(a => a.requires_confirm && a.status === "pending")

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-muted-foreground">
                    {actions.length} action{actions.length > 1 ? "s" : ""}
                </p>
                {pendingActions.length > 0 && onConfirm && onReject ? (
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onReject(pendingActions.map(a => a.id))}
                            disabled={isConfirming}
                        >
                            <IconX className="mr-1 size-3.5" />
                            Tout rejeter
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => onConfirm(pendingActions.map(a => a.id))}
                            disabled={isConfirming}
                        >
                            {isConfirming ? (
                                <IconLoader2 className="mr-1 size-3.5 animate-spin" />
                            ) : (
                                <IconCheck className="mr-1 size-3.5" />
                            )}
                            Tout approuver ({pendingActions.length})
                        </Button>
                    </div>
                ) : null}
            </div>

            <div className="divide-y rounded-lg border">
                {actions.map((action) => {
                    const cfg = STATUS_CONFIG[action.status] || STATUS_CONFIG.pending
                    const StatusIcon = cfg.icon
                    return (
                        <div key={action.id} className="flex items-center gap-3 px-4 py-3">
                            <StatusIcon className="size-4 shrink-0 text-muted-foreground" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                    {ACTION_LABELS[action.action_type] || action.action_type}
                                    {action.entity_type ? (
                                        <span className="ml-1 text-muted-foreground">({action.entity_type})</span>
                                    ) : null}
                                </p>
                                {action.result && Object.keys(action.result).length > 0 ? (
                                    <p className="text-xs text-muted-foreground truncate">
                                        {JSON.stringify(action.result)}
                                    </p>
                                ) : null}
                            </div>
                            <Badge variant={cfg.variant} className="shrink-0">
                                {cfg.label}
                            </Badge>
                            {action.requires_confirm && action.status === "pending" && onConfirm && onReject ? (
                                <div className="flex gap-1 shrink-0">
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="size-7"
                                        onClick={() => onConfirm([action.id])}
                                        disabled={isConfirming}
                                        title="Approuver"
                                    >
                                        <IconCheck className="size-3.5" />
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="size-7"
                                        onClick={() => onReject([action.id])}
                                        disabled={isConfirming}
                                        title="Rejeter"
                                    >
                                        <IconX className="size-3.5" />
                                    </Button>
                                </div>
                            ) : null}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
