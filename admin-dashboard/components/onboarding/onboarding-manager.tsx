"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import useSWR from "swr"
import { toast } from "sonner"

import { requestApi } from "@/lib/api"
import { isDemoModeActive } from "@/lib/demo-mode"
import { useI18n } from "@/lib/i18n"
import {
  getOnboardingStatus,
  markOnboardingCompleted,
  markOnboardingSkipped,
  ONBOARDING_OPEN_EVENT,
} from "@/lib/onboarding"
import { isPublicRoute } from "@/lib/auth-util"
import { OnboardingWizard, type OnboardingStep } from "@/components/onboarding/onboarding-wizard"

type AccountPayload = {
  full_name: string
  email: string
  title: string
  locale: string
  timezone: string
  preferences: Record<string, unknown>
  updated_at?: string | null
}

const fetcher = <T,>(path: string) =>
  requestApi<T>(path, undefined, { skipAuthRetry: true })

export function OnboardingManager() {
  const pathname = usePathname()
  const router = useRouter()
  const { messages } = useI18n()

  const [open, setOpen] = React.useState(false)
  const [stepIndex, setStepIndex] = React.useState(0)
  const [saving, setSaving] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  const [demoModeActive, setDemoModeActive] = React.useState(false)
  const autoOpenedRef = React.useRef(false)

  const routeIsPublic = isPublicRoute(pathname)
  const shouldLoadAccount = mounted && !routeIsPublic && !demoModeActive
  const { data: account, error, mutate } = useSWR<AccountPayload>(
    shouldLoadAccount ? "/api/v1/admin/account" : null,
    fetcher,
  )
  const onboardingStatus = React.useMemo(
    () => getOnboardingStatus(account?.preferences),
    [account?.preferences],
  )

  React.useEffect(() => {
    setMounted(true)
    setDemoModeActive(isDemoModeActive())
  }, [pathname])

  const steps = React.useMemo<OnboardingStep[]>(
    () => [
      {
        id: "dashboard",
        title: messages.onboarding.steps.dashboard.title,
        description: messages.onboarding.steps.dashboard.description,
        href: "/dashboard",
        ctaLabel: messages.onboarding.steps.dashboard.cta,
      },
      {
        id: "leads",
        title: messages.onboarding.steps.leads.title,
        description: messages.onboarding.steps.leads.description,
        href: "/leads",
        ctaLabel: messages.onboarding.steps.leads.cta,
      },
      {
        id: "tasks",
        title: messages.onboarding.steps.tasks.title,
        description: messages.onboarding.steps.tasks.description,
        href: "/tasks",
        ctaLabel: messages.onboarding.steps.tasks.cta,
      },
      {
        id: "opportunities",
        title: messages.onboarding.steps.opportunities.title,
        description: messages.onboarding.steps.opportunities.description,
        href: "/opportunities",
        ctaLabel: messages.onboarding.steps.opportunities.cta,
      },
    ],
    [messages],
  )

  React.useEffect(() => {
    if (!shouldLoadAccount) return
    if (!account || error) return
    if (autoOpenedRef.current) return
    if (onboardingStatus !== "pending") return

    autoOpenedRef.current = true
    setStepIndex(0)
    setOpen(true)
  }, [account, error, onboardingStatus, shouldLoadAccount])

  React.useEffect(() => {
    if (!shouldLoadAccount) return
    if (typeof window === "undefined") return
    const handler = () => {
      setStepIndex(0)
      setOpen(true)
    }
    window.addEventListener(ONBOARDING_OPEN_EVENT, handler)
    return () => window.removeEventListener(ONBOARDING_OPEN_EVENT, handler)
  }, [shouldLoadAccount])

  const persistAccountPreferences = React.useCallback(
    async (nextPreferences: Record<string, unknown>): Promise<boolean> => {
      if (!account) {
        toast.error(messages.onboarding.saveError)
        return false
      }

      try {
        setSaving(true)
        const payload: AccountPayload = {
          ...account,
          preferences: nextPreferences,
        }
        const saved = await requestApi<AccountPayload>("/api/v1/admin/account", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        await mutate(saved, { revalidate: false })
        return true
      } catch (submitError) {
        toast.error(
          submitError instanceof Error
            ? submitError.message
            : messages.onboarding.saveError,
        )
        return false
      } finally {
        setSaving(false)
      }
    },
    [account, messages.onboarding.saveError, mutate],
  )

  const onSkip = React.useCallback(async () => {
    const nextPreferences = markOnboardingSkipped(account?.preferences)
    const ok = await persistAccountPreferences(nextPreferences)
    if (!ok) return
    toast.success(messages.onboarding.skippedToast)
    setOpen(false)
  }, [account?.preferences, messages.onboarding.skippedToast, persistAccountPreferences])

  const onFinish = React.useCallback(async () => {
    const nextPreferences = markOnboardingCompleted(account?.preferences)
    const ok = await persistAccountPreferences(nextPreferences)
    if (!ok) return
    toast.success(messages.onboarding.completedToast)
    setOpen(false)
  }, [account?.preferences, messages.onboarding.completedToast, persistAccountPreferences])

  const progressLabel = React.useMemo(() => {
    const safeTotal = Math.max(steps.length, 1)
    const safeCurrent = Math.min(stepIndex + 1, safeTotal)
    return messages.onboarding.stepProgress
      .replace("{current}", String(safeCurrent))
      .replace("{total}", String(safeTotal))
  }, [messages.onboarding.stepProgress, stepIndex, steps.length])

  const onNavigate = React.useCallback(
    (href: string) => {
      setOpen(false)
      router.push(href)
    },
    [router],
  )

  if (!shouldLoadAccount) return null

  return (
    <OnboardingWizard
      open={open}
      saving={saving}
      stepIndex={stepIndex}
      steps={steps}
      progressLabel={progressLabel}
      previousLabel={messages.onboarding.previous}
      nextLabel={messages.onboarding.next}
      skipLabel={messages.onboarding.skip}
      finishLabel={messages.onboarding.finish}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setOpen(true)
          return
        }
        if (saving) return
        void onSkip()
      }}
      onPrevious={() => setStepIndex((current) => Math.max(0, current - 1))}
      onNext={() =>
        setStepIndex((current) =>
          Math.min(steps.length - 1, current + 1),
        )
      }
      onSkip={() => void onSkip()}
      onFinish={() => void onFinish()}
      onNavigate={onNavigate}
    />
  )
}
