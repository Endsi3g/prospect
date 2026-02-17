"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import useSWR from "swr"
import { IconArrowLeft, IconChecklist, IconPlus, IconRocket, IconTargetArrow, IconBrandWhatsapp, IconPhone, IconMail, IconBrandLinkedin } from "@tabler/icons-react"
import { toast } from "sonner"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { requestApi } from "@/lib/api"
import { formatCurrencyFr, formatDateTimeFr } from "@/lib/format"

type Lead = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone?: string | null
  title?: string | null
  linkedin_url?: string | null
  status: string
  segment?: string | null
  tags: string[]
  total_score: number
  stage_canonical?: string | null
  lead_owner_user_id?: string | null
  stage_entered_at?: string | null
  sla_due_at?: string | null
  next_action_at?: string | null
  handoff_required?: boolean
  handoff_completed_at?: string | null
  score: { tier: string; heat_status: string }
  updated_at: string
  company: { name: string; domain?: string | null; industry?: string | null; location?: string | null }
}

type LeadDraft = {
  first_name: string
  last_name: string
  email: string
  phone: string
  title: string
  linkedin_url: string
  status: string
  segment: string
  tags_text: string
  company_name: string
  company_domain: string
  company_industry: string
  company_location: string
}

type Interaction = { id: string; type: string; timestamp: string | null; details: Record<string, unknown> }
type Task = { id: string; title: string; status: string; priority: string; due_date?: string | null }
type Opportunity = { id: string; name: string; stage: string; status: string; amount?: number | null; probability: number; updated_at?: string | null }
type Note = { id: string; content: string; author?: string; created_at?: string; updated_at?: string }
type Campaign = { id: string; name: string; status: string }
type HistoryItem = { id: string; event_type: string; timestamp: string; title: string; description?: string }
type User = { id: string; email: string; display_name?: string | null; status: "active" | "invited" | "disabled"; roles: string[] }
type UsersResponse = { items: User[] }
type Recommendation = {
  id: string
  entity_type: string
  entity_id: string
  recommendation_type: string
  priority: number
  payload: Record<string, unknown>
  status: string
  requires_confirm: boolean
  created_at?: string | null
}
type RecommendationsResponse = { total: number; items: Recommendation[] }

const STATUS_OPTIONS = ["NEW", "ENRICHED", "SCORED", "CONTACTED", "INTERESTED", "CONVERTED", "LOST", "DISQUALIFIED"]
const STAGE_OPTIONS = ["qualification", "discovery", "proposal", "negotiation", "won", "lost"]
const CANONICAL_STAGE_OPTIONS = ["new", "enriched", "qualified", "contacted", "engaged", "opportunity", "won", "post_sale", "lost", "disqualified"]
const fetcher = <T,>(path: string) => requestApi<T>(path)

function toDraft(lead: Lead): LeadDraft {
  return {
    first_name: lead.first_name || "",
    last_name: lead.last_name || "",
    email: lead.email || "",
    phone: lead.phone || "",
    title: lead.title || "",
    linkedin_url: lead.linkedin_url || "",
    status: lead.status || "NEW",
    segment: lead.segment || "",
    tags_text: (lead.tags || []).join(", "),
    company_name: lead.company?.name || "",
    company_domain: lead.company?.domain || "",
    company_industry: lead.company?.industry || "",
    company_location: lead.company?.location || "",
  }
}

function newNoteId() {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeCanonical(value?: string | null): string {
  return String(value || "new").trim().toLowerCase() || "new"
}

function inferNextCanonicalStage(current?: string | null): string {
  const normalized = normalizeCanonical(current)
  const index = CANONICAL_STAGE_OPTIONS.indexOf(normalized)
  if (index < 0 || index >= CANONICAL_STAGE_OPTIONS.length - 1) return "qualified"
  return CANONICAL_STAGE_OPTIONS[index + 1]
}

function recommendationLabel(item: Recommendation): string {
  if (typeof item.payload?.title === "string" && item.payload.title.trim()) return item.payload.title
  return item.recommendation_type.replace(/_/g, " ")
}

export default function LeadDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params.id || "")

  const { data: lead, error: leadError, isLoading: leadLoading, mutate: mutateLead } = useSWR<Lead>(id ? `/api/v1/admin/leads/${id}` : null, fetcher)
  const { data: interactions, isLoading: interactionsLoading } = useSWR<Interaction[]>(id ? `/api/v1/admin/leads/${id}/interactions` : null, fetcher)
  const { data: tasks, isLoading: tasksLoading, mutate: mutateTasks } = useSWR<Task[]>(id ? `/api/v1/admin/leads/${id}/tasks` : null, fetcher)
  const { data: opportunities, isLoading: opportunitiesLoading, mutate: mutateOpportunities } = useSWR<Opportunity[]>(id ? `/api/v1/admin/leads/${id}/opportunities` : null, fetcher)
  const { data: notesData, isLoading: notesLoading, mutate: mutateNotes } = useSWR<{ items: Note[] }>(id ? `/api/v1/admin/leads/${id}/notes` : null, fetcher)
  const { data: history, isLoading: historyLoading, mutate: mutateHistory } = useSWR<{ items: HistoryItem[] }>(id ? `/api/v1/admin/leads/${id}/history?window=30d` : null, fetcher)
  const { data: campaigns } = useSWR<{ items: Campaign[] }>(`/api/v1/admin/campaigns?limit=50&offset=0`, fetcher)
  const { data: usersData, mutate: mutateUsers } = useSWR<UsersResponse>("/api/v1/admin/users", fetcher)
  const { data: recommendationsData, isLoading: recommendationsLoading, mutate: mutateRecommendations } = useSWR<RecommendationsResponse>(
    id ? "/api/v1/admin/recommendations?status=pending&limit=150&offset=0&seed=true" : null,
    fetcher,
  )

  const [draft, setDraft] = React.useState<LeadDraft | null>(null)
  const dirtyRef = React.useRef<Set<keyof LeadDraft>>(new Set())
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saveState, setSaveState] = React.useState("idle")
  const [isDraftValid, setIsDraftValid] = React.useState(true)

  const [quickTaskTitle, setQuickTaskTitle] = React.useState("")
  const [oppName, setOppName] = React.useState("")
  const [oppAmount, setOppAmount] = React.useState("")
  const [oppStage, setOppStage] = React.useState("qualification")
  const [campaignId, setCampaignId] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const [stageTarget, setStageTarget] = React.useState("qualified")
  const [stageReason, setStageReason] = React.useState("")
  const [ownerUserId, setOwnerUserId] = React.useState("")
  const [handoffNote, setHandoffNote] = React.useState("")
  const [workflowBusy, setWorkflowBusy] = React.useState(false)
  const [recommendationBusyId, setRecommendationBusyId] = React.useState<string | null>(null)

  const [notes, setNotes] = React.useState<Note[]>([])
  const [notesDirty, setNotesDirty] = React.useState(false)
  const notesTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const users = React.useMemo(() => usersData?.items || [], [usersData])
  const activeUsers = React.useMemo(() => users.filter((user) => user.status === "active"), [users])
  const ownerMap = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const user of users) map.set(user.id, (user.display_name || "").trim() || user.email)
    return map
  }, [users])

  const leadRecommendations = React.useMemo(
    () => (recommendationsData?.items || []).filter((item) => item.entity_type === "lead" && item.entity_id === id),
    [recommendationsData, id],
  )

  React.useEffect(() => {
    if (lead && dirtyRef.current.size === 0) setDraft(toDraft(lead))
  }, [lead])

  React.useEffect(() => {
    if (!notesDirty) setNotes(notesData?.items || [])
  }, [notesData, notesDirty])

  React.useEffect(() => {
    if (!campaignId && campaigns?.items?.length) {
      const next = campaigns.items.find((item) => item.status === "active")?.id || campaigns.items[0].id
      setCampaignId(next)
    }
  }, [campaigns, campaignId])

  React.useEffect(() => {
    if (!lead) return
    if (!stageTarget) setStageTarget(inferNextCanonicalStage(lead.stage_canonical))
    if (!ownerUserId) setOwnerUserId(lead.lead_owner_user_id || activeUsers[0]?.id || users[0]?.id || "")
  }, [lead, stageTarget, ownerUserId, activeUsers, users])

  const saveLead = React.useCallback(async () => {
    if (!draft || !id || dirtyRef.current.size === 0) return
    if (!draft.first_name.trim() || !draft.last_name.trim() || !draft.company_name.trim()) {
      setIsDraftValid(false)
      setSaveState("error")
      return
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.email.trim())) {
      setIsDraftValid(false)
      setSaveState("error")
      return
    }
    setIsDraftValid(true)
    const payload: Record<string, unknown> = {}
    for (const field of dirtyRef.current.values()) {
      if (field === "tags_text") payload.tags = draft.tags_text.split(",").map((item) => item.trim()).filter(Boolean)
      else payload[field] = (draft[field] as string).trim()
    }
    setSaveState("saving")
    try {
      const updated = await requestApi<Lead>(`/api/v1/admin/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      dirtyRef.current.clear()
      setSaveState("saved")
      await mutateLead(updated, false)
      await mutateHistory()
    } catch {
      setSaveState("error")
    }
  }, [draft, id, mutateHistory, mutateLead])

  React.useEffect(() => {
    if (!draft || dirtyRef.current.size === 0 || !isDraftValid) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void saveLead(), 850)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [draft, isDraftValid, saveLead])

  React.useEffect(() => {
    if (!notesDirty || !id) return
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    notesTimerRef.current = setTimeout(async () => {
      try {
        await requestApi(`/api/v1/admin/leads/${id}/notes`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: notes.filter((item) => item.content.trim()) }) })
        setNotesDirty(false)
        await mutateNotes()
        await mutateHistory()
      } catch {
        toast.error("Sauvegarde notes impossible.")
      }
    }, 850)
    return () => { if (notesTimerRef.current) clearTimeout(notesTimerRef.current) }
  }, [id, notes, notesDirty, mutateHistory, mutateNotes])

  const onField = <K extends keyof LeadDraft>(key: K, value: LeadDraft[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
    dirtyRef.current.add(key)
    setIsDraftValid(true)
    setSaveState("idle")
  }

  const createTask = async () => {
    if (!id) return
    setBusy(true)
    try {
      await requestApi("/api/v1/admin/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: (quickTaskTitle || "Suivi lead").trim(), status: "To Do", priority: "Medium", lead_id: id }) })
      setQuickTaskTitle("")
      await mutateTasks()
      await mutateHistory()
      toast.success("Tache creee.")
    } catch (error) { toast.error(error instanceof Error ? error.message : "Creation tache impossible.") } finally { setBusy(false) }
  }

  const createOpportunity = async (forcedName?: string) => {
    if (!id) return
    setBusy(true)
    try {
      await requestApi(`/api/v1/admin/leads/${id}/opportunities`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: (forcedName || oppName || `Opportunite - ${lead?.company?.name || "Lead"}`).trim(), stage: oppStage, amount: oppAmount ? Number(oppAmount) : null, probability: 30 }) })
      setOppName("")
      setOppAmount("")
      await mutateOpportunities()
      await mutateHistory()
      toast.success("Opportunite creee.")
    } catch (error) { toast.error(error instanceof Error ? error.message : "Creation opportunite impossible.") } finally { setBusy(false) }
  }

  const addToCampaign = async () => {
    if (!campaignId || !id) return
    setBusy(true)
    try {
      await requestApi(`/api/v1/admin/leads/${id}/add-to-campaign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaign_id: campaignId }) })
      await mutateHistory()
      toast.success("Lead ajoute a la campagne.")
    } catch (error) { toast.error(error instanceof Error ? error.message : "Ajout campagne impossible.") } finally { setBusy(false) }
  }

  const transitionLeadStage = async () => {
    if (!id || !stageTarget) return
    setWorkflowBusy(true)
    try {
      const response = await requestApi<{ lead: Lead }>(`/api/v1/admin/leads/${id}/stage-transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_stage: stageTarget, reason: stageReason.trim() || null, source: "manual_ui", sync_legacy: true }),
      })
      if (response.lead) await mutateLead(response.lead, false)
      else await mutateLead()
      await Promise.all([mutateHistory(), mutateRecommendations(), mutateTasks()])
      toast.success("Etape mise a jour.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Transition impossible.")
    } finally {
      setWorkflowBusy(false)
    }
  }

  const reassignLeadOwner = async () => {
    if (!id || !ownerUserId) return
    setWorkflowBusy(true)
    try {
      const result = await requestApi<{ owner_user_id: string }>(`/api/v1/admin/leads/${id}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_user_id: ownerUserId, reason: "manual_reassign_ui" }),
      })
      await mutateLead((current) => current ? { ...current, lead_owner_user_id: result.owner_user_id } : current, false)
      await Promise.all([mutateHistory(), mutateRecommendations(), mutateUsers()])
      toast.success("Owner mis a jour.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reassignation impossible.")
    } finally {
      setWorkflowBusy(false)
    }
  }

  const createHandoff = async () => {
    if (!id) return
    setWorkflowBusy(true)
    try {
      await requestApi("/api/v1/admin/handoffs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: id, to_user_id: ownerUserId || null, note: handoffNote.trim() || null }),
      })
      await Promise.all([mutateLead(), mutateHistory(), mutateRecommendations()])
      toast.success("Handoff cree.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Handoff impossible.")
    } finally {
      setWorkflowBusy(false)
    }
  }

  const applyRecommendation = async (recommendationId: string) => {
    setRecommendationBusyId(recommendationId)
    try {
      await requestApi(`/api/v1/admin/recommendations/${recommendationId}/apply`, { method: "POST" })
      await Promise.all([mutateRecommendations(), mutateLead(), mutateTasks(), mutateHistory()])
      toast.success("Recommandation appliquee.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Application impossible.")
    } finally {
      setRecommendationBusyId(null)
    }
  }

  const dismissRecommendation = async (recommendationId: string) => {
    setRecommendationBusyId(recommendationId)
    try {
      await requestApi(`/api/v1/admin/recommendations/${recommendationId}/dismiss`, { method: "POST" })
      await Promise.all([mutateRecommendations(), mutateHistory()])
      toast.success("Recommandation ignoree.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action impossible.")
    } finally {
      setRecommendationBusyId(null)
    }
  }

  if (leadLoading || !draft) return <div className="p-4 sm:p-6"><Skeleton className="h-48 w-full" /></div>
  if (leadError || !lead) return <div className="p-4 sm:p-6"><Button onClick={() => router.push("/leads")}>Retour</Button></div>

  const ownerDisplayName = ownerMap.get(lead.lead_owner_user_id || "") || "Non assigne"
  const changeHistory = (history?.items || []).filter((item) => item.id.startsWith("audit-")).slice(0, 12)

  return (
    <SidebarProvider style={{ "--sidebar-width": "calc(var(--spacing) * 72)", "--header-height": "calc(var(--spacing) * 12)" } as React.CSSProperties}>
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col gap-4 p-3 pt-0 sm:p-4 sm:pt-0 lg:p-6">
          <nav className="mt-2 flex items-center text-sm text-muted-foreground"><Link href="/leads">Leads</Link><span className="mx-2">/</span><span>{lead.first_name} {lead.last_name}</span></nav>
          <div className="flex flex-wrap items-center gap-3"><Button variant="ghost" size="icon" onClick={() => router.push("/leads")}><IconArrowLeft className="h-5 w-5" /></Button><h1 className="text-2xl font-bold">{lead.first_name} {lead.last_name}</h1><div className="ml-auto flex flex-wrap gap-2"><Badge variant="outline">{lead.status}</Badge><Badge>{lead.score.tier}</Badge><Badge variant="secondary">Score {Math.round(lead.total_score)}</Badge><Badge variant="outline">Stage {normalizeCanonical(lead.stage_canonical)}</Badge><Badge variant="secondary">Owner {ownerDisplayName}</Badge></div></div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <Tabs defaultValue="infos" className="space-y-4">
                <TabsList className="flex w-full flex-wrap justify-start"><TabsTrigger value="infos">Infos</TabsTrigger><TabsTrigger value="interactions">Interactions timeline</TabsTrigger><TabsTrigger value="tasks">Taches</TabsTrigger><TabsTrigger value="opportunities">Opportunites</TabsTrigger><TabsTrigger value="notes">Notes</TabsTrigger></TabsList>
                <TabsContent value="infos"><Card><CardHeader><CardTitle>Infos lead</CardTitle><CardDescription>Edition inline + autosave</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2"><Input id="lead-first-name" name="first_name" aria-label="Prenom" placeholder="Prenom" value={draft.first_name} onChange={(e) => onField("first_name", e.target.value)} onBlur={() => void saveLead()} /><Input id="lead-last-name" name="last_name" aria-label="Nom" placeholder="Nom" value={draft.last_name} onChange={(e) => onField("last_name", e.target.value)} onBlur={() => void saveLead()} /><Input id="lead-email" name="email" aria-label="Email" placeholder="email@entreprise.com" value={draft.email} onChange={(e) => onField("email", e.target.value)} onBlur={() => void saveLead()} /><Input id="lead-phone" name="phone" aria-label="Telephone" placeholder="+1 514 555 0100" value={draft.phone} onChange={(e) => onField("phone", e.target.value)} onBlur={() => void saveLead()} /><Input id="lead-title" name="title" aria-label="Poste" placeholder="Titre du poste" value={draft.title} onChange={(e) => onField("title", e.target.value)} onBlur={() => void saveLead()} /><Input id="lead-linkedin" name="linkedin_url" aria-label="URL LinkedIn" placeholder="https://www.linkedin.com/in/..." value={draft.linkedin_url} onChange={(e) => onField("linkedin_url", e.target.value)} onBlur={() => void saveLead()} /><select id="lead-status" name="status" aria-label="Statut du lead" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={draft.status} onChange={(e) => onField("status", e.target.value)} onBlur={() => void saveLead()}><option value="">Selectionner un statut</option>{STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select><Input id="lead-segment" name="segment" aria-label="Segment" placeholder="Segment" value={draft.segment} onChange={(e) => onField("segment", e.target.value)} onBlur={() => void saveLead()} /><Input id="lead-company-name" name="company_name" aria-label="Nom de l'entreprise" placeholder="Nom de l'entreprise" value={draft.company_name} onChange={(e) => onField("company_name", e.target.value)} onBlur={() => void saveLead()} /><Input id="lead-company-domain" name="company_domain" aria-label="Domaine de l'entreprise" placeholder="entreprise.com" value={draft.company_domain} onChange={(e) => onField("company_domain", e.target.value)} onBlur={() => void saveLead()} /><Input id="lead-company-industry" name="company_industry" aria-label="Secteur d'activite" placeholder="Secteur d'activite" value={draft.company_industry} onChange={(e) => onField("company_industry", e.target.value)} onBlur={() => void saveLead()} /><Input id="lead-company-location" name="company_location" aria-label="Localisation" placeholder="Ville, region" value={draft.company_location} onChange={(e) => onField("company_location", e.target.value)} onBlur={() => void saveLead()} /><Input id="lead-tags" name="tags_text" aria-label="Tags" placeholder="tag1, tag2" className="md:col-span-2" value={draft.tags_text} onChange={(e) => onField("tags_text", e.target.value)} onBlur={() => void saveLead()} /></CardContent></Card></TabsContent>
                <TabsContent value="interactions"><Card><CardHeader><CardTitle>Timeline interactions</CardTitle></CardHeader><CardContent className="space-y-2">{interactionsLoading ? <Skeleton className="h-24 w-full" /> : null}{(interactions || []).length === 0 ? <p className="text-sm text-muted-foreground">Aucune interaction.</p> : null}{(interactions || []).map((item) => <div key={item.id} className="rounded-lg border p-3"><div className="flex items-center justify-between"><Badge variant="outline">{item.type}</Badge><span className="text-xs text-muted-foreground">{formatDateTimeFr(item.timestamp)}</span></div><p className="mt-1 text-xs text-muted-foreground">{JSON.stringify(item.details || {})}</p></div>)}</CardContent></Card></TabsContent>
                <TabsContent value="tasks"><Card><CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Taches</CardTitle><div className="flex gap-2"><Input value={quickTaskTitle} onChange={(e) => setQuickTaskTitle(e.target.value)} placeholder="Titre tache" /><Button onClick={() => void createTask()} disabled={busy}><IconPlus className="h-4 w-4" />Creer</Button></div></CardHeader><CardContent className="space-y-2">{tasksLoading ? <Skeleton className="h-24 w-full" /> : null}{(tasks || []).map((item) => <div key={item.id} className="flex items-center justify-between rounded-lg border p-3"><div><p className="font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.status} | {item.priority}</p></div><span className="text-xs text-muted-foreground">{formatDateTimeFr(item.due_date || null)}</span></div>)}</CardContent></Card></TabsContent>
                <TabsContent value="opportunities"><Card><CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Opportunites</CardTitle><div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[1fr_110px_150px_auto]"><Input value={oppName} onChange={(e) => setOppName(e.target.value)} placeholder="Nom" /><Input type="number" min={0} value={oppAmount} onChange={(e) => setOppAmount(e.target.value)} placeholder="Montant" /><select title="Opportunity stage" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={oppStage} onChange={(e) => setOppStage(e.target.value)}>{STAGE_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select><Button onClick={() => void createOpportunity()} disabled={busy}><IconPlus className="h-4 w-4" />Ajouter</Button></div></CardHeader><CardContent className="space-y-2">{opportunitiesLoading ? <Skeleton className="h-24 w-full" /> : null}{(opportunities || []).map((item) => <div key={item.id} className="rounded-lg border p-3"><div className="flex items-center justify-between"><p className="font-medium">{item.name}</p><div className="flex gap-2"><Badge variant="outline">{item.stage}</Badge><Badge>{item.status}</Badge></div></div><p className="text-xs text-muted-foreground">Montant: {formatCurrencyFr(item.amount)} | Probabilite: {item.probability}% | Maj: {formatDateTimeFr(item.updated_at || null)}</p></div>)}</CardContent></Card></TabsContent>
                <TabsContent value="notes"><Card><CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Notes</CardTitle><Button variant="outline" onClick={() => { setNotes((current) => [...current, { id: newNoteId(), content: "", author: "admin" }]); setNotesDirty(true) }}><IconPlus className="h-4 w-4" />Nouvelle note</Button></CardHeader><CardContent className="space-y-2">{notesLoading ? <Skeleton className="h-24 w-full" /> : null}{notes.map((item) => <div key={item.id} className="rounded-lg border p-3"><textarea title="Note content" className="min-h-[92px] w-full rounded-md border border-input bg-background p-2 text-sm" value={item.content} onChange={(e) => { setNotes((current) => current.map((note) => note.id === item.id ? { ...note, content: e.target.value } : note)); setNotesDirty(true) }} /><div className="mt-2 flex items-center justify-between"><p className="text-xs text-muted-foreground">{item.author || "admin"} | {formatDateTimeFr(item.updated_at || item.created_at || null)}</p><Button variant="ghost" size="sm" onClick={() => { setNotes((current) => current.filter((note) => note.id !== item.id)); setNotesDirty(true) }}>Supprimer</Button></div></div>)}</CardContent></Card></TabsContent>
              </Tabs>
            </div>
            <div className="space-y-4">
              <Card><CardHeader><CardTitle>Workflow funnel</CardTitle><CardDescription>Transition, owner, handoff et SLA.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="rounded-lg border p-3 text-xs text-muted-foreground"><p>Stage courant: <span className="font-medium text-foreground">{normalizeCanonical(lead.stage_canonical)}</span></p><p>Owner: <span className="font-medium text-foreground">{ownerDisplayName}</span></p><p>SLA due: <span className="font-medium text-foreground">{formatDateTimeFr(lead.sla_due_at || null)}</span></p><p>Next action: <span className="font-medium text-foreground">{formatDateTimeFr(lead.next_action_at || null)}</span></p><p>Handoff: <span className="font-medium text-foreground">{lead.handoff_required ? "requis" : "non requis"}</span></p></div><div className="space-y-2"><p className="text-sm font-medium">Transition d&apos;etape</p><select title="Target stage" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={stageTarget} onChange={(e) => setStageTarget(e.target.value)}>{CANONICAL_STAGE_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select><Input placeholder="Raison (optionnel)" value={stageReason} onChange={(e) => setStageReason(e.target.value)} /><Button className="w-full" disabled={workflowBusy} onClick={() => void transitionLeadStage()}>{workflowBusy ? "Transition..." : "Transitionner"}</Button></div><div className="space-y-2"><p className="text-sm font-medium">Reassigner owner</p><select title="Lead owner" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)}><option value="">Selectionner un utilisateur</option>{activeUsers.map((user) => <option key={user.id} value={user.id}>{(user.display_name || "").trim() || user.email}</option>)}</select><Button className="w-full" variant="outline" disabled={workflowBusy || !ownerUserId} onClick={() => void reassignLeadOwner()}>{workflowBusy ? "Mise a jour..." : "Mettre a jour owner"}</Button></div><div className="space-y-2"><p className="text-sm font-medium">Handoff post-sale</p><Input placeholder="Note handoff (optionnel)" value={handoffNote} onChange={(e) => setHandoffNote(e.target.value)} /><Button className="w-full" variant="secondary" disabled={workflowBusy} onClick={() => void createHandoff()}>{workflowBusy ? "Creation..." : "Creer handoff"}</Button></div></CardContent></Card>
              <Card><CardHeader><CardTitle>Recommandations IA</CardTitle><CardDescription>Actions suggerees pour ce lead.</CardDescription></CardHeader><CardContent className="space-y-2">{recommendationsLoading ? <Skeleton className="h-24 w-full" /> : null}{!recommendationsLoading && leadRecommendations.length === 0 ? <p className="text-sm text-muted-foreground">Aucune recommandation en attente.</p> : null}{leadRecommendations.map((item) => <div key={item.id} className="rounded-lg border p-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{recommendationLabel(item)}</p><Badge variant="outline">P{item.priority}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{formatDateTimeFr(item.created_at || null)}</p><div className="mt-2 flex gap-2"><Button size="sm" onClick={() => void applyRecommendation(item.id)} disabled={recommendationBusyId === item.id}>{recommendationBusyId === item.id ? "..." : "Appliquer"}</Button><Button size="sm" variant="outline" onClick={() => void dismissRecommendation(item.id)} disabled={recommendationBusyId === item.id}>Ignorer</Button></div></div>)}</CardContent></Card>
              <Card><CardHeader><CardTitle>Actions rapides</CardTitle></CardHeader><CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="w-full justify-start h-9 px-2 text-xs" onClick={() => window.open(`https://wa.me/${lead.phone?.replace(/\D/g, "")}`, "_blank")} disabled={!lead.phone}>
                    <IconBrandWhatsapp className="mr-1.5 h-3.5 w-3.5 text-green-600" />
                    WhatsApp
                  </Button>
                  <Button variant="outline" className="w-full justify-start h-9 px-2 text-xs" onClick={() => (window.location.href = `tel:${lead.phone}`)} disabled={!lead.phone}>
                    <IconPhone className="mr-1.5 h-3.5 w-3.5 text-blue-600" />
                    Appeler
                  </Button>
                  <Button variant="outline" className="w-full justify-start h-9 px-2 text-xs" onClick={() => (window.location.href = `mailto:${lead.email}`)}>
                    <IconMail className="mr-1.5 h-3.5 w-3.5 text-orange-600" />
                    Email
                  </Button>
                  <Button variant="outline" className="w-full justify-start h-9 px-2 text-xs" onClick={() => lead.linkedin_url && window.open(lead.linkedin_url, "_blank")} disabled={!lead.linkedin_url}>
                    <IconBrandLinkedin className="mr-1.5 h-3.5 w-3.5 text-cyan-600" />
                    LinkedIn
                  </Button>
                </div>
                <div className="my-2 border-t border-muted" />
                <Button className="w-full justify-start" onClick={() => void createTask()} disabled={busy}><IconChecklist className="h-4 w-4" />Creer tache</Button><Button className="w-full justify-start" onClick={() => void createOpportunity(`Conversion - ${lead.first_name} ${lead.last_name}`)} disabled={busy}><IconTargetArrow className="h-4 w-4" />Convertir en opportunite</Button><select title="Selected campaign" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}><option value="">Choisir campagne</option>{(campaigns?.items || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><Button className="w-full justify-start" onClick={() => void addToCampaign()} disabled={busy}><IconRocket className="h-4 w-4" />Ajouter a campagne</Button></CardContent></Card>
              <Card><CardHeader><CardTitle>Sauvegarde</CardTitle></CardHeader><CardContent><p className="text-sm">Infos: <span className="font-medium">{saveState === "saving" ? "Sauvegarde..." : saveState === "saved" ? "Enregistre" : saveState === "error" ? "Erreur" : "En attente"}</span></p><p className="text-sm">Notes: <span className="font-medium">{notesDirty ? "Sauvegarde..." : "Enregistre"}</span></p></CardContent></Card>
              <Card><CardHeader><CardTitle>Historique des changements</CardTitle><CardDescription>Trace sur 30 jours</CardDescription></CardHeader><CardContent className="space-y-2">{historyLoading ? <Skeleton className="h-24 w-full" /> : null}{changeHistory.length === 0 ? <p className="text-sm text-muted-foreground">Aucun changement trace.</p> : null}{changeHistory.map((item) => <div key={item.id} className="rounded-lg border p-2"><p className="text-sm font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{formatDateTimeFr(item.timestamp)}</p>{item.description ? <p className="mt-1 text-xs text-muted-foreground">{item.description}</p> : null}</div>)}</CardContent></Card>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

