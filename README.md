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

## Deploiement backend (Koyeb)

Le backend FastAPI peut etre deploie sur Koyeb via Git (service Web).

Commande de demarrage:

```text
uvicorn src.admin.app:create_app --host 0.0.0.0 --port $PORT --factory
```

Variables minimales backend:
- `APP_ENV=production`
- `ADMIN_AUTH_MODE=hybrid`
- `ADMIN_USERNAME=<secure-user>`
- `ADMIN_PASSWORD=<secure-password>`
- `JWT_SECRET=<long-random-secret>`
- `DATABASE_URL=<managed-postgres-url>`
- `ADMIN_CORS_ALLOW_ORIGINS=https://<frontend-netlify>,https://<frontend-vercel>`

Healthcheck:

```powershell
Invoke-RestMethod https://<backend-domain>/healthz
```

## Deploiement frontend (Vercel)

Le frontend deployable principal est `admin-dashboard`, avec backend FastAPI externe.

```powershell
npx vercel --cwd admin-dashboard
npx vercel --prod --cwd admin-dashboard
```

Variables Vercel minimales:
- `API_BASE_URL=https://<backend-domain>`
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

Contournement Windows (environnement verrouille / erreur `PermissionError` sur `tmpdir`):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/utilities/run_pytest_windows_safe.ps1 -q
```

Exemple cible:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/utilities/run_pytest_windows_safe.ps1 tests/test_admin_metrics_api.py -q
```

## Scripts utiles

- `deploy.ps1` (`up`, `down`, `logs`, `check`)
- `scripts/ops/healthcheck.py`
- `scripts/ops/check_pipeline.py`
- `scripts/qa/run_intelligent_diagnostics.ps1`
- `scripts/verification/verify_advanced_system.py`
