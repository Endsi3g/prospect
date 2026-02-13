const DEFAULT_BASE_URL = "/api/proxy"

type RequestApiOptions = {
  skipAuthRetry?: boolean
}

type ErrorPayload = {
  detail?: string
  message?: string
}

function isMockEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK === "true"
}

function normalizeBaseUrl(raw: string): string {
  return raw.endsWith("/") ? raw.slice(0, -1) : raw
}

export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_BASE_URL
  return normalizeBaseUrl(raw)
}

function friendlyProxyHint(): string {
  return "Verifiez API_BASE_URL sur Vercel et que le backend FastAPI est en ligne."
}

function mapFriendlyError({
  status,
  detail,
  normalizedPath,
}: {
  status: number
  detail: string
  normalizedPath: string
}): string {
  const cleanDetail = detail.trim()
  const lowerDetail = cleanDetail.toLowerCase()

  if (lowerDetail.includes("[mock]")) {
    return "Mode mock actif, mais donnees de test introuvables pour cet ecran."
  }

  if (status === 502) {
    return `API indisponible via proxy (${normalizedPath}). ${friendlyProxyHint()}`
  }

  if (status === 504) {
    return `Timeout proxy vers l'API (${normalizedPath}). ${friendlyProxyHint()}`
  }

  if (status >= 500 && lowerDetail.includes("upstream")) {
    return `${cleanDetail} ${friendlyProxyHint()}`
  }

  if (status >= 400 && cleanDetail) {
    return cleanDetail
  }

  return `Requete API en echec (${status}) sur ${normalizedPath}.`
}

async function parseErrorMessage(
  response: Response,
  normalizedPath: string,
): Promise<string> {
  try {
    const payload = (await response.clone().json()) as ErrorPayload
    const detail = payload.detail || payload.message || ""
    return mapFriendlyError({
      status: response.status,
      detail,
      normalizedPath,
    })
  } catch {
    try {
      const text = await response.text()
      return mapFriendlyError({
        status: response.status,
        detail: text || "",
        normalizedPath,
      })
    } catch {
      return mapFriendlyError({
        status: response.status,
        detail: "",
        normalizedPath,
      })
    }
  }
}

async function refreshAdminSession(): Promise<boolean> {
  try {
    const refreshUrl = `${getApiBaseUrl()}/api/v1/admin/auth/refresh`
    const response = await fetch(refreshUrl, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
    })
    return response.ok
  } catch {
    return false
  }
}

export async function requestApi<T>(
  path: string,
  init?: RequestInit,
  options?: RequestApiOptions,
): Promise<T> {
  if (isMockEnabled()) {
    const { getMockResponse } = await import("./mocks")
    try {
      return await getMockResponse<T>(path)
    } catch {
      throw new Error("Mode mock actif, mais ce flux n'a pas de fixture. Desactivez NEXT_PUBLIC_USE_MOCK ou ajoutez des donnees mock.")
    }
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  const url = path.startsWith("http") ? path : `${getApiBaseUrl()}${normalizedPath}`
  const headers = new Headers(init?.headers || undefined)

  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers,
      cache: "no-store",
      credentials: "same-origin",
    })
  } catch {
    throw new Error(`Connexion API impossible (${normalizedPath}). ${friendlyProxyHint()}`)
  }

  const isAuthEndpoint = normalizedPath.startsWith("/api/v1/admin/auth/")
  if (response.status === 401 && !isAuthEndpoint && !options?.skipAuthRetry) {
    const refreshed = await refreshAdminSession()
    if (refreshed) {
      return requestApi<T>(path, init, { skipAuthRetry: true })
    }
  }

  if (!response.ok) {
    const message = await parseErrorMessage(response, normalizedPath)
    if (response.status === 401 && typeof window !== "undefined" && !isAuthEndpoint) {
      window.location.href = "/login"
      return undefined as T
    }
    throw new Error(message)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export async function fetchApi<T>(path: string): Promise<T> {
  return requestApi<T>(path)
}
