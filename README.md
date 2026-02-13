# ProspectionApp

Plateforme de prospection B2B avec sourcing, enrichissement, scoring, operations admin, et assistant IA.

## Stack

- Backend: `FastAPI`, `SQLAlchemy`, `Pydantic`
- DB: `SQLite` (local) / `PostgreSQL` (prod)
- Frontend principal: `admin-dashboard` (Next.js)
- Frontend sandbox: `system-playground` (Next.js)
- Ops/QA: scripts PowerShell et Python dans `scripts/`

## Structure du repo

```text
src/
  admin/            API admin, assistant, recherche, import, diagnostics
  ai_engine/        prompts et generation de messages
  core/             modeles, DB, migrations, logging
  enrichment/       sourcing + enrichissement
  intent/           providers intent (mock/bombora/6sense)
  outreach/         logique de follow-up
  scoring/          moteur de scoring + config
  workflows/        orchestration pipeline

admin-dashboard/    UI principale Next.js
system-playground/  sandbox UI Next.js
scripts/            ops, QA, utilitaires, verification
tests/              tests backend API et logique
docs/               documentation projet
assets/             assets de reference
archive/            artefacts historiques
```

## Demarrage local (backend)

```powershell
python -m venv .venv
.\.venv\Scripts\Activate
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn src.admin.app:app --reload --port 8000
```

Healthcheck:

```powershell
Invoke-RestMethod http://localhost:8000/healthz
```

## Demarrage local (dashboard)

```powershell
cd admin-dashboard
npm install
npm run dev
```

- Dashboard: `http://localhost:3000`
- API: `http://localhost:8000`

## Deploiement Vercel (frontend)

Le frontend deployable est `admin-dashboard`, avec backend FastAPI externe.

```powershell
npx vercel --cwd admin-dashboard
npx vercel --prod --cwd admin-dashboard
```

Variables Vercel minimales:
- `API_BASE_URL=https://<backend-render>`
- `NEXT_PUBLIC_USE_MOCK=false`
- `PROXY_UPSTREAM_TIMEOUT_MS=20000`

## Demarrage Docker

```powershell
.\deploy.ps1 up
.\deploy.ps1 check
```

## Documentation

- Index docs: `docs/README.md`
- API admin: `docs/api/admin_v1.md`
- Navigation projet: `docs/PROJECT_NAVIGATION.md`
- Roadmap: `docs/strategy/NEXT_STEPS.md`
- Plan IA: `docs/strategy/AI_INTEGRATION_PLAN.md`
- Guide operations: `docs/operations/OPERATIONS_MANUAL.md`
- Guide refactor frontend: `docs/frontend/FRONTEND_REFACTOR_GUIDE.md`

## Tests

Suite complete:

```powershell
python -m pytest -q
```

Exemple test cible:

```powershell
python -m pytest tests/test_admin_assistant_api.py -v
```

## Scripts utiles

- `deploy.ps1` (`up`, `down`, `logs`, `check`)
- `scripts/ops/healthcheck.py`
- `scripts/ops/check_pipeline.py`
- `scripts/qa/run_intelligent_diagnostics.ps1`
- `scripts/verification/verify_advanced_system.py`
