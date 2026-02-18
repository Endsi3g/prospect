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
} from "@tabler/icons-react"
import { toast } from "sonner"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"

import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { requestApi } from "@/lib/api"
import { formatNumberFr } from "@/lib/format"
import { cn } from "@/lib/utils"

type DocItem = {
  doc_id: string
  title: string
  ext: string
  status: "processed" | "pending_conversion" | "failed" | "duplicate" | "unsupported" | "ingested"
  size_bytes: number
  updated_at: string | null
  raw_path?: string | null
}

type DocsResponse = {
  generated_at: string
  stats: Record<string, number>
  page: number
  page_size: number
  total: number
  items: DocItem[]
}

type ChatMessage = {
  role: "user" | "assistant"
  content: string
  sources?: { source: string }[]
  isThinking?: boolean
}

const fetcher = <T,>(path: string) => requestApi<T>(path)

function StatusDot({ status }: { status: DocItem["status"] }) {
  switch (status) {
    case "processed":
    case "ingested":
      return <div className="size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
    case "failed":
      return <div className="size-2 rounded-full bg-red-500" />
    case "pending_conversion":
      return <div className="size-2 rounded-full bg-amber-500 animate-pulse" />
    default:
      return <div className="size-2 rounded-full bg-slate-400" />
  }
}

export default function LibraryPage() {
  const [search, setSearch] = React.useState("")
  const [page] = React.useState(1)

  // Chat state
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    { role: "assistant", content: "Bonjour ! Je suis connecté à votre base de connaissances. Comment puis-je vous aider aujourd'hui ?" }
  ])
  const [input, setInput] = React.useState("")
  const [isChatLoading, setIsChatLoading] = React.useState(false)
  const [isIngesting, setIsIngesting] = React.useState(false)
  const scrollAreaRef = React.useRef<HTMLDivElement>(null)
  const bottomRef = React.useRef<HTMLDivElement>(null)

  const queryParams = new URLSearchParams({
    page: String(page),
    page_size: "50", // Higher limit for list view
  })
  if (search.trim()) queryParams.set("q", search.trim())

  const { data, error, isLoading, mutate } = useSWR<DocsResponse>(
    `/api/v1/admin/docs/compagnie?${queryParams.toString()}`,
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
          {/* LEFT: Chat Interface - Takes majority of space */}
          <div className="flex-1 flex flex-col relative border-r border-border/40 min-w-0">
            <div className="flex items-center justify-between p-4 border-b border-border/40 bg-muted/10 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                  <IconBrain className="size-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-sm">Assistant Connaissance</h2>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="relative flex size-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full size-2 bg-emerald-500"></span>
                    </span>
                    En ligne
                  </div>
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
              <div className="space-y-6 max-w-3xl mx-auto pb-4">
                {messages.map((m, i) => (
                  <div key={i} className={cn(
                    "flex gap-4 group",
                    m.role === "user" ? "flex-row-reverse" : ""
                  )}>
                    <div className={cn(
                      "size-8 rounded-full flex items-center justify-center shrink-0 border shadow-sm",
                      m.role === "assistant" ? "bg-indigo-50 text-indigo-600 border-indigo-100" : "bg-zinc-900 text-zinc-50 border-zinc-800"
                    )}>
                      {m.role === "assistant" ? <IconSparkles className="size-4" /> : <IconUser className="size-4" />}
                    </div>

                    <div className={cn(
                      "flex flex-col gap-1 max-w-[80%]",
                      m.role === "user" ? "items-end" : "items-start"
                    )}>
                      <div className={cn(
                        "p-3.5 rounded-2xl text-sm shadow-sm",
                        m.role === "user"
                          ? "bg-zinc-900 text-zinc-50 rounded-tr-sm"
                          : "bg-white dark:bg-zinc-900/50 border border-border/50 rounded-tl-sm"
                      )}>
                        <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                      </div>

                      {m.sources && m.sources.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {m.sources.map((s: { source: string }, idx: number) => (
                            <Badge
                              key={idx}
                              variant="secondary"
                              className="h-6 text-[10px] rounded-md px-2 gap-1 bg-indigo-500/5 text-indigo-700 hover:bg-indigo-500/10 cursor-pointer border-indigo-200/50 transition-colors"
                              title={s.source}
                            >
                              <IconFileText className="size-3 opacity-50" />
                              {s.source.split(/[\\/]/).pop()}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isChatLoading && (
                  <div className="flex gap-4">
                    <div className="size-8 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center shrink-0">
                      <IconSparkles className="size-4 animate-pulse" />
                    </div>
                    <div className="bg-white dark:bg-zinc-900/50 border border-border/50 p-4 rounded-2xl rounded-tl-sm flex gap-1 items-center shadow-sm w-fit">
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></span>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} className="h-px" />
              </div>
            </ScrollArea>

            <div className="p-4 bg-background/80 backdrop-blur-md border-t border-border/40">
              <form
                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                className="max-w-3xl mx-auto relative flex items-center gap-2"
              >
                <div className="relative flex-1">
                  <Input
                    placeholder="Posez une question à propos de vos documents..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    disabled={isChatLoading}
                    className="pr-12 py-6 bg-muted/30 border-muted-foreground/20 focus-visible:ring-indigo-500 rounded-xl shadow-inner text-base"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
                    <Button
                      type="submit"
                      size="icon"
                      disabled={!input.trim() || isChatLoading}
                      className={cn(
                        "h-8 w-8 rounded-lg transition-all",
                        input.trim() ? "bg-indigo-600 hover:bg-indigo-700" : "bg-muted text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <IconSend className="size-4" />
                    </Button>
                  </div>
                </div>
              </form>
              <p className="text-center text-[10px] text-muted-foreground mt-2">
                L&apos;IA peut faire des erreurs. Vérifiez toujours les sources.
              </p>
            </div>
          </div>

          {/* RIGHT: Document Sidebar */}
          <div className="w-80 border-l border-border/40 bg-zinc-50/50 dark:bg-zinc-900/20 flex flex-col hidden lg:flex">
            <div className="p-4 border-b border-border/40 flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <IconBook className="size-4 text-muted-foreground" />
                Documents
              </h3>
              <Button
                variant="soft"
                size="icon"
                className="h-7 w-7"
                onClick={handleIngest}
                disabled={isIngesting}
                title="Synchroniser"
              >
                <IconRefresh className={cn("size-3.5", isIngesting && "animate-spin")} />
              </Button>
            </div>

            <div className="p-3 border-b border-border/40">
              <div className="relative">
                <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Filtrer..."
                  className="h-8 pl-8 text-xs bg-background/50 border-input/50"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex gap-3 items-center p-2">
                      <Skeleton className="size-8 rounded-md" />
                      <div className="space-y-1.5 flex-1">
                        <Skeleton className="h-3 w-3/4" />
                        <Skeleton className="h-2 w-1/2" />
                      </div>
                    </div>
                  ))
                ) : error ? (
                  <div className="text-center p-4 text-xs text-destructive">Impossible de charger les documents.</div>
                ) : !data?.items?.length ? (
                  <div className="text-center p-8 text-muted-foreground text-xs flex flex-col items-center gap-2">
                    <IconFileText className="size-8 opacity-20" />
                    Aucun document trouvé.
                  </div>
                ) : (
                  data.items.map((doc) => (
                    <div
                      key={doc.doc_id}
                      className="group flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border/30"
                    >
                      <div className="relative shrink-0 mt-0.5">
                        <div className="size-8 rounded-lg bg-white dark:bg-zinc-800 border shadow-sm flex items-center justify-center text-xs font-bold text-muted-foreground tracking-tighter uppercase relative z-10">
                          {doc.ext || "DOC"}
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 z-20 ring-2 ring-background rounded-full">
                          <StatusDot status={doc.status} />
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium leading-tight truncate text-foreground/90" title={doc.title}>
                          {doc.title}
                        </h4>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                          <span>{formatNumberFr(doc.size_bytes / 1024)} KB</span>
                          {doc.raw_path && (
                            <>
                              <span className="text-border/40">•</span>
                              <a
                                href={doc.raw_path}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-primary flex items-center gap-0.5"
                              >
                                Ouvrir <IconExternalLink className="size-2.5" />
                              </a>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            <div className="p-3 border-t border-border/40 bg-muted/10 text-[10px] text-muted-foreground text-center">
              {data?.total || 0} documents indexés
            </div>
          </div>
        </div>
      </SidebarInset>
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
