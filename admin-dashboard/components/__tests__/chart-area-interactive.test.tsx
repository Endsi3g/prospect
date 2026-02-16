import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import ChartAreaInteractive, { type TrendPoint } from "@/components/chart-area-interactive"

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}))

const trendFixture: TrendPoint[] = Array.from({ length: 100 }).map((_, idx) => ({
  date: new Date(Date.UTC(2026, 0, idx + 1)).toISOString().slice(0, 10),
  created: idx + 10,
  contacted: idx + 5,
}))

describe("ChartAreaInteractive", () => {
  it("updates summary when changing period 90/30/7", async () => {
    const user = userEvent.setup()

    render(<ChartAreaInteractive trend={trendFixture} />)

    const summary = screen.getByTestId("chart-summary")
    expect(summary).toHaveTextContent("Période: 3 mois")

    await user.click(screen.getByRole("button", { name: "30 jours" }))
    expect(summary).toHaveTextContent("Période: 30 jours")

    await user.click(screen.getByRole("button", { name: "7 jours" }))
    expect(summary).toHaveTextContent("Période: 7 jours")
  })

  it("renders empty state with accessibility summary", () => {
    render(<ChartAreaInteractive trend={[]} />)

    expect(screen.getByText("Aucune donnée de tendance disponible.")).toBeInTheDocument()

    const summary = screen.getByTestId("chart-summary")
    expect(summary).toHaveTextContent("Graphique en aires comparant les leads créés")
    expect(summary).toHaveTextContent("Aucune donnée à résumer")
  })
})

