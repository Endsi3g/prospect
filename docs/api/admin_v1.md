# Admin API v1

Base URL (local): `http://localhost:8000`

Authentication: Basic Auth (`ADMIN_USERNAME` / `ADMIN_PASSWORD`) required for `/api/v1/admin/*`.

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

## Tasks
- `GET /api/v1/admin/tasks`
- `POST /api/v1/admin/tasks`
- `PATCH /api/v1/admin/tasks/{task_id}`
- `DELETE /api/v1/admin/tasks/{task_id}`

## Projects
- `GET /api/v1/admin/projects`
- `POST /api/v1/admin/projects`
- `PATCH /api/v1/admin/projects/{project_id}`
- `DELETE /api/v1/admin/projects/{project_id}`

## Analytics / Settings / Search / Help
- `GET /api/v1/admin/analytics`
- `GET /api/v1/admin/settings`
- `PUT /api/v1/admin/settings`
- `GET /api/v1/admin/search?q=...&limit=...`
- `GET /api/v1/admin/research/web?q=...&provider=auto&limit=8`
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
