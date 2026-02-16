import * as React from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import Home from "@/app/page"
import { I18nProvider } from "@/lib/i18n"

describe("landing page", () => {
  it("renders login, signup and demo actions", () => {
    render(
      React.createElement(I18nProvider, null, React.createElement(Home)),
    )

    expect(screen.getByRole("link", { name: "Se connecter" })).toHaveAttribute("href", "/login")
    expect(screen.getByRole("link", { name: "Creer un compte" })).toHaveAttribute("href", "/create-account")
    expect(screen.getByRole("link", { name: "Tester sans compte" })).toHaveAttribute("href", "/dashboard")
  })
})
