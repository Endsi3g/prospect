"use client"

import * as React from "react"
import useSWR from "swr"

import { AppSidebar } from "@/components/app-sidebar"
import ChartAreaInteractive, { type TrendPoint } from "@/components/chart-area-interactive"
import { SectionCards } from "@/components/section-cards"
import { SiteHeader } from "@/components/site-header"
import { SyncStatus } from "@/components/sync-status"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchApi } from "@/lib/api"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"

type DashboardStats = {
  sourced_total: number
  qualified_total: number
  contacted_total: number
  replied_total: number
  booked_total: number
  closed_total: number
  qualified_rate: number
  contact_rate: number
  reply_rate: number
  book_rate: number
  close_rate: number
  avg_total_score: number
  tier_distribution: Record<string, number>
  daily_pipeline_trend: TrendPoint[]
}

const fetcher = <T,>(path: string) => fetchApi<T>(path)

export default function DashboardPage() {
  const { data: stats, error, isLoading, mutate, isValidating } = useSWR<DashboardStats>("/api/v1/admin/stats", fetcher)
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null)

  React.useEffect(() => {
    if (!stats) return
    setUpdatedAt(new Date())
  }, [stats])

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
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <div className="px-4 lg:px-6">
                <SyncStatus updatedAt={updatedAt} isValidating={isValidating} />
              </div>
              {isLoading ? (
                <div className="space-y-4 px-4 lg:px-6">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Skeleton className="h-28 w-full" />
                    <Skeleton className="h-28 w-full" />
                    <Skeleton className="h-28 w-full" />
                    <Skeleton className="h-28 w-full" />
                  </div>
                  <Skeleton className="h-[320px] w-full" />
                </div>
              ) : null}
              {!isLoading && error ? (
                <div className="px-4 lg:px-6">
                  <ErrorState
                    title="Impossible de charger les statistiques du tableau de bord."
                    onRetry={() => void mutate()}
                  />
                </div>
              ) : null}
              {!isLoading && !error ? (
                <>
                  <SectionCards stats={stats} />
                  <div className="px-4 lg:px-6">
                    <ChartAreaInteractive trend={stats?.daily_pipeline_trend || []} />
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
