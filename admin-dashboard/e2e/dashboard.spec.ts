import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem("prospect:locale")
    window.localStorage.setItem("prospect:forceMock", "true")
  })
  await page.goto("/demo")
  await page.waitForURL("**/dashboard")
})

test("dashboard charge avec metriques visibles", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible()
  await expect(page.getByText("Leads sourcés")).toBeVisible()
  await expect(page.getByText("Activité pipeline")).toBeVisible()
})

test("switch locale FR vers EN persiste", async ({ page }) => {
  await expect(page.getByText("Leads sourcés")).toBeVisible()

  await page.getByRole("button", { name: "Basculer la langue" }).click()

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible()
  await expect(page.getByText("Sourced leads")).toBeVisible()
  await expect(page.getByText("Pipeline activity")).toBeVisible()

  await page.reload()
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible()
  await expect(page.getByText("Sourced leads")).toBeVisible()
})

