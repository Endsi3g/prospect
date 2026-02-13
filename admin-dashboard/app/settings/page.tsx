"use client"

import * as React from "react"
import Link from "next/link"
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

type SettingsPayload = {
  organization_name: string
  locale: string
  timezone: string
  default_page_size: number
  dashboard_refresh_seconds: number
  support_email: string
  theme: "light" | "dark" | "system"
  default_refresh_mode: "manual" | "polling"
  notifications: {
    email: boolean
    in_app: boolean
  }
}

type IntegrationsPayload = {
  providers: Record<string, { enabled: boolean; config: Record<string, unknown>; meta?: Record<string, unknown> }>
}

type WebhookItem = {
  id: string
  name: string
  url: string
  events: string[]
  enabled: boolean
}

type WebhooksPayload = {
  items: WebhookItem[]
}

const fetcher = <T,>(path: string) => requestApi<T>(path)

export default function SettingsPage() {
  const { data, error, isLoading, mutate } = useSWR<SettingsPayload>(
    "/api/v1/admin/settings",
    fetcher,
  )
  const { data: integrations, mutate: mutateIntegrations } = useSWR<IntegrationsPayload>(
    "/api/v1/admin/integrations",
    fetcher,
  )
  const { data: webhooks, mutate: mutateWebhooks } = useSWR<WebhooksPayload>(
    "/api/v1/admin/webhooks",
    fetcher,
  )

  const [isSaving, setIsSaving] = React.useState(false)
  const [savingIntegrations, setSavingIntegrations] = React.useState(false)
  const [creatingWebhook, setCreatingWebhook] = React.useState(false)
  const [form, setForm] = React.useState<SettingsPayload>({
    organization_name: "",
    locale: "fr-FR",
    timezone: "Europe/Paris",
    default_page_size: 25,
    dashboard_refresh_seconds: 30,
    support_email: "",
    theme: "system",
    default_refresh_mode: "polling",
    notifications: {
      email: true,
      in_app: true,
    },
  })
  const [integrationForm, setIntegrationForm] = React.useState({
    slackEnabled: false,
    slackWebhook: "",
    zapierEnabled: false,
    zapierZapId: "",
    duckduckgoEnabled: true,
    perplexityEnabled: false,
    perplexityApiKey: "",
    perplexityModel: "sonar",
    firecrawlEnabled: false,
    firecrawlApiKey: "",
    firecrawlCountry: "us",
    firecrawlLang: "en",
  })
  const [webhookForm, setWebhookForm] = React.useState({
    name: "",
    url: "",
    events: "lead.created,lead.updated",
  })

  React.useEffect(() => {
    if (!data) return
    setForm(data)
  }, [data])

  React.useEffect(() => {
    if (!integrations) return
    const slack = integrations.providers.slack
    const zapier = integrations.providers.zapier
    const duckduckgo = integrations.providers.duckduckgo
    const perplexity = integrations.providers.perplexity
    const firecrawl = integrations.providers.firecrawl
    setIntegrationForm({
      slackEnabled: Boolean(slack?.enabled),
      slackWebhook: String(slack?.config?.webhook || ""),
      zapierEnabled: Boolean(zapier?.enabled),
      zapierZapId: String(zapier?.config?.zap_id || ""),
      duckduckgoEnabled: Boolean(duckduckgo?.enabled ?? true),
      perplexityEnabled: Boolean(perplexity?.enabled),
      perplexityApiKey: String(perplexity?.config?.api_key || ""),
      perplexityModel: String(perplexity?.config?.model || "sonar"),
      firecrawlEnabled: Boolean(firecrawl?.enabled),
      firecrawlApiKey: String(firecrawl?.config?.api_key || ""),
      firecrawlCountry: String(firecrawl?.config?.country || "us"),
      firecrawlLang: String(firecrawl?.config?.lang || "en"),
    })
  }, [integrations])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      setIsSaving(true)
      await requestApi("/api/v1/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      toast.success("Parametres enregistres.")
      await mutate()
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : "Echec de sauvegarde")
    } finally {
      setIsSaving(false)
    }
  }

  async function saveIntegrations() {
    try {
      setSavingIntegrations(true)
      await requestApi("/api/v1/admin/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providers: {
            slack: {
              enabled: integrationForm.slackEnabled,
              config: { webhook: integrationForm.slackWebhook },
            },
            zapier: {
              enabled: integrationForm.zapierEnabled,
              config: { zap_id: integrationForm.zapierZapId },
            },
            duckduckgo: {
              enabled: integrationForm.duckduckgoEnabled,
              config: { region: "us-en", safe_search: "moderate" },
            },
            perplexity: {
              enabled: integrationForm.perplexityEnabled,
              config: {
                api_key: integrationForm.perplexityApiKey,
                model: integrationForm.perplexityModel,
                api_key_env: "PERPLEXITY_API_KEY",
              },
            },
            firecrawl: {
              enabled: integrationForm.firecrawlEnabled,
              config: {
                api_key: integrationForm.firecrawlApiKey,
                country: integrationForm.firecrawlCountry,
                lang: integrationForm.firecrawlLang,
                api_key_env: "FIRECRAWL_API_KEY",
              },
            },
          },
        }),
      })
      toast.success("Integrations mises a jour.")
      await mutateIntegrations()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Echec de sauvegarde des integrations")
    } finally {
      setSavingIntegrations(false)
    }
  }

  async function createWebhook(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      setCreatingWebhook(true)
      await requestApi("/api/v1/admin/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: webhookForm.name,
          url: webhookForm.url,
          events: webhookForm.events
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          enabled: true,
        }),
      })
      toast.success("Webhook cree.")
      setWebhookForm({ name: "", url: "", events: "lead.created,lead.updated" })
      await mutateWebhooks()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Echec de creation du webhook")
    } finally {
      setCreatingWebhook(false)
    }
  }

  async function deleteWebhook(webhookId: string) {
    try {
      await requestApi(`/api/v1/admin/webhooks/${webhookId}`, { method: "DELETE" })
      toast.success("Webhook supprime.")
      await mutateWebhooks()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible")
    }
  }

  function updateField<K extends keyof SettingsPayload>(key: K, value: SettingsPayload[K]) {
    setForm((current) => ({ ...current, [key]: value }))
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-3xl font-bold tracking-tight">Parametres</h2>
            <Button asChild variant="outline">
              <Link href="/settings/team">Gerer equipe</Link>
            </Button>
          </div>
          {error ? (
            <ErrorState title="Impossible de charger les parametres." onRetry={() => void mutate()} />
          ) : null}
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <form onSubmit={onSubmit} className="max-w-4xl space-y-6 rounded-xl border p-5">
              <h3 className="text-lg font-semibold">Configuration generale</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="organization_name">Organisation</Label>
                  <Input
                    id="organization_name"
                    value={form.organization_name}
                    onChange={(event) => updateField("organization_name", event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="support_email">Email support</Label>
                  <Input
                    id="support_email"
                    type="email"
                    value={form.support_email}
                    onChange={(event) => updateField("support_email", event.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="locale">Locale</Label>
                  <Input
                    id="locale"
                    value={form.locale}
                    onChange={(event) => updateField("locale", event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Fuseau horaire</Label>
                  <Input
                    id="timezone"
                    value={form.timezone}
                    onChange={(event) => updateField("timezone", event.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="default_page_size">Taille page</Label>
                  <Input
                    id="default_page_size"
                    type="number"
                    min={5}
                    max={200}
                    value={form.default_page_size}
                    onChange={(event) => updateField("default_page_size", Number(event.target.value))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dashboard_refresh_seconds">Refresh dashboard (s)</Label>
                  <Input
                    id="dashboard_refresh_seconds"
                    type="number"
                    min={10}
                    max={3600}
                    value={form.dashboard_refresh_seconds}
                    onChange={(event) =>
                      updateField("dashboard_refresh_seconds", Number(event.target.value))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Theme</Label>
                  <Select
                    value={form.theme}
                    onValueChange={(value) => updateField("theme", value as SettingsPayload["theme"])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">Systeme</SelectItem>
                      <SelectItem value="light">Clair</SelectItem>
                      <SelectItem value="dark">Sombre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Mode refresh</Label>
                  <Select
                    value={form.default_refresh_mode}
                    onValueChange={(value) =>
                      updateField("default_refresh_mode", value as SettingsPayload["default_refresh_mode"])
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="polling">Automatique</SelectItem>
                      <SelectItem value="manual">Manuel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="notif-email"
                    checked={form.notifications.email}
                    onCheckedChange={(checked) =>
                      updateField("notifications", {
                        ...form.notifications,
                        email: Boolean(checked),
                      })
                    }
                  />
                  <Label htmlFor="notif-email">Notifications email</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="notif-app"
                    checked={form.notifications.in_app}
                    onCheckedChange={(checked) =>
                      updateField("notifications", {
                        ...form.notifications,
                        in_app: Boolean(checked),
                      })
                    }
                  />
                  <Label htmlFor="notif-app">Notifications in-app</Label>
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Enregistrement..." : "Enregistrer"}
                </Button>
              </div>
            </form>
          )}

          <div className="max-w-4xl space-y-4 rounded-xl border p-5">
            <h3 className="text-lg font-semibold">Integrations</h3>
            <p className="text-sm text-muted-foreground">
              Focus gratuit / free tier: DuckDuckGo (gratuit), Perplexity (credits d&apos;essai), Firecrawl (free tier).
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="slack-enabled"
                    checked={integrationForm.slackEnabled}
                    onCheckedChange={(checked) =>
                      setIntegrationForm((current) => ({
                        ...current,
                        slackEnabled: Boolean(checked),
                      }))
                    }
                  />
                  <Label htmlFor="slack-enabled">Slack active</Label>
                </div>
                <Input
                  placeholder="Slack webhook URL"
                  value={integrationForm.slackWebhook}
                  disabled={!integrationForm.slackEnabled}
                  className={!integrationForm.slackEnabled ? "opacity-60" : ""}
                  onChange={(event) =>
                    setIntegrationForm((current) => ({
                      ...current,
                      slackWebhook: event.target.value,
                    }))
                  }
                />
                {!integrationForm.slackEnabled ? (
                  <p className="text-xs text-muted-foreground">Activez Slack pour editer ce champ.</p>
                ) : null}
              </div>
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="zapier-enabled"
                    checked={integrationForm.zapierEnabled}
                    onCheckedChange={(checked) =>
                      setIntegrationForm((current) => ({
                        ...current,
                        zapierEnabled: Boolean(checked),
                      }))
                    }
                  />
                  <Label htmlFor="zapier-enabled">Zapier actif</Label>
                </div>
                <Input
                  placeholder="Zap ID"
                  value={integrationForm.zapierZapId}
                  disabled={!integrationForm.zapierEnabled}
                  className={!integrationForm.zapierEnabled ? "opacity-60" : ""}
                  onChange={(event) =>
                    setIntegrationForm((current) => ({
                      ...current,
                      zapierZapId: event.target.value,
                    }))
                  }
                />
                {!integrationForm.zapierEnabled ? (
                  <p className="text-xs text-muted-foreground">Activez Zapier pour editer ce champ.</p>
                ) : null}
              </div>
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="duckduckgo-enabled"
                    checked={integrationForm.duckduckgoEnabled}
                    onCheckedChange={(checked) =>
                      setIntegrationForm((current) => ({
                        ...current,
                        duckduckgoEnabled: Boolean(checked),
                      }))
                    }
                  />
                  <Label htmlFor="duckduckgo-enabled">DuckDuckGo web search (gratuit)</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Aucun token requis. Fournit la base de recherche web avancee.
                </p>
              </div>
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="perplexity-enabled"
                    checked={integrationForm.perplexityEnabled}
                    onCheckedChange={(checked) =>
                      setIntegrationForm((current) => ({
                        ...current,
                        perplexityEnabled: Boolean(checked),
                      }))
                    }
                  />
                  <Label htmlFor="perplexity-enabled">Perplexity (research competitor)</Label>
                </div>
                <Input
                  placeholder="Perplexity API key (optionnel)"
                  value={integrationForm.perplexityApiKey}
                  disabled={!integrationForm.perplexityEnabled}
                  className={!integrationForm.perplexityEnabled ? "opacity-60" : ""}
                  onChange={(event) =>
                    setIntegrationForm((current) => ({
                      ...current,
                      perplexityApiKey: event.target.value,
                    }))
                  }
                />
                <Input
                  placeholder="Modele (ex: sonar)"
                  value={integrationForm.perplexityModel}
                  disabled={!integrationForm.perplexityEnabled}
                  className={!integrationForm.perplexityEnabled ? "opacity-60" : ""}
                  onChange={(event) =>
                    setIntegrationForm((current) => ({
                      ...current,
                      perplexityModel: event.target.value,
                    }))
                  }
                />
                {!integrationForm.perplexityEnabled ? (
                  <p className="text-xs text-muted-foreground">Activez Perplexity pour editer ces champs.</p>
                ) : null}
              </div>
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="firecrawl-enabled"
                    checked={integrationForm.firecrawlEnabled}
                    onCheckedChange={(checked) =>
                      setIntegrationForm((current) => ({
                        ...current,
                        firecrawlEnabled: Boolean(checked),
                      }))
                    }
                  />
                  <Label htmlFor="firecrawl-enabled">Firecrawl (crawler competitor)</Label>
                </div>
                <Input
                  placeholder="Firecrawl API key (optionnel)"
                  value={integrationForm.firecrawlApiKey}
                  disabled={!integrationForm.firecrawlEnabled}
                  className={!integrationForm.firecrawlEnabled ? "opacity-60" : ""}
                  onChange={(event) =>
                    setIntegrationForm((current) => ({
                      ...current,
                      firecrawlApiKey: event.target.value,
                    }))
                  }
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Country (us)"
                    value={integrationForm.firecrawlCountry}
                    disabled={!integrationForm.firecrawlEnabled}
                    className={!integrationForm.firecrawlEnabled ? "opacity-60" : ""}
                    onChange={(event) =>
                      setIntegrationForm((current) => ({
                        ...current,
                        firecrawlCountry: event.target.value,
                      }))
                    }
                  />
                  <Input
                    placeholder="Lang (en)"
                    value={integrationForm.firecrawlLang}
                    disabled={!integrationForm.firecrawlEnabled}
                    className={!integrationForm.firecrawlEnabled ? "opacity-60" : ""}
                    onChange={(event) =>
                      setIntegrationForm((current) => ({
                        ...current,
                        firecrawlLang: event.target.value,
                      }))
                    }
                  />
                </div>
                {!integrationForm.firecrawlEnabled ? (
                  <p className="text-xs text-muted-foreground">Activez Firecrawl pour editer ces champs.</p>
                ) : null}
              </div>
            </div>
            <Button variant="outline" onClick={saveIntegrations} disabled={savingIntegrations}>
              {savingIntegrations ? "Sauvegarde..." : "Sauvegarder integrations"}
            </Button>
          </div>

          <div className="max-w-4xl space-y-4 rounded-xl border p-5">
            <h3 className="text-lg font-semibold">Webhooks</h3>
            <form onSubmit={createWebhook} className="grid gap-3 sm:grid-cols-3">
              <Input
                placeholder="Nom"
                value={webhookForm.name}
                onChange={(event) =>
                  setWebhookForm((current) => ({ ...current, name: event.target.value }))
                }
                required
              />
              <Input
                placeholder="https://..."
                value={webhookForm.url}
                onChange={(event) =>
                  setWebhookForm((current) => ({ ...current, url: event.target.value }))
                }
                required
              />
              <Input
                placeholder="events separes par des virgules"
                value={webhookForm.events}
                onChange={(event) =>
                  setWebhookForm((current) => ({ ...current, events: event.target.value }))
                }
                required
              />
              <div className="sm:col-span-3">
                <Button type="submit" disabled={creatingWebhook}>
                  {creatingWebhook ? "Creation..." : "Ajouter webhook"}
                </Button>
              </div>
            </form>
            <div className="space-y-2">
              {(webhooks?.items || []).map((webhook) => (
                <div
                  key={webhook.id}
                  className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">{webhook.name}</p>
                    <p className="text-xs text-muted-foreground">{webhook.url}</p>
                    <p className="text-xs text-muted-foreground">
                      events: {webhook.events.join(", ")} | {webhook.enabled ? "active" : "desactive"}
                    </p>
                  </div>
                  <Button variant="destructive" size="sm" onClick={() => void deleteWebhook(webhook.id)}>
                    Supprimer
                  </Button>
                </div>
              ))}
              {!webhooks || webhooks.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun webhook configure.</p>
              ) : null}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

