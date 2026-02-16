import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { LoginForm } from "@/components/login-form"
import { I18nProvider } from "@/lib/i18n"

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe("LoginForm", () => {
  it("starts with blank credentials", () => {
    render(
      <I18nProvider>
        <LoginForm />
      </I18nProvider>,
    )

    const usernameInput = screen.getByLabelText("Nom d'utilisateur") as HTMLInputElement
    const passwordInput = screen.getByLabelText("Mot de passe") as HTMLInputElement

    expect(usernameInput.value).toBe("")
    expect(passwordInput.value).toBe("")
  })

  it("links to account creation", () => {
    render(
      <I18nProvider>
        <LoginForm />
      </I18nProvider>,
    )

    const link = screen.getByRole("link", { name: "Pas de compte ? Creer un compte" })
    expect(link).toHaveAttribute("href", "/create-account")
  })
})
