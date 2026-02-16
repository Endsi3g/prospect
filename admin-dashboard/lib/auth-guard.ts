const PUBLIC_PATHS = new Set(["/", "/login", "/create-account", "/demo"])
const PUBLIC_PREFIXES = ["/_next/", "/api/", "/images/"]
const STATIC_FILE_REGEX = /\.[a-zA-Z0-9]+$/

export const ACCESS_COOKIE_NAME = "admin_access_token"
export const DEMO_COOKIE_NAME = "prospect_demo"

export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase()
}

export function isLocalhostHost(hostname: string): boolean {
  const normalized = normalizeHostname(hostname)
  return normalized === "localhost" || normalized === "127.0.0.1"
}

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true
  if (STATIC_FILE_REGEX.test(pathname)) return true
  return false
}

export function isDemoAccessAllowed(hostname: string, hasDemoCookie: boolean): boolean {
  return hasDemoCookie && isLocalhostHost(hostname)
}

export function isRouteAuthenticated({
  hostname,
  hasAccessCookie,
  hasDemoCookie,
}: {
  hostname: string
  hasAccessCookie: boolean
  hasDemoCookie: boolean
}): boolean {
  if (hasAccessCookie) return true
  return isDemoAccessAllowed(hostname, hasDemoCookie)
}
