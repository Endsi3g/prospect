"use client"

import * as React from "react"
import { IconRefresh, IconRefreshAlert } from "@tabler/icons-react"
import { toast } from "sonner"

import { useApiSource, useSyncSettings } from "@/components/app-providers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDateTime } from "@/lib/format"
import { toIntlLocale, useI18n } from "@/lib/i18n"

export function SyncStatus({
  updatedAt,
  isValidating,
  onRefresh,
}: {
  updatedAt?: Date | null
  isValidating?: boolean
  onRefresh?: () => void | Promise<void>
}) {
  const { refreshSeconds } = useSyncSettings()
  const { dataSource } = useApiSource()
  const { locale, messages } = useI18n()
  const [nowMs, setNowMs] = React.useState(0)
  const [isRefreshing, setIsRefreshing] = React.useState(false)

  React.useEffect(() => {
    setNowMs(Date.now())
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => window.clearInterval(intervalId)
  }, [])

  const staleMs = React.useMemo(() => {
    if (!updatedAt) return Number.MAX_SAFE_INTEGER
    return nowMs - updatedAt.getTime()
  }, [nowMs, updatedAt])

  const isStale = staleMs > Math.max(refreshSeconds * 1000, 60_000)
  const isBusy = Boolean(isValidating) || isRefreshing
  const isFallbackSource = dataSource === "dev-fallback"
  const sourceBadgeClass = isFallbackSource
    ? "border-amber-600/55 bg-amber-400/20 text-amber-950 dark:border-amber-500/45 dark:bg-amber-500/20 dark:text-amber-100"
    : "border-emerald-600/45 bg-emerald-500/15 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-100"
  const sourceValue =
    dataSource === "upstream"
      ? messages.dashboard.sync.sourceApi
      : dataSource === "dev-fallback"
        ? messages.dashboard.sync.sourceFallback
        : messages.dashboard.sync.sourceUnknown

  const formattedUpdatedAt = updatedAt
    ? formatDateTime(updatedAt.toISOString(), toIntlLocale(locale))
    : null

  const handleRefresh = React.useCallback(async () => {
    if (!onRefresh || isBusy) return
    try {
      setIsRefreshing(true)
      await onRefresh()
      toast.success(messages.dashboard.sync.toastSuccess)
    } catch {
      toast.error(messages.dashboard.sync.toastError)
    } finally {
      setIsRefreshing(false)
    }
  }, [isBusy, messages.dashboard.sync.toastError, messages.dashboard.sync.toastSuccess, onRefresh])

  if (isStale) {
    return (
      <div
        className="mb-4 flex w-full flex-col gap-2 rounded-md border border-amber-500/55 bg-amber-400/16 px-3 py-2 sm:flex-row sm:items-center sm:justify-between dark:border-amber-400/45 dark:bg-amber-300/12"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-amber-950 dark:text-amber-50">
          <IconRefreshAlert className="size-4" />
          <span>
            {messages.dashboard.sync.stalePrefix} -{" "}
            {formattedUpdatedAt || messages.dashboard.sync.staleNoSync}
            {isFallbackSource ? ` (${messages.dashboard.sync.fallbackModeActive})` : ""}
          </span>
          <Badge variant="outline" className={sourceBadgeClass}>
            {messages.dashboard.sync.sourceLabel}: {sourceValue}
          </Badge>
        </div>
        {onRefresh ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 border-amber-600/55 bg-amber-50 text-xs text-amber-950 hover:bg-amber-100 dark:border-amber-300/35 dark:bg-amber-200/15 dark:text-amber-50 dark:hover:bg-amber-200/25"
            onClick={() => void handleRefresh()}
            disabled={isBusy}
          >
            {isBusy ? messages.dashboard.sync.refreshing : messages.dashboard.sync.refresh}
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite" aria-atomic="true">
      <IconRefresh className={`size-3.5 ${isBusy ? "animate-spin" : ""}`} />
      <span>
        {formattedUpdatedAt
          ? `${messages.dashboard.sync.upToDatePrefix} - ${formattedUpdatedAt}`
          : messages.dashboard.sync.pending}
      </span>
      <Badge variant="outline" className={sourceBadgeClass}>
        {messages.dashboard.sync.sourceLabel}: {sourceValue}
      </Badge>
      {isFallbackSource ? (
        <Badge variant="outline" className="border-amber-600/45 bg-amber-300/15 text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-100">
          {messages.dashboard.sync.fallbackBadge}
        </Badge>
      ) : null}
      {onRefresh ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleRefresh()}
          disabled={isBusy}
          className="h-7 px-2 text-xs"
        >
          {isBusy ? messages.dashboard.sync.refreshing : messages.dashboard.sync.refresh}
        </Button>
      ) : null}
    </div>
  )
}
