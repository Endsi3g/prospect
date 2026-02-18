"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { fetchApi, requestApi } from "@/lib/api"
import { toast } from "sonner"

type LandingPage = {
  id: string
  title: string
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
}

const fetcher = <T,>(path: string) => fetchApi<T>(path)

export default function PublicLandingPage() {
  const { slug } = useParams()
  const { data: page, error, isLoading } = useSWR<LandingPage>(`/api/v1/public/pages/${slug}`, fetcher)

  const [email, setEmail] = React.useState("")
  const [clinicName, setClinicName] = React.useState("")
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [submitted, setSubmitted] = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      setIsSubmitting(true)
      await requestApi("/api/v1/capture/lead", {
        method: "POST",
        body: JSON.stringify({
          email,
          company_name: clinicName,
          source: `landing_page_${slug}`
        })
      })
      setSubmitted(true)
      toast.success("Demande envoyée !")
    } catch {
      toast.error("Une erreur est survenue.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) return <div className="flex h-screen items-center justify-center font-sans">Chargement...</div>
  if (error || !page) return <div className="flex h-screen items-center justify-center font-sans text-red-500">Page non trouvée.</div>

  const primaryColor = page.theme.primary_color || "#2563eb"

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center font-sans">
        <div className="max-w-md space-y-4 rounded-2xl bg-white p-8 shadow-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold">Merci !</h1>
          <p className="text-slate-600">Votre demande a été bien reçue. Un expert vous contactera sous 24h.</p>
          <Button onClick={() => window.location.reload()} className="mt-4">Retour</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center p-6 text-center">
        <header className="mb-12">
          <span className="text-lg font-bold tracking-tight text-blue-600">ClinicFlow IA</span>
        </header>

        <main className="w-full max-w-2xl space-y-8">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">
            {page.content.hero_title}
          </h1>
          <p className="text-xl text-slate-600">
            {page.content.hero_subtitle}
          </p>

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a href="#quote" className="inline-block rounded-xl px-8 py-4 font-bold text-white shadow-lg transition-transform hover:scale-105" style={{ backgroundColor: primaryColor }}>
              {page.content.cta_text}
            </a>
            <Button variant="outline" className="rounded-xl px-8 py-4 h-auto font-bold border-slate-200">
              Voir la démo
            </Button>
          </div>

          <div className="mt-16 grid grid-cols-3 gap-8 text-xs font-bold uppercase tracking-widest text-slate-400">
            <div>+150 Cliniques</div>
            <div>Sécurisé RGPD</div>
            <div>Support 24/7</div>
          </div>

          <section id="quote" className="mt-20 rounded-3xl bg-white p-8 shadow-xl sm:p-12 text-left">
            <h2 className="mb-8 text-center text-2xl font-bold">Obtenir un devis personnalisé</h2>
            <form onSubmit={handleSubmit} className="mx-auto max-w-sm space-y-4">
              <div className="space-y-2">
                <Label htmlFor="clinic">Nom de votre établissement</Label>
                <Input
                  id="clinic"
                  placeholder="Ma Clinique"
                  required
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email professionnel</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="nom@clinique.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={isSubmitting} className="mt-4 w-full h-12 text-lg font-bold" style={{ backgroundColor: primaryColor }}>
                {isSubmitting ? "Envoi..." : "Recevoir mon devis"}
              </Button>
            </form>
          </section>
        </main>

        <footer className="mt-20 py-8 text-sm text-slate-400">
          © 2026 ClinicFlow IA. Tous droits réservés.
        </footer>
      </div>
    </div>
  )
}
