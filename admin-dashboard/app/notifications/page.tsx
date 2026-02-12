"use client"

import * as React from "react"
import useSWR from "swr"
import { toast } from "sonner"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { EmptyState } from "@/components/ui/empty-state"
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

type NotificationItem = {
  id: string
  event_key: string
  title: string
  message: string
  channel: "in_app" | "email"
  is_read: boolean
  created_at?: string | null
  link_href?: string | null
  entity_type?: string | null
  entity_id?: string | null
}

type NotificationsPayload = {
  items: NotificationItem[]
  unread_count: number
  next_cursor?: string | null
}

type NotificationPreferences = {
  channels: Record<string, Record<string, boolean>>
}

const fetcher = <T,>(path: string) => requestApi<T>(path)

export default function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = React.useState(false)
  const [channelFilter, setChannelFilter] = React.useState("all")
  const [eventFilter, setEventFilter] = React.useState("all")
  const [savingPrefs, setSavingPrefs] = React.useState(false)
  const [creatingDemo, setCreatingDemo] = React.useState(false)
  const [prefsDraft, setPrefsDraft] = React.useState<NotificationPreferences>({ channels: {} })

  const notificationsPath = React.useMemo(() => {
    const params = new URLSearchParams({ limit: "50" })
    if (unreadOnly) params.set("unread_only", "true")
    if (channelFilter !== "all") params.set("channel", channelFilter)
    if (eventFilter !== "all") params.set("event_key", eventFilter)
    return `/api/v1/admin/notifications?${params.toString()}`
  }, [channelFilter, eventFilter, unreadOnly])

  const {
    data: notifications,
    error: notificationsError,
    isLoading: notificationsLoading,
    mutate: mutateNotifications,
  } = useSWR<NotificationsPayload>(notificationsPath, fetcher)
  const {
    data: preferences,
    error: preferencesError,
    isLoading: preferencesLoading,
    mutate: mutatePreferences,
  } = useSWR<NotificationPreferences>("/api/v1/admin/notifications/preferences", fetcher)

  React.useEffect(() => {
    if (!preferences) return
    setPrefsDraft(preferences)
  }, [preferences])

  const eventKeys = React.useMemo(() => {
    const fromInApp = Object.keys(prefsDraft.channels.in_app || {})
    return Array.from(new Set(fromInApp)).sort()
  }, [prefsDraft.channels.in_app])

  async function markRead(notificationId: string) {
    try {
      await requestApi("/api/v1/admin/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [notificationId] }),
      })
      await mutateNotifications()
    } catch (markError) {
      toast.error(markError instanceof Error ? markError.message : "Action impossible")
    }
  }

  async function markAllRead() {
    try {
      await requestApi("/api/v1/admin/notifications/mark-all-read", { method: "POST" })
      toast.success("Toutes les notifications sont marquees comme lues.")
      await mutateNotifications()
    } catch (markError) {
      toast.error(markError instanceof Error ? markError.message : "Action impossible")
    }
  }

  async function savePreferences() {
    try {
      setSavingPrefs(true)
      await requestApi("/api/v1/admin/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefsDraft),
      })
      toast.success("Preferences enregistrees.")
      await mutatePreferences()
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Sauvegarde impossible")
    } finally {
      setSavingPrefs(false)
    }
  }

  async function createDemoNotification(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const title = String(formData.get("title") || "").trim()
    const message = String(formData.get("message") || "").trim()
    if (!title || !message) return
    try {
      setCreatingDemo(true)
      await requestApi("/api/v1/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_key: "report_ready",
          title,
          message,
          channel: "in_app",
          link_href: "/reports",
        }),
      })
      toast.success("Notification de test creee.")
      event.currentTarget.reset()
      await mutateNotifications()
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : "Creation impossible")
    } finally {
      setCreatingDemo(false)
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-3xl font-bold tracking-tight">Notifications</h2>
            <Button variant="outline" onClick={() => void markAllRead()}>
              Tout marquer lu ({notifications?.unread_count || 0})
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Filtres</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4">
              <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
                <Checkbox
                  id="unread_only"
                  checked={unreadOnly}
                  onCheckedChange={(checked) => setUnreadOnly(Boolean(checked))}
                />
                <Label htmlFor="unread_only">Non lues uniquement</Label>
              </div>
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Canal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous canaux</SelectItem>
                  <SelectItem value="in_app">In-app</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
              <Select value={eventFilter} onValueChange={setEventFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Evenement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous evenements</SelectItem>
                  {eventKeys.map((eventKey) => (
                    <SelectItem key={eventKey} value={eventKey}>
                      {eventKey}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Centre de notifications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {notificationsLoading ? (
                <>
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </>
              ) : null}
              {!notificationsLoading && notificationsError ? (
                <ErrorState title="Impossible de charger les notifications." onRetry={() => void mutateNotifications()} />
              ) : null}
              {!notificationsLoading && !notificationsError && notifications && notifications.items.length === 0 ? (
                <EmptyState
                  title="Aucune notification"
                  description="Les evenements critiques apparaitront ici."
                  className="min-h-28"
                />
              ) : null}
              {!notificationsLoading && !notificationsError && notifications ? (
                notifications.items.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-lg border p-3 ${item.is_read ? "opacity-75" : "border-primary/50"}`}
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-semibold">{item.title}</p>
                        <p className="text-sm text-muted-foreground">{item.message}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.event_key} | {item.channel} | {formatDateTimeFr(item.created_at)}
                        </p>
                        {item.link_href ? (
                          <a href={item.link_href} className="text-xs underline">
                            Ouvrir
                          </a>
                        ) : null}
                      </div>
                      {!item.is_read ? (
                        <Button variant="outline" size="sm" onClick={() => void markRead(item.id)}>
                          Marquer lu
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {preferencesLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : null}
              {!preferencesLoading && preferencesError ? (
                <ErrorState title="Impossible de charger les preferences." onRetry={() => void mutatePreferences()} />
              ) : null}
              {!preferencesLoading && !preferencesError ? (
                <>
                  {eventKeys.map((eventKey) => (
                    <div key={eventKey} className="grid gap-3 rounded-lg border p-3 md:grid-cols-3 md:items-center">
                      <p className="font-medium">{eventKey}</p>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`in_app_${eventKey}`}
                          checked={Boolean(prefsDraft.channels.in_app?.[eventKey])}
                          onCheckedChange={(checked) =>
                            setPrefsDraft((current) => ({
                              ...current,
                              channels: {
                                ...current.channels,
                                in_app: {
                                  ...(current.channels.in_app || {}),
                                  [eventKey]: Boolean(checked),
                                },
                              },
                            }))
                          }
                        />
                        <Label htmlFor={`in_app_${eventKey}`}>In-app</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`email_${eventKey}`}
                          checked={Boolean(prefsDraft.channels.email?.[eventKey])}
                          onCheckedChange={(checked) =>
                            setPrefsDraft((current) => ({
                              ...current,
                              channels: {
                                ...current.channels,
                                email: {
                                  ...(current.channels.email || {}),
                                  [eventKey]: Boolean(checked),
                                },
                              },
                            }))
                          }
                        />
                        <Label htmlFor={`email_${eventKey}`}>Email</Label>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-end">
                    <Button onClick={() => void savePreferences()} disabled={savingPrefs}>
                      {savingPrefs ? "Sauvegarde..." : "Sauvegarder preferences"}
                    </Button>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notification de test</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={createDemoNotification} className="grid gap-3 md:grid-cols-3">
                <Input name="title" placeholder="Titre" required />
                <Input name="message" placeholder="Message" required />
                <Button type="submit" disabled={creatingDemo}>
                  {creatingDemo ? "Creation..." : "Creer"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
