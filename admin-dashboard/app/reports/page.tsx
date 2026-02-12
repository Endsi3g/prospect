"use client"

import * as React from "react"
import useSWR from "swr"
import { IconCalendarStats, IconClockPlay, IconFileDownload, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"

import { AppSidebar } from "@/components/app-sidebar"
import { ExportCsvButton } from "@/components/export-csv-button"
import { SiteHeader } from "@/components/site-header"
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
import { fetchApi, getApiBaseUrl, requestApi } from "@/lib/api"
import { formatDateTimeFr, formatNumberFr } from "@/lib/format"

type StatsPayload = {
  sourced_total: number
  qualified_total: number
  contacted_total: number
  closed_total: number
}

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

const fetcher = <T,>(path: string) => fetchApi<T>(path)

export default function ReportsPage() {
  const { data: stats, error, isLoading, mutate } = useSWR<StatsPayload>("/api/v1/admin/stats", fetcher)
  const { data: schedulesData, mutate: mutateSchedules } = useSWR<ReportSchedulesPayload>(
    "/api/v1/admin/reports/schedules",
    fetcher,
  )
  const { data: runsData, mutate: mutateRuns } = useSWR<ReportRunsPayload>(
    "/api/v1/admin/reports/schedules/runs?limit=20",
    fetcher,
  )

  const [period, setPeriod] = React.useState("30d")
  const [dashboard, setDashboard] = React.useState("operations")
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

  async function exportPdf() {
    try {
      setIsExportingPdf(true)
      const params = new URLSearchParams({
        period,
        dashboard,
      })
      const response = await fetch(`${getApiBaseUrl()}/api/v1/admin/reports/export/pdf?${params.toString()}`, {
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error(`Export PDF impossible (${response.status})`)
      }
      const blob = await response.blob()
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
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 md:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <h2 className="text-3xl font-bold tracking-tight">Rapports</h2>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <ExportCsvButton entity="leads" label="Export leads" />
              <ExportCsvButton entity="tasks" label="Export taches" />
              <ExportCsvButton entity="projects" label="Export projets" />
              <Button variant="outline" onClick={() => void exportPdf()} disabled={isExportingPdf}>
                <IconFileDownload className="size-4" />
                {isExportingPdf ? "Export..." : "Export PDF"}
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : null}
          {!isLoading && error ? (
            <ErrorState
              title="Impossible de charger les indicateurs de rapport."
              onRetry={() => void mutate()}
            />
          ) : null}
          {!isLoading && !error && stats && stats.sourced_total === 0 ? (
            <EmptyState
              title="Aucune donnee disponible"
              description="Ajoutez vos premiers leads pour activer les rapports et exports."
            />
          ) : null}
          {!isLoading && !error && stats && stats.sourced_total > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Leads sourcees</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">
                  {formatNumberFr(stats.sourced_total)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Leads qualifies</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">
                  {formatNumberFr(stats.qualified_total)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Leads contactes</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">
                  {formatNumberFr(stats.contacted_total)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Opportunites gagnees</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">
                  {formatNumberFr(stats.closed_total)}
                </CardContent>
              </Card>
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Dashboard avancé</CardTitle>
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
              <div className="md:col-span-2 rounded-lg border p-3 text-sm text-muted-foreground">
                Config actuelle: {dashboard} sur {period}. Les exports utilisent ces filtres.
              </div>
            </CardContent>
          </Card>

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
              <CardTitle>Historique des executions</CardTitle>
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
                    {run.message ? (
                      <p className="text-xs text-muted-foreground">{run.message}</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
