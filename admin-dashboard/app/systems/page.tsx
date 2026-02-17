"use client"

import * as React from "react"
import useSWR from "swr"
import { IconChartBar, IconCheck, IconSettings, IconSparkles } from "@tabler/icons-react"
import { toast } from "sonner"

import { AppSidebar } from "@/components/app-sidebar"
import { ExportCsvButton } from "@/components/export-csv-button"
import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { fetchApi, requestApi } from "@/lib/api"
import { formatDateTimeFr } from "@/lib/format"

type IntegrationEntry = {
  enabled: boolean
  config?: Record<string, unknown>
  meta?: Record<string, unknown>
}

type IntegrationsPayload = {
  providers: Record<string, IntegrationEntry>
}

type AuditItem = {
  id: string
  actor: string
  action: string
  entity_type?: string | null
  entity_id?: string | null
  created_at?: string | null
}

type AuditPayload = {
  items: AuditItem[]
  next_cursor?: string | null
}

type DiagnosticsLatestPayload = {
  available: boolean
  artifact?: string
  detail?: string
  started_at?: string
  finished_at?: string
  generated_at?: string
  duration_seconds?: number
  status?: string
}

type RunPayload = {
  ok: boolean
  return_code: number
  auto_fix: boolean
  started_at: string
  finished_at: string
  duration_seconds: number
  artifact: string
  stdout_tail?: string[]
  stderr_tail?: string[]
  artifact_payload?: Record<string, unknown>
}

type SyncHealthSource = {
  entity: string
  count: number
  last_updated_at?: string | null
  stale_seconds?: number | null
  status: string
}

type SyncHealthPayload = {
  generated_at: string
  status: string
  ok: boolean
  last_sync_at?: string | null
  stale_seconds?: number | null
  sources: SyncHealthSource[]
}

type IntegrityIssue = {
  code: string
  severity: string
  count: number
  message: string
}

type DataIntegrityPayload = {
  generated_at: string
  status: string
  ok: boolean
  totals: {
    leads: number
    tasks: number
    projects: number
  }
  checks: {
    orphan_tasks: number
    orphan_projects: number
    duplicate_lead_emails: number
    tasks_without_assignee: number
    stale_unscored_leads: number
    failed_report_runs_30d: number
  }
  issues: IntegrityIssue[]
}

const fetcher = <T,>(path: string) => fetchApi<T>(path)

function statusBadge(value: string | undefined) {
  const key = (value || "").toLowerCase()
  if (key === "ok" || key === "success" || key === "passed") {
    return <Badge className="bg-emerald-600">OK</Badge>
  }
  if (key === "warning" || key === "degraded") {
    return <Badge variant="outline">Warning</Badge>
  }
  if (key === "failed" || key === "error") {
    return <Badge variant="destructive">Erreur</Badge>
  }
  return <Badge variant="secondary">{value || "inconnu"}</Badge>
}

function pretty(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2)
}

export default function SystemsPage() {
  const [runningDiagnostics, setRunningDiagnostics] = React.useState(false)
  const [runningAutofix, setRunningAutofix] = React.useState(false)
  const [lastRunPayload, setLastRunPayload] = React.useState<RunPayload | null>(null)

  const {
    data: diagnostics,
    error: diagnosticsError,
    isLoading: diagnosticsLoading,
    mutate: mutateDiagnostics,
  } = useSWR<DiagnosticsLatestPayload>("/api/v1/admin/diagnostics/latest", fetcher)
  const {
    data: autofix,
    error: autofixError,
    isLoading: autofixLoading,
    mutate: mutateAutofix,
  } = useSWR<DiagnosticsLatestPayload>("/api/v1/admin/autofix/latest", fetcher)
  const {
    data: integrations,
    error: integrationsError,
    isLoading: integrationsLoading,
    mutate: mutateIntegrations,
  } = useSWR<IntegrationsPayload>("/api/v1/admin/integrations", fetcher)
  const {
    data: audit,
    error: auditError,
    isLoading: auditLoading,
    mutate: mutateAudit,
  } = useSWR<AuditPayload>("/api/v1/admin/audit-log?limit=25", fetcher)
  const {
    data: syncHealth,
    error: syncHealthError,
    isLoading: syncHealthLoading,
    mutate: mutateSyncHealth,
  } = useSWR<SyncHealthPayload>("/api/v1/admin/sync/health", fetcher)
  const {
    data: dataIntegrity,
    error: dataIntegrityError,
    isLoading: dataIntegrityLoading,
    mutate: mutateDataIntegrity,
  } = useSWR<DataIntegrityPayload>("/api/v1/admin/data/integrity", fetcher)

  const providers = Object.entries(integrations?.providers || {})
  const enabledProviders = providers.filter(([, payload]) => payload.enabled).length
  const syncSources = syncHealth?.sources || []
  const integrityIssues = dataIntegrity?.issues || []

  async function runDiagnostics() {
    try {
      setRunningDiagnostics(true)
      const payload = await requestApi<RunPayload>("/api/v1/admin/diagnostics/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_fix: false }),
      })
      setLastRunPayload(payload)
      toast.success("Diagnostics termines.")
      await mutateDiagnostics()
      await mutateAudit()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Echec du diagnostic")
    } finally {
      setRunningDiagnostics(false)
    }
  }

  async function runAutofix() {
    try {
      setRunningAutofix(true)
      const payload = await requestApi<RunPayload>("/api/v1/admin/autofix/run", {
        method: "POST",
      })
      setLastRunPayload(payload)
      toast.success("Autofix termine.")
      await mutateAutofix()
      await mutateAudit()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Echec de l'autofix")
    } finally {
      setRunningAutofix(false)
    }
  }

  async function refreshAll() {
    try {
      await Promise.all([
        mutateDiagnostics(),
        mutateAutofix(),
        mutateIntegrations(),
        mutateAudit(),
        mutateSyncHealth(),
        mutateDataIntegrity(),
      ])
      toast.success("Etat systeme actualise.")
    } catch (error) {
      console.error("refreshAll failed", error)
      toast.error("Impossible d'actualiser l'etat systeme.")
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
        <div className="flex flex-1 flex-col gap-4 p-3 pt-0 sm:p-4 sm:pt-0 lg:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <h2 className="text-3xl font-bold tracking-tight">Systemes</h2>
            <div className="flex flex-wrap items-center gap-2">
              <ExportCsvButton entity="systems" label="Export systemes" />
              <Button variant="outline" onClick={() => void refreshAll()}>
                Actualiser
              </Button>
            </div>
          </div>

          {(diagnosticsLoading || autofixLoading || integrationsLoading || auditLoading || syncHealthLoading || dataIntegrityLoading) && !diagnostics && !autofix ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : null}

          {diagnosticsError || autofixError || integrationsError || auditError || syncHealthError || dataIntegrityError ? (
            <ErrorState
              title="Impossible de charger certains etats systeme."
              description="Vérifiez la connexion backend puis relancez le rafraichissement."
              onRetry={() => void refreshAll()}
            />
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Diagnostics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <IconChartBar className="size-4 text-muted-foreground" />
                  {statusBadge(diagnostics?.status || (diagnostics?.available ? "ok" : "warning"))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {diagnostics?.finished_at
                    ? `Dernier run: ${formatDateTimeFr(diagnostics.finished_at)}`
                    : diagnostics?.detail || "Aucun run enregistre"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Autofix</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <IconSparkles className="size-4 text-muted-foreground" />
                  {statusBadge(autofix?.status || (autofix?.available ? "ok" : "warning"))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {autofix?.finished_at
                    ? `Dernier run: ${formatDateTimeFr(autofix.finished_at)}`
                    : autofix?.detail || "Aucun run enregistre"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Sync donnees</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <IconSettings className="size-4 text-muted-foreground" />
                  {statusBadge(syncHealth?.status)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {syncHealth?.last_sync_at
                    ? `Derniere sync: ${formatDateTimeFr(syncHealth.last_sync_at)}`
                    : "Aucune synchronisation valide"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Integrite data</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <IconChartBar className="size-4 text-muted-foreground" />
                  {statusBadge(dataIntegrity?.status)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {integrityIssues.length > 0 ? `${integrityIssues.length} issue(s)` : "Aucune anomalie"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Integrations actives</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{enabledProviders}</CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Evenements audit (25)</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{audit?.items.length || 0}</CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Actions systeme</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void runDiagnostics()} disabled={runningDiagnostics}>
                <IconSettings className="size-4" />
                {runningDiagnostics ? "Diagnostic..." : "Lancer diagnostic"}
              </Button>
              <Button variant="outline" onClick={() => void runAutofix()} disabled={runningAutofix}>
                <IconSparkles className="size-4" />
                {runningAutofix ? "Autofix..." : "Lancer autofix"}
              </Button>
              <p className="text-sm text-muted-foreground">
                Les deux actions ajoutent une trace dans l&apos;audit et mettent a jour les artefacts QA.
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Sante de synchronisation</CardTitle>
              </CardHeader>
              <CardContent>
                {syncSources.length === 0 ? (
                  <EmptyState
                    title="Aucune source synchronisee"
                    description="Les flux apparaitront ici des qu'une synchronisation est detectee."
                    className="min-h-32"
                  />
                ) : (
                  <div className="space-y-2">
                    {syncSources.map((source) => (
                      <div key={source.entity} className="rounded-lg border px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">{source.entity}</p>
                          {statusBadge(source.status)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {source.count} element(s) •{" "}
                          {source.last_updated_at ? formatDateTimeFr(source.last_updated_at) : "aucune date"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Integrite des donnees</CardTitle>
              </CardHeader>
              <CardContent>
                {integrityIssues.length === 0 ? (
                  <EmptyState
                    title="Aucune anomalie"
                    description="Les controles d'integrite sont au vert."
                    className="min-h-32"
                  />
                ) : (
                  <div className="space-y-2">
                    {integrityIssues.map((issue) => (
                      <div key={issue.code} className="rounded-lg border px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">{issue.code}</p>
                          {statusBadge(issue.severity)}
                        </div>
                        <p className="text-xs text-muted-foreground">{issue.message}</p>
                        <p className="text-xs text-muted-foreground">{issue.count} occurrence(s)</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Integrations</CardTitle>
              </CardHeader>
              <CardContent>
                {providers.length === 0 ? (
                  <EmptyState
                    title="Aucune integration"
                    description="Configurez vos providers dans Parametres."
                    className="min-h-32"
                  />
                ) : (
                  <div className="space-y-2">
                    {providers.map(([key, payload]) => (
                      <div key={key} className="flex items-center justify-between rounded-lg border px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">{key}</p>
                          <p className="text-xs text-muted-foreground">
                            {(payload.config && Object.keys(payload.config).length > 0)
                              ? `${Object.keys(payload.config).length} parametre(s)`
                              : "Sans configuration"}
                          </p>
                        </div>
                        {payload.enabled ? (
                          <Badge className="bg-emerald-600">
                            <IconCheck className="size-3" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline">Inactive</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Audit log recent</CardTitle>
              </CardHeader>
              <CardContent>
                {!audit || audit.items.length === 0 ? (
                  <EmptyState
                    title="Aucun evenement"
                    description="Les actions systeme apparaitront ici."
                    className="min-h-32"
                  />
                ) : (
                  <div className="space-y-2">
                    {audit.items.map((item) => (
                      <div key={item.id} className="rounded-lg border px-3 py-2 text-sm">
                        <p className="font-medium">
                          {item.action} <span className="text-muted-foreground">par {item.actor}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.entity_type || "system"} {item.entity_id ? `#${item.entity_id}` : ""} • {item.created_at ? formatDateTimeFr(item.created_at) : "Inconnu"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {lastRunPayload ? (
            <Card>
              <CardHeader>
                <CardTitle>Derniere execution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-4 text-sm">
                  <div className="rounded-lg border px-3 py-2">
                    <p className="text-muted-foreground">Resultat</p>
                    <p className="font-medium">{lastRunPayload.ok ? "Succes" : "Echec"}</p>
                  </div>
                  <div className="rounded-lg border px-3 py-2">
                    <p className="text-muted-foreground">Retour</p>
                    <p className="font-medium">{lastRunPayload.return_code}</p>
                  </div>
                  <div className="rounded-lg border px-3 py-2">
                    <p className="text-muted-foreground">Duree</p>
                    <p className="font-medium">{lastRunPayload.duration_seconds}s</p>
                  </div>
                  <div className="rounded-lg border px-3 py-2">
                    <p className="text-muted-foreground">Type</p>
                    <p className="font-medium">{lastRunPayload.auto_fix ? "Autofix" : "Diagnostic"}</p>
                  </div>
                </div>
                <pre className="max-h-80 overflow-auto rounded-lg border bg-muted p-3 text-[11px]">
                  {pretty(lastRunPayload.artifact_payload || {
                    stdout_tail: lastRunPayload.stdout_tail,
                    stderr_tail: lastRunPayload.stderr_tail,
                    artifact: lastRunPayload.artifact,
                  })}
                </pre>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}


