"use client"

import Link from "next/link"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { activateLocalDemoMode } from "@/lib/demo-mode"
import { useI18n } from "@/lib/i18n"

export default function Home() {
  const { messages } = useI18n()
  const onDemoClick = React.useCallback(() => {
    activateLocalDemoMode()
  }, [])

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col justify-center px-6 py-12">
      <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr] lg:items-end">
        <section className="space-y-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Prospect
          </p>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            {messages.auth.hero.title}
          </h1>
          <p className="max-w-xl text-base text-muted-foreground sm:text-lg">
            {messages.auth.hero.description}
          </p>
        </section>
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:p-6">
          <Button asChild className="w-full">
            <Link href="/login">{messages.auth.hero.loginCta}</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/create-account">{messages.auth.hero.createAccountCta}</Link>
          </Button>
          <Button asChild variant="secondary" className="w-full">
            <Link href="/dashboard" onClick={onDemoClick}>
              {messages.auth.hero.demoCta}
            </Link>
          </Button>
        </section>
      </div>
    </main>
  )
}
