"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import useSWR from "swr"
import { isPublicRoute } from "@/lib/auth-util"
import { requestApi } from "@/lib/api"
import { isDemoModeActive } from "@/lib/demo-mode"

const fetcher = <T,>(path: string) =>
    requestApi<T>(path, undefined, { skipAuthRetry: true })

export function SessionGuard({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const router = useRouter()
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        setMounted(true)
    }, [])

    const routeIsPublic = isPublicRoute(pathname)
    const isDemo = mounted && isDemoModeActive()

    // Only fetch account if we're on a non-public route and NOT in demo mode
    const { data: account, error, isLoading } = useSWR(
        mounted && !routeIsPublic && !isDemo ? "/api/v1/admin/account" : null,
        fetcher,
        {
            shouldRetryOnError: false,
            revalidateOnFocus: false,
        }
    )

    React.useEffect(() => {
        if (!mounted) return
        if (routeIsPublic) return
        if (isDemo) return

        // If API returns an error (like 401) or we are finished loading and have no account
        if (error || (!isLoading && !account)) {
            // requestApi already handles 401 by setting window.location.href = "/login"
            // but just in case or for other errors, we redirect to landing page
            // router.push("/") 
        }
    }, [mounted, routeIsPublic, isDemo, account, error, isLoading, router])

    // While loading internal content, we might want to show a skeleton or nothing 
    // to avoid flashing content before redirect.
    if (mounted && !routeIsPublic && !isDemo && isLoading) {
        return <div className="flex h-svh w-full items-center justify-center">Loading...</div>
    }

    return <>{children}</>
}
