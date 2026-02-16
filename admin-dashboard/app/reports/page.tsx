"use client"

import * as React from "react"
import useSWR from "swr"
import {
  IconCalendarStats,
  IconClockPlay,
  IconFileDownload,
  IconTrash,
  IconTimeline,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { AppSidebar } from "@/components/app-sidebar"
import { ExportCsvButton } from "@/components/export-csv-button"
import { SiteHeader } from "@/components/site-header"
import { SyncStatus } from "@/components/sync-status"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { useLoadingTimeout } from "@/hooks/use-loading-timeout"
import { fetchApi, requestApi, requestApiBlob } from "@/lib/api"
import { formatDateFr, formatDateTimeFr, formatNumberFr } from "@/lib/format"

type ReportSchedule = {
  id: string
  name: string
  frequency: "daily" | "weekly" | "monthly"
  timezone: string
  hour_local: number
  minute_local: number
  format: "pdf" | "csv"
  recipients: string[]
  enabled: boolean
  last_run_at?: string | null
  next_run_at?: string | null
}

type ReportSchedulesPayload = {
  items: ReportSchedule[]
}

type ReportRun = {
  id: string
  schedule_id?: string | null
  status: string
  output_format: string
  recipient_count: number
  started_at?: string | null
  finished_at?: string | null
  message?: string
}

type ReportRunsPayload = {
  items: ReportRun[]
}

type Report30dPayload = {
  window: {
    label: string
    days: number
    from: string
    to: string
  }
  kpis: {
    leads_created_total: number
    leads_scored_total: number
    leads_contacted_total: number
    leads_closed_total: number
    tasks_created_total: number
    tasks_completed_total: number
    task_completion_rate: number
  }
  daily_trend: Array<{
    date: string
    created: number
    scored: number
    contacted: number
    closed: number
    tasks_created: number
    tasks_completed: number
  }>
  timeline_items: Array<{
    id: string
    event_type: string
    timestamp: string
    title: string
    description: string
    channel?: string
  }>
  channel_breakdown: Array<{
    channel: string
    count: number
    completed: number
  }>
  quality_flags: {
    stale_unscored_leads: number
    unassigned_tasks: number
  }
}

const fetcher = <T,>(path: string) => fetchApi<T>(path)

function channelLabel(channel: string): string {
  if (channel === "email") return "Email"
  if (channel === "linkedin") return "LinkedIn"
  if (channel === "call") return "Appel"
  return channel
}

export default function ReportsPage() {
  const [period, setPeriod] = React.useState("30d")
  const [dashboard, setDashboard] = React.useState("operations")

  const { data: report30d, error, isLoading, mutate } = useSWR<Report30dPayload>(
    `/api/v1/admin/reports/30d?window=${encodeURIComponent(period)}`,
    fetcher,
  )
  const { data: schedulesData, mutate: mutateSchedules } = useSWR<ReportSchedulesPayload>(
    "/api/v1/admin/reports/schedules",
    fetcher,
  )
  const { data: runsData, mutate: mutateRuns } = useSWR<ReportRunsPayload>(
    "/api/v1/admin/reports/schedules/runs?limit=20",
    fetcher,
  )
  const loadingTimedOut = useLoadingTimeout(isLoading, 12_000)
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null)

  const [isExportingPdf, setIsExportingPdf] = React.useState(false)
  const [creatingSchedule, setCreatingSchedule] = React.useState(false)
  const [runningDueSchedules, setRunningDueSchedules] = React.useState(false)
  const [scheduleForm, setScheduleForm] = React.useState({
    name: "",
    frequency: "weekly",
    format: "pdf",
    timezone: "Europe/Paris",
    hour_local: "09",
    minute_local: "00",
    recipients: "",
  })

  React.useEffect(() => {
    if (!report30d) return
    setUpdatedAt(new Date())
  }, [report30d])

  async function exportPdf() {
    try {
      setIsExportingPdf(true)
      const params = new URLSearchParams({
        period,
        dashboard,
      })
      const blob = await requestApiBlob(`/api/v1/admin/reports/export/pdf?${params.toString()}`)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `reports-${dashboard}-${period}.pdf`
      link.click()
      window.URL.revokeObjectURL(url)
      toast.success("Export PDF termine.")
    } catch (downloadError) {
      toast.error(downloadError instanceof Error ? downloadError.message : "Echec de l'export PDF")
    } finally {
      setIsExportingPdf(false)
    }
  }

  async function createSchedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      setCreatingSchedule(true)
      await requestApi("/api/v1/admin/reports/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: scheduleForm.name,
          frequency: scheduleForm.frequency,
          format: scheduleForm.format,
          timezone: scheduleForm.timezone,
          hour_local: Number(scheduleForm.hour_local),
          minute_local: Number(scheduleForm.minute_local),
          recipients: scheduleForm.recipients
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          filters: { period, dashboard },
          enabled: true,
        }),
      })
      toast.success("Planification creee.")
      setScheduleForm({
        name: "",
        frequency: "weekly",
        format: "pdf",
        timezone: "Europe/Paris",
        hour_local: "09",
        minute_local: "00",
        recipients: "",
      })
      await mutateSchedules()
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : "Creation impossible")
    } finally {
      setCreatingSchedule(false)
    }
  }

  async function runDueSchedules() {
    try {
      setRunningDueSchedules(true)
      const result = await requestApi<{ executed: number }>("/api/v1/admin/reports/schedules/run-due", {
        method: "POST",
      })
      toast.success(`Execution terminee (${result.executed} planification(s)).`)
      await mutateSchedules()
      await mutateRuns()
      await mutate()
    } catch (runError) {
      toast.error(runError instanceof Error ? runError.message : "Execution impossible")
    } finally {
      setRunningDueSchedules(false)
    }
  }

  async function deleteSchedule(scheduleId: string) {
    try {
      await requestApi(`/api/v1/admin/reports/schedules/${scheduleId}`, {
        method: "DELETE",
      })
      toast.success("Planification supprimee.")
      await mutateSchedules()
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "Suppression impossible")
    }
  }

  const trendTail = React.useMemo(() => (report30d?.daily_trend || []).slice(-12).reverse(), [report30d?.daily_trend])

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col gap-4 p-3 pt-0 sm:p-4 sm:pt-0 lg:p-6">
          <SyncStatus updatedAt={updatedAt} onRefresh={() => void mutate()} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <h2 className="text-3xl font-bold tracking-tight">Rapports</h2>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <ExportCsvButton entity="leads" label="Export leads" />
              <ExportCsvButton entity="tasks" label="Export taches" />
              <ExportCsvButton entity="projects" label="Export projets" />
              <ExportCsvButton entity="systems" label="Export systemes" />
              <Button variant="outline" onClick={() => void exportPdf()} disabled={isExportingPdf}>
                <IconFileDownload className="size-4" />
                {isExportingPdf ? "Export..." : "Export PDF"}
              </Button>
            </div>
          </div>

          {isLoading && !loadingTimedOut ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : null}
          {!isLoading && (error || loadingTimedOut) ? (
            <ErrorState
              title="Impossible de charger les indicateurs 30 jours."
              description={
                loadingTimedOut
                  ? "Le chargement depasse le delai attendu. Verifiez la connectivite API puis reessayez."
                  : error instanceof Error
                    ? error.message
                    : "Les indicateurs 30 jours sont temporairement indisponibles."
              }
              secondaryLabel="Verifier les integrations"
              secondaryHref="/systems"
              onRetry={() => void mutate()}
            />
          ) : null}
          {!isLoading && !error && !loadingTimedOut && report30d && report30d.kpis.leads_created_total === 0 ? (
            <EmptyState
              title="Aucune donnee disponible"
              description="Ajoutez vos premiers leads pour activer les rapports et exports."
            />
          ) : null}
          {!isLoading && !error && !loadingTimedOut && report30d && report30d.kpis.leads_created_total > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Leads sourcees</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">
                  {formatNumberFr(report30d.kpis.leads_created_total)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Leads scorees</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">
                  {formatNumberFr(report30d.kpis.leads_scored_total)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Leads contactees</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">
                  {formatNumberFr(report30d.kpis.leads_contacted_total)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Taches completees</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">
                  {formatNumberFr(report30d.kpis.tasks_completed_total)}
                </CardContent>
              </Card>
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Dashboard avance 30 jours</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Periode</Label>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7d">7 jours</SelectItem>
                    <SelectItem value="30d">30 jours</SelectItem>
                    <SelectItem value="90d">90 jours</SelectItem>
                    <SelectItem value="ytd">Annee en cours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tableau</Label>
                <Select value={dashboard} onValueChange={setDashboard}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operations">Operations</SelectItem>
                    <SelectItem value="pipeline">Pipeline</SelectItem>
                    <SelectItem value="team">Equipe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-lg border p-3 text-sm text-muted-foreground md:col-span-2">
                Fenetre active: {report30d?.window.label || period}. Exports et planifications utilisent ces filtres.
              </div>
            </CardContent>
          </Card>

          {report30d ? (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Tendance quotidienne</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {trendTail.map((day) => (
                    <div key={day.date} className="grid grid-cols-6 gap-2 rounded border p-2 text-xs">
                      <div>{formatDateFr(day.date)}</div>
                      <div>Creees: {day.created}</div>
                      <div>Scorees: {day.scored}</div>
                      <div>Contactees: {day.contacted}</div>
                      <div>Taches: {day.tasks_created}</div>
                      <div>Done: {day.tasks_completed}</div>
                    </div>
                  ))}
                  {trendTail.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucune tendance disponible.</p>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Canaux & qualite</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    {report30d.channel_breakdown.map((item) => (
                      <div key={item.channel} className="rounded border p-2 text-sm">
                        <p className="font-medium">{channelLabel(item.channel)}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.count} taches | completees: {item.completed}
                        </p>
                      </div>
                    ))}
                    {report30d.channel_breakdown.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Aucune tache sur la periode.</p>
                    ) : null}
                  </div>
                  <div className="rounded border p-3 text-xs">
                    <p>Leads non rescored recents: {report30d.quality_flags.stale_unscored_leads}</p>
                    <p>Taches sans assignee: {report30d.quality_flags.unassigned_tasks}</p>
                    <p>Taux completion taches: {Math.round(report30d.kpis.task_completion_rate)}%</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2">
                <IconCalendarStats className="size-5" />
                Planification des rapports
              </CardTitle>
              <Button variant="outline" onClick={() => void runDueSchedules()} disabled={runningDueSchedules}>
                <IconClockPlay className="size-4" />
                {runningDueSchedules ? "Execution..." : "Executer les planifications dues"}
              </Button>
            </CardHeader>
            <CardContent className="space-y-5">
              <form onSubmit={createSchedule} className="grid gap-3 md:grid-cols-3">
                <Input
                  placeholder="Nom du schedule"
                  value={scheduleForm.name}
                  onChange={(event) => setScheduleForm((current) => ({ ...current, name: event.target.value }))}
                  required
                />
                <Select
                  value={scheduleForm.frequency}
                  onValueChange={(value) => setScheduleForm((current) => ({ ...current, frequency: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Quotidien</SelectItem>
                    <SelectItem value="weekly">Hebdomadaire</SelectItem>
                    <SelectItem value="monthly">Mensuel</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={scheduleForm.format}
                  onValueChange={(value) => setScheduleForm((current) => ({ ...current, format: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="csv">CSV</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Timezone (ex: Europe/Paris)"
                  value={scheduleForm.timezone}
                  onChange={(event) => setScheduleForm((current) => ({ ...current, timezone: event.target.value }))}
                  required
                />
                <Input
                  type="number"
                  min={0}
                  max={23}
                  placeholder="Heure"
                  value={scheduleForm.hour_local}
                  onChange={(event) => setScheduleForm((current) => ({ ...current, hour_local: event.target.value }))}
                  required
                />
                <Input
                  type="number"
                  min={0}
                  max={59}
                  placeholder="Minute"
                  value={scheduleForm.minute_local}
                  onChange={(event) => setScheduleForm((current) => ({ ...current, minute_local: event.target.value }))}
                  required
                />
                <Input
                  className="md:col-span-2"
                  placeholder="Destinataires (emails separes par virgules)"
                  value={scheduleForm.recipients}
                  onChange={(event) => setScheduleForm((current) => ({ ...current, recipients: event.target.value }))}
                />
                <Button type="submit" disabled={creatingSchedule}>
                  {creatingSchedule ? "Creation..." : "Ajouter planification"}
                </Button>
              </form>

              {schedulesData && schedulesData.items.length === 0 ? (
                <EmptyState
                  title="Aucune planification"
                  description="Creez une planification pour automatiser les envois de rapports."
                  className="min-h-24"
                />
              ) : null}

              {schedulesData?.items.map((schedule) => (
                <div
                  key={schedule.id}
                  className="flex flex-col gap-2 rounded-lg border p-3 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-medium">{schedule.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {schedule.frequency} | {schedule.format.toUpperCase()} | {schedule.hour_local.toString().padStart(2, "0")}:
                      {schedule.minute_local.toString().padStart(2, "0")} ({schedule.timezone})
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Prochaine execution: {formatDateTimeFr(schedule.next_run_at)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Derniere execution: {formatDateTimeFr(schedule.last_run_at)}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => void deleteSchedule(schedule.id)}>
                    <IconTrash className="size-4 text-red-600" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconTimeline className="size-5" />
                Historique des executions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {runsData && runsData.items.length === 0 ? (
                <EmptyState
                  title="Aucune execution"
                  description="Les runs des planifications apparaitront ici."
                  className="min-h-24"
                />
              ) : null}
              {runsData?.items.map((run) => (
                <div
                  key={run.id}
                  className="flex flex-col gap-1 rounded-lg border p-3 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {run.status} | {run.output_format.toUpperCase()} | destinataires: {run.recipient_count}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Debut: {formatDateTimeFr(run.started_at)} | Fin: {formatDateTimeFr(run.finished_at)}
                    </p>
                    {run.message ? <p className="text-xs text-muted-foreground">{run.message}</p> : null}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {report30d ? (
            <Card>
              <CardHeader>
                <CardTitle>Timeline 30 jours</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {report30d.timeline_items.slice(0, 40).map((event) => (
                  <div key={event.id} className="rounded border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{event.title}</p>
                      <span className="text-xs text-muted-foreground">{event.event_type}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatDateTimeFr(event.timestamp)}</p>
                    <p className="text-xs text-muted-foreground">{event.description}</p>
                  </div>
                ))}
                {report30d.timeline_items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun evenement dans la timeline.</p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

