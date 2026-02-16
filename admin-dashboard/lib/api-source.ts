export const API_DATA_SOURCE_HEADER = "x-prospect-data-source"
const API_META_EVENT = "prospect:api-meta"

export type ApiDataSource = "upstream" | "dev-fallback" | "unknown"

export type ApiMeta = {
  dataSource: ApiDataSource
  status: number
  receivedAt: string
}

let latestApiMeta: ApiMeta | null = null

export function normalizeApiDataSource(rawValue: string | null | undefined): ApiDataSource {
  const value = (rawValue || "").trim().toLowerCase()
  if (value === "upstream") return "upstream"
  if (value === "dev-fallback") return "dev-fallback"
  return "unknown"
}

export function buildApiMeta(dataSource: ApiDataSource, status: number): ApiMeta {
  return {
    dataSource,
    status,
    receivedAt: new Date().toISOString(),
  }
}

export function publishApiMeta(meta: ApiMeta): void {
  latestApiMeta = meta
  if (typeof window === "undefined") {
    return
  }
  window.dispatchEvent(
    new CustomEvent<ApiMeta>(API_META_EVENT, {
      detail: meta,
    }),
  )
}

export function subscribeApiMeta(handler: (meta: ApiMeta) => void): () => void {
  if (typeof window === "undefined") {
    return () => {}
  }

  const listener = (event: Event) => {
    const detail = (event as CustomEvent<ApiMeta>).detail
    if (detail) {
      handler(detail)
    }
  }

  window.addEventListener(API_META_EVENT, listener as EventListener)
  return () => {
    window.removeEventListener(API_META_EVENT, listener as EventListener)
  }
}

export function getLatestApiMeta(): ApiMeta | null {
  return latestApiMeta
}

export function dataSourceLabel(dataSource: ApiDataSource): string {
  if (dataSource === "upstream") return "API"
  if (dataSource === "dev-fallback") return "Fallback"
  return "Inconnu"
}
