import { render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import { describe, expect, it, vi } from "vitest"

import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider } from "@/components/ui/sidebar"
import { I18nProvider } from "@/lib/i18n"
import { fetchApi } from "@/lib/api"

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}))

vi.mock("@/components/modal-system-provider", () => ({
  useModalSystem: () => ({
    openHelp: vi.fn(),
    openSearch: vi.fn(),
  }),
}))

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    fetchApi: vi.fn(),
  }
})

const fetchApiMock = vi.mocked(fetchApi)

function renderSidebar() {
  return render(
    <I18nProvider>
      <SWRConfig value={{ provider: () => new Map() }}>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </SWRConfig>
    </I18nProvider>
  )
}

describe("AppSidebar", () => {
  it("renders profile data from /api/v1/admin/account", async () => {
    fetchApiMock.mockResolvedValueOnce({
      full_name: "Jane Doe",
      email: "jane.doe@example.com",
    })

    renderSidebar()

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument()
    expect(screen.getByText("jane.doe@example.com")).toBeInTheDocument()
    expect(screen.queryByText("shadcn")).not.toBeInTheDocument()
    expect(screen.queryByText("m@example.com")).not.toBeInTheDocument()
  })

  it("falls back to generic profile values on error", async () => {
    fetchApiMock.mockRejectedValueOnce(new Error("account unavailable"))

    renderSidebar()

    await waitFor(() => {
      expect(fetchApiMock).toHaveBeenCalledWith("/api/v1/admin/account")
    })

    expect(screen.getByText("Utilisateur")).toBeInTheDocument()
    expect(screen.getByText("-")).toBeInTheDocument()
  })

  it("renders modal support actions as buttons instead of # links", async () => {
    fetchApiMock.mockResolvedValueOnce({ full_name: "Admin", email: "admin@example.com" })

    renderSidebar()

    const helpButton = await screen.findByRole("button", { name: "Aide" })
    const searchButton = screen.getByRole("button", { name: "Recherche" })

    expect(helpButton).toHaveAttribute("aria-haspopup", "dialog")
    expect(searchButton).toHaveAttribute("aria-haspopup", "dialog")
    expect(screen.queryByRole("link", { name: "Aide" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Recherche" })).not.toBeInTheDocument()
  })
})

