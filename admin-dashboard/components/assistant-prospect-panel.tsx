"use client"

import * as React from "react"
import useSWR, { mutate } from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
    IconPlayerPlay,
    IconLoader2,
    IconSparkles,
    IconArrowLeft,
} from "@tabler/icons-react"
import { fetchApi, requestApi } from "@/lib/api"
import { AssistantActionPlan } from "./assistant-action-plan"
import { AssistantRunResult } from "./assistant-run-result"

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

type RunDetail = {
    id: string
    prompt: string
    status: string
    actor: string
    summary?: string | null
    config: Record<string, unknown>
    created_at?: string | null
    finished_at?: string | null
    actions: ActionItem[]
}

type RunsResponse = {
    items: Array<{
        id: string
        prompt: string
        status: string
        actor: string
        summary?: string | null
        action_count: number
        created_at?: string | null
        finished_at?: string | null
    }>
    total: number
}

const fetcher = <T,>(path: string) => fetchApi<T>(path)

export function AssistantProspectPanel() {
    const [prompt, setPrompt] = React.useState("")
    const [maxLeads, setMaxLeads] = React.useState("20")
    const [source, setSource] = React.useState("apify")
    const [isExecuting, setIsExecuting] = React.useState(false)
    const [isConfirming, setIsConfirming] = React.useState(false)
    const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null)
    const [currentRun, setCurrentRun] = React.useState<RunDetail | null>(null)

    const { data: runsData, isLoading: runsLoading } = useSWR<RunsResponse>(
        "/api/v1/admin/assistant/prospect/runs?limit=10",
        fetcher,
        {
            refreshInterval:
                currentRun?.status === "running" ||
                    runsData?.items?.some((r) => r.status === "running")
                    ? 3000
                    : 0,
        },
    )

    const { data: runDetail, isLoading: detailLoading } = useSWR<RunDetail>(
        selectedRunId ? `/api/v1/admin/assistant/prospect/runs/${selectedRunId}` : null,
        fetcher,
        { refreshInterval: runDetail?.status === "running" ? 3000 : 0 },
    )

    // When a run finishes executing, show it
    React.useEffect(() => {
        if (currentRun) {
            setSelectedRunId(currentRun.id)
        }
    }, [currentRun])

    const displayedRun = selectedRunId && runDetail ? runDetail : currentRun

    async function handleExecute() {
        if (!prompt.trim()) return
        setIsExecuting(true)
        setCurrentRun(null)
        setSelectedRunId(null)
        try {
            const result = await requestApi<RunDetail>(
                "/api/v1/admin/assistant/prospect/execute",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        prompt: prompt.trim(),
                        max_leads: parseInt(maxLeads, 10),
                        source,
                        auto_confirm: true,
                    }),
                },
            )
            setCurrentRun(result)
            setSelectedRunId(result.id)
            void mutate("/api/v1/admin/assistant/prospect/runs?limit=10")
        } catch (err) {
            console.error("Execute failed:", err)
        } finally {
            setIsExecuting(false)
        }
    }

    async function handleConfirm(actionIds: string[]) {
        if (!displayedRun) return
        setIsConfirming(true)
        try {
            await requestApi("/api/v1/admin/assistant/prospect/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action_ids: actionIds, approve: true }),
            })
            // Refresh run detail
            if (selectedRunId) {
                void mutate(`/api/v1/admin/assistant/prospect/runs/${selectedRunId}`)
            }
        } catch (err) {
            console.error("Confirm failed:", err)
        } finally {
            setIsConfirming(false)
        }
    }

    async function handleReject(actionIds: string[]) {
        if (!displayedRun) return
        setIsConfirming(true)
        try {
            await requestApi("/api/v1/admin/assistant/prospect/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action_ids: actionIds, approve: false }),
            })
            if (selectedRunId) {
                void mutate(`/api/v1/admin/assistant/prospect/runs/${selectedRunId}`)
            }
        } catch (err) {
            console.error("Reject failed:", err)
        } finally {
            setIsConfirming(false)
        }
    }

    return (
        <div className="space-y-4">
            {/* ── Prompt input ──────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <IconSparkles className="size-5 text-primary" />
                        Commande IA
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Input
                        placeholder="Ex: Trouve 20 leads dentistes à Lyon, score-les et lance le nurturing..."
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault()
                                void handleExecute()
                            }
                        }}
                        disabled={isExecuting}
                    />
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">Max leads:</span>
                            <Select value={maxLeads} onValueChange={setMaxLeads} disabled={isExecuting}>
                                <SelectTrigger className="w-20 h-8">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="5">5</SelectItem>
                                    <SelectItem value="10">10</SelectItem>
                                    <SelectItem value="20">20</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                    <SelectItem value="100">100</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">Source:</span>
                            <Select value={source} onValueChange={setSource} disabled={isExecuting}>
                                <SelectTrigger className="w-24 h-8">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="apify">Apify</SelectItem>
                                    <SelectItem value="manual">Manuel</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex-1" />
                        <Button
                            onClick={handleExecute}
                            disabled={isExecuting || !prompt.trim()}
                            className="gap-2"
                        >
                            {isExecuting ? (
                                <IconLoader2 className="size-4 animate-spin" />
                            ) : (
                                <IconPlayerPlay className="size-4" />
                            )}
                            Lancer
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* ── Current / selected run detail ──────────────── */}
            {displayedRun ? (
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                onClick={() => { setSelectedRunId(null); setCurrentRun(null) }}
                            >
                                <IconArrowLeft className="size-4" />
                            </Button>
                            <CardTitle className="flex-1 truncate text-base">
                                {displayedRun.prompt}
                            </CardTitle>
                            <Badge
                                variant={
                                    displayedRun.status === "completed" ? "default"
                                        : displayedRun.status === "failed" ? "destructive"
                                            : "secondary"
                                }
                            >
                                {displayedRun.status}
                            </Badge>
                        </div>
                        {displayedRun.summary ? (
                            <p className="text-sm text-muted-foreground">{displayedRun.summary}</p>
                        ) : null}
                    </CardHeader>
                    <CardContent>
                        {displayedRun.actions.length > 0 ? (
                            <AssistantActionPlan
                                actions={displayedRun.actions}
                                onConfirm={handleConfirm}
                                onReject={handleReject}
                                isConfirming={isConfirming}
                            />
                        ) : (
                            <p className="text-sm text-muted-foreground">Aucune action dans ce run.</p>
                        )}
                    </CardContent>
                </Card>
            ) : null}

            {/* ── Run history ───────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle>Historique des runs</CardTitle>
                </CardHeader>
                <CardContent>
                    <AssistantRunResult
                        runs={runsData}
                        isLoading={runsLoading}
                        onSelectRun={(id) => setSelectedRunId(id)}
                    />
                </CardContent>
            </Card>
        </div>
    )
}
