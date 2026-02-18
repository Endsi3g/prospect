"use client"

import * as React from "react"
import useSWR from "swr"
import { IconSearch, IconArrowRight, IconLifebuoy, IconBook, IconExternalLink, IconSparkles } from "@tabler/icons-react"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { requestApi } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { requestOnboardingOpen } from "@/lib/onboarding"

type HelpSection = {
  id: string
  label: string
  items: { label: string; href: string }[]
}

type HelpQuickAction = {
  id: string
  label: string
  href: string
  scope: string
}

type HelpPayload = {
  support_email: string
  faqs: { question: string; answer: string }[]
  links: { label: string; href: string }[]
  sections?: HelpSection[]
  quick_actions?: HelpQuickAction[]
  updated_at?: string
}

const fetcher = <T,>(path: string) => requestApi<T>(path)

export default function HelpPage() {
  const { messages } = useI18n()
  const { data, error, isLoading, mutate } = useSWR<HelpPayload>("/api/v1/admin/help", fetcher)

  const [search, setSearch] = React.useState("")

  const onLaunchOnboarding = React.useCallback(() => {
    requestOnboardingOpen()
  }, [])

  const filteredFaqs = React.useMemo(() => {
    if (!data?.faqs || !search.trim()) return data?.faqs || []
    const q = search.toLowerCase()
    return data.faqs.filter(f =>
      f.question.toLowerCase().includes(q) ||
      f.answer.toLowerCase().includes(q)
    )
  }, [data, search])

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col gap-6 p-3 pt-0 sm:p-4 sm:pt-0 lg:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Centre d&apos;Aide</h2>
              <p className="text-muted-foreground">Trouvez des réponses et explorez les guides d&apos;utilisation.</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onLaunchOnboarding}>
                {messages.onboarding.launchFromHelp}
              </Button>
              <Button onClick={() => window.open(`mailto:${data?.support_email || "support@example.com"}`)}>
                Contacter le support
              </Button>
            </div>
          </div>

          <div className="relative max-w-2xl">
            <IconSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher une question, un guide ou un terme..."
              className="pl-10 h-12 text-base shadow-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {isLoading ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
              <p className="font-bold">Erreur de chargement</p>
              <p>Impossible de récupérer le contenu du centre d&apos;aide.</p>
              <Button variant="link" className="p-0 h-auto text-destructive underline" onClick={() => void mutate()}>
                Réessayer
              </Button>
            </div>
          ) : null}

          {data && (
            <div className="space-y-10">
              {/* Quick Actions */}
              {data.quick_actions && data.quick_actions.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {data.quick_actions.map((action) => {
                    const isSafe = (() => {
                      try {
                        const url = new URL(action.href, window.location.origin);
                        return ["http:", "https:", "mailto:"].includes(url.protocol);
                      } catch {
                        return false;
                      }
                    })();

                    const card = (
                      <Card className="hover:border-primary/50 transition-colors group cursor-pointer h-full">
                        <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
                          <div className="space-y-1">
                            <CardTitle className="text-sm font-bold uppercase tracking-wider">{action.label}</CardTitle>
                            <CardDescription className="text-xs">Accès rapide {action.scope}</CardDescription>
                          </div>
                          <IconSparkles className="size-5 text-primary opacity-50 group-hover:opacity-100 transition-opacity" />
                        </CardHeader>
                      </Card>
                    );

                    if (!isSafe) return <div key={action.id}>{card}</div>;

                    return (
                      <a
                        key={action.id}
                        href={action.href}
                        className="block no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
                      >
                        {card}
                      </a>
                    );
                  })}
                </div>
              )}

              <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
                <div className="space-y-8">
                  {/* Sections / Guides */}
                  {data.sections && data.sections.map((section) => (
                    <div key={section.id} className="space-y-4">
                      <h3 className="text-xl font-bold flex items-center gap-2">
                        <IconBook className="size-5 text-primary" />
                        {section.label}
                      </h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {section.items.map((item) => (
                          <a
                            key={item.label}
                            href={item.href}
                            className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors group"
                          >
                            <span className="font-medium text-sm">{item.label}</span>
                            <IconArrowRight className="size-4 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* FAQ */}
                  <div className="space-y-4">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <IconLifebuoy className="size-5 text-primary" />
                      Foire aux questions
                    </h3>
                    <div className="space-y-4">
                      {filteredFaqs.length > 0 ? (
                        filteredFaqs.map((faq) => (
                          <Card key={faq.question} className="shadow-xs">
                            <CardHeader className="p-4">
                              <CardTitle className="text-base">{faq.question}</CardTitle>
                            </CardHeader>
                            <CardContent className="px-4 pb-4 pt-0">
                              <p className="text-sm text-muted-foreground leading-relaxed">{faq.answer}</p>
                            </CardContent>
                          </Card>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground italic p-4 border rounded-lg border-dashed text-center">
                          Aucun résultat pour &quot;{search}&quot;.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Support Sidebar */}
                  <Card className="bg-primary text-primary-foreground border-none">
                    <CardHeader>
                      <CardTitle className="text-lg">Besoin d&apos;aide ?</CardTitle>
                      <CardDescription className="text-primary-foreground/80">
                        Notre équipe répond généralement en moins de 2 heures.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-1">
                        <p className="text-xs font-bold uppercase opacity-70">Email Direct</p>
                        <a href={`mailto:${data.support_email}`} className="block font-medium hover:underline break-all">
                          {data.support_email}
                        </a>
                      </div>
                      <Button variant="secondary" className="w-full" onClick={() => window.open(`mailto:${data.support_email}`)}>
                        Envoyer un message
                      </Button>
                    </CardContent>
                  </Card>

                  {/* External Links */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">
                      Liens externes
                    </h4>
                    <div className="space-y-1">
                      {data.links.map((link) => (
                        <a
                          key={link.href}
                          href={link.href}
                          className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors group"
                          target={link.href.startsWith("http") ? "_blank" : undefined}
                          rel={link.href.startsWith("http") ? "noreferrer noopener" : undefined}
                        >
                          <span>{link.label}</span>
                          <IconExternalLink className="size-3.5 opacity-50 group-hover:opacity-100" />
                        </a>
                      ))}
                    </div>
                  </div>

                  {data.updated_at && (
                    <p className="text-[10px] text-muted-foreground text-center pt-4">
                      Dernière mise à jour : {new Date(data.updated_at).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
