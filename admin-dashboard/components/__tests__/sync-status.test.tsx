import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { SyncStatus } from "@/components/sync-status"

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: toastMock,
}))

describe("SyncStatus", () => {
  it("renders stale and non-stale states", async () => {
    const staleDate = new Date(Date.now() - 61_000)
    const recentDate = new Date()

    const { rerender } = render(<SyncStatus updatedAt={staleDate} />)
    expect(await screen.findByText(/Données potentiellement périmées/)).toBeInTheDocument()

    rerender(<SyncStatus updatedAt={recentDate} />)
    expect(await screen.findByText(/Données à jour/)).toBeInTheDocument()
  })

  it("disables refresh action while validating", async () => {
    const staleDate = new Date(Date.now() - 61_000)

    render(<SyncStatus updatedAt={staleDate} isValidating onRefresh={vi.fn()} />)

    const button = await screen.findByRole("button", { name: "Actualisation..." })
    expect(button).toBeDisabled()
  })

  it("shows success toast only after async refresh resolves", async () => {
    const staleDate = new Date(Date.now() - 61_000)
    const user = userEvent.setup()

    let resolveRefresh: () => void = () => undefined
    const onRefresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve
        })
    )

    render(<SyncStatus updatedAt={staleDate} onRefresh={onRefresh} />)

    await user.click(await screen.findByRole("button", { name: "Rafraîchir" }))

    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole("button", { name: "Actualisation..." })).toBeDisabled()

    resolveRefresh()

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith("Données rafraîchies")
    })
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  it("shows error toast when async refresh fails", async () => {
    const staleDate = new Date(Date.now() - 61_000)
    const user = userEvent.setup()

    const onRefresh = vi.fn().mockRejectedValue(new Error("boom"))

    render(<SyncStatus updatedAt={staleDate} onRefresh={onRefresh} />)

    await user.click(await screen.findByRole("button", { name: "Rafraîchir" }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith("Échec du rafraîchissement")
    })
  })
})

