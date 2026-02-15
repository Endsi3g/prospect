"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import useSWR from "swr"
import { IconArrowLeft, IconChecklist, IconPlus, IconRocket, IconTargetArrow } from "@tabler/icons-react"
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

const STATUS_OPTIONS = ["NEW", "ENRICHED", "SCORED", "CONTACTED", "INTERESTED", "CONVERTED", "LOST", "DISQUALIFIED"]
const STAGE_OPTIONS = ["qualification", "discovery", "proposal", "negotiation", "won", "lost"]
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

  const [draft, setDraft] = React.useState<LeadDraft | null>(null)
  const dirtyRef = React.useRef<Set<keyof LeadDraft>>(new Set())
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saveState, setSaveState] = React.useState("idle")

  const [quickTaskTitle, setQuickTaskTitle] = React.useState("")
  const [oppName, setOppName] = React.useState("")
  const [oppAmount, setOppAmount] = React.useState("")
  const [oppStage, setOppStage] = React.useState("qualification")
  const [campaignId, setCampaignId] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const [notes, setNotes] = React.useState<Note[]>([])
  const [notesDirty, setNotesDirty] = React.useState(false)
  const notesTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => { if (lead && dirtyRef.current.size === 0) setDraft(toDraft(lead)) }, [lead])
  React.useEffect(() => { if (!notesDirty) setNotes(notesData?.items || []) }, [notesData, notesDirty])
  React.useEffect(() => {
    if (!campaignId && campaigns?.items?.length) setCampaignId(campaigns.items.find((item) => item.status === "active")?.id || campaigns.items[0].id)
  }, [campaigns, campaignId])

  const saveLead = React.useCallback(async () => {
    if (!draft || !id || dirtyRef.current.size === 0) return
    if (!draft.first_name.trim() || !draft.last_name.trim() || !draft.company_name.trim()) { setSaveState("error"); return }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.email.trim())) { setSaveState("error"); return }
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
    if (!draft || dirtyRef.current.size === 0) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void saveLead(), 850)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [draft, saveLead])

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

  if (leadLoading || !draft) return <div className="p-8"><Skeleton className="h-48 w-full" /></div>
  if (leadError || !lead) return <div className="p-8"><Button onClick={() => router.push("/leads")}>Retour</Button></div>

  const changeHistory = (history?.items || []).filter((item) => item.id.startsWith("audit-")).slice(0, 12)

  return (
    <SidebarProvider style={{ "--sidebar-width": "calc(var(--spacing) * 72)", "--header-height": "calc(var(--spacing) * 12)" } as React.CSSProperties}>
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <nav className="mt-2 flex items-center text-sm text-muted-foreground"><Link href="/leads">Leads</Link><span className="mx-2">/</span><span>{lead.first_name} {lead.last_name}</span></nav>
          <div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={() => router.push("/leads")}><IconArrowLeft className="h-5 w-5" /></Button><h1 className="text-2xl font-bold">{lead.first_name} {lead.last_name}</h1><div className="ml-auto flex gap-2"><Badge variant="outline">{lead.status}</Badge><Badge>{lead.score.tier}</Badge><Badge variant="secondary">Score {Math.round(lead.total_score)}</Badge></div></div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <Tabs defaultValue="infos" className="space-y-4">
                <TabsList className="flex w-full flex-wrap justify-start"><TabsTrigger value="infos">Infos</TabsTrigger><TabsTrigger value="interactions">Interactions timeline</TabsTrigger><TabsTrigger value="tasks">Taches</TabsTrigger><TabsTrigger value="opportunities">Opportunites</TabsTrigger><TabsTrigger value="notes">Notes</TabsTrigger></TabsList>
                <TabsContent value="infos"><Card><CardHeader><CardTitle>Infos lead</CardTitle><CardDescription>Edition inline + autosave</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2"><Input value={draft.first_name} onChange={(e) => onField("first_name", e.target.value)} onBlur={() => void saveLead()} /><Input value={draft.last_name} onChange={(e) => onField("last_name", e.target.value)} onBlur={() => void saveLead()} /><Input value={draft.email} onChange={(e) => onField("email", e.target.value)} onBlur={() => void saveLead()} /><Input value={draft.phone} onChange={(e) => onField("phone", e.target.value)} onBlur={() => void saveLead()} /><Input value={draft.title} onChange={(e) => onField("title", e.target.value)} onBlur={() => void saveLead()} /><Input value={draft.linkedin_url} onChange={(e) => onField("linkedin_url", e.target.value)} onBlur={() => void saveLead()} /><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={draft.status} onChange={(e) => onField("status", e.target.value)} onBlur={() => void saveLead()}>{STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select><Input value={draft.segment} onChange={(e) => onField("segment", e.target.value)} onBlur={() => void saveLead()} /><Input value={draft.company_name} onChange={(e) => onField("company_name", e.target.value)} onBlur={() => void saveLead()} /><Input value={draft.company_domain} onChange={(e) => onField("company_domain", e.target.value)} onBlur={() => void saveLead()} /><Input value={draft.company_industry} onChange={(e) => onField("company_industry", e.target.value)} onBlur={() => void saveLead()} /><Input value={draft.company_location} onChange={(e) => onField("company_location", e.target.value)} onBlur={() => void saveLead()} /><Input className="md:col-span-2" value={draft.tags_text} onChange={(e) => onField("tags_text", e.target.value)} onBlur={() => void saveLead()} /></CardContent></Card></TabsContent>
                <TabsContent value="interactions"><Card><CardHeader><CardTitle>Timeline interactions</CardTitle></CardHeader><CardContent className="space-y-2">{interactionsLoading ? <Skeleton className="h-24 w-full" /> : null}{(interactions || []).length === 0 ? <p className="text-sm text-muted-foreground">Aucune interaction.</p> : null}{(interactions || []).map((item) => <div key={item.id} className="rounded-lg border p-3"><div className="flex items-center justify-between"><Badge variant="outline">{item.type}</Badge><span className="text-xs text-muted-foreground">{formatDateTimeFr(item.timestamp)}</span></div><p className="mt-1 text-xs text-muted-foreground">{JSON.stringify(item.details || {})}</p></div>)}</CardContent></Card></TabsContent>
                <TabsContent value="tasks"><Card><CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Taches</CardTitle><div className="flex gap-2"><Input value={quickTaskTitle} onChange={(e) => setQuickTaskTitle(e.target.value)} placeholder="Titre tache" /><Button onClick={() => void createTask()} disabled={busy}><IconPlus className="h-4 w-4" />Creer</Button></div></CardHeader><CardContent className="space-y-2">{tasksLoading ? <Skeleton className="h-24 w-full" /> : null}{(tasks || []).map((item) => <div key={item.id} className="flex items-center justify-between rounded-lg border p-3"><div><p className="font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.status} | {item.priority}</p></div><span className="text-xs text-muted-foreground">{formatDateTimeFr(item.due_date || null)}</span></div>)}</CardContent></Card></TabsContent>
                <TabsContent value="opportunities"><Card><CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Opportunites</CardTitle><div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[1fr_110px_150px_auto]"><Input value={oppName} onChange={(e) => setOppName(e.target.value)} placeholder="Nom" /><Input type="number" min={0} value={oppAmount} onChange={(e) => setOppAmount(e.target.value)} placeholder="Montant" /><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={oppStage} onChange={(e) => setOppStage(e.target.value)}>{STAGE_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select><Button onClick={() => void createOpportunity()} disabled={busy}><IconPlus className="h-4 w-4" />Ajouter</Button></div></CardHeader><CardContent className="space-y-2">{opportunitiesLoading ? <Skeleton className="h-24 w-full" /> : null}{(opportunities || []).map((item) => <div key={item.id} className="rounded-lg border p-3"><div className="flex items-center justify-between"><p className="font-medium">{item.name}</p><div className="flex gap-2"><Badge variant="outline">{item.stage}</Badge><Badge>{item.status}</Badge></div></div><p className="text-xs text-muted-foreground">Montant: {formatCurrencyFr(item.amount)} | Probabilite: {item.probability}% | Maj: {formatDateTimeFr(item.updated_at || null)}</p></div>)}</CardContent></Card></TabsContent>
                <TabsContent value="notes"><Card><CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>Notes</CardTitle><Button variant="outline" onClick={() => { setNotes((current) => [...current, { id: newNoteId(), content: "", author: "admin" }]); setNotesDirty(true) }}><IconPlus className="h-4 w-4" />Nouvelle note</Button></CardHeader><CardContent className="space-y-2">{notesLoading ? <Skeleton className="h-24 w-full" /> : null}{notes.map((item) => <div key={item.id} className="rounded-lg border p-3"><textarea className="min-h-[92px] w-full rounded-md border border-input bg-background p-2 text-sm" value={item.content} onChange={(e) => { setNotes((current) => current.map((note) => note.id === item.id ? { ...note, content: e.target.value } : note)); setNotesDirty(true) }} /><div className="mt-2 flex items-center justify-between"><p className="text-xs text-muted-foreground">{item.author || "admin"} | {formatDateTimeFr(item.updated_at || item.created_at || null)}</p><Button variant="ghost" size="sm" onClick={() => { setNotes((current) => current.filter((note) => note.id !== item.id)); setNotesDirty(true) }}>Supprimer</Button></div></div>)}</CardContent></Card></TabsContent>
              </Tabs>
            </div>
            <div className="space-y-4">
              <Card><CardHeader><CardTitle>Actions rapides</CardTitle></CardHeader><CardContent className="space-y-2"><Button className="w-full justify-start" onClick={() => void createTask()} disabled={busy}><IconChecklist className="h-4 w-4" />Creer tache</Button><Button className="w-full justify-start" onClick={() => void createOpportunity(`Conversion - ${lead.first_name} ${lead.last_name}`)} disabled={busy}><IconTargetArrow className="h-4 w-4" />Convertir en opportunite</Button><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}><option value="">Choisir campagne</option>{(campaigns?.items || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><Button className="w-full justify-start" onClick={() => void addToCampaign()} disabled={busy}><IconRocket className="h-4 w-4" />Ajouter a campagne</Button></CardContent></Card>
              <Card><CardHeader><CardTitle>Sauvegarde</CardTitle></CardHeader><CardContent><p className="text-sm">Infos: <span className="font-medium">{saveState === "saving" ? "Sauvegarde..." : saveState === "saved" ? "Enregistre" : saveState === "error" ? "Erreur" : "En attente"}</span></p><p className="text-sm">Notes: <span className="font-medium">{notesDirty ? "Sauvegarde..." : "Enregistre"}</span></p></CardContent></Card>
              <Card><CardHeader><CardTitle>Historique des changements</CardTitle><CardDescription>Trace sur 30 jours</CardDescription></CardHeader><CardContent className="space-y-2">{historyLoading ? <Skeleton className="h-24 w-full" /> : null}{changeHistory.length === 0 ? <p className="text-sm text-muted-foreground">Aucun changement trace.</p> : null}{changeHistory.map((item) => <div key={item.id} className="rounded-lg border p-2"><p className="text-sm font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{formatDateTimeFr(item.timestamp)}</p>{item.description ? <p className="mt-1 text-xs text-muted-foreground">{item.description}</p> : null}</div>)}</CardContent></Card>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
