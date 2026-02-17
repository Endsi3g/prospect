"use client"

import * as React from "react"
import { IconKey, IconTrash, IconCheck, IconAlertTriangle } from "@tabler/icons-react"
import { toast } from "sonner"
import useSWR from "swr"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { requestApi } from "@/lib/api"

type SecretKey = {
  key: string
  required: boolean
  multiline: boolean
  description: string
  readonly?: boolean
}

type SecretCategory = {
  id: string
  label: string
  keys: SecretKey[]
}

type SecretSchema = {
  version: string
  categories: SecretCategory[]
}

type SecretStateItem = {
  key: string
  configured: boolean
  source: "db" | "env" | "none"
  masked_value: string
  updated_at: string | null
}

type SecretListResponse = {
  items: SecretStateItem[]
}

const fetcher = <T,>(path: string) => requestApi<T>(path)

interface SecretsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SecretsModal({ open, onOpenChange }: SecretsModalProps) {
  const { data: schema, isLoading: loadingSchema } = useSWR<SecretSchema>(
    open ? "/api/v1/admin/secrets/schema" : null,
    fetcher
  )
  const { data: states, isLoading: loadingStates, mutate: mutateStates } = useSWR<SecretListResponse>(
    open ? "/api/v1/admin/secrets" : null,
    fetcher
  )

  const [editingKey, setEditingKey] = React.useState<string | null>(null)
  const [inputValue, setInputValue] = React.useState("")
  const [isSaving, setIsSaving] = React.useState(false)

  const statesMap = React.useMemo(() => {
    const map = new Map<string, SecretStateItem>()
    states?.items.forEach(item => map.set(item.key, item))
    return map
  }, [states])

  async function handleSave() {
    if (!editingKey || !inputValue.trim()) return
    
    setIsSaving(true)
    try {
      await requestApi("/api/v1/admin/secrets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: editingKey, value: inputValue.trim() }),
      })
      toast.success(`Clé ${editingKey} enregistrée.`)
      setEditingKey(null)
      setInputValue("")
      await mutateStates()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur de sauvegarde")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(key: string) {
    try {
      await requestApi(`/api/v1/admin/secrets/${key}`, { method: "DELETE" })
      toast.success(`Clé ${key} supprimée du vault.`)
      await mutateStates()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur de suppression")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconKey className="size-5 text-primary" />
            Gestion des Secrets ENV
          </DialogTitle>
          <DialogDescription>
            Configurez vos clés d&apos;API de manière sécurisée. Les valeurs stockées en base de données sont chiffrées et prioritaires sur les variables d&apos;environnement.
          </DialogDescription>
        </DialogHeader>

        {loadingSchema || loadingStates ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {schema?.categories.map((category) => (
              <div key={category.id} className="space-y-3">
                <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  {category.label}
                </h4>
                <div className="grid gap-3">
                  {category.keys.map((k) => {
                    const state = statesMap.get(k.key)
                    const isEditing = editingKey === k.key
                    const isConfigured = state?.configured
                    
                    return (
                      <div key={k.key} className="rounded-lg border bg-card p-3 shadow-xs">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <code className="text-xs font-bold text-primary">{k.key}</code>
                              {isConfigured && (
                                <Badge variant={state?.source === "db" ? "default" : "secondary"} className="text-[10px] h-4">
                                  {state?.source === "db" ? "VAULT DB" : "ENV OS"}
                                </Badge>
                              )}
                              {!isConfigured && (
                                <Badge variant="outline" className="text-[10px] h-4 border-dashed text-muted-foreground">
                                  NON CONFIGURÉ
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{k.description}</p>
                          </div>
                          
                          {!k.readonly && (
                            <div className="flex gap-2">
                              {isConfigured && state?.source === "db" && !isEditing && (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="size-7 h-7 w-7 text-muted-foreground hover:text-destructive"
                                  onClick={() => handleDelete(k.key)}
                                >
                                  <IconTrash className="size-3.5" />
                                </Button>
                              )}
                              <Button 
                                variant={isEditing ? "default" : "outline"} 
                                size="sm" 
                                className="h-7 text-[10px]"
                                onClick={() => {
                                  if (isEditing) handleSave()
                                  else {
                                    setEditingKey(k.key)
                                    setInputValue("")
                                  }
                                }}
                                disabled={isSaving}
                              >
                                {isEditing ? "Enregistrer" : isConfigured ? "Modifier" : "Configurer"}
                              </Button>
                            </div>
                          )}
                        </div>

                        {isEditing && (
                          <div className="mt-3 flex gap-2">
                            <Input
                              autoFocus
                              placeholder="Saisir la nouvelle valeur..."
                              value={inputValue}
                              onChange={(e) => setInputValue(e.target.value)}
                              className="h-8 text-xs font-mono"
                              type="password"
                            />
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 text-[10px]"
                              onClick={() => setEditingKey(null)}
                            >
                              Annuler
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-2 flex items-center gap-2 rounded-md bg-amber-50 p-3 text-[11px] text-amber-800 dark:bg-amber-950/20 dark:text-amber-400">
          <IconAlertTriangle className="size-4 shrink-0" />
          <p>
            Les secrets enregistrés ici sont prioritaires. Si une clé est présente à la fois dans le 
            <strong> Vault DB</strong> et dans le fichier <strong>.env</strong>, c&apos;est la valeur de la DB qui sera utilisée par les services IA et d&apos;enrichissement.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
