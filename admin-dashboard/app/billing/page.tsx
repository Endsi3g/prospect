"use client"

import * as React from "react"
import useSWR from "swr"
import { toast } from "sonner"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
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
import { formatCurrencyFr, formatDateFr, formatDateTimeFr, formatNumberFr } from "@/lib/format"

type BillingProfile = {
  plan_name: string
  billing_cycle: string
  status: string
  currency: string
  amount_cents: number
  company_name: string
  billing_email: string
  vat_number: string
  address_line: string
  city: string
  postal_code: string
  country: string
  notes: string
  updated_at?: string | null
}

type BillingInvoice = {
  id: string
  invoice_number: string
  period_start?: string | null
  period_end?: string | null
  issued_at?: string | null
  due_at?: string | null
  status: string
  currency: string
  amount_cents: number
  notes?: string | null
}

type BillingPayload = {
  profile: BillingProfile
  invoices: BillingInvoice[]
  summary: {
    invoice_count: number
    outstanding_cents: number
    paid_cents: number
  }
}

const fetcher = <T,>(path: string) => requestApi<T>(path)

export default function BillingPage() {
  const { data, error, isLoading, mutate } = useSWR<BillingPayload>("/api/v1/admin/billing", fetcher)
  const [saving, setSaving] = React.useState(false)
  const [creatingInvoice, setCreatingInvoice] = React.useState(false)
  const [profile, setProfile] = React.useState<BillingProfile>({
    plan_name: "Business",
    billing_cycle: "monthly",
    status: "active",
    currency: "EUR",
    amount_cents: 9900,
    company_name: "",
    billing_email: "",
    vat_number: "",
    address_line: "",
    city: "",
    postal_code: "",
    country: "France",
    notes: "",
  })
  const [invoiceForm, setInvoiceForm] = React.useState({
    invoice_number: "",
    amount_cents: 0,
    status: "issued",
    due_at: "",
  })

  React.useEffect(() => {
    if (!data) return
    setProfile(data.profile)
  }, [data])

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      setSaving(true)
      await requestApi("/api/v1/admin/billing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      })
      toast.success("Facturation mise a jour.")
      await mutate()
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : "Echec de sauvegarde")
    } finally {
      setSaving(false)
    }
  }

  async function createInvoice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      setCreatingInvoice(true)
      await requestApi("/api/v1/admin/billing/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_number: invoiceForm.invoice_number,
          amount_cents: Number(invoiceForm.amount_cents),
          status: invoiceForm.status,
          due_at: invoiceForm.due_at ? new Date(invoiceForm.due_at).toISOString() : null,
        }),
      })
      toast.success("Facture ajoutee.")
      setInvoiceForm({
        invoice_number: "",
        amount_cents: 0,
        status: "issued",
        due_at: "",
      })
      await mutate()
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : "Creation facture impossible")
    } finally {
      setCreatingInvoice(false)
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
          <h2 className="text-3xl font-bold tracking-tight">Facturation</h2>
          {error ? (
            <ErrorState title="Impossible de charger la facturation." onRetry={() => void mutate()} />
          ) : null}
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : null}
          {!isLoading && data ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Factures total</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-semibold">
                    {formatNumberFr(data.summary.invoice_count)}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Encaisse</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-semibold">
                    {formatCurrencyFr((data.summary.paid_cents || 0) / 100)}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">A encaisser</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-semibold">
                    {formatCurrencyFr((data.summary.outstanding_cents || 0) / 100)}
                  </CardContent>
                </Card>
              </div>

              <form onSubmit={saveProfile} className="max-w-5xl space-y-5 rounded-xl border p-5">
                <h3 className="text-lg font-semibold">Profil de facturation</h3>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="plan_name">Plan</Label>
                    <Input
                      id="plan_name"
                      value={profile.plan_name}
                      onChange={(event) => setProfile((current) => ({ ...current, plan_name: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cycle</Label>
                    <Select
                      value={profile.billing_cycle}
                      onValueChange={(value) => setProfile((current) => ({ ...current, billing_cycle: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Mensuel</SelectItem>
                        <SelectItem value="quarterly">Trimestriel</SelectItem>
                        <SelectItem value="yearly">Annuel</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={profile.status}
                      onValueChange={(value) => setProfile((current) => ({ ...current, status: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Actif</SelectItem>
                        <SelectItem value="past_due">En retard</SelectItem>
                        <SelectItem value="cancelled">Annule</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="amount_cents">Montant (centimes)</Label>
                    <Input
                      id="amount_cents"
                      type="number"
                      min={0}
                      value={profile.amount_cents}
                      onChange={(event) =>
                        setProfile((current) => ({ ...current, amount_cents: Number(event.target.value) }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company_name">Entreprise</Label>
                    <Input
                      id="company_name"
                      value={profile.company_name}
                      onChange={(event) =>
                        setProfile((current) => ({ ...current, company_name: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="billing_email">Email facturation</Label>
                    <Input
                      id="billing_email"
                      type="email"
                      value={profile.billing_email}
                      onChange={(event) =>
                        setProfile((current) => ({ ...current, billing_email: event.target.value }))
                      }
                      required
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="address_line">Adresse</Label>
                    <Input
                      id="address_line"
                      value={profile.address_line}
                      onChange={(event) =>
                        setProfile((current) => ({ ...current, address_line: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">Ville</Label>
                    <Input
                      id="city"
                      value={profile.city}
                      onChange={(event) => setProfile((current) => ({ ...current, city: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="postal_code">Code postal</Label>
                    <Input
                      id="postal_code"
                      value={profile.postal_code}
                      onChange={(event) =>
                        setProfile((current) => ({ ...current, postal_code: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Derniere mise a jour: {formatDateTimeFr(profile.updated_at)}
                  </p>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Enregistrement..." : "Enregistrer"}
                  </Button>
                </div>
              </form>

              <Card>
                <CardHeader>
                  <CardTitle>Ajouter une facture</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={createInvoice} className="grid gap-3 md:grid-cols-4">
                    <Input
                      placeholder="Numero facture"
                      value={invoiceForm.invoice_number}
                      onChange={(event) =>
                        setInvoiceForm((current) => ({ ...current, invoice_number: event.target.value }))
                      }
                      required
                    />
                    <Input
                      type="number"
                      min={0}
                      placeholder="Montant (centimes)"
                      value={invoiceForm.amount_cents}
                      onChange={(event) =>
                        setInvoiceForm((current) => ({ ...current, amount_cents: Number(event.target.value) }))
                      }
                      required
                    />
                    <Select
                      value={invoiceForm.status}
                      onValueChange={(value) => setInvoiceForm((current) => ({ ...current, status: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="issued">Emise</SelectItem>
                        <SelectItem value="paid">Payee</SelectItem>
                        <SelectItem value="overdue">En retard</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="datetime-local"
                      value={invoiceForm.due_at}
                      onChange={(event) =>
                        setInvoiceForm((current) => ({ ...current, due_at: event.target.value }))
                      }
                    />
                    <div className="md:col-span-4">
                      <Button type="submit" disabled={creatingInvoice}>
                        {creatingInvoice ? "Ajout..." : "Ajouter facture"}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Historique des factures</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.invoices.length === 0 ? (
                    <EmptyState
                      title="Aucune facture"
                      description="Ajoutez votre premiere facture pour demarrer le suivi."
                      className="min-h-28"
                    />
                  ) : (
                    data.invoices.map((invoice) => (
                      <div
                        key={invoice.id}
                        className="flex flex-col gap-2 rounded-lg border p-3 md:flex-row md:items-center md:justify-between"
                      >
                        <div>
                          <p className="font-medium">{invoice.invoice_number}</p>
                          <p className="text-xs text-muted-foreground">
                            Emise: {formatDateFr(invoice.issued_at)} | Echeance: {formatDateFr(invoice.due_at)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{formatCurrencyFr((invoice.amount_cents || 0) / 100)}</p>
                          <p className="text-xs text-muted-foreground">{invoice.status}</p>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
