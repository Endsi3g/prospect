"use client"

import * as React from "react"
import useSWR from "swr"
import { toast } from "sonner"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { requestApi } from "@/lib/api"
import { formatDateTimeFr } from "@/lib/format"

type AccountPayload = {
  full_name: string
  email: string
  title: string
  locale: string
  timezone: string
  preferences: {
    density?: "compact" | "comfortable"
    keyboard_shortcuts?: boolean
    start_page?: string
  }
  updated_at?: string | null
}

const fetcher = <T,>(path: string) => requestApi<T>(path)

export default function AccountPage() {
  const { data, error, isLoading, mutate } = useSWR<AccountPayload>("/api/v1/admin/account", fetcher)
  const [isSaving, setIsSaving] = React.useState(false)
  const [form, setForm] = React.useState<AccountPayload>({
    full_name: "",
    email: "",
    title: "",
    locale: "fr-FR",
    timezone: "Europe/Paris",
    preferences: {
      density: "comfortable",
      keyboard_shortcuts: true,
      start_page: "/dashboard",
    },
  })

  React.useEffect(() => {
    if (!data) return
    setForm({
      ...data,
      preferences: {
        density: data.preferences?.density || "comfortable",
        keyboard_shortcuts: data.preferences?.keyboard_shortcuts ?? true,
        start_page: data.preferences?.start_page || "/dashboard",
      },
    })
  }, [data])

  function updateField<K extends keyof AccountPayload>(key: K, value: AccountPayload[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      setIsSaving(true)
      await requestApi("/api/v1/admin/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      toast.success("Compte mis a jour.")
      await mutate()
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : "Echec de sauvegarde")
    } finally {
      setIsSaving(false)
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
        <div className="flex flex-1 flex-col gap-6 p-4 pt-0 md:p-8">
          <h2 className="text-3xl font-bold tracking-tight">Compte</h2>
          {error ? (
            <ErrorState title="Impossible de charger le compte." onRetry={() => void mutate()} />
          ) : null}
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <form onSubmit={onSubmit} className="max-w-4xl space-y-6 rounded-xl border p-5">
              <h3 className="text-lg font-semibold">Profil administrateur</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Nom complet</Label>
                  <Input
                    id="full_name"
                    value={form.full_name}
                    onChange={(event) => updateField("full_name", event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(event) => updateField("email", event.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="title">Poste</Label>
                  <Input
                    id="title"
                    value={form.title}
                    onChange={(event) => updateField("title", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="locale">Locale</Label>
                  <Input
                    id="locale"
                    value={form.locale}
                    onChange={(event) => updateField("locale", event.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="timezone">Fuseau horaire</Label>
                  <Input
                    id="timezone"
                    value={form.timezone}
                    onChange={(event) => updateField("timezone", event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Densite interface</Label>
                  <Select
                    value={form.preferences.density || "comfortable"}
                    onValueChange={(value) =>
                      updateField("preferences", { ...form.preferences, density: value as "compact" | "comfortable" })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="comfortable">Confortable</SelectItem>
                      <SelectItem value="compact">Compact</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Page de demarrage</Label>
                  <Select
                    value={form.preferences.start_page || "/dashboard"}
                    onValueChange={(value) =>
                      updateField("preferences", { ...form.preferences, start_page: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="/dashboard">Dashboard</SelectItem>
                      <SelectItem value="/leads">Leads</SelectItem>
                      <SelectItem value="/tasks">Taches</SelectItem>
                      <SelectItem value="/reports">Rapports</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 rounded-lg border p-3">
                  <Checkbox
                    id="keyboard_shortcuts"
                    checked={Boolean(form.preferences.keyboard_shortcuts)}
                    onCheckedChange={(checked) =>
                      updateField("preferences", {
                        ...form.preferences,
                        keyboard_shortcuts: Boolean(checked),
                      })
                    }
                  />
                  <Label htmlFor="keyboard_shortcuts">Raccourcis clavier actifs</Label>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Derniere mise a jour: {formatDateTimeFr(data?.updated_at)}
                </p>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Enregistrement..." : "Enregistrer"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
