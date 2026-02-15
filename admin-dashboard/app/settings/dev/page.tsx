"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"

type MockScenario = "balanced" | "empty" | "ops_overload" | "conversion_peak"

const STORAGE_KEY = "prospect:mockScenario"
const SCENARIOS: Array<{ value: MockScenario; label: string; description: string }> = [
  { value: "balanced", label: "Balanced", description: "Jeu de donnees standard pour navigation complete." },
  { value: "empty", label: "Empty", description: "Scenario vide pour valider les etats sans donnees." },
  { value: "ops_overload", label: "Ops Overload", description: "Volume eleve leads/taches/projets pour stress UI." },
  { value: "conversion_peak", label: "Conversion Peak", description: "Pipeline oriente leads chauds et conversions." },
]

function normalizeScenario(raw: string | null | undefined): MockScenario {
  const value = String(raw || "").trim().toLowerCase()
  if (value === "balanced" || value === "empty" || value === "ops_overload" || value === "conversion_peak") {
    return value
  }
  return "balanced"
}

export default function DevSettingsPage() {
  const [scenario, setScenario] = React.useState<MockScenario>("balanced")

  React.useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const fromQuery = normalizeScenario(params.get("mockScenario") || params.get("mock_scenario"))
    const fromStorage = normalizeScenario(window.localStorage.getItem(STORAGE_KEY))
    const next = fromQuery !== "balanced" ? fromQuery : fromStorage
    setScenario(next)
  }, [])

  function saveScenario() {
    if (typeof window === "undefined") return
    window.localStorage.setItem(STORAGE_KEY, scenario)
    toast.success(`Scenario mock actif: ${scenario}`)
  }

  function clearScenario() {
    if (typeof window === "undefined") return
    window.localStorage.removeItem(STORAGE_KEY)
    setScenario("balanced")
    toast.success("Scenario mock reinitialise (balanced).")
  }

  const selectedMeta = SCENARIOS.find((item) => item.value === scenario)

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
        <div className="flex flex-1 flex-col gap-6 p-4 pt-0 md:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-3xl font-bold tracking-tight">Parametres Dev</h2>
            <Button asChild variant="outline">
              <Link href="/settings">Retour Parametres</Link>
            </Button>
          </div>

          <Card className="max-w-3xl">
            <CardHeader>
              <CardTitle>Scenario mock localhost</CardTitle>
              <CardDescription>
                Evite de passer `mockScenario` dans chaque URL. Le choix est sauvegarde dans votre navigateur local.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Scenario actif</Label>
                <Select value={scenario} onValueChange={(value) => setScenario(value as MockScenario)}>
                  <SelectTrigger className="max-w-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCENARIOS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{selectedMeta?.description}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={saveScenario}>Appliquer scenario</Button>
                <Button type="button" variant="outline" onClick={clearScenario}>
                  Reinitialiser
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="max-w-3xl">
            <CardHeader>
              <CardTitle>Liens de test rapides</CardTitle>
              <CardDescription>Optionnel: test forcé via query param pour comparaison.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href="/leads?mockScenario=ops_overload">/leads ops_overload</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/tasks?mockScenario=ops_overload">/tasks ops_overload</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/projects?mockScenario=ops_overload">/projects ops_overload</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/leads/lead-ops_overload-001?mockScenario=ops_overload">/leads/{`{id}`} ops_overload</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
