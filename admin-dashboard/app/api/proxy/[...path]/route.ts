import { NextRequest } from "next/server"

function getBaseUrl(): string {
  const raw = process.env.API_BASE_URL || "http://localhost:8000"
  return raw.endsWith("/") ? raw.slice(0, -1) : raw
}

function getOptionalAuthHeader(): string | null {
  const raw = process.env.ADMIN_AUTH
  if (!raw) {
    return null
  }
  return `Basic ${Buffer.from(raw).toString("base64")}`
}

function getUpstreamTimeoutMs(): number {
  const raw = Number(process.env.PROXY_UPSTREAM_TIMEOUT_MS || "20000")
  if (!Number.isFinite(raw)) return 20000
  return Math.max(1000, Math.min(raw, 120000))
}

async function forwardRequest(
  request: NextRequest,
  path: string[],
): Promise<Response> {
  const baseUrl = getBaseUrl()
  const normalizedPath = path.join("/")
  const targetUrl = `${baseUrl}/${normalizedPath}${request.nextUrl.search}`

  const headers = new Headers(request.headers)
  if (!headers.get("authorization")) {
    const fallbackAuth = getOptionalAuthHeader()
    if (fallbackAuth) {
      headers.set("Authorization", fallbackAuth)
    }
  }
  headers.set("x-forwarded-host", request.headers.get("host") || "")
  headers.set("x-forwarded-proto", request.nextUrl.protocol.replace(":", ""))
  headers.delete("host")
  headers.delete("content-length")
  headers.delete("connection")

  const method = request.method.toUpperCase()
  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : Buffer.from(await request.arrayBuffer())

  const controller = new AbortController()
  const timeoutMs = getUpstreamTimeoutMs()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  let upstream: Response
  try {
    upstream = await fetch(targetUrl, {
      method,
      headers,
      body,
      cache: "no-store",
      signal: controller.signal,
    })
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError"
    return Response.json(
      {
        detail: isTimeout
          ? "Upstream timeout from proxy."
          : "Unable to reach upstream API from proxy.",
      },
      { status: isTimeout ? 504 : 502 },
    )
  } finally {
    clearTimeout(timeout)
  }

  const responseHeaders = new Headers(upstream.headers)
  responseHeaders.delete("content-encoding")
  responseHeaders.delete("transfer-encoding")

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  })
}

type ProxyContext = {
  params:
    | {
        path: string[]
      }
    | Promise<{
        path: string[]
      }>
}

async function handler(request: NextRequest, context: ProxyContext): Promise<Response> {
  const { path } = await Promise.resolve(context.params)
  return forwardRequest(request, path)
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as HEAD }
