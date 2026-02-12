"use client"

import { IconAlertTriangle } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"

export function ErrorState({
  title,
  description,
  onRetry,
}: {
  title: string
  description?: string
  onRetry?: () => void
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50/70 px-6 py-8 text-center">
      <IconAlertTriangle className="mb-2 size-7 text-red-600" />
      <h3 className="text-sm font-semibold text-red-900">{title}</h3>
      {description ? <p className="mt-1 text-sm text-red-700">{description}</p> : null}
      {onRetry ? (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          Reessayer
        </Button>
      ) : null}
    </div>
  )
}
