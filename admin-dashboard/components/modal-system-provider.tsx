"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { IconHelp, IconSearch } from "@tabler/icons-react"
import { toast } from "sonner"

import { requestApi } from "@/lib/api"
import { formatDateTimeFr } from "@/lib/format"
import { Button } from "@/components/ui/button"
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
} from "@/components/ui/sheet"
import { Toaster } from "@/components/ui/sonner"

type SearchResultItem = {
  type: "lead" | "task" | "project"
  id: string
  title: string
  subtitle: string
  href: string
}

type SearchResponse = {
  query: string
  total: number
  items: SearchResultItem[]
}

type HelpPayload = {
  support_email: string
  faqs: { question: string; answer: string }[]
  links: { label: string; href: string }[]
}

type ProjectFormInput = {
  id?: string
  name?: string
  description?: string | null
  status?: string
  lead_id?: string | null
  due_date?: string | null
}

type ProjectFormConfig = {
  mode?: "create" | "edit"
  project?: ProjectFormInput
  onSuccess?: () => void
}

type ConfirmConfig = {
  title: string
  description?: string
  confirmLabel?: string
  onConfirm?: () => void | Promise<void>
}

type ModalSystemContextValue = {
  openSearch: () => void
  openHelp: () => void
  openProjectForm: (config?: ProjectFormConfig) => void
  openConfirm: (config: ConfirmConfig) => void
}

const ModalSystemContext = React.createContext<ModalSystemContextValue | null>(null)

const PROJECT_STATUSES = ["Planning", "In Progress", "On Hold", "Completed", "Cancelled"]

function toDatetimeLocal(value?: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function toIsoFromDatetimeLocal(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

export function useModalSystem(): ModalSystemContextValue {
  const context = React.useContext(ModalSystemContext)
  if (!context) {
    throw new Error("useModalSystem must be used within ModalSystemProvider")
  }
  return context
}

export function ModalSystemProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  const [searchOpen, setSearchOpen] = React.useState(false)
  const [helpOpen, setHelpOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [searchLoading, setSearchLoading] = React.useState(false)
  const [searchResults, setSearchResults] = React.useState<SearchResultItem[]>([])
  const [recentSearches, setRecentSearches] = React.useState<SearchResultItem[]>([])

  const [helpData, setHelpData] = React.useState<HelpPayload | null>(null)
  const [helpLoading, setHelpLoading] = React.useState(false)

  const [projectConfig, setProjectConfig] = React.useState<ProjectFormConfig>({
    mode: "create",
  })
  const [projectOpen, setProjectOpen] = React.useState(false)
  const [projectSubmitting, setProjectSubmitting] = React.useState(false)
  const [projectForm, setProjectForm] = React.useState({
    id: "",
    name: "",
    description: "",
    status: "Planning",
    lead_id: "",
    due_date: "",
  })

  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [confirmLoading, setConfirmLoading] = React.useState(false)
  const [confirmConfig, setConfirmConfig] = React.useState<ConfirmConfig>({
    title: "",
  })

  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem("prospect:recent-searches")
      if (raw) {
        const parsed = JSON.parse(raw) as SearchResultItem[]
        setRecentSearches(Array.isArray(parsed) ? parsed : [])
      }
    } catch {
      setRecentSearches([])
    }
  }, [])

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isMetaK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k"
      if (isMetaK) {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  React.useEffect(() => {
    if (!searchOpen) return
    const cleanQuery = query.trim()
    if (!cleanQuery) {
      setSearchResults(recentSearches)
      return
    }

    const timeout = window.setTimeout(async () => {
      try {
        setSearchLoading(true)
        const data = await requestApi<SearchResponse>(
          `/api/v1/admin/search?q=${encodeURIComponent(cleanQuery)}&limit=15`,
        )
        setSearchResults(data.items)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Echec de la recherche")
      } finally {
        setSearchLoading(false)
      }
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [query, recentSearches, searchOpen])

  React.useEffect(() => {
    if (!helpOpen) return
    let active = true
    async function loadHelp() {
      try {
        setHelpLoading(true)
        const data = await requestApi<HelpPayload>("/api/v1/admin/help")
        if (active) setHelpData(data)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Echec du chargement de l'aide")
      } finally {
        if (active) setHelpLoading(false)
      }
    }
    loadHelp()
    return () => {
      active = false
    }
  }, [helpOpen])

  React.useEffect(() => {
    if (!projectOpen) return
    const source = projectConfig.project
    setProjectForm({
      id: source?.id || "",
      name: source?.name || "",
      description: source?.description || "",
      status: source?.status || "Planning",
      lead_id: source?.lead_id || "",
      due_date: toDatetimeLocal(source?.due_date),
    })
  }, [projectConfig.project, projectOpen])

  const openProjectForm = React.useCallback((config?: ProjectFormConfig) => {
    setProjectConfig(config || { mode: "create" })
    setProjectOpen(true)
  }, [])

  const openConfirm = React.useCallback((config: ConfirmConfig) => {
    setConfirmConfig(config)
    setConfirmOpen(true)
  }, [])

  const contextValue = React.useMemo<ModalSystemContextValue>(
    () => ({
      openSearch: () => setSearchOpen(true),
      openHelp: () => setHelpOpen(true),
      openProjectForm,
      openConfirm,
    }),
    [openConfirm, openProjectForm],
  )

  async function submitProjectForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!projectForm.name.trim()) {
      toast.error("Le nom du projet est obligatoire.")
      return
    }

    const payload = {
      name: projectForm.name.trim(),
      description: projectForm.description.trim() || null,
      status: projectForm.status,
      lead_id: projectForm.lead_id.trim() || null,
      due_date: toIsoFromDatetimeLocal(projectForm.due_date),
    }

    try {
      setProjectSubmitting(true)
      if (projectConfig.mode === "edit" && projectForm.id) {
        await requestApi(`/api/v1/admin/projects/${projectForm.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        toast.success("Projet mis a jour.")
      } else {
        await requestApi("/api/v1/admin/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        toast.success("Projet cree.")
      }
      setProjectOpen(false)
      projectConfig.onSuccess?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Echec de la sauvegarde du projet")
    } finally {
      setProjectSubmitting(false)
    }
  }

  async function runConfirmAction() {
    try {
      setConfirmLoading(true)
      await confirmConfig.onConfirm?.()
      setConfirmOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action impossible")
    } finally {
      setConfirmLoading(false)
    }
  }

  function onSearchSelect(item: SearchResultItem) {
    const nextRecent = [item, ...recentSearches.filter((entry) => entry.id !== item.id || entry.type !== item.type)].slice(0, 8)
    setRecentSearches(nextRecent)
    sessionStorage.setItem("prospect:recent-searches", JSON.stringify(nextRecent))
    setSearchOpen(false)
    setQuery("")
    router.push(item.href)
  }

  return (
    <ModalSystemContext.Provider value={contextValue}>
      {children}
      <Toaster position="top-right" />

      <Sheet open={searchOpen} onOpenChange={setSearchOpen}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <IconSearch className="size-4" />
              Recherche globale
            </SheetTitle>
            <SheetDescription>
              Recherchez des leads, des taches et des projets. Raccourci clavier: Ctrl+K / Cmd+K.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher..."
            />
            <div className="space-y-2">
              {searchLoading ? <p className="text-sm text-muted-foreground">Recherche en cours...</p> : null}
              {!searchLoading && searchResults.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun resultat.</p>
              ) : null}
              {searchResults.map((item) => (
                <button
                  key={`${item.type}:${item.id}`}
                  onClick={() => onSearchSelect(item)}
                  className="w-full rounded-lg border px-3 py-2 text-left transition hover:bg-accent"
                  type="button"
                >
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.type.toUpperCase()} - {item.subtitle}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={helpOpen} onOpenChange={setHelpOpen}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <IconHelp className="size-4" />
              Centre aide
            </SheetTitle>
            <SheetDescription>
              Questions frequentes et liens utiles.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {helpLoading ? <p className="text-sm text-muted-foreground">Chargement...</p> : null}
            {!helpLoading && helpData ? (
              <>
                <p className="text-sm">
                  Support:{" "}
                  <a href={`mailto:${helpData.support_email}`} className="font-medium underline">
                    {helpData.support_email}
                  </a>
                </p>
                <div className="space-y-3">
                  {helpData.faqs.map((faq) => (
                    <div key={faq.question} className="rounded-lg border p-3">
                      <p className="text-sm font-semibold">{faq.question}</p>
                      <p className="text-sm text-muted-foreground">{faq.answer}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  {helpData.links.map((link) => (
                    <Link key={link.href} href={link.href} className="block text-sm underline">
                      {link.label}
                    </Link>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={projectOpen} onOpenChange={setProjectOpen}>
        <SheetContent className="sm:max-w-lg">
          <form onSubmit={submitProjectForm}>
            <SheetHeader>
              <SheetTitle>
                {projectConfig.mode === "edit" ? "Modifier le projet" : "Nouveau projet"}
              </SheetTitle>
              <SheetDescription>
                {projectConfig.mode === "edit"
                  ? "Mettez a jour les informations du projet."
                  : "Creez un projet connecte a votre pipeline."}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="project-name">Nom</Label>
                <Input
                  id="project-name"
                  value={projectForm.name}
                  onChange={(event) =>
                    setProjectForm((current) => ({ ...current, name: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-description">Description</Label>
                <textarea
                  id="project-description"
                  className="min-h-24 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                  value={projectForm.description}
                  onChange={(event) =>
                    setProjectForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="project-status">Statut</Label>
                  <Select
                    value={projectForm.status}
                    onValueChange={(value) =>
                      setProjectForm((current) => ({ ...current, status: value }))
                    }
                  >
                    <SelectTrigger id="project-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_STATUSES.map((statusValue) => (
                        <SelectItem key={statusValue} value={statusValue}>
                          {statusValue}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project-lead-id">Lead ID</Label>
                  <Input
                    id="project-lead-id"
                    value={projectForm.lead_id}
                    onChange={(event) =>
                      setProjectForm((current) => ({ ...current, lead_id: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-due-date">Echeance</Label>
                <Input
                  id="project-due-date"
                  type="datetime-local"
                  value={projectForm.due_date}
                  onChange={(event) =>
                    setProjectForm((current) => ({ ...current, due_date: event.target.value }))
                  }
                />
                {projectForm.due_date ? (
                  <p className="text-xs text-muted-foreground">
                    {formatDateTimeFr(toIsoFromDatetimeLocal(projectForm.due_date))}
                  </p>
                ) : null}
              </div>
            </div>
            <SheetFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setProjectOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={projectSubmitting}>
                {projectSubmitting ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={confirmOpen} onOpenChange={setConfirmOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{confirmConfig.title}</SheetTitle>
            <SheetDescription>{confirmConfig.description}</SheetDescription>
          </SheetHeader>
          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={confirmLoading}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={runConfirmAction} disabled={confirmLoading}>
              {confirmLoading ? "Traitement..." : confirmConfig.confirmLabel || "Confirmer"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </ModalSystemContext.Provider>
  )
}

