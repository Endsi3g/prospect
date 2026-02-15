"use client"

import * as React from "react"
import { IconFileExport } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { requestApiBlob } from "@/lib/api"

type ExportEntity = "leads" | "tasks" | "projects" | "systems"

export function ExportCsvButton({
  entity,
  fields,
  label = "Exporter CSV",
  variant = "outline",
}: {
  entity: ExportEntity
  fields?: string[]
  label?: string
  variant?: "default" | "outline" | "secondary"
}) {
  const [loading, setLoading] = React.useState(false)

  async function onExport() {
    try {
      setLoading(true)
      const params = new URLSearchParams({ entity })
      if (fields && fields.length > 0) {
        params.set("fields", fields.join(","))
      }
      const blob = await requestApiBlob(`/api/v1/admin/export/csv?${params.toString()}`)
      const objectUrl = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = objectUrl
      link.download = `${entity}.csv`
      link.click()
      window.URL.revokeObjectURL(objectUrl)
      toast.success("Export CSV termine.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Echec de l'export CSV")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant={variant} onClick={onExport} disabled={loading}>
      <IconFileExport className="size-4" />
      {loading ? "Export..." : label}
    </Button>
  )
}
