"use client"

import Link from "next/link"
import * as React from "react"
import {
  IconArrowRight,
  IconBolt,
  IconChartBar,
  IconAutomation,
  IconRobot,
  IconDatabase,
  IconRocket,
  IconCheck,
  IconBrandLinkedin,
  IconMail
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { activateLocalDemoMode } from "@/lib/demo-mode"
import { useI18n } from "@/lib/i18n"

export default function Home() {
  const { messages } = useI18n()
  const onDemoClick = React.useCallback(() => {
    activateLocalDemoMode()
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-primary/20">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 h-16">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">P</div>
            <span className="text-xl font-bold tracking-tight">Prospect</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium">
            <Link href="#features" className="hover:text-primary transition-colors">Features</Link>
            <Link href="#automation" className="hover:text-primary transition-colors">AI Engine</Link>
            <Link href="#pricing" className="hover:text-primary transition-colors">Pricing</Link>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium hover:text-primary transition-colors md:block hidden">Login</Link>
            <Button asChild size="sm" className="rounded-full px-5">
              <Link href="/create-account">Get Started</Link>
            </Button>
          </div>
        </div>
      </nav>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-20 pb-24 lg:pt-32 lg:pb-40">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(45%_45%_at_50%_50%,rgba(var(--primary-rgb),0.1)_0%,transparent_100%)]" />
          <div className="mx-auto max-w-7xl px-6 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-1.5 text-xs font-medium backdrop-blur-sm mb-8">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
              </span>
              New: AI-Powered Campaign Generation
            </div>
            <h1 className="mx-auto max-w-4xl text-5xl font-extrabold tracking-tight sm:text-7xl mb-8 bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-transparent leading-[1.1]">
              Revolutionize Your Sales with Intelligent Prospecting
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground sm:text-xl mb-12">
              Automate your entire outreach funnel with Prospect. Advanced lead scoring, AI-driven sequences, and real-time CRM integration.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Button asChild size="lg" className="h-14 rounded-full px-8 text-lg font-semibold shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5">
                <Link href="/create-account">
                  Start Free Trial
                  <IconArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-14 rounded-full px-8 text-lg font-semibold bg-background/50 backdrop-blur-sm transition-all hover:-translate-y-0.5">
                <Link href="/dashboard" onClick={onDemoClick}>
                  View Demo
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Brand Bar */}
        <section className="border-y bg-muted/30 py-12">
          <div className="mx-auto max-w-7xl px-6">
            <p className="text-center text-sm font-medium text-muted-foreground mb-10">TRUSTED BY INNOVATIVE SALES TEAMS</p>
            <div className="flex flex-wrap items-center justify-center gap-12 opacity-50 grayscale transition-all hover:grayscale-0">
              <div className="text-xl font-bold tracking-tighter">STARK INDUSTRIES</div>
              <div className="text-xl font-bold tracking-tighter">WAYNE CORP</div>
              <div className="text-xl font-bold tracking-tighter">OSCORP</div>
              <div className="text-xl font-bold tracking-tighter">PYLON</div>
              <div className="text-xl font-bold tracking-tighter">CYBERDYNE</div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-24 lg:py-32">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-20 text-center max-w-2xl mx-auto">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-primary mb-4">Features</h2>
              <h3 className="text-3xl font-bold sm:text-5xl">Everything you need to scale your outreach.</h3>
            </div>
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: <IconRobot className="h-8 w-8 text-primary" />,
                  title: "AI Lead Scoring",
                  desc: "Rank leads based on intent, firmographics, and interaction patterns using our proprietary models."
                },
                {
                  icon: <IconAutomation className="h-8 w-8 text-primary" />,
                  title: "Automated Sequences",
                  desc: "Build multi-channel outreach workflows that trigger automatically based on lead behavior."
                },
                {
                  icon: <IconDatabase className="h-8 w-8 text-primary" />,
                  title: "Data Enrichment",
                  desc: "Automatically find missing emails, phone numbers, and LinkedIn profiles for every prospect."
                },
                {
                  icon: <IconChartBar className="h-8 w-8 text-primary" />,
                  title: "Real-time Analytics",
                  desc: "Visualize your entire funnel with comprehensive reports and conversion metrics."
                },
                {
                  icon: <IconBrandLinkedin className="h-8 w-8 text-primary" />,
                  title: "LinkedIn Integration",
                  desc: "Sync directly with your LinkedIn network to automate connections and messages."
                },
                {
                  icon: <IconBolt className="h-8 w-8 text-primary" />,
                  title: "Lightning Fast CRM",
                  desc: "A high-performance interface designed for agility and speed in high-volume environments."
                }
              ].map((f, i) => (
                <div key={i} className="group relative flex flex-col p-8 rounded-3xl border bg-card/50 transition-all hover:border-primary/50 hover:bg-card">
                  <div className="mb-6 rounded-2xl bg-muted p-3 w-fit group-hover:bg-primary/10 transition-colors">
                    {f.icon}
                  </div>
                  <h4 className="text-xl font-bold mb-3">{f.title}</h4>
                  <p className="text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* AI Engine Section */}
        <section id="automation" className="py-24 lg:py-32 bg-muted/30">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-primary mb-4">Automation</h2>
                <h3 className="text-3xl font-bold sm:text-5xl mb-6">Built-in RAG & Intelligence.</h3>
                <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
                  Prospect doesn't just send emails. It understands your business logic, analyzes your documents, and generates highly personalized content that converts.
                </p>
                <div className="space-y-4">
                  {[
                    "Semantic search across your library",
                    "Deterministic content generation",
                    "Dynamic variable assignment",
                    "Automated sequence step builder"
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary">
                        <IconCheck className="h-4 w-4" />
                      </div>
                      <span className="font-medium">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative">
                <div className="rounded-3xl border bg-card p-4 shadow-2xl overflow-hidden">
                  <div className="bg-muted h-64 w-full rounded-2xl flex items-center justify-center border-b mb-4">
                    <IconAutomation className="h-20 w-20 text-muted-foreground/30 animate-pulse" />
                  </div>
                  <div className="space-y-3 p-2">
                    <div className="h-4 w-3/4 rounded-full bg-muted" />
                    <div className="h-4 w-1/2 rounded-full bg-muted/60" />
                    <div className="h-4 w-5/6 rounded-full bg-muted/40" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24">
          <div className="mx-auto max-w-5xl px-6">
            <div className="relative rounded-[2.5rem] bg-foreground text-background p-12 lg:p-20 text-center overflow-hidden">
              <h3 className="text-3xl font-bold sm:text-5xl mb-8 font-black">
                Ready to scale your pipeline?
              </h3>
              <p className="text-lg opacity-80 mb-12 max-w-2xl mx-auto italic">
                Join thousands of sales teams winning with intelligent prospecting.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4">
                <Button asChild size="lg" variant="secondary" className="h-14 rounded-full px-8 text-lg font-bold">
                  <Link href="/create-account">Get Started Now</Link>
                </Button>
                <Button asChild variant="ghost" size="lg" className="h-14 rounded-full px-8 text-lg font-semibold text-background hover:bg-background hover:text-foreground">
                  <Link href="/login">Sign In</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-12">
        <div className="mx-auto max-w-7xl px-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">P</div>
            <span className="text-xl font-bold tracking-tight">Prospect</span>
          </div>
          <p className="text-sm text-muted-foreground mb-8 text-center max-w-md mx-auto">
            The next generation prospecting engine built for modern sales teams. Powering growth through intelligence.
          </p>
          <div className="flex justify-center gap-8 text-xs text-muted-foreground font-medium uppercase tracking-widest">
            <p>© 2026 PROSPECT AI</p>
            <Link href="#" className="hover:text-primary">Privacy</Link>
            <Link href="#" className="hover:text-primary">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
