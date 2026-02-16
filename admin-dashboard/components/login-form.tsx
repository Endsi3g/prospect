"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { requestApi } from "@/lib/api"
import { useI18n } from "@/lib/i18n"

type LoginResponse = {
  ok: boolean
  username: string
}

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const router = useRouter()
  const { messages } = useI18n()
  const [username, setUsername] = React.useState("admin")
  const [password, setPassword] = React.useState("Endsieg25$")
  const [submitting, setSubmitting] = React.useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      setSubmitting(true)
      const payload = await requestApi<LoginResponse>(
        "/api/v1/admin/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        },
        { skipAuthRetry: true },
      )
      if (payload.ok) {
        toast.success(messages.auth.login.successToast)
        router.push("/dashboard")
      } else {
        toast.error(
          (payload as unknown as { message?: string }).message ||
            messages.auth.login.invalidCredentials,
        )
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : messages.auth.login.genericError,
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
          <h1 className="text-2xl font-bold">{messages.auth.login.title}</h1>
          <p className="text-muted-foreground text-sm text-balance">
            {messages.auth.login.description}
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="username">
            {messages.auth.login.usernameLabel}
          </FieldLabel>
          <Input
            id="username"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">
            {messages.auth.login.passwordLabel}
          </FieldLabel>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        <Field>
          <Button className="w-full" type="submit" disabled={submitting}>
            {submitting
              ? messages.auth.login.submitting
              : messages.auth.login.submit}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
