# Vercel Deployment Runbook (admin-dashboard)

This project uses split architecture:
- Frontend: `admin-dashboard` on Vercel
- Backend API: external FastAPI service (recommended: Koyeb)

## 1) Required backend settings

Set these environment variables on backend first:
- `APP_ENV=production`
- `ADMIN_AUTH_MODE=hybrid`
- `ADMIN_USERNAME=<secure-user>`
- `ADMIN_PASSWORD=<secure-password>`
- `JWT_SECRET=<long-random-secret>`
- `ADMIN_CORS_ALLOW_ORIGINS=https://<your-vercel-domain>.vercel.app`

Backend health must pass:
- `GET https://<backend-domain>/healthz` returns `{"ok": true, ...}`

## 2) Required Vercel settings

Set on Vercel project (Preview + Production):
- `API_BASE_URL=https://<backend-domain>`
- `ADMIN_AUTH=<admin-user>:<admin-password>` (optional fallback for proxy)
- `PROXY_UPSTREAM_TIMEOUT_MS=20000`
- `NEXT_PUBLIC_USE_MOCK=false`

Important:
- In production, proxy route requires `API_BASE_URL`.
- If missing, frontend proxy returns a clear config error.

## 3) Deploy commands

From repository root:

```powershell
npx vercel --cwd admin-dashboard
```

Then production:

```powershell
npx vercel --prod --cwd admin-dashboard
```

## 4) Post-deploy smoke checklist

1. Open `/login` and authenticate.
2. Dashboard loads stats (no infinite skeleton).
3. Leads/tasks/projects load with data or meaningful empty state.
4. Research page works (guided + web search).
5. Assistant run creation/list/confirm works.
6. Settings/team pages load without blocking errors.

## 5) Common failures

### "Unable to reach upstream API from proxy"
- Cause: backend down or bad `API_BASE_URL`.
- Fix: verify Vercel env + backend health.

### "Proxy API non configure"
- Cause: `API_BASE_URL` missing in Vercel env.
- Fix: add variable in Vercel for Preview and Production.

### 401 loops to login
- Cause: invalid auth/session or backend auth config mismatch.
- Fix: verify `ADMIN_AUTH_MODE`, credentials, and cookies on backend.
