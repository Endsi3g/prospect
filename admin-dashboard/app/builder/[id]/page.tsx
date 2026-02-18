"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import useSWR from "swr"
import { IconArrowLeft, IconDeviceFloppy, IconSparkles, IconRocket } from "@tabler/icons-react"
import { toast } from "sonner"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { fetchApi, requestApi } from "@/lib/api"


type LandingPage = {
  id: string
  name: string
  slug: string
  title: string
  description?: string
  content: {
    hero_title: string
    hero_subtitle: string
    cta_text: string
    problem_statement?: string
    solution_statement?: string
  }
  theme: {
    primary_color: string
  }
  is_published: boolean
}

const fetcher = <T,>(path: string) => fetchApi<T>(path)

export default function PageEditor() {
  const { id } = useParams()
  const router = useRouter()
  const { data: page, isLoading, mutate } = useSWR<LandingPage>(`/api/v1/builder/pages/${id}`, fetcher)

  const [formData, setFormData] = React.useState<LandingPage | null>(null)
  const [isSaving, setIsSaving] = React.useState(false)
  const [isGenerating, setIsGenerating] = React.useState(false)

  React.useEffect(() => {
    if (page) {
      setFormData(page)
    }
  }, [page])

  async function handleSave() {
    if (!formData) return
    try {
      setIsSaving(true)
      await requestApi(`/api/v1/builder/pages/${id}`, {
        method: "PATCH",
        body: JSON.stringify(formData)
      })
      toast.success("Page sauvegardée.")
      await mutate()
    } catch {
      toast.error("Échec de la sauvegarde.")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleGenerateAI() {
    try {
      setIsGenerating(true)
      const config = {
        business_type: formData?.name || "Clinique",
        target_audience: formData?.description || "Patients"
      }

      const aiContent = await requestApi<{
        hero_title?: string
        hero_subtitle?: string
        cta_text?: string
        problem_statement?: string
        solution_statement?: string
      }>("/api/v1/builder/generate", {
        method: "POST",
        body: JSON.stringify(config)
      })

      if (formData) {
        setFormData({
          ...formData,
          title: aiContent.hero_title || formData.title,
          content: {
            ...formData.content,
            hero_title: aiContent.hero_title,
            hero_subtitle: aiContent.hero_subtitle,
            cta_text: aiContent.cta_text,
            problem_statement: aiContent.problem_statement,
            solution_statement: aiContent.solution_statement
          }
        })
        toast.success("Contenu généré par l'IA.")
      }
    } catch {
      toast.error("Échec de la génération IA.")
    } finally {
      setIsGenerating(false)
    }
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-12 w-1/4 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!formData) return null

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
        <div className="flex flex-1 flex-col gap-4 p-3 pt-0 sm:p-4 sm:pt-0 lg:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => router.push("/builder")}>
                <IconArrowLeft className="size-4" />
              </Button>
              <h2 className="text-2xl font-bold tracking-tight">Editer: {formData.name}</h2>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleGenerateAI} disabled={isGenerating}>
                <IconSparkles className="mr-2 size-4" />
                {isGenerating ? "Génération..." : "Optimiser via IA"}
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                <IconDeviceFloppy className="mr-2 size-4" />
                {isSaving ? "Sauvegarde..." : "Sauvegarder"}
              </Button>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Configuration Générale</CardTitle>
                  <CardDescription>Paramètres de base de la landing page.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Nom interne</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="slug">Slug URL (/p/{formData.slug})</Label>
                    <Input
                      id="slug"
                      value={formData.slug}
                      onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <Label>Statut de publication</Label>
                      <p className="text-xs text-muted-foreground">Rendre la page accessible en ligne.</p>
                    </div>
                    <Switch
                      checked={formData.is_published}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_published: checked })}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Contenu Hero</CardTitle>
                  <CardDescription>Le premier bloc que vos visiteurs verront.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="hero_title">Titre principal</Label>
                    <Input
                      id="hero_title"
                      value={formData.content.hero_title}
                      onChange={(e) => setFormData({
                        ...formData,
                        content: { ...formData.content, hero_title: e.target.value }
                      })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="hero_subtitle">Sous-titre</Label>
                    <Textarea
                      id="hero_subtitle"
                      value={formData.content.hero_subtitle}
                      onChange={(e) => setFormData({
                        ...formData,
                        content: { ...formData.content, hero_subtitle: e.target.value }
                      })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="cta_text">Texte du bouton</Label>
                    <Input
                      id="cta_text"
                      value={formData.content.cta_text}
                      onChange={(e) => setFormData({
                        ...formData,
                        content: { ...formData.content, cta_text: e.target.value }
                      })}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Aperçu en direct</CardTitle>
                  <CardDescription>Visualisation approximative de la page.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-xl border shadow-sm overflow-hidden bg-slate-50 min-h-[400px]">
                    <div className="p-8 text-center space-y-4">
                      <span className="text-xs font-bold uppercase tracking-wider text-blue-600">ClinicFlow IA</span>
                      <h1 className="text-3xl font-extrabold tracking-tight">{formData.content.hero_title}</h1>
                      <p className="text-slate-600 max-w-md mx-auto">{formData.content.hero_subtitle}</p>
                      <Button className="mt-4 bg-blue-600 hover:bg-blue-700">
                        {formData.content.cta_text}
                      </Button>

                      {formData.content.problem_statement && (
                        <div className="mt-12 text-left bg-white p-4 rounded-lg shadow-inner">
                          <h3 className="font-bold text-sm mb-2">Le Problème</h3>
                          <p className="text-sm text-slate-500">{formData.content.problem_statement}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="outline" className="w-full justify-start" asChild>
                    <a href={`/p/${formData.slug}`} target="_blank" rel="noopener noreferrer">
                      <IconRocket className="mr-2 size-4" />
                      Voir la page en ligne
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
