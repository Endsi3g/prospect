const DEFAULT_BASE_URL = "/api/proxy"

export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_BASE_URL
  return raw.endsWith("/") ? raw.slice(0, -1) : raw
}

type RequestApiOptions = {
  skipAuthRetry?: boolean
}

async function parseErrorMessage(response: Response, normalizedPath: string): Promise<string> {
  let message = `API request failed (${response.status}) for ${normalizedPath}`
  try {
    const payload = (await response.json()) as { detail?: string }
    if (payload?.detail) {
      message = payload.detail
    }
    return message
  } catch {
    const text = await response.text()
    if (text) {
      message = text
    }
    return message
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
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  const url = path.startsWith("http") ? path : `${getApiBaseUrl()}${normalizedPath}`
  const headers = new Headers(init?.headers || undefined)
  const response = await fetch(url, {
    ...init,
    headers,
    cache: "no-store",
    credentials: "same-origin",
  })

  const isAuthEndpoint = normalizedPath.startsWith("/api/v1/admin/auth/")
  if (response.status === 401 && !isAuthEndpoint && !options?.skipAuthRetry) {
    const refreshed = await refreshAdminSession()
    if (refreshed) {
      return requestApi<T>(normalizedPath, init, { skipAuthRetry: true })
    }
  }

  if (!response.ok) {
    const message = await parseErrorMessage(response, normalizedPath)
    if (response.status === 401 && typeof window !== "undefined" && !isAuthEndpoint) {
      window.location.href = "/login"
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
