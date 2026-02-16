"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { requestApi } from "@/lib/api"
import { useI18n } from "@/lib/i18n"

type SignupResponse = {
  ok: boolean
  username: string
}

export function CreateAccountForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { messages } = useI18n()
  const [email, setEmail] = React.useState("")
  const [displayName, setDisplayName] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const nextPath = React.useMemo(() => {
    const raw = searchParams.get("next") || ""
    if (!raw.startsWith("/")) return "/dashboard"
    if (raw.startsWith("//")) return "/dashboard"
    return raw
  }, [searchParams])
  const redirectAfterAuth = React.useCallback((targetPath: string) => {
    router.replace(targetPath)
    router.refresh()
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        const current = window.location.pathname
        if (current === "/login" || current === "/create-account") {
          window.location.assign(targetPath)
        }
      }, 180)
    }
  }, [router])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password.length < 8) {
      toast.error(messages.auth.createAccount.passwordTooShort)
      return
    }
    if (password !== confirmPassword) {
      toast.error(messages.auth.createAccount.passwordMismatch)
      return
    }

    try {
      setSubmitting(true)
      const payload = await requestApi<SignupResponse>(
        "/api/v1/admin/auth/signup",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            display_name: displayName.trim() || undefined,
          }),
        },
        { skipAuthRetry: true },
      )
      if (payload.ok) {
        toast.success(messages.auth.createAccount.successToast)
        redirectAfterAuth(nextPath)
      } else {
        toast.error(messages.auth.createAccount.genericError)
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : messages.auth.createAccount.genericError,
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      className={cn("flex flex-col gap-6", className)}
      onSubmit={onSubmit}
      {...props}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">{messages.auth.createAccount.title}</h1>
          <p className="text-muted-foreground text-sm text-balance">
            {messages.auth.createAccount.description}
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="email">{messages.auth.createAccount.emailLabel}</FieldLabel>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="displayName">{messages.auth.createAccount.displayNameLabel}</FieldLabel>
          <Input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="name"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">{messages.auth.createAccount.passwordLabel}</FieldLabel>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="confirmPassword">{messages.auth.createAccount.confirmPasswordLabel}</FieldLabel>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        <Field>
          <Button className="w-full" type="submit" disabled={submitting}>
            {submitting
              ? messages.auth.createAccount.submitting
              : messages.auth.createAccount.submit}
          </Button>
        </Field>
        <p className="text-center text-sm text-muted-foreground">
          <Link className="underline underline-offset-4" href="/login">
            {messages.auth.createAccount.loginCta}
          </Link>
        </p>
      </FieldGroup>
    </form>
  )
}
