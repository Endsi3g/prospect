"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
    IconCircleCheck,
    IconAlertTriangle,
    IconClock,
    IconLoader2,
} from "@tabler/icons-react"
import { fetchApi } from "@/lib/api"

type RunListItem = {
    id: string
    prompt: string
    status: string
    actor: string
    summary?: string | null
    action_count: number
    created_at?: string | null
    finished_at?: string | null
}

type RunsResponse = {
    items: RunListItem[]
    total: number
}

const RUN_STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ElementType }> = {
    pending: { label: "En attente", variant: "outline", icon: IconClock },
    running: { label: "En cours", variant: "secondary", icon: IconLoader2 },
    completed: { label: "Terminé", variant: "default", icon: IconCircleCheck },
    completed_with_errors: { label: "Partiel", variant: "outline", icon: IconAlertTriangle },
    failed: { label: "Échoué", variant: "destructive", icon: IconAlertTriangle },
}

function formatRelative(iso: string | null | undefined): string {
    if (!iso) return "-"
    try {
        const d = new Date(iso)
        const now = new Date()
        const diff = now.getTime() - d.getTime()
        const mins = Math.floor(diff / 60000)
        if (mins < 1) return "à l'instant"
        if (mins < 60) return `il y a ${mins} min`
        const hours = Math.floor(mins / 60)
        if (hours < 24) return `il y a ${hours}h`
        const days = Math.floor(hours / 24)
        return `il y a ${days}j`
    } catch {
        return iso
    }
}

export function AssistantRunResult({
    runs,
    isLoading,
    onSelectRun,
}: {
    runs?: RunsResponse | null
    isLoading: boolean
    onSelectRun?: (runId: string) => void
}) {
    if (isLoading) {
        return (
            <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
            </div>
        )
    }

    if (!runs || runs.items.length === 0) {
        return (
            <div className="rounded-lg border border-dashed p-6 text-center">
                <p className="text-sm text-muted-foreground">Aucun run précédent.</p>
                <p className="text-xs text-muted-foreground mt-1">
                    Lancez votre première commande IA ci-dessus.
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-2">
            {runs.items.map((run) => {
                const cfg = RUN_STATUS_CONFIG[run.status] || RUN_STATUS_CONFIG.pending
                const StatusIcon = cfg.icon
                return (
                    <button
                        key={run.id}
                        onClick={() => onSelectRun?.(run.id)}
                        className="w-full text-left rounded-lg border px-4 py-3 hover:bg-accent transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <StatusIcon
                                className={`size-4 shrink-0 ${run.status === "running" ? "animate-spin" : ""} text-muted-foreground`}
                            />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{run.prompt}</p>
                                {run.summary ? (
                                    <p className="text-xs text-muted-foreground truncate mt-0.5">{run.summary}</p>
                                ) : null}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <Badge variant={cfg.variant}>{cfg.label}</Badge>
                                <span className="text-xs text-muted-foreground">
                                    {run.action_count} action{run.action_count !== 1 ? "s" : ""}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {formatRelative(run.created_at)}
                                </span>
                            </div>
                        </div>
                    </button>
                )
            })}
        </div>
    )
}
