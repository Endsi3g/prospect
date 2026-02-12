"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import useSWR from "swr"
import {
    IconArrowLeft,
    IconBriefcase,
    IconChecklist,
    IconMail,
    IconPhone,
    IconBrandLinkedin,
    IconBuilding, IconChartBar
} from "@tabler/icons-react"
import { format, differenceInMinutes } from "date-fns"
import { fr } from "date-fns/locale"
import Link from "next/link"

import { fetchApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

// Types matching backend models
type Interaction = {
    id: string
    type: string
    timestamp: string
    details: Record<string, unknown>
}

type Task = {
    id: string
    title: string
    status: string
    priority: string
    due_date?: string
}

type Project = {
    id: string
    name: string
    status: string
    created_at: string
}

type Lead = {
    id: string
    first_name: string
    last_name: string
    email: string
    phone?: string
    linkedin_url?: string
    company: {
        name: string
        domain?: string
        industry?: string
        location?: string
    }
    status: string
    segment?: string
    total_score: number
    score: {
        icp_score: number
        heat_score: number
        tier: string
        heat_status: string
        icp_breakdown: Record<string, number>
        heat_breakdown: Record<string, number>
    }
    interactions: Interaction[]
    tags: string[]
    created_at: string
    updated_at: string
}

const fetcher = <T,>(path: string) => fetchApi<T>(path)

export default function LeadDetailPage() {
    const params = useParams()
    const router = useRouter()
    const id = params.id as string

    const { data: lead, error: leadError, isLoading: leadLoading } = useSWR<Lead>(
        id ? `/api/v1/admin/leads/${id}` : null,
        fetcher
    )

    const { data: tasks, isLoading: tasksLoading } = useSWR<Task[]>(
        id ? `/api/v1/admin/leads/${id}/tasks` : null,
        fetcher
    )

    const { data: projects, isLoading: projectsLoading } = useSWR<Project[]>(
        id ? `/api/v1/admin/leads/${id}/projects` : null,
        fetcher
    )

    if (leadLoading) {
        return (
            <div className="p-8 space-y-4">
                <Skeleton className="h-12 w-1/3" />
                <Skeleton className="h-64 w-full" />
            </div>
        )
    }

    if (leadError || !lead) {
        return (
            <div className="p-8 text-center">
                <h2 className="text-xl font-bold text-red-600">Lead introuvable</h2>
                <Button onClick={() => router.push("/leads")} className="mt-4">
                    Retour aux leads
                </Button>
            </div>
        )
    }

    return (
        <SidebarProvider
            style={{
                "--sidebar-width": "calc(var(--spacing) * 72)",
                "--header-height": "calc(var(--spacing) * 12)",
            } as React.CSSProperties}
        >
            <AppSidebar variant="inset" />
            <SidebarInset>
                <SiteHeader />
                <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
                    {/* Header */}
                    {/* Header */}
                    <nav className="flex items-center text-sm text-muted-foreground mb-4">
                        <Link href="/leads" className="hover:text-foreground transition-colors">Leads</Link>
                        <span className="mx-2">/</span>
                        <span className="text-foreground font-medium">{lead.first_name} {lead.last_name}</span>
                    </nav>
                    <div className="flex items-center gap-4 py-4">
                        <Button variant="ghost" size="icon" onClick={() => router.push("/leads")}>
                            <IconArrowLeft className="h-5 w-5" />
                        </Button>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl font-bold tracking-tight">
                                    {lead.first_name} {lead.last_name}
                                </h1>
                                {(() => {
                                    const updatedAt = lead.updated_at ? new Date(lead.updated_at) : new Date(lead.created_at)
                                    const diffMins = differenceInMinutes(new Date(), updatedAt)
                                    const isStale = diffMins > 30
                                    return (
                                        <div className="flex items-center gap-2 px-2 py-1 bg-muted/50 rounded-full border">
                                            {isStale ? (
                                                <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                                            ) : (
                                                <div className="h-2 w-2 rounded-full bg-green-500" />
                                            )}
                                            <span className="text-xs text-muted-foreground">
                                                {isStale ? `Périmées (> ${Math.floor(diffMins)}m)` : "À jour"}
                                            </span>
                                        </div>
                                    )
                                })()}
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <IconBuilding className="h-4 w-4" />
                                <span>{lead.company.name}</span>
                                {lead.company.domain && (
                                    <span className="text-xs bg-muted px-1 rounded">{lead.company.domain}</span>
                                )}
                            </div>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                            <Badge variant={lead.status === "NEW" ? "default" : "secondary"}>
                                {lead.status}
                            </Badge>
                            <div className="flex flex-col items-end">
                                <span className="text-sm font-bold text-primary">Score: {lead.total_score}</span>
                                <span className="text-xs text-muted-foreground">{lead.score.tier} - {lead.score.heat_status}</span>
                            </div>
                        </div>
                    </div>

                    <Tabs defaultValue="overview" className="space-y-4">
                        <TabsList>
                            <TabsTrigger value="overview">Vue ensemble</TabsTrigger>
                            <TabsTrigger value="score">Score & Analyse</TabsTrigger>
                            <TabsTrigger value="tasks">
                                Taches
                                {tasks && tasks.length > 0 && (
                                    <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                                        {tasks.length}
                                    </Badge>
                                )}
                            </TabsTrigger>
                            <TabsTrigger value="projects">Projets</TabsTrigger>
                        </TabsList>

                        <TabsContent value="overview" className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base">Coordonnees</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-2 text-sm">
                                        <div className="flex items-center gap-2">
                                            <IconMail className="h-4 w-4 text-muted-foreground" />
                                            <a href={`mailto:${lead.email}`} className="hover:underline">{lead.email}</a>
                                        </div>
                                        {lead.phone && (
                                            <div className="flex items-center gap-2">
                                                <IconPhone className="h-4 w-4 text-muted-foreground" />
                                                <span>{lead.phone}</span>
                                            </div>
                                        )}
                                        {lead.linkedin_url && (
                                            <div className="flex items-center gap-2">
                                                <IconBrandLinkedin className="h-4 w-4 text-muted-foreground" />
                                                <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-600">LinkedIn Profile</a>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base">Details Entreprise</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-2 text-sm">
                                        {lead.company.industry && (
                                            <div className="grid grid-cols-2">
                                                <span className="text-muted-foreground">Industrie:</span>
                                                <span>{lead.company.industry}</span>
                                            </div>
                                        )}
                                        {lead.company.location && (
                                            <div className="grid grid-cols-2">
                                                <span className="text-muted-foreground">Localisation:</span>
                                                <span>{lead.company.location}</span>
                                            </div>
                                        )}
                                        <div className="grid grid-cols-2">
                                            <span className="text-muted-foreground">Segment:</span>
                                            <span>{lead.segment || "N/A"}</span>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base">Tags</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex flex-wrap gap-2">
                                            {lead.tags.map(tag => (
                                                <Badge key={tag} variant="outline">{tag}</Badge>
                                            ))}
                                            {lead.tags.length === 0 && <span className="text-sm text-muted-foreground">Aucun tag</span>}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>

                        <TabsContent value="score" className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <IconChartBar className="h-5 w-5 text-indigo-500" />
                                            ICP Score ({lead.score.icp_score}/100)
                                        </CardTitle>
                                        <CardDescription>Adequation avec le profil ideal</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-2">
                                            {Object.entries(lead.score.icp_breakdown).map(([criteria, score]) => (
                                                <div key={criteria} className="flex justify-between text-sm border-b pb-1 last:border-0">
                                                    <span>{criteria}</span>
                                                    <span className="font-medium">{score}</span>
                                                </div>
                                            ))}
                                            {Object.keys(lead.score.icp_breakdown).length === 0 && (
                                                <p className="text-muted-foreground text-sm">Pas de details disponibles.</p>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <IconChartBar className="h-5 w-5 text-orange-500" />
                                            Heat Score ({lead.score.heat_score}/100)
                                        </CardTitle>
                                        <CardDescription>Signal interet et engagement</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-2">
                                            {Object.entries(lead.score.heat_breakdown).map(([criteria, score]) => (
                                                <div key={criteria} className="flex justify-between text-sm border-b pb-1 last:border-0">
                                                    <span>{criteria}</span>
                                                    <span className="font-medium">{score}</span>
                                                </div>
                                            ))}
                                            {Object.keys(lead.score.heat_breakdown).length === 0 && (
                                                <p className="text-muted-foreground text-sm">Pas de details disponibles.</p>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>

                        <TabsContent value="tasks" className="space-y-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Taches Associees</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {tasksLoading ? (
                                        <Skeleton className="h-20 w-full" />
                                    ) : tasks && tasks.length > 0 ? (
                                        <div className="space-y-2">
                                            {tasks.map(task => (
                                                <div key={task.id} className="flex items-center justify-between p-3 border rounded-lg">
                                                    <div className="flex items-center gap-3">
                                                        <IconChecklist className={`h-5 w-5 ${task.status === "Done" ? "text-green-500" : "text-gray-400"}`} />
                                                        <div>
                                                            <div className="font-medium">{task.title}</div>
                                                            <div className="text-xs text-muted-foreground">Priority: {task.priority}</div>
                                                        </div>
                                                    </div>
                                                    <Badge variant={task.status === "Done" ? "secondary" : "outline"}>{task.status}</Badge>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">Aucune tache pour ce lead.</p>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="projects" className="space-y-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Projets</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {projectsLoading ? (
                                        <Skeleton className="h-20 w-full" />
                                    ) : projects && projects.length > 0 ? (
                                        <div className="space-y-2">
                                            {projects.map(project => (
                                                <div key={project.id} className="flex items-center justify-between p-3 border rounded-lg">
                                                    <div className="flex items-center gap-3">
                                                        <IconBriefcase className="h-5 w-5 text-blue-500" />
                                                        <div>
                                                            <div className="font-medium">{project.name}</div>
                                                            <div className="text-xs text-muted-foreground">Cree le {format(new Date(project.created_at), 'dd MMM yyyy', { locale: fr })}</div>
                                                        </div>
                                                    </div>
                                                    <Badge variant="outline">{project.status}</Badge>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">Aucun projet associe.</p>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </SidebarInset>
        </SidebarProvider>
    )
}

