"use client"

import * as React from "react"
import useSWR from "swr"
import { toast } from "sonner"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

type Role = {
  id: number
  key: string
  label: string
}

type User = {
  id: string
  email: string
  display_name?: string | null
  status: "active" | "invited" | "disabled"
  roles: string[]
}

type UsersResponse = {
  items: User[]
}

type RolesResponse = {
  items: Role[]
}

const USER_STATUSES: User["status"][] = ["active", "invited", "disabled"]
const fetcher = <T,>(path: string) => requestApi<T>(path)

export default function TeamSettingsPage() {
  const { data: usersData, error: usersError, isLoading: usersLoading, mutate: mutateUsers } = useSWR<UsersResponse>(
    "/api/v1/admin/users",
    fetcher,
  )
  const { data: rolesData, error: rolesError, isLoading: rolesLoading } = useSWR<RolesResponse>(
    "/api/v1/admin/roles",
    fetcher,
  )

  const [email, setEmail] = React.useState("")
  const [displayName, setDisplayName] = React.useState("")
  const [inviteRole, setInviteRole] = React.useState("sales")
  const [submitting, setSubmitting] = React.useState(false)
  const [updatingId, setUpdatingId] = React.useState<string | null>(null)
  const [pendingStatus, setPendingStatus] = React.useState<Record<string, User["status"]>>({})
  const [pendingRole, setPendingRole] = React.useState<Record<string, string>>({})

  const roleOptions = React.useMemo(() => rolesData?.items || [], [rolesData])
  const users = React.useMemo(() => usersData?.items || [], [usersData])

  React.useEffect(() => {
    if (roleOptions.length > 0 && !roleOptions.some((role) => role.key === inviteRole)) {
      setInviteRole(roleOptions[0].key)
    }
  }, [inviteRole, roleOptions])

  async function inviteUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      setSubmitting(true)
      await requestApi("/api/v1/admin/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          display_name: displayName || null,
          roles: [inviteRole],
        }),
      })
      toast.success("Invitation envoyee.")
      setEmail("")
      setDisplayName("")
      await mutateUsers()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invitation impossible")
    } finally {
      setSubmitting(false)
    }
  }

  async function updateUser(user: User) {
    const status = pendingStatus[user.id] || user.status
    const role = pendingRole[user.id] || user.roles[0] || "sales"
    try {
      setUpdatingId(user.id)
      await requestApi(`/api/v1/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          roles: [role],
        }),
      })
      toast.success("Utilisateur mis a jour.")
      await mutateUsers()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise a jour impossible")
    } finally {
      setUpdatingId(null)
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
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 md:p-8">
          <h2 className="text-3xl font-bold tracking-tight">Equipe & roles</h2>

          <Card>
            <CardHeader>
              <CardTitle>Inviter un utilisateur</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={inviteUser} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2 lg:col-span-2">
                  <Label htmlFor="invite-email">Email</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-name">Nom</Label>
                  <Input
                    id="invite-name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((role) => (
                        <SelectItem key={role.key} value={role.key}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2 lg:col-span-4">
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Invitation..." : "Inviter"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {usersLoading || rolesLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : null}
          {!usersLoading && (usersError || rolesError) ? (
            <ErrorState title="Impossible de charger les utilisateurs." onRetry={() => void mutateUsers()} />
          ) : null}
          {!usersLoading && !usersError && users.length === 0 ? (
            <EmptyState
              title="Aucun utilisateur invite"
              description="Invitez votre equipe pour activer la gestion de roles."
            />
          ) : null}
          {!usersLoading && !usersError && users.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Utilisateurs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-center"
                  >
                    <div className="lg:col-span-2">
                      <p className="text-sm font-medium">{user.display_name || user.email}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <div>
                      <Select
                        value={pendingStatus[user.id] || user.status}
                        onValueChange={(value) =>
                          setPendingStatus((current) => ({
                            ...current,
                            [user.id]: value as User["status"],
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {USER_STATUSES.map((statusValue) => (
                            <SelectItem key={statusValue} value={statusValue}>
                              {statusValue}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Select
                        value={pendingRole[user.id] || user.roles[0] || "sales"}
                        onValueChange={(value) =>
                          setPendingRole((current) => ({ ...current, [user.id]: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {roleOptions.map((role) => (
                            <SelectItem key={role.key} value={role.key}>
                              {role.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="lg:col-span-2">
                      <Button
                        variant="outline"
                        onClick={() => void updateUser(user)}
                        disabled={updatingId === user.id}
                      >
                        {updatingId === user.id ? "Mise a jour..." : "Enregistrer"}
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
