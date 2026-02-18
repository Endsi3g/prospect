"use client"

import * as React from "react"
import useSWR from "swr"
import {
  IconBook,
  IconRefresh,
  IconSend,
  IconBrain,
  IconSparkles,
  IconUser,
  IconFileText,
  IconSearch,
  IconUpload,
  IconPlus,
  IconTrash,
  IconDownload,
  IconEye,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { UploadModal } from "@/components/library/upload-modal"
import { DocumentPreview } from "@/components/library/document-preview"

import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { requestApi } from "@/lib/api"
import { formatNumberFr, formatDateTimeFr } from "@/lib/format"
import { cn } from "@/lib/utils"

type LibraryDoc = {
  id: string
  title: string
  filename: string
  file_type: string
  size_bytes: number
  mime_type: string
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

type ChatMessage = {
  role: "user" | "assistant"
  content: string
  sources?: { source: string }[]
  isThinking?: boolean
}

const fetcher = <T,>(path: string) => requestApi<T>(path)

export default function LibraryPage() {
  const [search, setSearch] = React.useState("")
  const [isUploadOpen, setIsUploadOpen] = React.useState(false)
  const [previewDoc, setPreviewDoc] = React.useState<LibraryDoc | null>(null)
  const [isDeleting, setIsDeleting] = React.useState<string | null>(null)

  // Chat state
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    { role: "assistant", content: "Bonjour ! Je suis connecté à votre base de connaissances. Comment puis-je vous aider aujourd'hui ?" }
  ])
  const [input, setInput] = React.useState("")
  const [isChatLoading, setIsChatLoading] = React.useState(false)
  const [isIngesting, setIsIngesting] = React.useState(false)
  const scrollAreaRef = React.useRef<HTMLDivElement>(null)
  const bottomRef = React.useRef<HTMLDivElement>(null)

  const queryParams = new URLSearchParams()
  if (search.trim()) queryParams.set("query", search.trim())

  const { data: documents, error, isLoading, mutate } = useSWR<LibraryDoc[]>(
    `/api/v1/admin/library/documents?${queryParams.toString()}`,
    fetcher
  )

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isChatLoading])

  const handleIngest = async () => {
    setIsIngesting(true)
    const toastId = toast.loading("Analyse des documents en cours...")
    try {
      const res = await requestApi<{ ingested: number, failed: number }>("/api/v1/admin/rag/ingest", { method: "POST" })
      toast.dismiss(toastId)
      if (res.ingested > 0) {
        toast.success(`${res.ingested} nouveaux documents indexés !`, {
          description: `${res.failed} échecs.`
        })
      } else {
        toast.info("Aucun nouveau document trouvé.", {
          description: "Votre base est déjà à jour."
        })
      }
      mutate()
    } catch {
      toast.dismiss(toastId)
      toast.error("Erreur lors de la synchronisation.")
    } finally {
      setIsIngesting(false)
    }
  }

  const handleSend = async () => {
    if (!input.trim() || isChatLoading) return
    const userMsg = input.trim()
    setInput("")
    setMessages(prev => [...prev, { role: "user", content: userMsg }])
    setIsChatLoading(true)

    try {
      const res = await requestApi<{ answer: string, sources: { source: string }[] }>("/api/v1/admin/rag/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userMsg })
      })
      setMessages(prev => [...prev, { role: "assistant", content: res.answer, sources: res.sources }])
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Désolé, je rencontre des difficultés pour accéder au cerveau..." }])
    } finally {
      setIsChatLoading(false)
    }
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm("Voulez-vous vraiment supprimer ce document ?")) return
    setIsDeleting(id)
    try {
      await requestApi(`/api/v1/admin/library/documents/${id}`, { method: "DELETE" })
      toast.success("Document supprimé")
      mutate()
    } catch {
      toast.error("Erreur lors de la suppression")
    } finally {
      setIsDeleting(null)
    }
  }

  const downloadFile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    window.open(`/api/v1/admin/library/documents/${id}/file`, "_blank")
  }

  return (
    <SidebarProvider
      style={{
        "--sidebar-width": "calc(var(--spacing) * 72)",
        "--header-height": "calc(var(--spacing) * 12)",
      } as React.CSSProperties}
    >
      <AppSidebar variant="inset" />
      <SidebarInset className="overflow-hidden h-screen flex flex-col">
        <SiteHeader />

        <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden bg-background/50">
          {/* LEFT: Library and Search - Document Management */}
          <div className="flex-1 flex flex-col relative border-r border-border/40 min-w-0">
            <div className="flex items-center justify-between p-4 border-b border-border/40 bg-muted/10 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                  <IconBook className="size-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-sm">Bibliothèque de Connaissances</h2>
                  <p className="text-[10px] text-muted-foreground">{documents?.length || 0} documents disponibles</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative hidden sm:block">
                  <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher..."
                    className="h-8 pl-8 w-48 text-xs bg-background/50"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Button size="sm" className="h-8 gap-2" onClick={() => setIsUploadOpen(true)}>
                  <IconPlus className="size-3.5" />
                  Ajouter
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 px-2" 
                  onClick={handleIngest} 
                  disabled={isIngesting}
                  title="Synchroniser RAG"
                >
                  <IconRefresh className={cn("size-3.5", isIngesting && "animate-spin")} />
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1 p-6">
              {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-32 w-full rounded-xl" />
                  ))}
                </div>
              ) : !documents?.length ? (
                <div className="h-full flex flex-col items-center justify-center gap-4 text-muted-foreground opacity-50">
                  <IconFileText className="size-16" />
                  <p className="text-sm">Aucun document trouvé dans la bibliothèque.</p>
                  <Button variant="outline" onClick={() => setIsUploadOpen(true)}>Commencer par ajouter un fichier</Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="group relative flex flex-col bg-white dark:bg-zinc-900 border border-border/50 rounded-xl overflow-hidden hover:shadow-lg hover:border-indigo-500/30 transition-all cursor-pointer"
                      onClick={() => setPreviewDoc(doc)}
                    >
                      <div className="h-24 bg-muted/30 flex items-center justify-center relative">
                        <div className="size-12 rounded-lg bg-white dark:bg-zinc-800 border shadow-sm flex items-center justify-center text-xs font-bold text-muted-foreground tracking-tighter uppercase">
                          {doc.file_type || "DOC"}
                        </div>
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); setPreviewDoc(doc); }}>
                            <IconEye className="size-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20" onClick={(e) => downloadFile(doc.id, e)}>
                            <IconDownload className="size-4" />
                          </Button>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8 text-white hover:bg-red-500/80" 
                            onClick={(e) => handleDelete(doc.id, e)}
                            disabled={isDeleting === doc.id}
                          >
                            <IconTrash className="size-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="p-3">
                        <h4 className="text-sm font-semibold truncate text-foreground/90 mb-1" title={doc.title}>
                          {doc.title}
                        </h4>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>{formatNumberFr(doc.size_bytes / 1024 / 1024)} MB</span>
                          <span>{formatDateTimeFr(doc.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* RIGHT: Chat Assistant - Focused on asking questions about the library */}
          <div className="w-[400px] border-l border-border/40 bg-zinc-50/50 dark:bg-zinc-900/20 flex flex-col hidden xl:flex">
            <div className="p-4 border-b border-border/40 bg-muted/10">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                  <IconBrain className="size-5" />
                </div>
                <h3 className="font-semibold text-sm">Assistant Connaissance</h3>
              </div>
            </div>

            <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
              <div className="space-y-4">
                {messages.map((m, i) => (
                  <div key={i} className={cn(
                    "flex flex-col gap-2",
                    m.role === "user" ? "items-end" : "items-start"
                  )}>
                    <div className={cn(
                      "p-3 rounded-xl text-xs shadow-sm max-w-[90%]",
                      m.role === "user"
                        ? "bg-zinc-900 text-zinc-50 rounded-tr-sm"
                        : "bg-white dark:bg-zinc-800 border border-border/50 rounded-tl-sm"
                    )}>
                      <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                    </div>

                    {m.sources && m.sources.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 px-1">
                        {m.sources.map((s: { source: string }, idx: number) => (
                          <Badge
                            key={idx}
                            variant="secondary"
                            className="h-5 text-[9px] rounded-md px-1.5 gap-1 bg-indigo-500/5 text-indigo-700 border-indigo-200/50"
                          >
                            {s.source.split(/[\\/]/).pop()}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {isChatLoading && (
                  <div className="bg-white dark:bg-zinc-800 border border-border/50 p-3 rounded-xl rounded-tl-sm flex gap-1 items-center shadow-sm w-fit">
                    <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce"></span>
                  </div>
                )}
                <div ref={bottomRef} className="h-px" />
              </div>
            </ScrollArea>

            <div className="p-4 bg-background/80 border-t border-border/40">
              <form
                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                className="relative flex flex-col gap-2"
              >
                <div className="relative">
                  <Input
                    placeholder="Une question sur vos docs ?"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    disabled={isChatLoading}
                    className="pr-10 py-5 bg-muted/30 border-muted-foreground/20 text-xs"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!input.trim() || isChatLoading}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-lg bg-indigo-600 hover:bg-indigo-700"
                  >
                    <IconSend className="size-3.5" />
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </SidebarInset>

      <UploadModal 
        open={isUploadOpen} 
        onOpenChange={setIsUploadOpen} 
        onSuccess={() => mutate()} 
      />

      {previewDoc && (
        <DocumentPreview
          open={!!previewDoc}
          onOpenChange={(open) => !open && setPreviewDoc(null)}
          docId={previewDoc.id}
          title={previewDoc.title}
          fileType={previewDoc.file_type}
        />
      )}
    </SidebarProvider>
  )
}

function IconExternalLink({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}
