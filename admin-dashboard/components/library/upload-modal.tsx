"use client"

import * as React from "react"
import {
  IconX,
  IconUpload,
  IconFileText,
  IconLoader2,
} from "@tabler/icons-react"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { requestApi } from "@/lib/api"

interface UploadModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function UploadModal({ open, onOpenChange, onSuccess }: UploadModalProps) {
  const [file, setFile] = React.useState<File | null>(null)
  const [title, setTitle] = React.useState("")
  const [isUploading, setIsUploading] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0]
      setFile(selectedFile)
      if (!title) {
        setTitle(selectedFile.name.split('.').slice(0, -1).join('.'))
      }
    }
  }

  const handleUpload = async () => {
    if (!file) return
    setIsUploading(true)
    const formData = new FormData()
    formData.append("file", file)
    if (title) formData.append("title", title)

    try {
      await requestApi("/api/v1/admin/library/upload", {
        method: "POST",
        body: formData,
      })
      toast.success("Document téléversé avec succès")
      setFile(null)
      setTitle("")
      onOpenChange(false)
      onSuccess()
    } catch (error) {
      toast.error("Erreur lors du téléversement")
      console.error(error)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Ajouter un document</DialogTitle>
          <DialogDescription>
            Téléversez un fichier PDF, Word ou une image dans votre bibliothèque.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div
            className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <IconFileText className="size-12 text-primary" />
                <p className="text-sm font-medium text-center">{file.name}</p>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-xs text-muted-foreground"
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                >
                  Changer
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <IconUpload className="size-12 opacity-50" />
                <p className="text-sm font-medium">Cliquez pour choisir un fichier</p>
                <p className="text-xs">PDF, DOCX, JPG, PNG (Max 50MB)</p>
              </div>
            )}
            <input
              type="file"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.webp"
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="title" className="text-sm font-medium">Titre du document</label>
            <Input
              id="title"
              placeholder="Titre facultatif"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleUpload} disabled={!file || isUploading}>
            {isUploading ? <><IconLoader2 className="mr-2 h-4 w-4 animate-spin" />Téléversement...</> : "Téléverser"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
