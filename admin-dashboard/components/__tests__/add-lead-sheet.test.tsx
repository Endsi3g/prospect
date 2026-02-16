import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { AddLeadSheet } from "@/components/add-lead-sheet"
import { I18nProvider } from "@/lib/i18n"
import { requestApi } from "@/lib/api"

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("@/lib/api", () => ({
  requestApi: vi.fn(),
}))

const requestApiMock = vi.mocked(requestApi)

function renderComponent() {
  return render(
    <I18nProvider>
      <AddLeadSheet />
    </I18nProvider>,
  )
}

describe("AddLeadSheet", () => {
  it("shows inline email and phone validation on blur and blocks submit", async () => {
    const user = userEvent.setup()
    renderComponent()

    await user.click(screen.getByRole("button", { name: /lead/i }))

    await user.type(await screen.findByLabelText("Prenom"), "Alice")
    await user.type(screen.getByLabelText("Nom"), "Martin")
    await user.type(screen.getByLabelText("Entreprise"), "Prospect Labs")

    const emailInput = screen.getByLabelText("Email")
    await user.type(emailInput, "alice-at-example")
    await user.tab()

    const phoneInput = screen.getByLabelText("Telephone")
    await user.type(phoneInput, "abc123")
    await user.tab()

    expect(await screen.findByText("Format d'email invalide")).toBeInTheDocument()
    expect(await screen.findByText("Format de telephone invalide")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Enregistrer" }))
    expect(requestApiMock).not.toHaveBeenCalled()
  })
})
