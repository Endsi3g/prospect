import { describe, expect, it } from "vitest"

import {
  isDemoAccessAllowed,
  isLocalhostHost,
  isPublicPath,
  isRouteAuthenticated,
} from "@/lib/auth-guard"

describe("auth guard helpers", () => {
  it("marks entry routes as public", () => {
    expect(isPublicPath("/")).toBe(true)
    expect(isPublicPath("/login")).toBe(true)
    expect(isPublicPath("/create-account")).toBe(true)
    expect(isPublicPath("/demo")).toBe(true)
    expect(isPublicPath("/api/proxy/api/v1/admin/stats")).toBe(true)
    expect(isPublicPath("/dashboard")).toBe(false)
  })

  it("allows demo access only on localhost hosts", () => {
    expect(isLocalhostHost("localhost")).toBe(true)
    expect(isLocalhostHost("127.0.0.1")).toBe(true)
    expect(isLocalhostHost("app.example.com")).toBe(false)
    expect(isDemoAccessAllowed("localhost", true)).toBe(true)
    expect(isDemoAccessAllowed("app.example.com", true)).toBe(false)
  })

  it("authenticates routes with either access cookie or localhost demo cookie", () => {
    expect(
      isRouteAuthenticated({
        hostname: "app.example.com",
        hasAccessCookie: true,
        hasDemoCookie: false,
      }),
    ).toBe(true)

    expect(
      isRouteAuthenticated({
        hostname: "localhost",
        hasAccessCookie: false,
        hasDemoCookie: true,
      }),
    ).toBe(true)

    expect(
      isRouteAuthenticated({
        hostname: "app.example.com",
        hasAccessCookie: false,
        hasDemoCookie: true,
      }),
    ).toBe(false)
  })
})
