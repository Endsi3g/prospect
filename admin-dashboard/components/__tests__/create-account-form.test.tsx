import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { CreateAccountForm } from "@/components/create-account-form"
import { I18nProvider } from "@/lib/i18n"
import { requestApi } from "@/lib/api"

const { replaceMock, refreshMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  refreshMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
    refresh: refreshMock,
  }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}))

vi.mock("@/lib/api", () => ({
  requestApi: vi.fn(),
}))

const requestApiMock = vi.mocked(requestApi)

function renderForm() {
  return render(
    <I18nProvider>
      <CreateAccountForm />
    </I18nProvider>,
  )
}

describe("CreateAccountForm", () => {
  it("prevents submit when passwords do not match", async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText("Email"), "new@example.com")
    await user.type(screen.getByLabelText("Mot de passe"), "StrongPass123!")
    await user.type(screen.getByLabelText("Confirmer le mot de passe"), "Mismatch123!")
    await user.click(screen.getByRole("button", { name: "Creer mon compte" }))

    expect(requestApiMock).not.toHaveBeenCalled()
    expect(toastErrorMock).toHaveBeenCalled()
  })

  it("submits signup and redirects on success", async () => {
    requestApiMock.mockResolvedValueOnce({ ok: true, username: "new@example.com" })
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText("Email"), "new@example.com")
    await user.type(screen.getByLabelText("Nom affiche (optionnel)"), "New User")
    await user.type(screen.getByLabelText("Mot de passe"), "StrongPass123!")
    await user.type(screen.getByLabelText("Confirmer le mot de passe"), "StrongPass123!")
    await user.click(screen.getByRole("button", { name: "Creer mon compte" }))

    expect(requestApiMock).toHaveBeenCalledWith(
      "/api/v1/admin/auth/signup",
      expect.objectContaining({ method: "POST" }),
      { skipAuthRetry: true },
    )
    expect(toastSuccessMock).toHaveBeenCalled()
    expect(replaceMock).toHaveBeenCalledWith("/dashboard")
  })
})
