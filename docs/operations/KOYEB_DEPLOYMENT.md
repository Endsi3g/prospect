# Koyeb Deployment Runbook (FastAPI backend)

This runbook deploys `src/admin/app.py` to Koyeb as the production backend.

## 1) Prerequisites

- Git repository connected to Koyeb
- Managed PostgreSQL URL available
- Frontend domains known (Netlify and/or Vercel)

The repository contains:
- `Dockerfile` (backend container build)
- `requirements.txt`

## 2) Create Koyeb web service

1. In Koyeb, create a Web Service from this repository.
2. Keep the default Docker build flow (root `Dockerfile`).
3. Expose HTTP port `8000`.
4. Start command (if overriding Docker CMD):
   - `uvicorn src.admin.app:create_app --host 0.0.0.0 --port $PORT --factory`

## 3) Environment variables

Required:
- `APP_ENV=production`
- `ADMIN_AUTH_MODE=hybrid`
- `ADMIN_USERNAME=<secure-user>`
- `ADMIN_PASSWORD=<secure-password>`
- `JWT_SECRET=<long-random-secret>`
- `DATABASE_URL=<postgres-connection-url>`
- `ADMIN_CORS_ALLOW_ORIGINS=https://<netlify-domain>,https://<vercel-domain>`

Optional (as needed):
- `OPENAI_API_KEY`
- `APOLLO_API_KEY`
- `APIFY_API_TOKEN`

## 4) Health validation

After deploy, verify:

```powershell
Invoke-RestMethod https://<koyeb-backend-domain>/healthz
```

Expected response includes `ok: true`.

## 5) Frontend cutover

1. Update frontend envs to point to Koyeb backend:
   - `API_BASE_URL=https://<koyeb-backend-domain>`
2. Apply changes in:
   - Vercel (Preview + Production)
   - Netlify (if used)
3. Redeploy frontend apps.

## 6) Smoke checklist

1. Login works.
2. Dashboard loads core stats.
3. Leads/tasks/projects endpoints respond.
4. Assistant and research flows load.
5. No requests target legacy `onrender.com` backend URLs.

## 7) Rollback

If a production issue appears:

1. Reset frontend `API_BASE_URL` to previous backend URL.
2. Redeploy frontend.
3. Inspect Koyeb logs and database connectivity before retrying cutover.
