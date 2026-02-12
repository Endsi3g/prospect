# Automated Prospecting System

Lead generation and outreach platform with dual scoring, intent enrichment, and admin operations tooling.

## Overview

This project does the following:

- Source leads from `Apollo.io` (B2B contacts) and `Apify` Google Maps crawler (local businesses).
- Enrich leads with company and intent signals (`mock`, `bombora`, `6sense` providers).
- Score each lead with:
  - `ICP score` (fit)
  - `Heat score` (timing and engagement)
- Assign:
  - Tier (`Tier A` to `Tier D`)
  - Heat status (`Hot`, `Warm`, `Cold`)
  - Next best action (automation hint)
- Generate outreach drafts and support follow-up workflows.
- Expose an admin dashboard and operational APIs.

## Latest Updates (2026-02-12)

- Full task lifecycle in admin API/UI (`create`, `list`, `update`, `delete`).
- Intelligent CSV import flow with table detection and mapping (`preview` + `commit`).
- Intelligent diagnostics and optional Codex autofix pipeline (`scripts/qa/*` + API endpoints).
- Expanded localhost smoke validation (`test_localhost_all_features.ps1`) including import and diagnostics endpoints.
- French dashboard UX improvements (skeleton loading states and connected task actions).

## Installation

```bash
python -m venv .venv
.\.venv\Scripts\Activate
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and configure values.

## Environment Variables

```dotenv
# API keys
APOLLO_API_KEY=your_apollo_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
APIFY_API_TOKEN=your_apify_api_token_here

# Intent provider
INTENT_PROVIDER=mock
INTENT_PROVIDER_API_KEY=your_intent_provider_api_key_here
INTENT_PROVIDER_BASE_URL=https://api.vendor.com

# Admin auth
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me
APP_ENV=development
ADMIN_CORS_ALLOW_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
ADMIN_RATE_LIMIT_PER_MINUTE=120
ADMIN_RATE_LIMIT_WINDOW_SECONDS=60

# Logging
LOG_LEVEL=INFO
LOG_FORMAT=json

# Database
DATABASE_URL=sqlite:///./prospect.db

# Next.js dashboard
API_BASE_URL=http://localhost:8000
ADMIN_AUTH=admin:change-me
```

## Pipeline Usage

Default run:

```bash
python run_system.py
```

Apollo example:

```bash
python run_system.py --source apollo --industry "Healthcare" --role "Owner" --location "Montreal"
```

Apify example:

```bash
python run_system.py --source apify --query "Dental clinics in Montreal" --limit 20
```

Intent provider override:

```bash
python run_system.py --intent-provider bombora
python run_system.py --intent-provider 6sense
python run_system.py --intent-provider none
```

## Admin Dashboard and APIs

Start admin app:

```bash
uvicorn src.admin.app:app --reload --port 8000
```

Open `http://localhost:8000/admin` and authenticate with `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

Available endpoints:

- `GET /healthz` service and DB health
- `GET /api/v1/admin/stats` core funnel KPIs
- `GET /api/v1/admin/leads?page=1&page_size=25` paginated leads
- `POST /api/v1/admin/leads` create a lead
- `GET /api/v1/admin/tasks` list tasks
- `POST /api/v1/admin/tasks` create a task
- `PATCH /api/v1/admin/tasks/{task_id}` update a task
- `DELETE /api/v1/admin/tasks/{task_id}` delete a task
- `GET /api/v1/admin/projects` list projects
- `POST /api/v1/admin/projects` create a project
- `PATCH /api/v1/admin/projects/{project_id}` update a project
- `DELETE /api/v1/admin/projects/{project_id}` delete a project
- `GET /api/v1/admin/analytics` analytics snapshot
- `GET /api/v1/admin/settings` read dashboard settings
- `PUT /api/v1/admin/settings` persist dashboard settings
- `GET /api/v1/admin/search?q=...&limit=...` global search
- `GET /api/v1/admin/help` help payload
- `POST /api/v1/admin/import/csv/preview` detect table + preview import
- `POST /api/v1/admin/import/csv/commit` commit CSV import
- `POST /api/v1/admin/diagnostics/run` run intelligent diagnostics
- `GET /api/v1/admin/diagnostics/latest` latest diagnostics artifact
- `POST /api/v1/admin/autofix/run` run diagnostics with codex autofix
- `GET /api/v1/admin/autofix/latest` latest autofix artifact
- `POST /api/v1/admin/rescore` rescore all persisted leads
- `POST /api/v1/score/preview` score a payload without persistence

Legacy endpoints were removed. Use only `/api/v1/*` routes.

## Localhost Quick Start

Run backend + frontend:

```powershell
.\scripts\ops\start_localhost_one_shot.ps1
```

Run full localhost smoke test:

```powershell
.\test_localhost_all_features.ps1
```

Run intelligent diagnostics:

```powershell
.\run_intelligent_tests.ps1
```

One-shot localhost startup (backend + frontend):

```powershell
.\scripts\ops\start_localhost_one_shot.ps1
```

Stop localhost processes:

```powershell
.\scripts\ops\stop_localhost.ps1
```

One-shot localhost validation (API + frontend + CRUD + import + diagnostics endpoints):

```powershell
.\test_localhost_all_features.ps1
```

Intelligent diagnostics runner (scrape + aggregate findings + optional codex autofix):

```powershell
.\run_intelligent_tests.ps1
.\run_intelligent_tests.ps1 -AutoFix
```

Example preview request:

```bash
curl -X POST "http://localhost:8000/api/v1/score/preview" \
  -u "admin:change-me" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"preview-1\",\"first_name\":\"Nadia\",\"last_name\":\"Gagnon\",\"email\":\"nadia@example.com\",\"company\":{\"name\":\"Clinique Nova\",\"industry\":\"Medical clinic\",\"size_range\":\"2-5\",\"location\":\"Montreal, QC\",\"description\":\"Prise de rendez-vous difficile\"},\"details\":{\"admin_present\":true,\"no_faq\":true,\"missing_essentials\":true,\"low_mobile_score\":true}}"
```

## Scoring Model

Scoring config is in `src/scoring/config.yaml` and validated by `src/scoring/config_schema.py`.

Key model outputs:

- `icp_score`
- `heat_score`
- `tier`
- `heat_status`
- `next_best_action`

The scoring engine persists these fields and dashboard APIs consume them directly.

## Operations Scripts

- `scripts/ops/check_connections.py`
- `scripts/ops/check_pipeline.py`
- `scripts/ops/healthcheck.py`
- `scripts/ops/start_localhost_one_shot.ps1`
- `scripts/ops/stop_localhost.ps1`
- `scripts/ops/setup_schedule.ps1`
- `scripts/qa/run_intelligent_diagnostics.ps1`
- `scripts/qa/scrape_frontend_errors.mjs`
- `scripts/qa/analyze_findings.py`
- `scripts/qa/build_codex_prompt.py`
- `scripts/qa/run_codex_autofix.ps1`
- `scripts/qa/validate_after_fix.ps1`
- `scripts/verification/verify_funnel.py`
- `scripts/verification/verify_advanced_system.py`
- `scripts/verification/test_followup_logic.py`
- `scripts/utilities/extract_manual.py`
- `scripts/utilities/generate_proposal.py`

Daily scheduling (Windows):

```powershell
.\scripts\ops\setup_schedule.ps1
```

Local healthcheck:

```bash
python scripts/ops/healthcheck.py --skip-http
python scripts/ops/healthcheck.py --url http://localhost:8000/healthz
```

## Project Layout

- `src/core` models, database, compatibility migration helper
- `src/enrichment` sourcing and enrichment clients/services
- `src/intent` intent adapters and normalization
- `src/scoring` scoring engine, config, optimizer
- `src/workflows` orchestration logic
- `src/admin` dashboard + admin APIs
- `src/outreach` follow-up automation
- `docs` strategy and playbooks
- `scripts` ops/verification/utilities
- `assets/reference` reference manuals

For a complete navigation map, see `docs/PROJECT_NAVIGATION.md`.
For admin endpoint contracts, see `docs/api/admin_v1.md`.
