"use client"

import * as React from "react"
import { SWRConfig } from "swr"
import { useTheme } from "next-themes"

import { ModalSystemProvider } from "@/components/modal-system-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { requestApi } from "@/lib/api"

type AdminSettingsResponse = {
  dashboard_refresh_seconds?: number
  theme?: "light" | "dark" | "system"
}

type SyncSettingsContextValue = {
  refreshSeconds: number
}

const SyncSettingsContext = React.createContext<SyncSettingsContextValue>({
  refreshSeconds: 30,
})

export function useSyncSettings(): SyncSettingsContextValue {
  return React.useContext(SyncSettingsContext)
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
          { skipAuthRetry: true }
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
          // On error, keep existing local theme preference to avoid jarring changes
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

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [refreshSeconds, setRefreshSeconds] = React.useState(30)

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <SyncSettingsContext.Provider value={{ refreshSeconds }}>
        <SWRConfig
          value={{
            refreshInterval: refreshSeconds * 1000,
            revalidateOnFocus: true,
            keepPreviousData: true,
          }}
        >
          <SettingsSyncer setRefreshSeconds={setRefreshSeconds}>
            <ModalSystemProvider>{children}</ModalSystemProvider>
          </SettingsSyncer>
        </SWRConfig>
      </SyncSettingsContext.Provider>
    </ThemeProvider>
  )
}
