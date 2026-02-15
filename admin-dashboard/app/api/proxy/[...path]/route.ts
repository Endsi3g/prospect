import { NextRequest } from "next/server"

function getBaseUrl(): string | null {
  const configured = process.env.API_BASE_URL
  if (configured && configured.trim()) {
    return configured.endsWith("/") ? configured.slice(0, -1) : configured
  }

  if (process.env.NODE_ENV === "production") {
    return null
  }

  return "http://localhost:8000"
}

function isDevelopmentEnv(): boolean {
  return process.env.NODE_ENV !== "production"
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

function buildWindowMeta(rawWindow: string | null) {
  const windowKey = (rawWindow || "30d").toLowerCase()
  const now = new Date()
  const result = {
    label: "30 jours",
    days: 30,
    from: "",
    to: now.toISOString(),
  }

  if (windowKey === "7d") {
    result.label = "7 jours"
    result.days = 7
  } else if (windowKey === "90d") {
    result.label = "90 jours"
    result.days = 90
  } else if (windowKey === "ytd") {
    const from = new Date(now.getFullYear(), 0, 1)
    result.label = "Annee en cours"
    result.days = Math.max(1, Math.ceil((now.getTime() - from.getTime()) / (24 * 3600 * 1000)))
    result.from = from.toISOString()
    return result
  }

  const from = new Date(now.getTime() - result.days * 24 * 3600 * 1000)
  result.from = from.toISOString()
  return result
}

function buildEmptyDailyTrend(days: number) {
  const output: Array<{
    date: string
    created: number
    scored: number
    contacted: number
    closed: number
    tasks_created: number
    tasks_completed: number
  }> = []

  const today = new Date()
  for (let index = days - 1; index >= 0; index -= 1) {
    const day = new Date(today.getTime() - index * 24 * 3600 * 1000)
    output.push({
      date: day.toISOString().slice(0, 10),
      created: 0,
      scored: 0,
      contacted: 0,
      closed: 0,
      tasks_created: 0,
      tasks_completed: 0,
    })
  }
  return output
}

function getDevelopmentFallback(pathname: string, search: URLSearchParams, method: string): unknown | null {
  const nowIso = new Date().toISOString()

  if (pathname === "/api/v1/admin/roles") {
    return {
      items: [
        { id: 1, key: "admin", label: "Administrateur" },
        { id: 2, key: "manager", label: "Manager" },
        { id: 3, key: "sales", label: "Commercial" },
      ],
    }
  }

  if (pathname === "/api/v1/admin/users") {
    return {
      items: [
        {
          id: "dev-user-admin",
          email: "admin@example.com",
          display_name: "Admin Dev",
          status: "active",
          roles: ["admin"],
          created_at: nowIso,
          updated_at: nowIso,
        },
      ],
    }
  }

  if (pathname === "/api/v1/admin/settings") {
    return {
      organization_name: "Prospect",
      locale: "fr-FR",
      timezone: "Europe/Paris",
      default_page_size: 25,
      dashboard_refresh_seconds: 30,
      support_email: "support@example.com",
      theme: "system",
      default_refresh_mode: "polling",
      notifications: { email: true, in_app: true },
    }
  }

  if (pathname === "/api/v1/admin/stats") {
    return {
      sourced_total: 0,
      qualified_total: 0,
      contacted_total: 0,
      replied_total: 0,
      booked_total: 0,
      closed_total: 0,
      qualified_rate: 0,
      contact_rate: 0,
      reply_rate: 0,
      book_rate: 0,
      close_rate: 0,
      avg_total_score: 0,
      tier_distribution: {},
      daily_pipeline_trend: [],
    }
  }

  if (pathname === "/api/v1/admin/metrics") {
    return {
      generated_at: nowIso,
      requests_total: 0,
      errors_total: 0,
      p95_latency_ms: 0,
      queue_depth: 0,
    }
  }

  if (pathname === "/api/v1/admin/sync/health" && method === "GET") {
    return {
      generated_at: nowIso,
      status: "empty",
      ok: true,
      last_sync_at: null,
      stale_seconds: null,
      sources: [
        { entity: "leads", count: 0, last_updated_at: null, stale_seconds: null, status: "empty" },
        { entity: "tasks", count: 0, last_updated_at: null, stale_seconds: null, status: "empty" },
        { entity: "projects", count: 0, last_updated_at: null, stale_seconds: null, status: "empty" },
        { entity: "report_runs", count: 0, last_updated_at: null, stale_seconds: null, status: "empty" },
        { entity: "assistant_runs", count: 0, last_updated_at: null, stale_seconds: null, status: "empty" },
        { entity: "notifications", count: 0, last_updated_at: null, stale_seconds: null, status: "empty" },
      ],
    }
  }

  if (pathname === "/api/v1/admin/data/integrity" && method === "GET") {
    return {
      generated_at: nowIso,
      status: "ok",
      ok: true,
      totals: { leads: 0, tasks: 0, projects: 0 },
      checks: {
        orphan_tasks: 0,
        orphan_projects: 0,
        duplicate_lead_emails: 0,
        tasks_without_assignee: 0,
        stale_unscored_leads: 0,
        failed_report_runs_30d: 0,
      },
      issues: [],
    }
  }

  if (pathname === "/api/v1/admin/metrics/overview" && method === "GET") {
    const windowMeta = buildWindowMeta("30d")
    return {
      generated_at: nowIso,
      request: {
        request_count: 0,
        error_rate: 0,
        p95_ms: 0,
        endpoints: [],
      },
      funnel: {
        sourced_total: 0,
        qualified_total: 0,
        contacted_total: 0,
        replied_total: 0,
        booked_total: 0,
        closed_total: 0,
        qualified_rate: 0,
        contact_rate: 0,
        reply_rate: 0,
        book_rate: 0,
        close_rate: 0,
        avg_total_score: 0,
        tier_distribution: {},
        daily_pipeline_trend: [],
      },
      analytics: {
        total_leads: 0,
        leads_by_status: {},
        task_completion_rate: 0,
        pipeline_value: 0,
        new_leads_today: 0,
      },
      report_30d: {
        window: windowMeta,
        kpis: {
          leads_created_total: 0,
          leads_scored_total: 0,
          leads_contacted_total: 0,
          leads_closed_total: 0,
          tasks_created_total: 0,
          tasks_completed_total: 0,
          task_completion_rate: 0,
        },
        quality_flags: {
          stale_unscored_leads: 0,
          unassigned_tasks: 0,
        },
      },
      sync: {
        status: "empty",
        ok: true,
        last_sync_at: null,
        stale_seconds: null,
      },
      integrity: {
        status: "ok",
        ok: true,
        issue_count: 0,
      },
    }
  }

  if (pathname === "/api/v1/admin/analytics") {
    return {
      total_leads: 0,
      leads_by_status: {},
      task_completion_rate: 0,
      pipeline_value: 0,
      new_leads_today: 0,
    }
  }

  if (pathname === "/api/v1/admin/reports/schedules") {
    return { items: [] }
  }

  if (pathname === "/api/v1/admin/tasks" && method === "GET") {
    return {
      page: 1,
      page_size: 25,
      total: 0,
      items: [],
    }
  }

  if (pathname === "/api/v1/admin/projects" && method === "GET") {
    return []
  }

  if (/^\/api\/v1\/admin\/projects\/[^/]+$/.test(pathname) && method === "GET") {
    return {
      id: "dev-project",
      name: "Projet dev",
      description: "Fallback local pour fiche projet.",
      status: "Planning",
      lead_id: null,
      progress_percent: 0,
      budget_total: null,
      budget_spent: 0,
      team: [],
      timeline: [],
      deliverables: [],
      due_date: null,
      created_at: nowIso,
      updated_at: nowIso,
    }
  }

  if (/^\/api\/v1\/admin\/projects\/[^/]+\/activity$/.test(pathname) && method === "GET") {
    return {
      project_id: pathname.split("/")[5] || "dev-project",
      total: 1,
      items: [
        {
          id: "dev-activity-1",
          title: "Fallback activity",
          actor: "dev-system",
          action: "project_viewed",
          timestamp: nowIso,
        },
      ],
    }
  }

  if (pathname === "/api/v1/admin/reports/schedules/runs") {
    return { items: [] }
  }

  if (pathname === "/api/v1/admin/reports/30d") {
    const windowMeta = buildWindowMeta(search.get("window"))
    return {
      window: windowMeta,
      kpis: {
        leads_created_total: 0,
        leads_scored_total: 0,
        leads_contacted_total: 0,
        leads_closed_total: 0,
        tasks_created_total: 0,
        tasks_completed_total: 0,
        task_completion_rate: 0,
      },
      daily_trend: buildEmptyDailyTrend(windowMeta.days),
      timeline_items: [],
      channel_breakdown: [
        { channel: "email", count: 0, completed: 0 },
        { channel: "call", count: 0, completed: 0 },
      ],
      quality_flags: {
        stale_unscored_leads: 0,
        unassigned_tasks: 0,
      },
    }
  }

  if (pathname === "/api/v1/admin/integrations") {
    return {
      providers: {
        slack: { enabled: false, config: {} },
        zapier: { enabled: false, config: {} },
        duckduckgo: { enabled: true, config: { region: "us-en", safe_search: "moderate" } },
        perplexity: { enabled: false, config: { model: "sonar" } },
        firecrawl: { enabled: false, config: { country: "us", lang: "en" } },
      },
    }
  }

  if (pathname === "/api/v1/admin/webhooks") {
    return { items: [] }
  }

  if (pathname === "/api/v1/admin/audit-log") {
    return {
      items: [
        {
          id: "dev-audit-1",
          actor: "dev-system",
          action: "proxy_fallback_used",
          entity_type: "proxy",
          entity_id: null,
          metadata: { mode: "development" },
          created_at: nowIso,
        },
      ],
      next_cursor: null,
    }
  }

  if (pathname === "/api/v1/admin/diagnostics/latest") {
    return {
      available: false,
      artifact: "artifacts/qa/latest_diagnostics.json",
      detail: "No diagnostics artifact available yet.",
      status: "warning",
      finished_at: null,
    }
  }

  if (pathname === "/api/v1/admin/autofix/latest") {
    return {
      available: false,
      artifact: "artifacts/qa/latest_autofix.json",
      detail: "No autofix artifact available yet.",
      status: "warning",
      finished_at: null,
    }
  }

  if (method === "POST" && pathname === "/api/v1/admin/diagnostics/run") {
    return {
      ok: true,
      return_code: 0,
      auto_fix: false,
      started_at: nowIso,
      finished_at: nowIso,
      duration_seconds: 0.02,
      artifact: "artifacts/qa/latest_diagnostics.json",
      stdout_tail: ["[dev-fallback] Diagnostics run simulated."],
      stderr_tail: [],
      artifact_payload: { status: "ok", source: "proxy-dev-fallback" },
    }
  }

  if (method === "POST" && pathname === "/api/v1/admin/autofix/run") {
    return {
      ok: true,
      return_code: 0,
      auto_fix: true,
      started_at: nowIso,
      finished_at: nowIso,
      duration_seconds: 0.03,
      artifact: "artifacts/qa/latest_autofix.json",
      stdout_tail: ["[dev-fallback] Autofix run simulated."],
      stderr_tail: [],
      artifact_payload: { status: "ok", source: "proxy-dev-fallback" },
    }
  }

  return null
}

function respondWithDevelopmentFallback(
  request: NextRequest,
  pathname: string,
): Response | null {
  if (!isDevelopmentEnv()) {
    return null
  }
  const method = request.method.toUpperCase()

  const payload = getDevelopmentFallback(pathname, request.nextUrl.searchParams, method)
  if (!payload) {
    return null
  }

  return Response.json(payload, {
    status: 200,
    headers: {
      "x-proxy-fallback": "dev-mock",
    },
  })
}

async function forwardRequest(
  request: NextRequest,
  path: string[],
): Promise<Response> {
  const normalizedPath = path.join("/")
  const pathname = `/${normalizedPath}`
  const baseUrl = getBaseUrl()
  if (!baseUrl) {
    const fallback = respondWithDevelopmentFallback(request, pathname)
    if (fallback) {
      return fallback
    }
    return Response.json(
      {
        detail:
          "Proxy API non configure. Definissez API_BASE_URL dans l'environnement frontend (Vercel/Netlify).",
      },
      { status: 500 },
    )
  }
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
    const fallback = respondWithDevelopmentFallback(request, pathname)
    if (fallback) {
      return fallback
    }

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

  if (upstream.status >= 500) {
    const fallback = respondWithDevelopmentFallback(request, pathname)
    if (fallback) {
      return fallback
    }
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
