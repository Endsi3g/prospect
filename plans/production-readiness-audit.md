# 🔍 Audit de Production-Readiness — The Uprising Hunter

> **Date d'audit** : 2026-02-20
> **Scope** : Analyse complète de tous les fichiers du projet (backend, frontend, infra, tests, docs)

---

## 🚨 Problèmes Critiques (Bloquants pour la Production)

### 1. Double API — `server.py` duplique `app.py`

**Fichiers** : [server.py](file:///c:/prospect/prospect/src/api/server.py) vs [app.py](file:///c:/prospect/prospect/src/admin/app.py)

- `server.py` (665 lignes) contient des endpoints identiques à `app.py` (9607 lignes) : `/api/v1/admin/leads`, `/api/v1/admin/tasks`, `/api/v1/admin/appointments`, `/api/v1/admin/workflows`, etc.
- `server.py` n'a **aucune** authentification (pas de JWT, pas de Basic Auth), tandis que `app.py` a une couche de sécurité complète.
- Le Dockerfile et Render ne lancent que `app.py`, mais `server.py` reste potentiellement exposable.
- **Risque** : Confusion entre les deux API, endpoints non sécurisés.

> [!CAUTION]
> **Action** : Supprimer `server.py` ou le convertir en simple script de test local. Tous les endpoints de production doivent passer exclusivement par `app.py`.

---

### 2. Fichiers `.db` et artefacts de lint commités

**Fichiers** : `prospect.db`, `uprising_hunter.db`, `lint_output.txt`, `lint_report.json`, `build_output.txt`

- Deux fichiers SQLite de données (1 Mo + 1.1 Mo) sont dans le repo — ils contiennent possiblement des données sensibles.
- Des artefacts de build/lint (`lint_output.txt`, `lint_report.json`, `build_output.txt`, `lint_full.txt`, etc.) sont commités dans `admin-dashboard/`.

> [!CAUTION]
> **Action** : Supprimer ces fichiers du repo, les ajouter dans `.gitignore`.

---

### 3. CORS hardcodé dans `server.py`

**Fichier** : [server.py](file:///c:/prospect/prospect/src/api/server.py#L278-L285)

```python
allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
```

- Les origines CORS sont en dur et ne couvrent que localhost.
- `app.py` utilise `ADMIN_CORS_ALLOW_ORIGINS` depuis `.env` (bon), mais `server.py` est hardcodé.
- **Impact** : Si `server.py` est utilisé en production, le frontend déployé sera bloqué par CORS.

---

### 4. Pas de `middleware.ts` fonctionnel dans le frontend

**Fichier** : [proxy.ts](file:///c:/prospect/prospect/admin-dashboard/proxy.ts) existe mais **aucun `middleware.ts`** n'est détecté dans `admin-dashboard/`.

- Next.js requiert un fichier `middleware.ts` (ou `.js`) à la racine de `admin-dashboard/` pour exécuter le middleware.
- Le fichier `proxy.ts` exporte `proxy()` et `config` mais n'est jamais importé comme middleware Next.js.
- **Impact** : La protection des routes côté frontend (redirection login, guard session) pourrait ne pas fonctionner en production.

> [!IMPORTANT]
> **Action** : Créer `admin-dashboard/middleware.ts` qui réexporte le proxy, ou renommer `proxy.ts` en `middleware.ts`.

---

### 5. Pas de Dockerfile frontend

- Le `docker-compose.yml` référence `./admin-dashboard/Dockerfile` mais ce fichier **n'existe pas**.
- Le build Docker échouera pour le service frontend.

> [!IMPORTANT]
> **Action** : Créer `admin-dashboard/Dockerfile` pour le build Next.js.

---

## ⚠️ Problèmes Importants (À corriger avant le déploiement)

### 6. Backend monolithique — `app.py` fait 9607 lignes

- Fichier unique contenant 441+ fonctions : routes, logique métier, middleware, modèles de requêtes, constantes.
- Maintenance et debugging très difficiles.
- **Recommandation** : Refactoriser en modules par domaine (routes séparées dans des APIRouters dédiés).

---

### 7. Pas de migrations de base de données versionnées (Alembic)

- La migration SQLite est gérée par un script ad-hoc de 1011 lignes (`db_migrations.py`) qui ajoute les colonnes manquantes.
- **Pas d'Alembic** pour PostgreSQL en production.
- La méthode `Base.metadata.create_all()` dans `server.py` est utilisée directement — ne gère pas les changements de schéma.

> [!WARNING]
> **Action** : Intégrer Alembic pour les migrations PostgreSQL. La méthode actuelle fonctionne pour le développement mais est risquée en production.

---

### 8. Actions Workflow manquantes

**Fichier** : [rules_engine.py](file:///c:/prospect/prospect/src/workflows/rules_engine.py)

Les actions prévues dans le [plan](file:///c:/prospect/prospect/plans/next-features-and-ux.md) ne sont pas implémentées :

- ❌ `send_webhook` — Prévu mais absent du code
- ❌ `add_tag` — Prévu mais absent du code
- ✅ `create_task` — Implémenté
- ✅ `change_stage` — Implémenté
- ✅ `change_status` — Implémenté

Triggers manquants :

- ❌ `task_completed` — Non câblé (le trigger n'est pas déclenché quand une tâche passe en "Done")
- ✅ `lead_created` — Câblé dans `server.py` mais pas dans `app.py`
- ✅ `lead_scored` — Câblé

---

### 9. Version `requirements.txt` non épinglée

```
pydantic>=2.0.0
fastapi>=0.111.0
sqlalchemy>=2.0.0
```

- Aucune version n'est épinglée exactement (`==`), seulement des minimums (`>=`).
- En production, cela peut causer des breaking changes inattendues.
- **Action** : Générer un `requirements.lock` ou utiliser `pip freeze > requirements.txt` avec des versions exactes.

---

### 10. `from_orm` deprecated dans Pydantic v2

**Fichier** : [server.py L240](file:///c:/prospect/prospect/src/api/server.py#L240)

```python
lead_model = Lead.from_orm(db_lead)
```

- `from_orm()` est deprecated dans Pydantic v2. Utiliser `Lead.model_validate(db_lead)` à la place.

---

### 11. Bare `except` dans le code backend

**Fichier** : [server.py L248](file:///c:/prospect/prospect/src/api/server.py#L248)

```python
except:
    pass
```

- Exceptions silencieusement ignorées — masque les bugs en production.
- Aussi dans `database.py` (lignes de fallback Supabase).
- **Action** : Remplacer par `except Exception as e:` avec logging approprié.

---

### 12. ID de Lead = Email dans `server.py`

**Fichier** : [server.py L316](file:///c:/prospect/prospect/src/api/server.py#L316)

```python
db_lead = DBLead(id=lead.email, ...)
```

- Les leads créés via `server.py` utilisent l'email comme ID primaire.
- `app.py` utilise des UUID (correct).
- **Incohérence** qui causerait des collisions et des erreurs si les deux API étaient utilisées.

---

### 13. CI/CD incomplet

**Fichier** : [ci.yml](file:///c:/prospect/prospect/.github/workflows/ci.yml)

Le pipeline CI actuel :

- ✅ Backend : `pytest`
- ✅ Frontend : `lint` + `build`
- ❌ Pas de tests frontend unitaires (`npm run test:unit` n'est pas dans le CI)
- ❌ Pas de tests E2E
- ❌ Pas de check de sécurité (dépendances vulnérables)
- ❌ Pas de déploiement automatique (Render auto-deploy est configuré mais pas lié au CI)

---

## 📋 Lacunes Fonctionnelles Identifiées

### 14. Page `/workflows` frontend — Incomplète

- La page `/workflows` existe dans le routeur (`admin-dashboard/app/workflows/`) mais il faudrait vérifier qu'elle est fonctionnelle et reliée au backend.

### 15. Sidebar — Liens manquants potentiels

- "Appointments" et "Workflows" sont prévus dans le sidebar mais doivent être vérifiés.

### 16. Skeleton loaders et Toasts

Les éléments UX du [plan](file:///c:/prospect/prospect/plans/next-features-and-ux.md) :

- `sonner` est installé — les toasts doivent être vérifiés sur tous les formulaires.
- Les skeleton loaders doivent être vérifiés sur les tableaux et listes.

---

## 🛡️ Sécurité

### 17. Points positifs déjà implémentés

- ✅ JWT avec refresh tokens (dans `app.py`)
- ✅ Rate limiting in-memory
- ✅ Cookie secure auto-mode
- ✅ Encrypted secrets storage (Fernet)
- ✅ CORS configurable via env (dans `app.py`)
- ✅ Auth guard middleware côté frontend
- ✅ Audit log (DBauditLog)

### 18. Points à améliorer

- ❌ Rate limiter en mémoire — ne survit pas aux redémarrages, ne fonctionne pas en multi-instance
- ❌ Pas de CSRF protection explicite
- ❌ `APP_ENCRYPTION_KEY` et `JWT_SECRET` sans validation de longueur au démarrage
- ❌ Le `print()` est utilisé partout au lieu du module `logging` standard
- ❌ Pas de `Content-Security-Policy` header

---

## 🧹 Nettoyage & Hygiène du Code

| Élément | État | Action |
|:--------|:-----|:-------|
| `server.py` legacy | ⚠️ Redondant | Supprimer ou archiver |
| `.db` files dans le repo | 🔴 Critique | Supprimer + .gitignore |
| Lint artifacts (`lint_*.txt`, `build_output.txt`) | 🟡 | Supprimer + .gitignore |
| `__pycache__` directories | 🟡 | Vérifier .gitignore |
| `venv/` et `.venv/` | ✅ | Déjà dans .gitignore |
| `node_modules/` | ✅ | Déjà dans .gitignore |
| `mocks.ts` (136 Ko) | 🟡 | Très volumineux — pourrait être splitté |
| `openapi.json` (291 Ko) | 🟡 | Devrait être auto-généré, pas commité |

---

## 📊 Résumé des Priorités

### 🔴 P0 — Faire immédiatement (bloquant production)

1. Supprimer ou archiver `server.py` (API dupliquée non sécurisée)
2. Supprimer les `.db` files du repo + `.gitignore`
3. Créer `admin-dashboard/middleware.ts` (auth guard inactif)
4. Créer `admin-dashboard/Dockerfile` (Docker build cassé)
5. Supprimer les artefacts de lint/build du repo + `.gitignore`

### 🟡 P1 — Avant le premier déploiement client

6. Épingler les versions dans `requirements.txt`
2. Corriger `from_orm` → `model_validate` (Pydantic v2)
3. Éliminer les bare `except: pass`
4. Ajouter tests frontend au CI (`npm run test:unit`)
5. Implémenter les actions workflow manquantes (`send_webhook`, `add_tag`)
6. Câbler le trigger `task_completed` dans le workflow engine

### 🟢 P2 — Amélioration continue

12. Refactoriser `app.py` en modules (APIRouters)
2. Intégrer Alembic pour les migrations
3. Passer au rate limiter Redis
4. Ajouter CSP headers
5. Valider `JWT_SECRET` / `APP_ENCRYPTION_KEY` au démarrage
6. Vérifier skeleton loaders et toasts sur toutes les pages
7. Générer `openapi.json` au build plutôt que le commiter

---

## ✅ Ce qui est bien fait

| Domaine | Détail |
|:--------|:-------|
| **Architecture** | FastAPI + Next.js 16 + React 19 — Stack moderne |
| **Auth** | JWT avec refresh, cookie-based, guard middleware |
| **API Client** | Retry automatique, mock fallback, error parsing FR |
| **i18n** | FR/EN complet avec types TypeScript |
| **Modèles** | Pydantic v2 + SQLAlchemy bien structurés |
| **Deployment** | Render.yaml, Docker, Netlify, Vercel — multi-plateforme |
| **Monitoring** | Prometheus + Grafana stack prêt |
| **Tests** | 40 fichiers de tests backend, vitest + playwright configurés |
| **UI** | Radix UI + Tailwind + Sonner + Framer Motion + SWR |
| **Security** | Encrypted secret store, audit logs, rate limiting |
| **Scoring** | Engine YAML-configurable avec tiers et heat status |
| **Workflows** | Rules engine fonctionnel avec triggers et critères |
