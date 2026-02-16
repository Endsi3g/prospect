# Admin API v1

Base URL (local): `http://localhost:8000`

Authentication:
- Supported modes via `ADMIN_AUTH_MODE`: `basic`, `hybrid`, `jwt` (default: `hybrid`).
- For `basic` and `hybrid`, Basic Auth (`ADMIN_USERNAME` / `ADMIN_PASSWORD`) is accepted on protected admin routes.
- For `jwt` and `hybrid`, session auth is available via `/api/v1/admin/auth/*` (HTTP-only cookies and Bearer token support).
- Production recommendation: set `ADMIN_AUTH_MODE=jwt` and provide a strong `JWT_SECRET`.

Error envelope (all admin/API v1 errors):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": {"issues": []},
    "retryable": false,
    "request_id": "uuid-or-client-id"
  },
  "detail": "Request validation failed."
}
```

`x-request-id` is echoed in response headers and payload.

## Auth
- `POST /api/v1/admin/auth/login`
- `POST /api/v1/admin/auth/refresh`
- `POST /api/v1/admin/auth/logout`
- `GET /api/v1/admin/auth/me`

## Health
- `GET /healthz`

## Leads
- `GET /api/v1/admin/leads?page=1&page_size=25`
- advanced query params:
  - `q`, `status`, `segment`, `tier`, `heat_status`, `company`, `industry`, `location`, `tag`
  - `min_score`, `max_score`
  - `has_email`, `has_phone`, `has_linkedin`
  - `created_from`, `created_to`, `last_scored_from`, `last_scored_to` (ISO datetime)
- `POST /api/v1/admin/leads`
- `POST /api/v1/admin/leads/{lead_id}/stage-transition`
- `POST /api/v1/admin/leads/{lead_id}/reassign`

## Tasks
- `GET /api/v1/admin/tasks`
- `POST /api/v1/admin/tasks`
- `PATCH /api/v1/admin/tasks/{task_id}`
- `DELETE /api/v1/admin/tasks/{task_id}`
- `POST /api/v1/admin/tasks/bulk-assign`

## Funnel / Workload / Handoffs
- `GET /api/v1/admin/funnel/config`
- `PUT /api/v1/admin/funnel/config`
- `GET /api/v1/admin/workload/owners`
- `GET /api/v1/admin/conversion/funnel?days=30`
- `POST /api/v1/admin/handoffs`

## Recommendations
- `GET /api/v1/admin/recommendations?status=pending&limit=50&offset=0`
- `POST /api/v1/admin/recommendations/{recommendation_id}/apply`
- `POST /api/v1/admin/recommendations/{recommendation_id}/dismiss`

## Opportunities
- `GET /api/v1/admin/opportunities`
- `GET /api/v1/admin/opportunities/summary`
- `POST /api/v1/admin/opportunities`
- `POST /api/v1/admin/opportunities/{opportunity_id}/stage-transition`
- `PATCH /api/v1/admin/opportunities/{opportunity_id}`
- `DELETE /api/v1/admin/opportunities/{opportunity_id}`

## Sequences
- `POST /api/v1/admin/sequences`
- `GET /api/v1/admin/sequences`
- `GET /api/v1/admin/sequences/{sequence_id}`
- `PATCH /api/v1/admin/sequences/{sequence_id}`
- `POST /api/v1/admin/sequences/{sequence_id}/simulate`

## Campaigns
- `POST /api/v1/admin/campaigns`
- `GET /api/v1/admin/campaigns`
- `GET /api/v1/admin/campaigns/{campaign_id}`
- `PATCH /api/v1/admin/campaigns/{campaign_id}`
- `POST /api/v1/admin/campaigns/{campaign_id}/activate`
- `POST /api/v1/admin/campaigns/{campaign_id}/pause`
- `POST /api/v1/admin/campaigns/{campaign_id}/enroll`
- `GET /api/v1/admin/campaigns/{campaign_id}/runs`

## Content generation
- `POST /api/v1/admin/content/generate`
  - `provider`: `deterministic` or `ollama`

## Enrichment
- `POST /api/v1/admin/enrichment/run`
- `GET /api/v1/admin/enrichment/{job_id}`

## Projects
- `GET /api/v1/admin/projects`
- `POST /api/v1/admin/projects`
- `PATCH /api/v1/admin/projects/{project_id}`
- `DELETE /api/v1/admin/projects/{project_id}`

## Analytics / Settings / Search / Help
- `GET /api/v1/admin/analytics`
- `GET /api/v1/admin/settings`
- `PUT /api/v1/admin/settings`
- `GET /api/v1/admin/secrets/schema`
- `GET /api/v1/admin/secrets`
- `PUT /api/v1/admin/secrets`
- `DELETE /api/v1/admin/secrets/{key}`
- `GET /api/v1/admin/search?q=...&limit=...`
- `GET /api/v1/admin/research/web?q=...&provider=auto&limit=8`
  - research providers: `auto`, `duckduckgo`, `perplexity`, `firecrawl`, `ollama`
- `GET /api/v1/admin/help`

## Import CSV
- `POST /api/v1/admin/import/csv/preview` (`multipart/form-data`)
  - fields:
    - `file` (CSV file, required)
    - `table` (`leads|tasks|projects`, optional)
    - `mapping_json` (JSON object string, optional)
- `POST /api/v1/admin/import/csv/commit` (`multipart/form-data`)
  - same fields as preview

Preview response:

```json
{
  "detected_table": "leads",
  "selected_table": "leads",
  "table_confidence": 0.86,
  "headers": ["first_name", "email"],
  "suggested_mapping": {"first_name": "first_name", "email": "email"},
  "effective_mapping": {"first_name": "first_name", "email": "email"},
  "total_rows": 10,
  "valid_rows": 9,
  "invalid_rows": 1,
  "errors": [{"row": 4, "message": "Lead email is required."}],
  "preview": [{"first_name": "Alice", "email": "alice@example.com"}]
}
```

Commit response:

```json
{
  "table": "leads",
  "processed_rows": 10,
  "created": 6,
  "updated": 3,
  "skipped": 1,
  "errors": [{"row": 4, "message": "Lead email is required."}]
}
```

## Diagnostics / Autofix
- `POST /api/v1/admin/diagnostics/run`
- `GET /api/v1/admin/diagnostics/latest`
- `POST /api/v1/admin/autofix/run`
- `GET /api/v1/admin/autofix/latest`

Run response:

```json
{
  "ok": true,
  "return_code": 0,
  "auto_fix": false,
  "duration_seconds": 12.4,
  "artifact": "C:\\prospect\\prospect\\artifacts\\qa\\latest_diagnostics.json"
}
```

Latest response:

```json
{
  "available": true,
  "ok": true,
  "error_count": 0,
  "warning_count": 0
}
```

## Scoring preview
- `POST /api/v1/score/preview`
