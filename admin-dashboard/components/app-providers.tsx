"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import { SWRConfig, useSWRConfig } from "swr"

import { ModalSystemProvider } from "@/components/modal-system-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { requestApi } from "@/lib/api"
import {
  getLatestApiMeta,
  subscribeApiMeta,
  type ApiDataSource,
  type ApiMeta,
} from "@/lib/api-source"
import { I18nProvider, useI18n } from "@/lib/i18n"

type AdminSettingsResponse = {
  dashboard_refresh_seconds?: number
  theme?: "light" | "dark" | "system"
}

type SyncSettingsContextValue = {
  refreshSeconds: number
}

type ApiSourceContextValue = {
  dataSource: ApiDataSource
  lastSourceChange: string | null
  latestMeta: ApiMeta | null
}

const SyncSettingsContext = React.createContext<SyncSettingsContextValue>({
  refreshSeconds: 30,
})

const ApiSourceContext = React.createContext<ApiSourceContextValue>({
  dataSource: "unknown",
  lastSourceChange: null,
  latestMeta: null,
})

const CRITICAL_REVALIDATION_PREFIXES = [
  "/api/v1/admin/stats",
  "/api/v1/admin/analytics",
  "/api/v1/admin/reports/30d",
  "/api/v1/admin/leads",
  "/api/v1/admin/tasks",
]

function isCriticalDashboardKey(key: unknown): boolean {
  if (typeof key !== "string") return false
  return CRITICAL_REVALIDATION_PREFIXES.some((prefix) => key.startsWith(prefix))
}

export function useSyncSettings(): SyncSettingsContextValue {
  return React.useContext(SyncSettingsContext)
}

export function useApiSource(): ApiSourceContextValue {
  return React.useContext(ApiSourceContext)
}

function SettingsSyncer({
  children,
  setRefreshSeconds,
}: {
  children: React.ReactNode
  setRefreshSeconds: (s: number) => void
}) {
  const { setTheme } = useTheme()

  React.useEffect(() => {
    let active = true
    async function loadSettings() {
      try {
        const payload = await requestApi<AdminSettingsResponse>(
          "/api/v1/admin/settings",
          undefined,
          { skipAuthRetry: true },
        )
        if (!active) return

        const seconds = Number(payload.dashboard_refresh_seconds || 30)
        setRefreshSeconds(Math.max(10, Math.min(seconds, 3600)))

        if (payload.theme) {
          setTheme(payload.theme)
        }
      } catch {
        if (active) {
          setRefreshSeconds(30)
          // Keep existing local theme preference to avoid jarring UI changes.
        }
      }
    }
    void loadSettings()
    return () => {
      active = false
    }
  }, [setRefreshSeconds, setTheme])

  return <>{children}</>
}

function DataSourceSyncer({
  children,
  onMeta,
}: {
  children: React.ReactNode
  onMeta: (meta: ApiMeta, sourceChanged: boolean, message: string | null) => void
}) {
  const { mutate } = useSWRConfig()
  const { messages } = useI18n()
  const previousSourceRef = React.useRef<ApiDataSource>(getLatestApiMeta()?.dataSource || "unknown")

  React.useEffect(() => {
    const unsubscribe = subscribeApiMeta((meta) => {
      const previousSource = previousSourceRef.current
      previousSourceRef.current = meta.dataSource

      const sourceChanged =
        previousSource !== "unknown" &&
        meta.dataSource !== "unknown" &&
        previousSource !== meta.dataSource

      const sourceLabel = (source: ApiDataSource) => {
        if (source === "upstream") return messages.dashboard.sync.sourceApi
        if (source === "dev-fallback") return messages.dashboard.sync.sourceFallback
        return messages.dashboard.sync.sourceUnknown
      }

      const transitionMessage = sourceChanged
        ? `${messages.dashboard.sync.sourceLabel}: ${sourceLabel(previousSource)} -> ${sourceLabel(meta.dataSource)}`
        : null

      onMeta(meta, sourceChanged, transitionMessage)

      if (sourceChanged) {
        toast.warning(`${transitionMessage}. ${messages.dashboard.sync.refreshing}`)
        void mutate(
          (key) => isCriticalDashboardKey(key),
          undefined,
          { revalidate: true },
        )
      }
    })

    return unsubscribe
  }, [messages, mutate, onMeta])

  return <>{children}</>
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [refreshSeconds, setRefreshSeconds] = React.useState(30)
  const [statusAnnouncement, setStatusAnnouncement] = React.useState("")
  const [apiSource, setApiSource] = React.useState<ApiSourceContextValue>(() => {
    const latestMeta = getLatestApiMeta()
    return {
      dataSource: latestMeta?.dataSource || "unknown",
      lastSourceChange: null,
      latestMeta: latestMeta || null,
    }
  })

  const handleMeta = React.useCallback(
    (meta: ApiMeta, sourceChanged: boolean, message: string | null) => {
      setApiSource((current) => ({
        dataSource: meta.dataSource,
        lastSourceChange: sourceChanged ? meta.receivedAt : current.lastSourceChange,
        latestMeta: meta,
      }))
      if (message) {
        setStatusAnnouncement(message)
      }
    },
    [],
  )

  return (
    <I18nProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <SyncSettingsContext.Provider value={{ refreshSeconds }}>
          <ApiSourceContext.Provider value={apiSource}>
            <SWRConfig
              value={{
                refreshInterval: refreshSeconds * 1000,
                revalidateOnFocus: false,
                dedupingInterval: 8_000,
                errorRetryCount: 1,
                focusThrottleInterval: 15_000,
                keepPreviousData: true,
              }}
            >
              <DataSourceSyncer onMeta={handleMeta}>
                <SettingsSyncer setRefreshSeconds={setRefreshSeconds}>
                  <p className="sr-only" role="status" aria-live="polite">
                    {statusAnnouncement}
                  </p>
                  <ModalSystemProvider>{children}</ModalSystemProvider>
                </SettingsSyncer>
              </DataSourceSyncer>
            </SWRConfig>
          </ApiSourceContext.Provider>
        </SyncSettingsContext.Provider>
      </ThemeProvider>
    </I18nProvider>
  )
}
