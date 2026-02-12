"use client"

import * as React from "react"
import { IconRefresh, IconRefreshAlert } from "@tabler/icons-react"

import { useSyncSettings } from "@/components/app-providers"
import { formatDateTimeFr } from "@/lib/format"

export function SyncStatus({
  updatedAt,
  isValidating,
}: {
  updatedAt?: Date | null
  isValidating?: boolean
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

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {isStale ? (
        <IconRefreshAlert className="size-3.5 text-amber-600" />
      ) : (
        <IconRefresh className={`size-3.5 ${isValidating ? "animate-spin" : ""}`} />
      )}
      {updatedAt ? (
        <span>
          {isStale ? "Donnees potentiellement perimees" : "Donnees a jour"} -{" "}
          {formatDateTimeFr(updatedAt.toISOString())}
        </span>
      ) : (
        <span>Synchronisation en attente</span>
      )}
    </div>
  )
}
