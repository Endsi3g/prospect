import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import {
  ACCESS_COOKIE_NAME,
  DEMO_COOKIE_NAME,
  isPublicPath,
  isRouteAuthenticated,
} from "./lib/auth-guard"

function toLoginRedirect(request: NextRequest): NextResponse {
  const redirectUrl = request.nextUrl.clone()
  redirectUrl.pathname = "/login"
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`
  redirectUrl.searchParams.set("next", next)
  return NextResponse.redirect(redirectUrl)
}

export function middleware(request: NextRequest) {
  const { pathname, hostname } = request.nextUrl
  const hasAccessCookie = Boolean(request.cookies.get(ACCESS_COOKIE_NAME)?.value)
  const hasDemoCookie = request.cookies.get(DEMO_COOKIE_NAME)?.value === "1"
  const authenticated = isRouteAuthenticated({
    hostname,
    hasAccessCookie,
    hasDemoCookie,
  })

  if (isPublicPath(pathname)) {
    if (hasAccessCookie && (pathname === "/login" || pathname === "/create-account")) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = "/dashboard"
      redirectUrl.search = ""
      return NextResponse.redirect(redirectUrl)
    }
    return NextResponse.next()
  }

  if (!authenticated) {
    return toLoginRedirect(request)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
