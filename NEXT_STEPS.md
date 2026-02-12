# Next Steps

## 1. Ce qui est deja implemente

- Backend admin enrichi:
  - CRUD complet taches (`POST/GET/PATCH/DELETE /api/v1/admin/tasks`)
  - Import CSV intelligent (`/api/v1/admin/import/csv/preview` + `/commit`)
  - Diagnostics/autofix (`/api/v1/admin/diagnostics/*`, `/api/v1/admin/autofix/*`)
- Frontend:
  - Actions taches "Modifier/Supprimer" connectees au backend
  - Import CSV depuis la page Leads (preview + mapping + commit)
  - Skeleton loaders sur pages leads/tasks/projects/settings/help
  - Proxy Next compatible body binaire/multipart
- QA/Ops:
  - Script root smoke `test_localhost_all_features.ps1`
  - Pipeline QA intelligent `run_intelligent_tests.ps1` + `scripts/qa/*`
  - Tests backend pour tasks/import/diagnostics
- Lead Detail Page:
  - Vue détaillée avec score breakdown, tâches et projets liés
  - Edition rapide des informations
- Liste des Leads:
  - Filtres serveur (Recherche, Statut)
  - Pagination et Tri serveur
- Gestion Compte & Facturation:
  - Endpoints profil et facturation (`/account`, `/billing`)
  - Génération de factures PDF
- Système de Notifications:
  - Canaux In-App et Email
  - Préférences de notification par événement
- Rapports Planifiés:
  - Création/Edition de plannings (`/reports/schedules`)
  - Export PDF/CSV et envoi par email

## 2. Priorites produit restantes

- Ajouter filtres serveur + pagination serveur pour les tâches.
- Completer analytics avec vues concretes (funnel conversion, performance par source).
- Ajouter actions bulk leads (export, assignation, ajout campagne).

## 3. Priorites techniques restantes

- Migrer les deprecations SQLAlchemy/Pydantic signalees par `pytest`.
- Ajouter tests frontend E2E (Playwright) pour:
  - Lead -> Projet
  - Lead -> Tache
  - Import CSV
  - Recherche globale (`Ctrl+K` / `Cmd+K`)
- Ajouter tests integration proxy Next (`/api/proxy/[...path]`) avec erreurs upstream.

## 4. Securite

- Remplacer Basic Auth statique par session/JWT admin robuste.
- Introduire credentials differencies par environnement.
- Ajouter rotation des secrets et tests de non-regression d'acces.

## 5. Observabilite et delivery

- Ajouter logs structures par endpoint admin (latence/statut).
- Ajouter metriques minimales (`request_count`, `error_rate`, `p95`).
- Ajouter CI:
  - `python -m pytest -q`
  - `cd admin-dashboard && npm run build`
  - `powershell -ExecutionPolicy Bypass -File .\test_localhost_all_features.ps1 -SkipUnitTests -SkipFrontendBuild`

## 6. Documentation

- Ajouter spec API admin dediee (`docs/api/admin_v1.md`).
- Ajouter guide "Troubleshooting localhost" (ports, auth, CORS, env).
- Ajouter mini guide utilisateur FR pour modales/import/recherche/diagnostics.
