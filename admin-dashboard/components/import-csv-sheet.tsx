"use client"

import * as React from "react"
import { IconFileImport } from "@tabler/icons-react"
import { toast } from "sonner"

import { requestApi } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
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
  SheetTrigger,
} from "@/components/ui/sheet"

type SupportedTable = "leads" | "tasks" | "projects"

type PreviewResponse = {
  detected_table: SupportedTable
  selected_table: SupportedTable
  table_confidence: number
  headers: string[]
  suggested_mapping: Record<string, string>
  effective_mapping: Record<string, string>
  total_rows: number
  valid_rows: number
  invalid_rows: number
  errors: { row: number; message: string }[]
  preview: Record<string, string>[]
}

type CommitResponse = {
  table: SupportedTable
  processed_rows: number
  created: number
  updated: number
  skipped: number
  errors: { row: number; message: string }[]
}

const TABLE_FIELDS: Record<SupportedTable, Array<{ key: string; label: string }>> = {
  leads: [
    { key: "first_name", label: "Prenom" },
    { key: "last_name", label: "Nom" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Telephone" },
    { key: "company_name", label: "Entreprise" },
    { key: "status", label: "Statut" },
    { key: "segment", label: "Segment" },
  ],
  tasks: [
    { key: "id", label: "ID" },
    { key: "title", label: "Titre" },
    { key: "status", label: "Statut" },
    { key: "priority", label: "Priorite" },
    { key: "due_date", label: "Echeance" },
    { key: "assigned_to", label: "Assigne a" },
    { key: "lead_id", label: "Lead ID" },
  ],
  projects: [
    { key: "id", label: "ID" },
    { key: "name", label: "Nom" },
    { key: "description", label: "Description" },
    { key: "status", label: "Statut" },
    { key: "lead_id", label: "Lead ID" },
    { key: "due_date", label: "Echeance" },
  ],
}

const NONE_OPTION = "__none__"

function buildFormData(
  file: File,
  table: SupportedTable,
  mapping: Record<string, string>,
): FormData {
  const form = new FormData()
  form.append("file", file)
  form.append("table", table)
  form.append("mapping_json", JSON.stringify(mapping))
  return form
}

export function ImportCsvSheet({ onImported }: { onImported?: () => void }) {
  const [open, setOpen] = React.useState(false)
  const [file, setFile] = React.useState<File | null>(null)
  const [selectedTable, setSelectedTable] = React.useState<SupportedTable>("leads")
  const [preview, setPreview] = React.useState<PreviewResponse | null>(null)
  const [mapping, setMapping] = React.useState<Record<string, string>>({})
  const [loading, setLoading] = React.useState(false)
  const [committing, setCommitting] = React.useState(false)

  function resetState() {
    setFile(null)
    setSelectedTable("leads")
    setPreview(null)
    setMapping({})
    setLoading(false)
    setCommitting(false)
  }

  async function runPreview() {
    if (!file) {
      toast.error("Selectionnez un fichier CSV.")
      return
    }
    try {
      setLoading(true)
      const data = await requestApi<PreviewResponse>("/api/v1/admin/import/csv/preview", {
        method: "POST",
        body: buildFormData(file, selectedTable, mapping),
      })
      setPreview(data)
      setSelectedTable(data.selected_table)
      setMapping(data.effective_mapping || {})
      toast.success("Preview CSV charge.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Echec de l'analyse CSV")
    } finally {
      setLoading(false)
    }
  }

  async function runCommit() {
    if (!file) {
      toast.error("Selectionnez un fichier CSV.")
      return
    }
    try {
      setCommitting(true)
      const payload = await requestApi<CommitResponse>("/api/v1/admin/import/csv/commit", {
        method: "POST",
        body: buildFormData(file, selectedTable, mapping),
      })
      toast.success(
        `Import termine: ${payload.created} crees, ${payload.updated} maj, ${payload.skipped} ignores.`,
      )
      onImported?.()
      setOpen(false)
      resetState()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Echec de l'import CSV")
    } finally {
      setCommitting(false)
    }
  }

  const fields = TABLE_FIELDS[selectedTable]

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          resetState()
        }
      }}
    >
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-2">
          <IconFileImport className="size-4" />
          Import CSV
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Import CSV intelligent</SheetTitle>
          <SheetDescription>
            Detection automatique de table, mapping manuel possible, puis import dans cette application.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="csv-file">Fichier CSV</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </div>

          <div className="space-y-2">
            <Label>Table cible</Label>
            <Select
              value={selectedTable}
              onValueChange={(value) => setSelectedTable(value as SupportedTable)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="leads">Leads</SelectItem>
                <SelectItem value="tasks">Taches</SelectItem>
                <SelectItem value="projects">Projets</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {fields.length > 0 ? (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">Mapping des colonnes</p>
              {fields.map((field) => (
                <div key={field.key} className="grid grid-cols-2 items-center gap-3">
                  <p className="text-sm">{field.label}</p>
                  <Select
                    value={mapping[field.key] || NONE_OPTION}
                    onValueChange={(value) =>
                      setMapping((current) => ({
                        ...current,
                        [field.key]: value === NONE_OPTION ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Aucune colonne" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_OPTION}>Aucune</SelectItem>
                      {(preview?.headers || []).map((header) => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          ) : null}

          {preview ? (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline">Detecte: {preview.detected_table}</Badge>
                <Badge variant="secondary">Confiance: {preview.table_confidence}</Badge>
                <Badge variant="outline">Lignes: {preview.total_rows}</Badge>
                <Badge variant="outline">Valides: {preview.valid_rows}</Badge>
                <Badge variant="outline">Invalides: {preview.invalid_rows}</Badge>
              </div>
              {preview.errors.length > 0 ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                  {preview.errors.slice(0, 5).map((entry) => (
                    <p key={`${entry.row}-${entry.message}`}>
                      Ligne {entry.row}: {entry.message}
                    </p>
                  ))}
                </div>
              ) : null}
              {preview.preview.length > 0 ? (
                <div className="max-h-52 space-y-2 overflow-auto rounded-md border p-2">
                  {preview.preview.slice(0, 5).map((row, index) => (
                    <pre key={index} className="whitespace-pre-wrap text-xs">
                      {JSON.stringify(row, null, 2)}
                    </pre>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <SheetFooter className="mt-6">
          <Button type="button" variant="outline" onClick={runPreview} disabled={loading}>
            {loading ? "Analyse..." : "Analyser"}
          </Button>
          <Button type="button" onClick={runCommit} disabled={committing || !preview}>
            {committing ? "Import..." : "Importer"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

