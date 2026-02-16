// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest"
import { NextRequest } from "next/server"

import { GET } from "../app/api/proxy/[...path]/route"

const originalFetch = globalThis.fetch
const originalNodeEnv = process.env.NODE_ENV
const originalBaseUrl = process.env.API_BASE_URL
const originalAuth = process.env.ADMIN_AUTH

function restoreRuntime() {
  globalThis.fetch = originalFetch
  ;(process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv

  if (originalBaseUrl === undefined) {
    delete process.env.API_BASE_URL
  } else {
    process.env.API_BASE_URL = originalBaseUrl
  }

  if (originalAuth === undefined) {
    delete process.env.ADMIN_AUTH
  } else {
    process.env.ADMIN_AUTH = originalAuth
  }
}

afterEach(() => {
  restoreRuntime()
})

describe("proxy data-source header contract", () => {
  it("returns x-prospect-data-source=upstream for successful upstream responses", async () => {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = "production"
    process.env.API_BASE_URL = "https://upstream.test"
    delete process.env.ADMIN_AUTH

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch

    const request = new NextRequest("http://localhost:3000/api/proxy/api/v1/admin/stats")
    const response = await GET(request, { params: { path: ["api", "v1", "admin", "stats"] } })

    expect(response.status).toBe(200)
    expect(response.headers.get("x-prospect-data-source")).toBe("upstream")
    expect(response.headers.get("x-proxy-fallback")).toBeNull()
  })

  it("returns x-prospect-data-source=dev-fallback when development fallback is used", async () => {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = "development"
    process.env.API_BASE_URL = "https://upstream.test"
    delete process.env.ADMIN_AUTH

    globalThis.fetch = (async () => {
      throw new Error("upstream unavailable")
    }) as typeof fetch

    const request = new NextRequest("http://localhost:3000/api/proxy/api/v1/admin/stats")
    const response = await GET(request, { params: { path: ["api", "v1", "admin", "stats"] } })

    expect(response.status).toBe(200)
    expect(response.headers.get("x-prospect-data-source")).toBe("dev-fallback")
    expect(response.headers.get("x-proxy-fallback")).toBe("dev-mock")

    const payload = await response.json() as { sourced_total: unknown }
    expect(typeof payload.sourced_total).toBe("number")
  })
})
