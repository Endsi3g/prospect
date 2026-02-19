export const PUBLIC_ROUTES = new Set(["/", "/login", "/create-account", "/demo"])

export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.has(pathname)) return true
  return false
}
