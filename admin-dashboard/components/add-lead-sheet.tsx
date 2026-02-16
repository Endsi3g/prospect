"use client"

import * as React from "react"
import { IconCirclePlusFilled } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { requestApi } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { isValidLeadEmail, isValidLeadPhone } from "@/lib/lead-form-validation"

type LeadFormState = {
  firstName: string
  lastName: string
  email: string
  phone: string
  company: string
  status: string
  segment: string
}

const DEFAULT_FORM: LeadFormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  company: "",
  status: "NEW",
  segment: "General",
}

export function AddLeadSheet() {
  const { messages } = useI18n()
  const [isOpen, setIsOpen] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(false)
  const [createAnother, setCreateAnother] = React.useState(false)
  const [form, setForm] = React.useState<LeadFormState>(DEFAULT_FORM)
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  function setField<K extends keyof LeadFormState>(key: K, value: LeadFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  function resetForm() {
    setForm(DEFAULT_FORM)
    setErrors({})
  }

  function validate(): boolean {
    const nextErrors: Record<string, string> = {}
    if (!form.firstName.trim()) nextErrors.firstName = "Prenom obligatoire."
    if (!form.lastName.trim()) nextErrors.lastName = "Nom obligatoire."
    if (!isValidLeadEmail(form.email)) nextErrors.email = "Email invalide."
    if (!isValidLeadPhone(form.phone)) nextErrors.phone = "Telephone invalide."
    if (!form.company.trim()) nextErrors.company = "Entreprise obligatoire."
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!validate()) return
    setIsLoading(true)

    const payload = {
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      company_name: form.company.trim(),
      status: form.status,
      segment: form.segment,
    }

    try {
      await requestApi("/api/v1/admin/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      toast.success("Lead cree avec succes.")
      window.dispatchEvent(new Event("prospect:lead-created"))
      if (createAnother) {
        resetForm()
      } else {
        setIsOpen(false)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur pendant la creation du lead.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open)
        if (!open) {
          resetForm()
          setCreateAnother(false)
        }
      }}
    >
      <SheetTrigger asChild>
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground h-11 w-full rounded-xl px-4 font-bold shadow-lg transition-all duration-200"
          aria-label={messages.addLead.quickButtonAria}
        >
          <IconCirclePlusFilled className="!size-5" />
          <span>{messages.sidebar.quickLead}</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-[460px] rounded-l-xl">
        <form onSubmit={onSubmit}>
          <SheetHeader>
            <SheetTitle>Ajouter un lead</SheetTitle>
            <SheetDescription>
              Creez un nouveau lead manuellement pour alimenter votre pipeline.
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-6 py-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">Prenom</Label>
                <Input
                  id="firstName"
                  value={form.firstName}
                  onChange={(event) => setField("firstName", event.target.value)}
                  className={errors.firstName ? "border-red-500 focus-visible:ring-red-500" : ""}
                  required
                />
                {errors.firstName ? <p className="text-xs text-red-600 font-medium">{errors.firstName}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Nom</Label>
                <Input
                  id="lastName"
                  value={form.lastName}
                  onChange={(event) => setField("lastName", event.target.value)}
                  className={errors.lastName ? "border-red-500 focus-visible:ring-red-500" : ""}
                  required
                />
                {errors.lastName ? <p className="text-xs text-red-600 font-medium">{errors.lastName}</p> : null}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(event) => setField("email", event.target.value)}
                onBlur={() => {
                  if (form.email && !isValidLeadEmail(form.email)) {
                    setErrors(prev => ({ ...prev, email: "Format d'email invalide" }))
                  }
                }}
                className={errors.email ? "border-red-500 focus-visible:ring-red-500" : ""}
                required
              />
              {errors.email ? <p className="text-xs text-red-600 font-medium">{errors.email}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telephone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(event) => setField("phone", event.target.value)}
                onBlur={() => {
                  if (form.phone && !isValidLeadPhone(form.phone)) {
                    setErrors((current) => ({ ...current, phone: "Format de telephone invalide" }))
                  }
                }}
                placeholder="+1 (555) 000-0000"
                className={errors.phone ? "border-red-500 focus-visible:ring-red-500" : ""}
              />
              {errors.phone ? <p className="text-xs text-red-600 font-medium">{errors.phone}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="company">Entreprise</Label>
              <Input
                id="company"
                value={form.company}
                onChange={(event) => setField("company", event.target.value)}
                className={errors.company ? "border-red-500 focus-visible:ring-red-500" : ""}
                required
              />
              {errors.company ? <p className="text-xs text-red-600 font-medium">{errors.company}</p> : null}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="status">Statut</Label>
                <Select value={form.status} onValueChange={(value) => setField("status", value)}>
                  <SelectTrigger id="status">
                    <SelectValue placeholder="Choisir un statut" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="NEW">Nouveau</SelectItem>
                    <SelectItem value="SCORED">Score</SelectItem>
                    <SelectItem value="CONTACTED">Contacte</SelectItem>
                    <SelectItem value="INTERESTED">Interesse</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="segment">Segment</Label>
                <Select value={form.segment} onValueChange={(value) => setField("segment", value)}>
                  <SelectTrigger id="segment">
                    <SelectValue placeholder="Choisir un segment" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="General">General</SelectItem>
                    <SelectItem value="Enterprise">Enterprise</SelectItem>
                    <SelectItem value="SMB">SMB</SelectItem>
                    <SelectItem value="Startup">Startup</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-medium">Previsualisation</p>
              <p>
                {form.firstName || "-"} {form.lastName || "-"} | {form.company || "Entreprise"}
              </p>
              <p className="text-muted-foreground">
                {form.email || "email@exemple.com"} - {form.segment}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="create-another"
                checked={createAnother}
                onCheckedChange={(checked) => setCreateAnother(Boolean(checked))}
              />
              <Label htmlFor="create-another">Creer un autre lead apres enregistrement</Label>
            </div>
          </div>
          <SheetFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creation..." : "Enregistrer"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
