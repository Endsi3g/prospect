"use client"

import * as React from "react"
import useSWR from "swr"
import { IconChartBar, IconCurrencyEuro, IconTarget, IconUsers } from "@tabler/icons-react"

import { AppSidebar } from "@/components/app-sidebar"
import ChartAreaInteractive, { type TrendPoint } from "@/components/chart-area-interactive"
import { SiteHeader } from "@/components/site-header"
import { SyncStatus } from "@/components/sync-status"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useLoadingTimeout } from "@/hooks/use-loading-timeout"
import { fetchApi } from "@/lib/api"
import { formatCurrencyFr, formatNumberFr } from "@/lib/format"

type AnalyticsData = {
  total_leads: number
  leads_by_status: Record<string, number>
  task_completion_rate: number
  pipeline_value: number
  new_leads_today: number
}

type DashboardStats = {
  daily_pipeline_trend: TrendPoint[]
}

const fetcher = <T,>(path: string) => fetchApi<T>(path)

export default function AnalyticsPage() {
  const {
    data: analytics,
    error: analyticsError,
    isLoading: analyticsLoading,
    mutate: mutateAnalytics,
  } = useSWR<AnalyticsData>("/api/v1/admin/analytics", fetcher)
  const loadingTimedOut = useLoadingTimeout(analyticsLoading, 12_000)
  const { data: stats } = useSWR<DashboardStats>("/api/v1/admin/stats", fetcher)
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null)

  React.useEffect(() => {
    if (!analytics) return
    setUpdatedAt(new Date())
  }, [analytics])

  const conversionRate = React.useMemo(() => {
    if (!analytics || analytics.total_leads === 0) return "0"
    const converted = analytics.leads_by_status["CONVERTED"] || 0
    return ((converted / analytics.total_leads) * 100).toFixed(1)
  }, [analytics])

  const statusRows = React.useMemo(
    () =>
      Object.entries(analytics?.leads_by_status || {}).sort((left, right) => right[1] - left[1]),
    [analytics?.leads_by_status],
  )

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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-3xl font-bold tracking-tight">Analytique</h2>
            <SyncStatus updatedAt={updatedAt} onRefresh={() => void mutateAnalytics()} />
          </div>

          {analyticsLoading && !loadingTimedOut ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
              <Skeleton className="h-80 w-full" />
            </div>
          ) : null}
          {!analyticsLoading && (analyticsError || loadingTimedOut) ? (
            <ErrorState
              title="Impossible de charger les donnees analytiques."
              description={
                loadingTimedOut
                  ? "Le chargement depasse le delai attendu. Verifiez la connectivite API puis relancez."
                  : analyticsError instanceof Error
                    ? analyticsError.message
                    : "Les donnees analytiques sont indisponibles."
              }
              secondaryLabel="Ouvrir Parametres"
              secondaryHref="/settings"
              onRetry={() => void mutateAnalytics()}
            />
          ) : null}
          {!analyticsLoading && !analyticsError && !loadingTimedOut && analytics && analytics.total_leads === 0 ? (
            <EmptyState
              title="Aucune donnee disponible"
              description="Les graphiques et KPI apparaitront apres creation de vos premiers leads."
            />
          ) : null}
          {!analyticsLoading && !analyticsError && !loadingTimedOut && analytics && analytics.total_leads > 0 ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="rounded-xl border shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Valeur pipeline</CardTitle>
                    <IconCurrencyEuro className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCurrencyFr(analytics.pipeline_value)}</div>
                    <p className="text-xs text-muted-foreground">Estimation actuelle</p>
                  </CardContent>
                </Card>
                <Card className="rounded-xl border shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Taux de conversion</CardTitle>
                    <IconTarget className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{conversionRate}%</div>
                    <p className="text-xs text-muted-foreground">Leads convertis</p>
                  </CardContent>
                </Card>
                <Card className="rounded-xl border shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Completion taches</CardTitle>
                    <IconChartBar className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{Math.round(analytics.task_completion_rate)}%</div>
                    <p className="text-xs text-muted-foreground">Efficacite equipe</p>
                  </CardContent>
                </Card>
                <Card className="rounded-xl border shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Leads actifs</CardTitle>
                    <IconUsers className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatNumberFr(analytics.total_leads)}</div>
                    <p className="text-xs text-muted-foreground">
                      +{formatNumberFr(analytics.new_leads_today)} aujourdhui
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <div className="lg:col-span-4">
                  <ChartAreaInteractive trend={stats?.daily_pipeline_trend || []} />
                </div>
                <Card className="lg:col-span-3 rounded-xl border shadow-sm">
                  <CardHeader>
                    <CardTitle>Leads par statut</CardTitle>
                    <CardDescription>Distribution par etape pipeline</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {statusRows.map(([status, count]) => (
                        <div key={status} className="flex items-center">
                          <div className="w-full">
                            <div className="flex items-center justify-between text-sm">
                              <span>{status}</span>
                              <span className="font-semibold">
                                {formatNumberFr(count)} (
                                {Math.round((count / Math.max(analytics.total_leads, 1)) * 100)}%)
                              </span>
                            </div>
                            <div className="mt-1 h-2 w-full rounded-full bg-secondary">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{
                                  width: `${(count / Math.max(analytics.total_leads, 1)) * 100}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

