"use client"

import * as React from "react"
import useSWR from "swr"
import { DndContext, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"
import { IconGripVertical, IconLayoutKanban, IconListDetails, IconPlus } from "@tabler/icons-react"
import { toast } from "sonner"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SyncStatus } from "@/components/sync-status"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useLoadingTimeout } from "@/hooks/use-loading-timeout"
import { fetchApi, requestApi } from "@/lib/api"
import { formatCurrencyFr, formatDateFr, formatNumberFr } from "@/lib/format"

type Stage = "Prospect" | "Qualified" | "Proposed" | "Won" | "Lost"
type ViewMode = "kanban" | "table"
type EditField = "amount" | "probability" | "close_date"

type Opportunity = {
  id: string
  prospect_id: string
  prospect_name: string
  amount: number
  stage: Stage
  probability: number
  assigned_to: string
  close_date: string | null
  created_at: string | null
}
type OpportunitiesResponse = { page: number; page_size: number; total: number; items: Opportunity[] }
type Summary = {
  pipeline_value_total: number
  win_rate_percent: number
  avg_deal_size: number
  close_rate_percent: number
  forecast_monthly: Array<{ month: string; expected_revenue: number; weighted_revenue: number; count: number }>
}
type LeadsResponse = { items: Array<{ id: string; first_name?: string; last_name?: string; email: string }> }
type UsersResponse = { items: Array<{ id: string; email: string; display_name?: string | null }> }
type QuickLeadResponse = { created: boolean; lead: { id: string; name: string } }

const STAGES: Stage[] = ["Prospect", "Qualified", "Proposed", "Won", "Lost"]
const fetcher = <T,>(path: string) => fetchApi<T>(path)
const chartConfig = {
  weighted_revenue: { label: "Pondere", color: "var(--primary)" },
  expected_revenue: { label: "Brut", color: "hsl(var(--muted-foreground))" },
} satisfies ChartConfig

function toDateInput(value: string | null | undefined): string {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}
function toIsoDate(value: string): string | null {
  if (!value.trim()) return null
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
function overdue(item: Opportunity): boolean {
  if (!item.close_date) return false
  const ts = Date.parse(item.close_date)
  return Number.isFinite(ts) && ts < Date.now()
}

function DropCol({ stage, children }: { stage: Stage; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage:${stage}` })
  return <div ref={setNodeRef} className={`min-h-[12rem] rounded-xl border p-3 ${isOver ? "border-primary" : "border-border"}`}>{children}</div>
}
function DragCard({ item, children }: { item: Opportunity; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useDraggable({ id: item.id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={`rounded-lg border bg-background p-3 ${isDragging ? "opacity-60" : ""}`}>
      <div className="mb-2 flex items-center justify-between"><span className="truncate font-medium">{item.prospect_name}</span><button type="button" {...attributes} {...listeners}><IconGripVertical className="size-4 text-muted-foreground" /></button></div>
      {children}
    </div>
  )
}

export default function OpportunitiesPage() {
  const [view, setView] = React.useState<ViewMode>("kanban")
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null)
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [savingLead, setSavingLead] = React.useState(false)
  const [searchLead, setSearchLead] = React.useState("")
  const [searchLeadDebounced, setSearchLeadDebounced] = React.useState("")

  const [filters, setFilters] = React.useState({ status: "ALL", amountMin: "", amountMax: "", dateField: "close" as "close" | "created", dateFrom: "", dateTo: "", assignedTo: "ALL" })
  const [fDebounced, setFDebounced] = React.useState(filters)

  const [edit, setEdit] = React.useState<{ id: string; field: EditField } | null>(null)
  const [draft, setDraft] = React.useState("")

  const [form, setForm] = React.useState({ prospect_id: "", amount: "", stage: "Prospect" as Stage, probability: "30", close_date: "", assigned_to: "Vous" })
  const [quickLead, setQuickLead] = React.useState({ first_name: "", last_name: "", email: "", company_name: "" })

  React.useEffect(() => { const t = window.setTimeout(() => setFDebounced(filters), 300); return () => window.clearTimeout(t) }, [filters])
  React.useEffect(() => { const t = window.setTimeout(() => setSearchLeadDebounced(searchLead.trim()), 250); return () => window.clearTimeout(t) }, [searchLead])
  React.useEffect(() => { try { const v = window.localStorage.getItem("prospect:opportunities:view"); if (v === "kanban" || v === "table") setView(v) } catch {} }, [])
  React.useEffect(() => { try { window.localStorage.setItem("prospect:opportunities:view", view) } catch {} }, [view])

  const listPath = React.useMemo(() => {
    const p = new URLSearchParams()
    p.set("page", "1"); p.set("page_size", "300"); p.set("date_field", fDebounced.dateField); p.set("sort", "created_at"); p.set("order", "desc")
    if (fDebounced.status !== "ALL") p.set("status", fDebounced.status)
    if (fDebounced.amountMin.trim()) p.set("amount_min", fDebounced.amountMin.trim())
    if (fDebounced.amountMax.trim()) p.set("amount_max", fDebounced.amountMax.trim())
    if (fDebounced.dateFrom.trim()) p.set("date_from", fDebounced.dateFrom.trim())
    if (fDebounced.dateTo.trim()) p.set("date_to", fDebounced.dateTo.trim())
    if (fDebounced.assignedTo !== "ALL") p.set("assigned_to", fDebounced.assignedTo)
    return `/api/v1/admin/opportunities?${p.toString()}`
  }, [fDebounced])
  const sumPath = React.useMemo(() => listPath.replace("/api/v1/admin/opportunities?", "/api/v1/admin/opportunities/summary?"), [listPath])
  const leadsPath = React.useMemo(() => `/api/v1/admin/leads?page=1&page_size=25&q=${encodeURIComponent(searchLeadDebounced)}&sort=created_at&order=desc`, [searchLeadDebounced])

  const { data, error, isLoading, mutate } = useSWR<OpportunitiesResponse>(listPath, fetcher)
  const { data: summaryData, error: summaryError, mutate: mutateSummary } = useSWR<Summary>(sumPath, fetcher)
  const { data: leadsData, mutate: mutateLeads } = useSWR<LeadsResponse>(open ? leadsPath : null, fetcher)
  const { data: usersData } = useSWR<UsersResponse>("/api/v1/admin/users", fetcher)
  const timeout = useLoadingTimeout(isLoading, 12_000)

  React.useEffect(() => { if (data) setUpdatedAt(new Date()) }, [data])

  const rows = React.useMemo(() => data?.items ?? [], [data])
  const filtered = React.useMemo(() => {
    const min = filters.amountMin.trim() ? Number(filters.amountMin) : null
    const max = filters.amountMax.trim() ? Number(filters.amountMax) : null
    const from = filters.dateFrom.trim() ? Date.parse(filters.dateFrom) : Number.NaN
    const toRaw = filters.dateTo.trim() ? Date.parse(filters.dateTo) : Number.NaN
    const to = Number.isFinite(toRaw) ? toRaw + 86399999 : Number.NaN
    return rows.filter((r) => {
      if (filters.status !== "ALL" && r.stage !== filters.status) return false
      if (filters.assignedTo !== "ALL" && r.assigned_to !== filters.assignedTo) return false
      if (min !== null && Number.isFinite(min) && r.amount < min) return false
      if (max !== null && Number.isFinite(max) && r.amount > max) return false
      const dRaw = filters.dateField === "close" ? r.close_date : r.created_at
      const d = dRaw ? Date.parse(dRaw) : Number.NaN
      if (Number.isFinite(from) && (!Number.isFinite(d) || d < from)) return false
      if (Number.isFinite(to) && (!Number.isFinite(d) || d > to)) return false
      return true
    })
  }, [filters, rows])

  const byStage = React.useMemo(() => {
    const grouped: Record<Stage, Opportunity[]> = { Prospect: [], Qualified: [], Proposed: [], Won: [], Lost: [] }
    for (const row of filtered) grouped[row.stage].push(row)
    return grouped
  }, [filtered])

  const summary = summaryData || { pipeline_value_total: filtered.reduce((a, b) => a + b.amount, 0), win_rate_percent: 0, avg_deal_size: 0, close_rate_percent: 0, forecast_monthly: [] }
  const assigned = React.useMemo(() => {
    const s = new Set<string>()
    for (const row of rows) s.add(row.assigned_to)
    for (const u of usersData?.items || []) s.add((u.display_name || "").trim() || u.email)
    return Array.from(s).filter(Boolean).sort((a, b) => a.localeCompare(b, "fr"))
  }, [rows, usersData?.items])

  const sensors = useSensors(useSensor(MouseSensor), useSensor(TouchSensor))

  async function patch(id: string, payload: Record<string, unknown>, optimistic: Partial<Opportunity>) {
    const snap = data
    mutate((cur) => cur ? { ...cur, items: cur.items.map((r) => r.id === id ? { ...r, ...optimistic } : r) } : cur, false)
    try {
      const updated = await requestApi<Opportunity>(`/api/v1/admin/opportunities/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      mutate((cur) => cur ? { ...cur, items: cur.items.map((r) => r.id === id ? updated : r) } : cur, false)
      await mutateSummary()
    } catch (e) {
      mutate(snap, false)
      toast.error(e instanceof Error ? e.message : "Mise a jour impossible")
    }
  }

  async function drop(event: DragEndEvent) {
    if (!event.over) return
    const active = rows.find((r) => r.id === String(event.active.id)); if (!active) return
    const overId = String(event.over.id)
    const next = overId.startsWith("stage:") ? (overId.slice(6) as Stage) : rows.find((r) => r.id === overId)?.stage
    if (!next || next === active.stage) return
    await patch(active.id, { stage: next }, { stage: next })
  }

  function startInline(row: Opportunity, field: EditField) {
    setEdit({ id: row.id, field })
    if (field === "amount") setDraft(String(row.amount))
    if (field === "probability") setDraft(String(row.probability))
    if (field === "close_date") setDraft(toDateInput(row.close_date))
  }

  async function commitInline() {
    if (!edit) return
    const { id, field } = edit
    if (field === "amount") {
      const v = Number(draft); if (!Number.isFinite(v) || v < 0) return toast.error("Montant invalide.")
      setEdit(null); setDraft(""); return patch(id, { amount: v }, { amount: v })
    }
    if (field === "probability") {
      const v = Number(draft); if (!Number.isFinite(v) || v < 0 || v > 100) return toast.error("Probabilite invalide.")
      const n = Math.round(v); setEdit(null); setDraft(""); return patch(id, { probability: n }, { probability: n })
    }
    const v = toIsoDate(draft); if (draft.trim() && !v) return toast.error("Date invalide.")
    setEdit(null); setDraft(""); return patch(id, { close_date: v }, { close_date: v })
  }

  const inline = (row: Opportunity, field: EditField) => {
    const active = edit?.id === row.id && edit.field === field
    if (active) return <Input autoFocus type={field === "close_date" ? "date" : "number"} value={draft} min={field === "amount" ? 0 : 0} max={field === "probability" ? 100 : undefined} onChange={(e) => setDraft(e.target.value)} onBlur={() => void commitInline()} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void commitInline() } if (e.key === "Escape") { e.preventDefault(); setEdit(null); setDraft("") } }} className="h-8" />
    const label = field === "amount" ? formatCurrencyFr(row.amount) : field === "probability" ? `${formatNumberFr(row.probability)}%` : formatDateFr(row.close_date)
    return <button type="button" className="text-left hover:text-primary" onDoubleClick={() => startInline(row, field)}>{label}</button>
  }

  async function create() {
    const amount = Number(form.amount), prob = Number(form.probability)
    if (!form.prospect_id.trim()) return toast.error("Selectionnez un prospect.")
    if (!Number.isFinite(amount) || amount < 0) return toast.error("Montant invalide.")
    if (!Number.isFinite(prob) || prob < 0 || prob > 100) return toast.error("Probabilite invalide.")
    try {
      setSaving(true)
      await requestApi("/api/v1/admin/opportunities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prospect_id: form.prospect_id, amount, stage: form.stage, probability: Math.round(prob), close_date: toIsoDate(form.close_date), assigned_to: form.assigned_to.trim() || "Vous" }) })
      toast.success("Opportunite creee.")
      setOpen(false)
      setForm({ prospect_id: "", amount: "", stage: "Prospect", probability: "30", close_date: "", assigned_to: "Vous" })
      await mutate(); await mutateSummary()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Creation impossible")
    } finally { setSaving(false) }
  }

  async function createLead() {
    if (!quickLead.first_name.trim() || !quickLead.last_name.trim() || !quickLead.email.trim() || !quickLead.company_name.trim()) return toast.error("Champs prospect requis.")
    try {
      setSavingLead(true)
      const res = await requestApi<QuickLeadResponse>("/api/v1/admin/opportunities/quick-lead", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(quickLead) })
      if (!res.lead?.id) return toast.error("Creation prospect impossible.")
      setForm((c) => ({ ...c, prospect_id: res.lead.id }))
      setSearchLead(res.lead.name)
      toast.success(res.created ? "Prospect cree." : "Prospect existant.")
      await mutateLeads()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Creation prospect impossible")
    } finally { setSavingLead(false) }
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": "calc(var(--spacing) * 72)", "--header-height": "calc(var(--spacing) * 12)" } as React.CSSProperties}>
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 md:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-3xl font-bold tracking-tight">Opportunites</h2>
            <div className="flex flex-wrap gap-2">
              <Button variant={view === "kanban" ? "default" : "outline"} onClick={() => setView("kanban")}><IconLayoutKanban className="size-4" />Kanban</Button>
              <Button variant={view === "table" ? "default" : "outline"} onClick={() => setView("table")}><IconListDetails className="size-4" />Table</Button>
              <Button onClick={() => setOpen(true)}><IconPlus className="size-4" />Creer opportunite</Button>
            </div>
          </div>

          <SyncStatus updatedAt={updatedAt} onRefresh={() => { void mutate(); void mutateSummary() }} />

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Card><CardHeader className="pb-2"><CardDescription>Pipeline value total</CardDescription><CardTitle>{formatCurrencyFr(summary.pipeline_value_total)}</CardTitle></CardHeader></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Win rate</CardDescription><CardTitle>{summary.win_rate_percent.toFixed(1)}%</CardTitle></CardHeader></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Avg deal size</CardDescription><CardTitle>{formatCurrencyFr(summary.avg_deal_size)}</CardTitle></CardHeader></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Close rate</CardDescription><CardTitle>{summary.close_rate_percent.toFixed(1)}%</CardTitle></CardHeader></Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Filtres</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={filters.status} onValueChange={(value) => setFilters((c) => ({ ...c, status: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="ALL">Tous</SelectItem>{STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Amount min</Label><Input type="number" min={0} value={filters.amountMin} onChange={(e) => setFilters((c) => ({ ...c, amountMin: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Amount max</Label><Input type="number" min={0} value={filters.amountMax} onChange={(e) => setFilters((c) => ({ ...c, amountMax: e.target.value }))} /></div>
              <div className="space-y-1">
                <Label>Date field</Label>
                <Select value={filters.dateField} onValueChange={(value) => setFilters((c) => ({ ...c, dateField: value as "close" | "created" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="close">Close date</SelectItem><SelectItem value="created">Created date</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Date from</Label><Input type="date" value={filters.dateFrom} onChange={(e) => setFilters((c) => ({ ...c, dateFrom: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Date to</Label><Input type="date" value={filters.dateTo} onChange={(e) => setFilters((c) => ({ ...c, dateTo: e.target.value }))} /></div>
              <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                <Label>Assigned user</Label>
                <Select value={filters.assignedTo} onValueChange={(value) => setFilters((c) => ({ ...c, assignedTo: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="ALL">Tous</SelectItem>{assigned.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Revenue forecast</CardTitle><CardDescription>Projections par mois basees sur probabilities.</CardDescription></CardHeader>
            <CardContent>
              {summary.forecast_monthly.length === 0 ? (
                <div className="flex h-52 items-center justify-center rounded border border-dashed text-sm text-muted-foreground">Aucun forecast disponible.</div>
              ) : (
                <ChartContainer config={chartConfig} className="h-52 w-full">
                  <AreaChart data={summary.forecast_monthly}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tickFormatter={(value) => new Date(`${value}-01`).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
                    <Area dataKey="expected_revenue" type="monotone" stroke="var(--color-expected_revenue)" fill="var(--color-expected_revenue)" fillOpacity={0.1} />
                    <Area dataKey="weighted_revenue" type="monotone" stroke="var(--color-weighted_revenue)" fill="var(--color-weighted_revenue)" fillOpacity={0.25} />
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          {isLoading && !timeout ? <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div> : null}
          {!isLoading && (error || summaryError || timeout) ? (
            <ErrorState title="Impossible de charger les opportunites." description={timeout ? "Le chargement est trop long." : error instanceof Error ? error.message : summaryError instanceof Error ? summaryError.message : "Erreur inconnue."} onRetry={() => { void mutate(); void mutateSummary() }} />
          ) : null}
          {!isLoading && !error && !timeout && filtered.length === 0 ? <EmptyState title="Aucune opportunite" description="Ajustez les filtres ou creez une opportunite." /> : null}

          {!isLoading && !error && !timeout && filtered.length > 0 ? (
            view === "kanban" ? (
              <DndContext sensors={sensors} onDragEnd={(event) => void drop(event)}>
                <div className="grid gap-4 xl:grid-cols-5">
                  {STAGES.map((stage) => (
                    <div key={stage} className="space-y-2">
                      <div className="flex items-center justify-between"><h3 className="font-semibold">{stage}</h3><Badge variant="outline">{byStage[stage].length}</Badge></div>
                      <DropCol stage={stage}>
                        <div className="space-y-3">
                          {byStage[stage].map((row) => (
                            <DragCard key={row.id} item={row}>
                              <div className="space-y-1 text-sm">
                                <div className="flex items-center justify-between"><span className="text-muted-foreground">Deal value</span>{inline(row, "amount")}</div>
                                <div className="flex items-center justify-between"><span className="text-muted-foreground">Probability</span>{inline(row, "probability")}</div>
                                <div className="flex items-center justify-between"><span className="text-muted-foreground">Close date</span>{inline(row, "close_date")}</div>
                                <div className="flex items-center justify-between"><span className="text-muted-foreground">Assigned to</span><span>{row.assigned_to}</span></div>
                                {overdue(row) ? <div className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700">Retard close date</div> : null}
                              </div>
                            </DragCard>
                          ))}
                        </div>
                      </DropCol>
                    </div>
                  ))}
                </div>
              </DndContext>
            ) : (
              <div className="rounded-xl border">
                <Table>
                  <TableHeader><TableRow><TableHead>Prospect</TableHead><TableHead>Stage</TableHead><TableHead>Deal value</TableHead><TableHead>Probability</TableHead><TableHead>Close date</TableHead><TableHead>Assigned to</TableHead><TableHead>Alerte</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {filtered.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.prospect_name}</TableCell>
                        <TableCell><Badge variant="outline">{row.stage}</Badge></TableCell>
                        <TableCell>{inline(row, "amount")}</TableCell>
                        <TableCell>{inline(row, "probability")}</TableCell>
                        <TableCell>{inline(row, "close_date")}</TableCell>
                        <TableCell>{row.assigned_to}</TableCell>
                        <TableCell>{overdue(row) ? <span className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700">Retard</span> : <span className="text-xs text-muted-foreground">OK</span>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          ) : null}
        </div>
      </SidebarInset>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader><SheetTitle>Creer opportunite</SheetTitle><SheetDescription>prospect_id, amount, stage, probability, close_date</SheetDescription></SheetHeader>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>Prospect</Label>
              <Input value={searchLead} onChange={(e) => setSearchLead(e.target.value)} placeholder="Rechercher prospect" />
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border p-2">
                {(leadsData?.items || []).map((lead) => {
                  const label = `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || lead.email
                  return <button key={lead.id} type="button" className={`block w-full rounded px-2 py-1 text-left text-sm hover:bg-muted ${form.prospect_id === lead.id ? "bg-muted" : ""}`} onClick={() => { setForm((c) => ({ ...c, prospect_id: lead.id })); setSearchLead(label) }}>{label}</button>
                })}
              </div>
              <p className="text-xs text-muted-foreground">prospect_id: {form.prospect_id || "-"}</p>
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-sm font-medium">Creation prospect rapide</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input placeholder="Prenom" value={quickLead.first_name} onChange={(e) => setQuickLead((c) => ({ ...c, first_name: e.target.value }))} />
                <Input placeholder="Nom" value={quickLead.last_name} onChange={(e) => setQuickLead((c) => ({ ...c, last_name: e.target.value }))} />
              </div>
              <Input placeholder="Email" type="email" value={quickLead.email} onChange={(e) => setQuickLead((c) => ({ ...c, email: e.target.value }))} />
              <Input placeholder="Societe" value={quickLead.company_name} onChange={(e) => setQuickLead((c) => ({ ...c, company_name: e.target.value }))} />
              <Button type="button" variant="outline" onClick={() => void createLead()} disabled={savingLead}>{savingLead ? "Creation..." : "Creer prospect"}</Button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label>Amount</Label><Input type="number" min={0} value={form.amount} onChange={(e) => setForm((c) => ({ ...c, amount: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Stage</Label><Select value={form.stage} onValueChange={(v) => setForm((c) => ({ ...c, stage: v as Stage }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label>Probability %</Label><Input type="number" min={0} max={100} value={form.probability} onChange={(e) => setForm((c) => ({ ...c, probability: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Close date</Label><Input type="date" value={form.close_date} onChange={(e) => setForm((c) => ({ ...c, close_date: e.target.value }))} /></div>
            </div>
            <div className="space-y-1"><Label>Assigned to</Label><Input value={form.assigned_to} onChange={(e) => setForm((c) => ({ ...c, assigned_to: e.target.value }))} /></div>
          </div>
          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={() => void create()} disabled={saving}>{saving ? "Creation..." : "Creer opportunite"}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  )
}
