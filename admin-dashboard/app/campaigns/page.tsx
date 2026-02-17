"use client"

import * as React from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { IconTrash } from "@tabler/icons-react"

import { AppShell } from "@/components/layout/app-shell"
import { SyncStatus } from "@/components/sync-status"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { requestApi } from "@/lib/api"

type AnyMap = Record<string, unknown>

type Sequence = {
  id: string
  name: string
  description?: string | null
  status: string
  channels?: string[]
  steps?: AnyMap[]
}

type Campaign = {
  id: string
  name: string
  description?: string | null
  status: string
  sequence_id?: string | null
  channel_strategy?: AnyMap
  enrollment_filter?: AnyMap
}

type CampaignRun = {
  id: string
  status: string
  lead_id?: string | null
  action_type: string
  step_index: number
  trigger_source: string
  error_message?: string | null
}

const DEFAULT_SEQUENCE_STEPS = JSON.stringify(
  [
    {
      channel: "email",
      template_key: "initial_outreach",
      delay_days: 0,
      conditions: {},
    },
    {
      channel: "call",
      template_key: "follow_up_call",
      delay_days: 2,
      conditions: { min_heat_score: 20 },
    },
  ],
  null,
  2,
)

const DEFAULT_CAMPAIGN_FILTER = JSON.stringify(
  {
    statuses: ["NEW", "ENRICHED"],
    min_total_score: 35,
  },
  null,
  2,
)

const DEFAULT_CONTENT_CONTEXT = JSON.stringify(
  {
    company_name: "Acme",
    pain_point: "la conversion des leads inbound",
    hook: "votre croissance recente",
  },
  null,
  2,
)

const DEFAULT_ENRICHMENT_CONTEXT = JSON.stringify(
  {
    source: "manual-ui",
    objective: "prioriser les leads chauds",
  },
  null,
  2,
)

const fetcher = <T,>(path: string) => requestApi<T>(path)

function parseJsonObject(raw: string, label: string): AnyMap | null {
  const clean = raw.trim()
  if (!clean) return {}
  try {
    const parsed = JSON.parse(clean) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      toast.error(`${label} doit etre un objet JSON.`)
      return null
    }
    return parsed as AnyMap
  } catch {
    toast.error(`JSON invalide dans ${label}.`)
    return null
  }
}

function parseJsonArray(raw: string, label: string): AnyMap[] | null {
  const clean = raw.trim()
  if (!clean) return []
  try {
    const parsed = JSON.parse(clean) as unknown
    if (!Array.isArray(parsed)) {
      toast.error(`${label} doit etre un tableau JSON.`)
      return null
    }
    const filtered = parsed.filter((item) => typeof item === "object" && item !== null) as AnyMap[]
    if (filtered.length !== parsed.length) {
      toast.error(`${label}: ${parsed.length - filtered.length} element(s) non objet ignores.`)
    }
    return filtered
  } catch {
    toast.error(`JSON invalide dans ${label}.`)
    return null
  }
}

function parseChannels(raw: string): string[] {
  const channels = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
  return Array.from(new Set(channels))
}

function pretty(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2)
}

export default function CampaignsPage() {
  const [activeTab, setActiveTab] = React.useState("campaigns")
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null)

  const {
    data: campaignsResponse,
    error: campaignsError,
    isLoading: campaignsLoading,
    mutate: mutateCampaigns,
  } = useSWR<{ items: Campaign[] }>("/api/v1/admin/campaigns?limit=100&offset=0", fetcher)

  const {
    data: sequencesResponse,
    error: sequencesError,
    isLoading: sequencesLoading,
    mutate: mutateSequences,
  } = useSWR<{ items: Sequence[] }>("/api/v1/admin/sequences?limit=100&offset=0", fetcher)

  React.useEffect(() => {
    if (!campaignsResponse && !sequencesResponse) return
    setUpdatedAt(new Date())
  }, [campaignsResponse, sequencesResponse])

  const campaigns = React.useMemo(() => campaignsResponse?.items ?? [], [campaignsResponse])
  const sequences = React.useMemo(() => sequencesResponse?.items ?? [], [sequencesResponse])

  const [selectedCampaignId, setSelectedCampaignId] = React.useState("")
  const [editingCampaignId, setEditingCampaignId] = React.useState<string | null>(null)

  const [campaignName, setCampaignName] = React.useState("")
  const [campaignDescription, setCampaignDescription] = React.useState("")
  const [campaignStatus, setCampaignStatus] = React.useState("draft")
  const [campaignSequenceId, setCampaignSequenceId] = React.useState("")
  const [campaignStrategy, setCampaignStrategy] = React.useState("{}")
  const [campaignFilter, setCampaignFilter] = React.useState(DEFAULT_CAMPAIGN_FILTER)

  // Structured form states
  const [useFormForStrategy, setUseFormForStrategy] = React.useState(true)
  const [strategyEmail, setStrategyEmail] = React.useState(true)
  const [strategyEmailDelay, setStrategyEmailDelay] = React.useState("24")
  const [strategyLinkedin, setStrategyLinkedin] = React.useState(false)
  const [strategyLinkedinDelay, setStrategyLinkedinDelay] = React.useState("48")

  const [useFormForFilter, setUseFormForFilter] = React.useState(true)
  const [filterMinScore, setFilterMinScore] = React.useState("35")
  const [filterStatuses, setFilterStatuses] = React.useState<string[]>(["NEW", "ENRICHED"])
  const [campaignBusy, setCampaignBusy] = React.useState(false)
  const [processingCampaignActions, setProcessingCampaignActions] = React.useState<Set<string>>(new Set())

  const [runStatus, setRunStatus] = React.useState("all")
  const runsPath = React.useMemo(() => {
    if (!selectedCampaignId) return null
    const params = new URLSearchParams({ limit: "40", offset: "0" })
    if (runStatus !== "all") params.set("status", runStatus)
    return `/api/v1/admin/campaigns/${selectedCampaignId}/runs?${params.toString()}`
  }, [selectedCampaignId, runStatus])

  const {
    data: runsResponse,
    error: runsError,
    isLoading: runsLoading,
    mutate: mutateRuns,
  } = useSWR<{ items: CampaignRun[] }>(runsPath, fetcher)

  const [selectedSequenceId, setSelectedSequenceId] = React.useState("")
  const [sequenceName, setSequenceName] = React.useState("")
  const [sequenceDescription, setSequenceDescription] = React.useState("")
  const [sequenceStatus, setSequenceStatus] = React.useState("draft")
  const [sequenceChannels, setSequenceChannels] = React.useState("email,call")
  const [sequenceSteps, setSequenceSteps] = React.useState(DEFAULT_SEQUENCE_STEPS)
  const [useFormForSteps, setUseFormForSteps] = React.useState(true)
  const [sequenceStepsList, setSequenceStepsList] = React.useState<AnyMap[]>([
    {
      channel: "email",
      template_key: "initial_outreach",
      delay_days: 0,
      conditions: {},
    },
  ])
  const [simulateContext, setSimulateContext] = React.useState('{"heat_score":42,"company_name":"Acme"}')
  const [simulateResult, setSimulateResult] = React.useState<AnyMap | null>(null)
  const [sequenceBusy, setSequenceBusy] = React.useState(false)

  const [contentLeadId, setContentLeadId] = React.useState("")
  const [contentChannel, setContentChannel] = React.useState("email")
  const [contentStep, setContentStep] = React.useState("1")
  const [contentTemplate, setContentTemplate] = React.useState("")
  const [contentProvider, setContentProvider] = React.useState("deterministic")
  const [contentContext, setContentContext] = React.useState(DEFAULT_CONTENT_CONTEXT)
  const [contentBusy, setContentBusy] = React.useState(false)
  const [contentHistory, setContentHistory] = React.useState<AnyMap[]>([])

  const [enrichmentQuery, setEnrichmentQuery] = React.useState("")
  const [enrichmentLeadId, setEnrichmentLeadId] = React.useState("")
  const [enrichmentProvider, setEnrichmentProvider] = React.useState("mock")
  const [enrichmentContext, setEnrichmentContext] = React.useState(DEFAULT_ENRICHMENT_CONTEXT)
  const [lookupJobId, setLookupJobId] = React.useState("")
  const [enrichmentBusy, setEnrichmentBusy] = React.useState(false)
  const [enrichmentHistory, setEnrichmentHistory] = React.useState<AnyMap[]>([])

  React.useEffect(() => {
    if (campaigns.length === 0) return
    if (!selectedCampaignId || !campaigns.some((item) => item.id === selectedCampaignId)) {
      setSelectedCampaignId(campaigns[0].id)
    }
  }, [campaigns, selectedCampaignId])

  React.useEffect(() => {
    if (sequences.length === 0) return
    if (!selectedSequenceId || !sequences.some((item) => item.id === selectedSequenceId)) {
      setSelectedSequenceId(sequences[0].id)
    }
  }, [sequences, selectedSequenceId])

  function resetCampaignForm() {
    setEditingCampaignId(null)
    setCampaignName("")
    setCampaignDescription("")
    setCampaignStatus("draft")
    setCampaignSequenceId("")
    setCampaignStrategy("{}")
    setCampaignFilter(DEFAULT_CAMPAIGN_FILTER)
    setStrategyEmail(true)
    setStrategyEmailDelay("24")
    setStrategyLinkedin(false)
    setStrategyLinkedinDelay("48")
    setFilterMinScore("35")
    setFilterStatuses(["NEW", "ENRICHED"])
  }

  function startEditingCampaign(campaign: Campaign) {
    setEditingCampaignId(campaign.id)
    setCampaignName(campaign.name)
    setCampaignDescription(campaign.description || "")
    setCampaignStatus(campaign.status)
    setCampaignSequenceId(campaign.sequence_id || "")

    // Strategy
    const strategy = campaign.channel_strategy || {}
    setCampaignStrategy(pretty(strategy))
    if (strategy.email) {
      setStrategyEmail(true)
      setStrategyEmailDelay(String((strategy.email as any).delay || "24"))
    } else {
      setStrategyEmail(false)
    }
    if (strategy.linkedin) {
      setStrategyLinkedin(true)
      setStrategyLinkedinDelay(String((strategy.linkedin as any).delay || "48"))
    } else {
      setStrategyLinkedin(false)
    }

    // Filter
    const filter = campaign.enrollment_filter || {}
    setCampaignFilter(pretty(filter))
    setFilterMinScore(String(filter.min_total_score || "0"))
    setFilterStatuses((filter.statuses as string[]) || [])
    
    // Switch to form mode
    setUseFormForStrategy(true)
    setUseFormForFilter(true)

    // Switch to campaigns tab if not there
    setActiveTab("campaigns")
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submitCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!campaignName.trim()) {
      toast.error("Nom de campagne requis.")
      return
    }

    let strategy: AnyMap | null = {}
    if (useFormForStrategy) {
      if (strategyEmail) strategy.email = { delay: Number.parseInt(strategyEmailDelay, 10) || 0 }
      if (strategyLinkedin) strategy.linkedin = { delay: Number.parseInt(strategyLinkedinDelay, 10) || 0 }
    } else {
      strategy = parseJsonObject(campaignStrategy, "channel_strategy")
    }
    if (strategy === null) return

    let filter: AnyMap | null = {}
    if (useFormForFilter) {
      filter = {
        statuses: filterStatuses,
        min_total_score: Number.parseInt(filterMinScore, 10) || 0,
      }
    } else {
      filter = parseJsonObject(campaignFilter, "enrollment_filter")
    }
    if (filter === null) return

    setCampaignBusy(true)
    try {
      const url = editingCampaignId 
        ? `/api/v1/admin/campaigns/${editingCampaignId}`
        : "/api/v1/admin/campaigns"
      
      const method = editingCampaignId ? "PATCH" : "POST"

      await requestApi(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campaignName.trim(),
          description: campaignDescription.trim() || null,
          status: campaignStatus,
          sequence_id: campaignSequenceId || null,
          channel_strategy: strategy,
          enrollment_filter: filter,
        }),
      })
      
      toast.success(editingCampaignId ? "Campagne mise a jour." : "Campagne creee.")
      resetCampaignForm()
      await mutateCampaigns()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action impossible.")
    } finally {
      setCampaignBusy(false)
    }
  }

  async function toggleCampaign(campaign: Campaign) {
    const action = campaign.status === "active" ? "pause" : "activate"
    const actionKey = `toggle:${campaign.id}`
    if (processingCampaignActions.has(actionKey)) return
    setProcessingCampaignActions((current) => new Set(current).add(actionKey))
    try {
      await requestApi(`/api/v1/admin/campaigns/${campaign.id}/${action}`, { method: "POST" })
      await mutateCampaigns()
      await mutateRuns()
      toast.success(action === "activate" ? "Campagne activee." : "Campagne en pause.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action impossible.")
    } finally {
      setProcessingCampaignActions((current) => {
        const next = new Set(current)
        next.delete(actionKey)
        return next
      })
    }
  }

  async function enrollCampaign(campaign: Campaign) {
    const filter = parseJsonObject(JSON.stringify(campaign.enrollment_filter ?? {}), "enrollment_filter")
    if (filter === null) return
    const actionKey = `enroll:${campaign.id}`
    if (processingCampaignActions.has(actionKey)) return
    setProcessingCampaignActions((current) => new Set(current).add(actionKey))
    try {
      const result = await requestApi<{ created: number; skipped: number }>(`/api/v1/admin/campaigns/${campaign.id}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters: filter, max_leads: 50 }),
      })
      toast.success(`Enrollment termine: ${result.created} crees, ${result.skipped} ignores.`)
      await mutateRuns()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enrollment impossible.")
    } finally {
      setProcessingCampaignActions((current) => {
        const next = new Set(current)
        next.delete(actionKey)
        return next
      })
    }
  }

  async function createSequence(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!sequenceName.trim()) {
      toast.error("Nom de sequence requis.")
      return
    }
    let steps: AnyMap[] | null = []
    if (useFormForSteps) {
      steps = sequenceStepsList
    } else {
      steps = parseJsonArray(sequenceSteps, "steps")
    }
    if (steps === null) return
    setSequenceBusy(true)
    try {
      await requestApi("/api/v1/admin/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sequenceName.trim(),
          description: sequenceDescription.trim() || null,
          status: sequenceStatus,
          channels: parseChannels(sequenceChannels),
          steps,
        }),
      })
      toast.success("Sequence creee.")
      setSequenceName("")
      setSequenceDescription("")
      setSequenceChannels("email,call")
      setSequenceSteps(DEFAULT_SEQUENCE_STEPS)
      await mutateSequences()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Creation de sequence impossible.")
    } finally {
      setSequenceBusy(false)
    }
  }

  async function simulateSequence() {
    if (!selectedSequenceId) {
      toast.error("Selectionnez une sequence.")
      return
    }
    const context = parseJsonObject(simulateContext, "lead_context")
    if (context === null) return
    setSequenceBusy(true)
    try {
      const result = await requestApi<AnyMap>(`/api/v1/admin/sequences/${selectedSequenceId}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_context: context }),
      })
      setSimulateResult(result)
      toast.success("Simulation generee.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Simulation impossible.")
    } finally {
      setSequenceBusy(false)
    }
  }

  async function generateContent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const context = parseJsonObject(contentContext, "context")
    if (context === null) return
    const trimmedStep = contentStep.trim()
    const parsedStep = trimmedStep === "" ? 1 : Number.parseInt(trimmedStep, 10)
    if (Number.isNaN(parsedStep)) {
      toast.error("L'etape de contenu doit etre un nombre entier.")
      return
    }
    setContentBusy(true)
    try {
      const result = await requestApi<AnyMap>("/api/v1/admin/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: contentLeadId.trim() || null,
          channel: contentChannel,
          step: parsedStep,
          template_key: contentTemplate.trim() || null,
          provider: contentProvider.trim() || "deterministic",
          context,
        }),
      })
      setContentHistory((prev) => [result, ...prev].slice(0, 6))
      toast.success("Contenu genere.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generation impossible.")
    } finally {
      setContentBusy(false)
    }
  }

  async function runEnrichment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const context = parseJsonObject(enrichmentContext, "context")
    if (context === null) return
    if (!enrichmentQuery.trim()) {
      toast.error("Requete denrichissement requise.")
      return
    }
    setEnrichmentBusy(true)
    try {
      const result = await requestApi<AnyMap>("/api/v1/admin/enrichment/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: enrichmentQuery.trim(),
          lead_id: enrichmentLeadId.trim() || null,
          provider: enrichmentProvider.trim() || "mock",
          context,
        }),
      })
      setLookupJobId(String(result.id || ""))
      setEnrichmentHistory((prev) => [result, ...prev].slice(0, 6))
      toast.success("Enrichissement termine.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enrichissement impossible.")
    } finally {
      setEnrichmentBusy(false)
    }
  }

  async function lookupEnrichment() {
    if (!lookupJobId.trim()) {
      toast.error("Entrez un job_id.")
      return
    }
    setEnrichmentBusy(true)
    try {
      const result = await requestApi<AnyMap>(`/api/v1/admin/enrichment/${lookupJobId.trim()}`)
      setEnrichmentHistory((prev) => [result, ...prev.filter((item) => item.id !== result.id)].slice(0, 6))
      toast.success("Job charge.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Job introuvable.")
    } finally {
      setEnrichmentBusy(false)
    }
  }

  return (
    <AppShell>
      <div className="flex flex-1 flex-col gap-4">
        <div className="rounded-2xl border bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 p-5 text-slate-50">
          <h2 className="text-3xl font-bold tracking-tight">Growth Automation Studio</h2>
          <p className="mt-2 text-sm text-slate-200">
            Campagnes, sequences, generation de contenu et enrichment dans une vue unifiee.
          </p>
        </div>

        <SyncStatus
          updatedAt={updatedAt}
          isValidating={campaignsLoading || sequencesLoading || runsLoading}
          onRefresh={() => {
            void mutateCampaigns()
            void mutateSequences()
            void mutateRuns()
          }}
        />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="campaigns">Campagnes</TabsTrigger>
            <TabsTrigger value="sequences">Sequences</TabsTrigger>
            <TabsTrigger value="studio">Studio IA</TabsTrigger>
          </TabsList>

          <TabsContent value="campaigns" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{editingCampaignId ? `Edition de campagne: ${campaignName}` : "Creation de campagne"}</CardTitle>
                {editingCampaignId && (
                  <Button variant="ghost" size="sm" onClick={resetCampaignForm}>Annuler l'edition</Button>
                )}
              </CardHeader>
              <CardContent>
                <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={submitCampaign}>
                  <div className="space-y-1">
                    <Label htmlFor="campaign-name">Nom</Label>
                    <Input
                      id="campaign-name"
                      value={campaignName}
                      onChange={(event) => setCampaignName(event.target.value)}
                      placeholder="Nurture Mid-Market Q1"
                      disabled={campaignBusy}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="campaign-description">Description</Label>
                    <Input
                      id="campaign-description"
                      value={campaignDescription}
                      onChange={(event) => setCampaignDescription(event.target.value)}
                      placeholder="Objectif, ICP, angle"
                      disabled={campaignBusy}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="campaign-status">Status</Label>
                    <select
                      id="campaign-status"
                      title="Campaign status"
                      value={campaignStatus}
                      onChange={(event) => setCampaignStatus(event.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      disabled={campaignBusy}
                    >
                      <option value="draft">draft</option>
                      <option value="active">active</option>
                      <option value="paused">paused</option>
                      <option value="archived">archived</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="campaign-sequence">Sequence</Label>
                    <select
                      id="campaign-sequence"
                      title="Selected sequence"
                      value={campaignSequenceId}
                      onChange={(event) => setCampaignSequenceId(event.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      disabled={campaignBusy || sequencesLoading}
                    >
                      <option value="">Aucune</option>
                      {sequences.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-3 md:col-span-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold">Channel Strategy</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[10px]"
                        onClick={() => setUseFormForStrategy(!useFormForStrategy)}
                        type="button"
                      >
                        {useFormForStrategy ? "Switch to JSON" : "Switch to Form"}
                      </Button>
                    </div>

                    {useFormForStrategy ? (
                      <div className="grid gap-4 rounded-lg border p-3">
                        <div className="flex items-center gap-4">
                          <Checkbox
                            id="strategy-email"
                            checked={strategyEmail}
                            onCheckedChange={(checked) => setStrategyEmail(checked === true)}
                          />
                          <div className="grid gap-1.5 leading-none">
                            <Label htmlFor="strategy-email">Email Outreach</Label>
                          </div>
                          <div className="ml-auto flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Delay (hrs):</span>
                            <Input
                              type="number"
                              className="h-7 w-16"
                              value={strategyEmailDelay}
                              onChange={(e) => setStrategyEmailDelay(e.target.value)}
                              disabled={!strategyEmail}
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <Checkbox
                            id="strategy-linkedin"
                            checked={strategyLinkedin}
                            onCheckedChange={(checked) => setStrategyLinkedin(checked === true)}
                          />
                          <div className="grid gap-1.5 leading-none">
                            <Label htmlFor="strategy-linkedin">LinkedIn Message</Label>
                          </div>
                          <div className="ml-auto flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Delay (hrs):</span>
                            <Input
                              type="number"
                              className="h-7 w-16"
                              value={strategyLinkedinDelay}
                              onChange={(e) => setStrategyLinkedinDelay(e.target.value)}
                              disabled={!strategyLinkedin}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <textarea
                        id="campaign-strategy"
                        title="Channel strategy JSON"
                        placeholder='{ "email": { "delay": 24 } }'
                        value={campaignStrategy}
                        onChange={(event) => setCampaignStrategy(event.target.value)}
                        rows={5}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
                        disabled={campaignBusy}
                      />
                    )}
                  </div>

                  <div className="space-y-3 md:col-span-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold">Target Audience (Filters)</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[10px]"
                        onClick={() => setUseFormForFilter(!useFormForFilter)}
                        type="button"
                      >
                        {useFormForFilter ? "Switch to JSON" : "Switch to Form"}
                      </Button>
                    </div>

                    {useFormForFilter ? (
                      <div className="grid gap-4 rounded-lg border p-3">
                        <div className="grid gap-2">
                          <Label htmlFor="filter-min-score">Minimum Quality Score</Label>
                          <div className="flex items-center gap-4">
                            <Input
                              id="filter-min-score"
                              type="number"
                              min="0"
                              max="100"
                              value={filterMinScore}
                              onChange={(e) => setFilterMinScore(e.target.value)}
                            />
                            <span className="text-sm font-medium">{filterMinScore}/100</span>
                          </div>
                        </div>

                        <div className="grid gap-2">
                          <Label>Lead Statuses to Include</Label>
                          <div className="flex flex-wrap gap-3">
                            {["NEW", "ENRICHED", "SCORED", "CONTACTED"].map((status) => (
                              <div key={status} className="flex items-center gap-1.5">
                                <Checkbox
                                  id={`status-${status}`}
                                  checked={filterStatuses.includes(status)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setFilterStatuses([...filterStatuses, status])
                                    } else {
                                      setFilterStatuses(filterStatuses.filter((s) => s !== status))
                                    }
                                  }}
                                />
                                <Label htmlFor={`status-${status}`} className="text-xs">
                                  {status}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <textarea
                        id="campaign-filter"
                        title="Enrollment filter JSON"
                        placeholder='{ "lead_score": { "$gt": 50 } }'
                        value={campaignFilter}
                        onChange={(event) => setCampaignFilter(event.target.value)}
                        rows={5}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
                        disabled={campaignBusy}
                      />
                    )}
                  </div>
                  <div className="md:col-span-4">
                    <Button type="submit" disabled={campaignBusy}>
                      {campaignBusy ? (editingCampaignId ? "Mise a jour..." : "Creation...") : (editingCampaignId ? "Mettre a jour" : "Creer la campagne")}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {campaignsError ? (
              <ErrorState
                title="Impossible de charger les campagnes."
                description={campaignsError instanceof Error ? campaignsError.message : undefined}
                onRetry={() => void mutateCampaigns()}
              />
            ) : null}

            <div className="grid gap-4 lg:grid-cols-[1.1fr,1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Catalogue des campagnes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {campaignsLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-20 w-full" />
                      <Skeleton className="h-20 w-full" />
                    </div>
                  ) : campaigns.length === 0 ? (
                    <EmptyState
                      title="Aucune campagne"
                      description="Creez une campagne puis activez-la pour lancer l automation."
                    />
                  ) : (
                    campaigns.map((campaign) => (
                      <div
                        key={campaign.id}
                        className={`rounded-xl border p-3 ${selectedCampaignId === campaign.id ? "border-primary bg-muted/40" : ""}`}
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => setSelectedCampaignId(campaign.id)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold">{campaign.name}</p>
                            <Badge variant={campaign.status === "active" ? "default" : "secondary"}>{campaign.status}</Badge>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {campaign.description || "Aucune description"}
                          </p>
                        </button>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => void toggleCampaign(campaign)}>
                            {campaign.status === "active" ? "Pause" : "Activer"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => startEditingCampaign(campaign)}>
                            Modifier
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => void enrollCampaign(campaign)}>
                            Enroll leads
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Runs de campagne</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="run-status">Status</Label>
                    <select
                      id="run-status"
                      title="Filter runs by status"
                      value={runStatus}
                      onChange={(event) => setRunStatus(event.target.value)}
                      className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="all">all</option>
                      <option value="pending">pending</option>
                      <option value="executed">executed</option>
                      <option value="failed">failed</option>
                      <option value="skipped">skipped</option>
                    </select>
                  </div>

                  {runsLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  ) : runsError ? (
                    <ErrorState
                      title="Impossible de charger les runs."
                      description={runsError instanceof Error ? runsError.message : undefined}
                      onRetry={() => void mutateRuns()}
                    />
                  ) : (runsResponse?.items || []).length === 0 ? (
                    <EmptyState title="Aucun run" description="Les runs apparaitront apres enrollment." />
                  ) : (
                    (runsResponse?.items || []).map((run) => (
                      <div key={run.id} className="rounded-lg border p-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold">
                            step {run.step_index} - {run.action_type}
                          </p>
                          <Badge variant={run.status === "executed" ? "default" : "secondary"}>{run.status}</Badge>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          trigger: {run.trigger_source} | lead: {run.lead_id || "n/a"}
                        </p>
                        {run.error_message ? <p className="mt-1 text-[11px] text-red-500">{run.error_message}</p> : null}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="sequences" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Creation de sequence</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="grid gap-3 md:grid-cols-2" onSubmit={createSequence}>
                  <div className="space-y-1">
                    <Label htmlFor="sequence-name">Nom</Label>
                    <Input
                      id="sequence-name"
                      value={sequenceName}
                      onChange={(event) => setSequenceName(event.target.value)}
                      placeholder="Default Nurture Sequence"
                      disabled={sequenceBusy}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="sequence-status">Status</Label>
                    <select
                      id="sequence-status"
                      title="Sequence status"
                      value={sequenceStatus}
                      onChange={(event) => setSequenceStatus(event.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      disabled={sequenceBusy}
                    >
                      <option value="draft">draft</option>
                      <option value="active">active</option>
                      <option value="archived">archived</option>
                    </select>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label htmlFor="sequence-description">Description</Label>
                    <Input
                      id="sequence-description"
                      value={sequenceDescription}
                      onChange={(event) => setSequenceDescription(event.target.value)}
                      placeholder="Flow multicanal en 3 etapes"
                      disabled={sequenceBusy}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label htmlFor="sequence-channels">Channels (comma separated)</Label>
                    <Input
                      id="sequence-channels"
                      value={sequenceChannels}
                      onChange={(event) => setSequenceChannels(event.target.value)}
                      placeholder="email,call,dm"
                      disabled={sequenceBusy}
                    />
                  </div>
                  <div className="space-y-3 md:col-span-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold">Étapes de la Séquence</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[10px]"
                        onClick={() => setUseFormForSteps(!useFormForSteps)}
                        type="button"
                      >
                        {useFormForSteps ? "Passer au JSON" : "Passer au Formulaire"}
                      </Button>
                    </div>

                    {useFormForSteps ? (
                      <div className="space-y-4 rounded-lg border p-4 bg-muted/20">
                        {sequenceStepsList.map((step, index) => (
                          <div key={index} className="relative space-y-3 rounded-md border bg-background p-3 shadow-sm">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute right-1 top-1 h-6 w-6"
                              onClick={() => {
                                const newList = [...sequenceStepsList]
                                newList.splice(index, 1)
                                setSequenceStepsList(newList)
                              }}
                              type="button"
                            >
                              <IconTrash className="h-3 w-3 text-red-500" />
                            </Button>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1">
                                <Label className="text-[10px] uppercase">Canal</Label>
                                <Select
                                  value={step.channel as string}
                                  onValueChange={(val) => {
                                    const newList = [...sequenceStepsList]
                                    newList[index] = { ...step, channel: val }
                                    setSequenceStepsList(newList)
                                  }}
                                >
                                  <SelectTrigger className="h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="email">Email</SelectItem>
                                    <SelectItem value="call">Appel</SelectItem>
                                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] uppercase">Template Key</Label>
                                <Input
                                  className="h-8"
                                  value={step.template_key as string}
                                  onChange={(e) => {
                                    const newList = [...sequenceStepsList]
                                    newList[index] = { ...step, template_key: e.target.value }
                                    setSequenceStepsList(newList)
                                  }}
                                />
                              </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1">
                                <Label className="text-[10px] uppercase">Délai (jours)</Label>
                                <Input
                                  type="number"
                                  className="h-8"
                                  min="0"
                                  value={step.delay_days as number}
                                  onChange={(e) => {
                                    const newList = [...sequenceStepsList]
                                    newList[index] = { ...step, delay_days: Number.parseInt(e.target.value, 10) || 0 }
                                    setSequenceStepsList(newList)
                                  }}
                                />
                              </div>
                              <div className="flex items-end">
                                <Badge variant="outline" className="h-8 w-full justify-center text-[10px] font-normal border-dashed">
                                  Étape {index + 1}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full border-dashed"
                          onClick={() => {
                            setSequenceStepsList([
                              ...sequenceStepsList,
                              { channel: "email", template_key: "", delay_days: 1, conditions: {} },
                            ])
                          }}
                          type="button"
                        >
                          Ajouter une étape
                        </Button>
                      </div>
                    ) : (
                      <textarea
                        id="sequence-steps"
                        title="Sequence steps JSON array"
                        placeholder='[ { "type": "email", "delay_hours": 2 } ]'
                        value={sequenceSteps}
                        onChange={(event) => setSequenceSteps(event.target.value)}
                        rows={8}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
                        disabled={sequenceBusy}
                      />
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <Button type="submit" disabled={sequenceBusy}>
                      {sequenceBusy ? "Creation..." : "Creer sequence"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {sequencesError ? (
              <ErrorState
                title="Impossible de charger les sequences."
                description={sequencesError instanceof Error ? sequencesError.message : undefined}
                onRetry={() => void mutateSequences()}
              />
            ) : null}

            <div className="grid gap-4 lg:grid-cols-[1fr,1.15fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Catalogue des sequences</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {sequencesLoading ? (
                    <>
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </>
                  ) : sequences.length === 0 ? (
                    <EmptyState title="Aucune sequence" description="Creez votre premiere sequence multicanal." />
                  ) : (
                    sequences.map((sequence) => (
                      <button
                        key={sequence.id}
                        type="button"
                        className={`w-full rounded-lg border p-2 text-left ${selectedSequenceId === sequence.id ? "border-primary bg-muted/40" : ""
                          }`}
                        onClick={() => setSelectedSequenceId(sequence.id)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold">{sequence.name}</p>
                          <Badge variant={sequence.status === "active" ? "default" : "secondary"}>{sequence.status}</Badge>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          channels: {(sequence.channels || []).join(", ") || "n/a"}
                        </p>
                      </button>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Simulation sequence</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="simulate-context">Lead context (JSON)</Label>
                    <textarea
                      id="simulate-context"
                      title="Lead context JSON for simulation"
                      placeholder='{ "lead_name": "John", "company": "Acme" }'
                      value={simulateContext}
                      onChange={(event) => setSimulateContext(event.target.value)}
                      rows={8}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
                      disabled={sequenceBusy}
                    />
                  </div>
                  <Button onClick={() => void simulateSequence()} disabled={sequenceBusy || !selectedSequenceId}>
                    {sequenceBusy ? "Simulation..." : "Simuler"}
                  </Button>

                  {simulateResult ? (
                    <pre className="max-h-80 overflow-auto rounded-lg border bg-muted p-3 text-[11px]">
                      {pretty(simulateResult)}
                    </pre>
                  ) : (
                    <EmptyState title="Aucune simulation" description="Lancez une simulation pour visualiser la timeline." />
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="studio" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Content generation</CardTitle>
                </CardHeader>
                <CardContent>
                  <form className="space-y-3" onSubmit={generateContent}>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="content-lead-id">Lead ID (optional)</Label>
                        <Input
                          id="content-lead-id"
                          value={contentLeadId}
                          onChange={(event) => setContentLeadId(event.target.value)}
                          disabled={contentBusy}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="content-provider">Provider</Label>
                        <Input
                          id="content-provider"
                          value={contentProvider}
                          onChange={(event) => setContentProvider(event.target.value)}
                          disabled={contentBusy}
                        />
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-1">
                        <Label htmlFor="content-channel">Channel</Label>
                        <select
                          id="content-channel"
                          title="Content channel"
                          value={contentChannel}
                          onChange={(event) => setContentChannel(event.target.value)}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                          disabled={contentBusy}
                        >
                          <option value="email">email</option>
                          <option value="call">call</option>
                          <option value="dm">dm</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="content-step">Step</Label>
                        <Input
                          id="content-step"
                          value={contentStep}
                          onChange={(event) => setContentStep(event.target.value)}
                          disabled={contentBusy}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="content-template">Template key</Label>
                        <Input
                          id="content-template"
                          value={contentTemplate}
                          onChange={(event) => setContentTemplate(event.target.value)}
                          disabled={contentBusy}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="content-context">Context (JSON)</Label>
                      <textarea
                        id="content-context"
                        title="Content generation context JSON"
                        placeholder='{ "tone": "professional" }'
                        value={contentContext}
                        onChange={(event) => setContentContext(event.target.value)}
                        rows={8}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
                        disabled={contentBusy}
                      />
                    </div>
                    <Button type="submit" disabled={contentBusy}>
                      {contentBusy ? "Generation..." : "Generer contenu"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Enrichment run</CardTitle>
                </CardHeader>
                <CardContent>
                  <form className="space-y-3" onSubmit={runEnrichment}>
                    <div className="space-y-1">
                      <Label htmlFor="enrichment-query">Query</Label>
                      <Input
                        id="enrichment-query"
                        value={enrichmentQuery}
                        onChange={(event) => setEnrichmentQuery(event.target.value)}
                        placeholder="Dentistes Paris + croissance 2025"
                        disabled={enrichmentBusy}
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="enrichment-lead-id">Lead ID (optional)</Label>
                        <Input
                          id="enrichment-lead-id"
                          value={enrichmentLeadId}
                          onChange={(event) => setEnrichmentLeadId(event.target.value)}
                          disabled={enrichmentBusy}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="enrichment-provider">Provider</Label>
                        <Input
                          id="enrichment-provider"
                          value={enrichmentProvider}
                          onChange={(event) => setEnrichmentProvider(event.target.value)}
                          disabled={enrichmentBusy}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="enrichment-context">Context (JSON)</Label>
                      <textarea
                        id="enrichment-context"
                        title="Enrichment context JSON"
                        placeholder='{ "max_results": 10 }'
                        value={enrichmentContext}
                        onChange={(event) => setEnrichmentContext(event.target.value)}
                        rows={7}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
                        disabled={enrichmentBusy}
                      />
                    </div>
                    <Button type="submit" disabled={enrichmentBusy}>
                      {enrichmentBusy ? "Execution..." : "Lancer enrichment"}
                    </Button>
                  </form>

                  <div className="mt-4 rounded-lg border p-3">
                    <Label htmlFor="lookup-job-id">Lookup by job_id</Label>
                    <div className="mt-2 flex gap-2">
                      <Input
                        id="lookup-job-id"
                        value={lookupJobId}
                        onChange={(event) => setLookupJobId(event.target.value)}
                        disabled={enrichmentBusy}
                      />
                      <Button variant="outline" onClick={() => void lookupEnrichment()} disabled={enrichmentBusy}>
                        Charger
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Derniers contenus generes</CardTitle>
                </CardHeader>
                <CardContent>
                  {contentHistory.length === 0 ? (
                    <EmptyState title="Aucun contenu" description="Generez un message email/call/dm." />
                  ) : (
                    <div className="space-y-3">
                      {contentHistory.map((item, index) => (
                        <pre key={`content-${item.id ?? index}`} className="max-h-72 overflow-auto rounded-lg border bg-muted p-3 text-[11px]">
                          {pretty(item)}
                        </pre>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Derniers enrichissements</CardTitle>
                </CardHeader>
                <CardContent>
                  {enrichmentHistory.length === 0 ? (
                    <EmptyState title="Aucun enrichissement" description="Lancez un enrichment run." />
                  ) : (
                    <div className="space-y-3">
                      {enrichmentHistory.map((item, index) => (
                        <pre key={`enrichment-${item.id ?? index}`} className="max-h-72 overflow-auto rounded-lg border bg-muted p-3 text-[11px]">
                          {pretty(item)}
                        </pre>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  )
}
