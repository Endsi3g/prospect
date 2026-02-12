"use client"

import * as React from "react"
import { IconRefresh, IconRefreshAlert } from "@tabler/icons-react"

import { useSyncSettings } from "@/components/app-providers"
import { Button } from "@/components/ui/button"
import { formatDateTimeFr } from "@/lib/format"
import { toast } from "sonner"

export function SyncStatus({
  updatedAt,
  isValidating,
  onRefresh,
}: {
  updatedAt?: Date | null
  isValidating?: boolean
  onRefresh?: () => void
}) {
  const { refreshSeconds } = useSyncSettings()
  const [nowMs, setNowMs] = React.useState(0)

  React.useEffect(() => {
    setNowMs(Date.now())
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => window.clearInterval(intervalId)
  }, [])

  const staleMs = React.useMemo(() => {
    if (!updatedAt) return Number.MAX_SAFE_INTEGER
    return nowMs - updatedAt.getTime()
  }, [nowMs, updatedAt])
  const isStale = staleMs > Math.max(refreshSeconds * 2000, 60_000)

  if (isStale) {
    return (
      <div className="flex items-center justify-between bg-amber-500/10 p-2 rounded-md border border-amber-500/20 w-full mb-4">
        <div className="flex items-center gap-2 text-sm text-amber-600">
          <IconRefreshAlert className="size-4" />
          <span>Données potentiellement périmées - {updatedAt ? formatDateTimeFr(updatedAt.toISOString()) : 'Date inconnue'}</span>
        </div>
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs border-amber-200 hover:bg-amber-100 hover:text-amber-700 bg-white"
            onClick={() => {
              onRefresh()
              toast.success("Donnees rafraichies")
            }}
          >
            Rafraîchir
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <IconRefresh className={`size-3.5 ${isValidating ? "animate-spin" : ""}`} />
      {updatedAt ? (
        <span>Donnees a jour - {formatDateTimeFr(updatedAt.toISOString())}</span>
      ) : (
        <span>Synchronisation en attente</span>
      )}
    </div>
  )
}
