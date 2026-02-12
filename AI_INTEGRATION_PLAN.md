# Plan d’intégration: IA spécialisée “Prospect AI” via Khoj

## Résumé

Implémenter une IA spécialisée pour cette application en s’appuyant sur un service Khoj dédié (Docker), pilotée depuis une nouvelle vue “IA Prospect” dans `/assistant` (2 vues dans la même page).

L’IA devra:

- aller chercher des leads (priorité Apify),
- appliquer nurturing + scoring,
- ajouter/mettre à jour automatiquement dans l’app,
- notifier l’utilisateur (in-app + email selon préférences),
- journaliser toutes les actions (audit log).

## Architecture cible

- Variables:
  - `KHOJ_API_BASE_URL`
  - `KHOJ_API_BEARER_TOKEN`

### Orchestrateur IA backend (`src/admin/assistant_service.py`)

- Appel Khoj `/api/chat`
- Réponse JSON structurée (plan d’actions)

### UI dans `/assistant` (2 vues)

- Vue existante conservée
- Vue “IA Prospect”:
  - statut run
  - résultats (leads/tâches/projets)
  - historique des runs

## Nouvelles APIs admin

Sous `/api/v1/admin/assistant`:

- `POST /prospect/execute`
- `GET /prospect/runs`
- `GET /prospect/runs/{run_id}`
- `POST /prospect/confirm`

## Événements notifications à ajouter

- `assistant_run_completed`

## Flux fonctionnel

1. Sourcing leads
   - `source_leads_apify` via Apify + enrichment + scoring + upsert DB

2. Nurturing
   - `nurture_leads` via `FollowUpManager`

3. Scoring
   - rescoring global/ciblé via logique existante

4. Notifications
   - in-app systématique
   - email selon préférences

5. Audit
   - trace par run + action

## Garde-fous

Auto-exécution autorisée:

- create/update leads/tasks/projects
- sourcing
- nurturing
- rescoring

Confirmation obligatoire:

- suppressions
- bulk actions massives
- opérations irréversibles

## Fichiers concernés

Backend:

- `src/admin/app.py`
- `src/admin/assistant_service.py` (new)
- `src/admin/assistant_types.py` (new)
- `src/admin/assistant_store.py` (new)
- `src/core/db_models.py`
- `src/core/db_migrations.py`

Frontend:

- `admin-dashboard/app/assistant/page.tsx`
- `admin-dashboard/components/assistant-prospect-panel.tsx` (new)
- `admin-dashboard/components/assistant-action-plan.tsx` (new)
- `admin-dashboard/components/assistant-run-result.tsx` (new)

Config/Ops:

- `.env.example`
- `docker-compose.yml` (service Khoj)

## Tests

Backend:

- run complet avec création leads + nurturing + scoring
- action sensible bloquée en attente de confirmation
- gestion indisponibilité Khoj
- notifications créées correctement
- audit log complet
- idempotence sur rejouage

Frontend:

- affichage vue IA
- plan + exécution + erreurs partielles
- historique runs
- navigation vers entités créées

E2E:
Commande: “Trouve 20 leads dentistes à Lyon, score-les, lance nurturing et notifie-moi.”
Attendu:

- leads visibles
- scoring renseigné
- tâches nurturing créées
- notifications présentes
- audit log présent

## Rollout

- Feature flag `assistant_prospect_enabled=false`
- Activation locale QA
- Activation progressive + monitoring

## Hypothèses validées

- Déploiement Khoj: service Docker dédié
- Autonomie IA: auto avec garde-fous
- Source prioritaire: Apify
- UX: 2 vues dans `/assistant`
