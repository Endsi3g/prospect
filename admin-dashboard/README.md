## Prospect Admin Dashboard (FR)

Frontend Next.js connecte au backend FastAPI unique (`src/admin/app.py`) via un proxy serveur (`/api/proxy/*`).

### Demarrage rapide

Depuis la racine du repo:

```powershell
.\scripts\ops\start_localhost_one_shot.ps1
```

URLs:

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000`
- Backend HTML admin: `http://localhost:8000/admin`

Arret:

```powershell
.\scripts\ops\stop_localhost.ps1
```

### Variables d'environnement frontend

`admin-dashboard/.env.local` (ecrit automatiquement par le script one-shot):

```dotenv
API_BASE_URL=http://localhost:8000
ADMIN_AUTH=admin:change-me
```

Ces variables sont **server-only** (aucune exposition navigateur).

### Mode mock localhost (fallback auto)

En local, si le backend/proxy est indisponible, le frontend bascule automatiquement sur des donnees mock pour continuer les tests UI (leads, tasks, projects, settings, reports, etc.).

- Optionnel: desactiver ce fallback automatique avec:

```dotenv
NEXT_PUBLIC_AUTO_MOCK_LOCALHOST=false
```

- Forcer le mode mock (meme si API disponible):

```dotenv
NEXT_PUBLIC_USE_MOCK=true
```

- Choisir le scenario mock par defaut (volume/comportement):

```dotenv
NEXT_PUBLIC_MOCK_SCENARIO_DEFAULT=balanced
```

Scenarios disponibles: `balanced`, `empty`, `ops_overload`, `conversion_peak`.

- Override rapide depuis l'URL locale (sans redemarrer):

`http://localhost:3000/leads?mockScenario=ops_overload`

- Selection UI (sans query param):

`/settings/dev` -> choisir le scenario puis `Appliquer scenario` (stocke localement dans le navigateur).

### Fonctionnalites

- UI en francais
- CRUD projets avec modales globales
- Page Parametres persistante (`GET/PUT /api/v1/admin/settings`)
- Recherche globale (`Ctrl+K` / `Cmd+K`)
- Panneau et page d'aide (`/help`)
- Import CSV intelligent (preview + mapping + commit) depuis la page Leads
- Edition/Suppression de taches connectees au backend (`PATCH/DELETE /api/v1/admin/tasks/{id}`)
- Flows:
  - Lead -> Projet
  - Lead -> Tache
  - Tache -> Projet

### Build

```bash
cd admin-dashboard
npm run build
```
