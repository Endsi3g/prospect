"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { activateLocalDemoMode } from "@/lib/demo-mode"

export default function DemoBootstrapPage() {
  const router = useRouter()

  React.useEffect(() => {
    const activated = activateLocalDemoMode()
    router.replace(activated ? "/dashboard" : "/login")
  }, [router])

  return (
    <main className="flex min-h-svh items-center justify-center px-6 text-center">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Activation du mode demo...</h1>
        <p className="text-sm text-muted-foreground">
          Redirection vers le dashboard.
        </p>
      </div>
    </main>
  )
}
