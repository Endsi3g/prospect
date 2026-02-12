"use client"

import * as React from "react"
import { SWRConfig } from "swr"

import { ModalSystemProvider } from "@/components/modal-system-provider"
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

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [refreshSeconds, setRefreshSeconds] = React.useState(30)

  function applyTheme(theme: "light" | "dark" | "system") {
    if (theme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
      document.documentElement.classList.toggle("dark", prefersDark)
      return
    }
    document.documentElement.classList.toggle("dark", theme === "dark")
  }

  React.useEffect(() => {
    let active = true
    async function loadSettings() {
      try {
        const payload = await requestApi<AdminSettingsResponse>("/api/v1/admin/settings")
        if (!active) return
        const seconds = Number(payload.dashboard_refresh_seconds || 30)
        setRefreshSeconds(Math.max(10, Math.min(seconds, 3600)))
        applyTheme(payload.theme || "system")
      } catch {
        if (active) {
          setRefreshSeconds(30)
          applyTheme("system")
        }
      }
    }
    void loadSettings()
    return () => {
      active = false
    }
  }, [])

  return (
    <SyncSettingsContext.Provider value={{ refreshSeconds }}>
      <SWRConfig
        value={{
          refreshInterval: refreshSeconds * 1000,
          revalidateOnFocus: true,
          keepPreviousData: true,
        }}
      >
        <ModalSystemProvider>{children}</ModalSystemProvider>
      </SWRConfig>
    </SyncSettingsContext.Provider>
  )
}
