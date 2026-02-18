"use client"

import * as React from "react"
import { IconX, IconDownload, IconFileText, IconLoader2 } from "@tabler/icons-react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface DocumentPreviewProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  docId: string
  title: string
  fileType: string
}

export function DocumentPreview({ open, onOpenChange, docId, title, fileType }: DocumentPreviewProps) {
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState(false)

  const fileUrl = `/api/v1/admin/library/documents/${docId}/file`

  const isImage = ["jpg", "jpeg", "png", "webp", "gif", "image"].includes(fileType.toLowerCase())
  const isPdf = fileType.toLowerCase() === "pdf"

  React.useEffect(() => {
    setIsLoading(true)
    setError(false)
  }, [docId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-4 border-b">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="truncate pr-8">{title}</DialogTitle>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 gap-2"
                onClick={() => window.open(fileUrl, "_blank")}
              >
                <IconDownload className="size-4" />
                Télécharger
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-[500px] flex items-center justify-center bg-muted/20 relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/50 z-10">
              <IconLoader2 className="size-8 animate-spin text-primary" />
            </div>
          )}

          {isImage ? (
            <img 
              src={fileUrl} 
              alt={title} 
              className="max-w-full max-h-full object-contain"
              onLoad={() => setIsLoading(false)}
              onError={() => { setIsLoading(false); setError(true); }}
            />
          ) : isPdf ? (
            <iframe 
              src={`${fileUrl}#toolbar=0`} 
              title={title}
              className="w-full h-full border-none"
              onLoad={() => setIsLoading(false)}
            />
          ) : (
            <div className="flex flex-col items-center gap-4 text-muted-foreground p-12 text-center">
              <IconFileText className="size-24 opacity-20" />
              <p>L&apos;aperçu n&apos;est pas disponible pour ce type de fichier ({fileType}).</p>
              <Button variant="outline" onClick={() => window.open(fileUrl, "_blank")}>
                Télécharger pour consulter
              </Button>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center gap-4 text-destructive p-12 text-center">
              <IconX className="size-24 opacity-20" />
              <p>Erreur lors du chargement du fichier.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
