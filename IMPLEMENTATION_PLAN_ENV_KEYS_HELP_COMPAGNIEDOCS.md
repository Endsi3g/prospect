# Plan d'implementation decision-complete - Secrets ENV chiffres, Refonte Help, CompagnieDocs dynamique

## 1. Resume executif

Ce plan couvre trois livrables relies:

1. Gestion securisee des secrets backend via une modale admin + stockage chiffre en base.
2. Refonte du centre d'aide (`/help`) avec structure enrichie et compatibilite descendante API.
3. Passage de la bibliotheque (`/library`) en mode dynamique depuis `assets/reference/compagnie_docs/index/corpus_index.json`.

Le plan est decision-complete: contrats API, structure de donnees, migration, tests, rollout et defaults sont verrouilles.

## 2. Etat actuel verifie dans le repo

### Backend (FastAPI)

- API admin principale dans `src/admin/app.py`.
- Endpoints existants:
  - `GET/PUT /api/v1/admin/settings`
  - `GET/PUT /api/v1/admin/integrations`
  - `GET /api/v1/admin/help`
- `DBAdminSetting` existe deja (`src/core/db_models.py`) avec `key` + `value_json`.
- Les integrations sont stockees en clair dans `DBIntegrationConfig.config_json`.
- Les services `research_service` / `ollama_service` lisent des `api_key` depuis le payload integration ou `os.getenv`.

### Frontend (Next.js admin-dashboard)

- `admin-dashboard/app/settings/page.tsx` envoie encore des secrets en clair via `/integrations` (`api_key`, webhook, etc.).
- `admin-dashboard/app/help/page.tsx` consomme `/api/v1/admin/help` (payload minimal).
- `admin-dashboard/app/library/page.tsx` est statique (pas de call API).
- Proxy dev dans `admin-dashboard/app/api/proxy/[...path]/route.ts` sans fallback pour endpoints secrets/docs.

### CompagnieDocs

- Ingestion existante: `scripts/utilities/ingest_compagnie_docs.py`.
- Index existe deja: `assets/reference/compagnie_docs/index/corpus_index.json`.
- Docs deja presentes: `docs/operations/COMPAGNIE_DOCS_INGESTION.md`.
- Manquants (prevus au plan):
  - `scripts/utilities/generate_compagniedocs_catalog.py`
  - `docs/reference/COMPAGNIEDOCS_CATALOG.md`

## 3. Objectifs et perimetre

### In scope

1. CRUD secrets admin chiffres en DB pour cles backend critiques.
2. Resolution centralisee des secrets en runtime (DB > env OS > default code).
3. Suppression du stockage plaintext des cles sensibles dans `admin_integration_configs`.
4. Refonte API + UI de `/help` sans casser les clients existants.
5. Endpoint docs CompagnieDocs pour alimenter `/library` dynamiquement.
6. Script de generation de catalogue markdown depuis `corpus_index.json`.
7. Couverture de tests backend + frontend + migration.

### Out of scope (V1)

- Rotation automatique planifiee des cles de chiffrement.
- Gestion de secrets fichiers/binaires.
- RBAC granulaire par type de secret (on reste sur guard admin existant).
- Moteur de recherche full-text avance sur corpus docs (on fait filtre simple q/status/ext).

## 4. Decisions verrouillees

1. **Stockage secrets**: `DBAdminSetting` cle `secure_secrets_v1` (pas de nouvelle table).
2. **Chiffrement**: Fernet (symetrique) avec `APP_ENCRYPTION_KEY`.
3. **Source prioritaire des secrets**:
   1. DB chiffree
   2. Variables d'environnement OS
   3. Valeur par defaut du code (si existante)
4. **Compatibilite API**:
   - `GET /help` conserve `support_email`, `faqs`, `links`.
   - `GET/PUT /integrations` conservent la forme generale `providers`.
5. **Migration plaintext**: migration lazy idempotente au premier acces integrations/secrets.
6. **Masquage**: aucune valeur secrete retournee en clair; affichage `********` uniquement.
7. **Journalisation**: jamais de secret en logs/audit; seulement noms de cles et meta non sensibles.

## 5. Contrats API (public interfaces)

## 5.1 Nouveaux endpoints Secrets

### `GET /api/v1/admin/secrets/schema`

Retourne le schema canonique des cles gerables et metadonnees UI.

Exemple:

```json
{
  "version": "v1",
  "categories": [
    {
      "id": "ai",
      "label": "AI / NLP",
      "keys": [
        {"key": "OPENAI_API_KEY", "required": false, "multiline": false, "description": "OpenAI API key"},
        {"key": "ANTHROPIC_API_KEY", "required": false, "multiline": false, "description": "Anthropic API key"},
        {"key": "OLLAMA_API_KEY", "required": false, "multiline": false, "description": "Ollama bearer key"}
      ]
    }
  ]
}
```

### `GET /api/v1/admin/secrets`

Retourne l'etat des cles configurees (sans valeurs).

Exemple:

```json
{
  "items": [
    {"key": "OPENAI_API_KEY", "configured": true, "source": "db", "masked_value": "********", "updated_at": "2026-02-16T10:00:00Z"},
    {"key": "APIFY_API_TOKEN", "configured": false, "source": "none", "masked_value": "", "updated_at": null}
  ]
}
```

### `PUT /api/v1/admin/secrets`

Body:

```json
{"key": "OPENAI_API_KEY", "value": "sk-..."}
```

Comportement:

- valide la cle contre le schema canonique,
- chiffre et persiste,
- audit log: action `secret_upserted` avec `entity_id=<key>`.

Reponses:

- `200` succes,
- `400` cle invalide / valeur vide,
- `500` si `APP_ENCRYPTION_KEY` absente ou chiffrement KO.

### `DELETE /api/v1/admin/secrets/{key}`

- supprime la cle du vault chiffre,
- audit log `secret_deleted`,
- reponse `{ "deleted": true, "key": "..." }`.

## 5.2 Evolution endpoint Integrations (compatibilite conservee)

### `PUT /api/v1/admin/integrations`

- Accepte toujours `providers[provider].config`.
- Pour champs sensibles connus (`api_key`, `webhook`, etc.), la valeur est:
  - stockee dans le vault chiffre (`secure_secrets_v1`),
  - retiree de `config_json` (ou remplacee par `""`).

### `GET /api/v1/admin/integrations`

- Retourne la structure actuelle,
- Champs sensibles retournes masques (`********` si presents via DB/env, sinon `""`),
- Ajout optionnel non cassant: `meta.secret_keys` par provider.

## 5.3 Evolution endpoint Help

### `GET /api/v1/admin/help`

Conserve:
- `support_email`, `faqs`, `links`

Ajoute (optionnel, backward-compatible):
- `sections`: liste structuree (guides, faq, api, troubleshooting),
- `quick_actions`: actions rapides (href + label + scope),
- `updated_at`.

## 5.4 Nouveau endpoint docs CompagnieDocs

### `GET /api/v1/admin/docs/compagnie`

Query params:
- `q` (texte libre)
- `status` (`processed|pending_conversion|failed|duplicate|unsupported`)
- `ext` (`.pdf|.fig`)
- `page` (default 1)
- `page_size` (default 24, max 100)

Reponse:

```json
{
  "generated_at": "2026-02-15T02:47:54.998714+00:00",
  "stats": {"total_files": 11, "processed_pdf": 8, "processed_fig": 3, "pending_fig_conversion": 3, "fig_converted": 0, "duplicates": 0, "failed": 0, "unsupported": 0},
  "page": 1,
  "page_size": 24,
  "total": 11,
  "items": [
    {
      "doc_id": "uprising-studio-...",
      "title": "UPRISING STUDIO.pdf",
      "ext": ".pdf",
      "status": "processed",
      "size_bytes": 4009153,
      "updated_at": "2026-02-15T02:47:53.341150+00:00",
      "raw_path": "assets/reference/compagnie_docs/raw/...",
      "processed": {
        "markdown_path": "assets/reference/compagnie_docs/processed/pdf_markdown/...",
        "json_path": "assets/reference/compagnie_docs/processed/pdf_json/..."
      }
    }
  ]
}
```

Erreurs:
- `404` si index absent,
- `500` si index corrompu/non parseable.

## 6. Design technique backend

## 6.1 Nouveaux modules

### `src/admin/secrets_manager.py` (NEW)

Responsabilites:
- schema canonique des cles,
- chiffrement/dechiffrement Fernet,
- lecture/ecriture vault `secure_secrets_v1`,
- masquage valeurs,
- migration plaintext depuis integrations.

API interne proposee:
- `get_secret_schema() -> dict`
- `list_secret_states(db: Session) -> dict`
- `upsert_secret(db: Session, key: str, value: str, actor: str) -> dict`
- `delete_secret(db: Session, key: str, actor: str) -> dict`
- `resolve_secret(db: Session | None, key: str, default: str = "") -> str`
- `migrate_plaintext_integration_secrets_if_needed(db: Session) -> dict`

## 6.2 Evolution `src/admin/app.py`

Ajouts:
- pydantic payloads pour endpoints secrets/docs,
- endpoints `/secrets/*` et `/docs/compagnie`,
- extension `_help_payload` (sans casser shape existante),
- integration de migration lazy au debut de `GET/PUT /integrations` et `GET /secrets`.

Modifs:
- `_save_integrations_payload`:
  - extraction champs sensibles,
  - persistance dans vault,
  - sanitization `config_json`.
- `_list_integrations_payload`:
  - injection de masquage secret fields selon presence DB/env.

## 6.3 Resolution runtime des secrets

Cles critiques impactees:
- `OPENAI_API_KEY`
- `APIFY_API_TOKEN`
- `PERPLEXITY_API_KEY`
- `FIRECRAWL_API_KEY`
- `OLLAMA_API_KEY`
- `SMTP_PASSWORD`
- `JWT_SECRET` (lecture uniquement, voir assumptions)

Modifs cibles:
- `src/admin/research_service.py`
- `src/admin/ollama_service.py`
- `src/admin/assistant_service.py`
- `src/ai_engine/generator.py`
- `src/ai_engine/agent_tools.py`

Regle:
- remplacer lecture directe `os.getenv("KEY")` par resolver central.
- si DB indisponible, fallback env OS.

## 6.4 Structure `secure_secrets_v1` en base

`DBAdminSetting(key="secure_secrets_v1").value_json`:

```json
{
  "version": 1,
  "ciphertext": "<fernet-token>",
  "updated_at": "2026-02-16T10:00:00Z",
  "updated_by": "admin"
}
```

Payload decrypte (jamais logge):

```json
{
  "OPENAI_API_KEY": "...",
  "APIFY_API_TOKEN": "...",
  "PERPLEXITY_API_KEY": "..."
}
```

## 6.5 Migration plaintext integrations -> vault

Marker DB:
- `DBAdminSetting(key="secure_secrets_migration_v1_done") = {"done": true, "at": "..."}`

Algo:
1. Lire toutes lignes `DBIntegrationConfig`.
2. Pour chaque provider, extraire champs sensibles connus.
3. Si valeur non vide et non masquee (`********`), stocker dans vault.
4. Nettoyer `config_json` (mettre `""`).
5. Commit transaction.
6. Ecrire marker migration.

Idempotence:
- relance sans effet de bord.

## 7. Design frontend

## 7.1 Settings: modale Secrets ENV

Fichier principal:
- `admin-dashboard/app/settings/page.tsx`

Ajouts:
- bouton `Gerer cles ENV` ouvrant modale,
- fetch `GET /api/v1/admin/secrets/schema` + `GET /api/v1/admin/secrets`,
- actions `PUT/DELETE /api/v1/admin/secrets`.

Comportement UI:
- valeurs jamais affichees en clair apres save,
- badge source (`DB` / `ENV` / `none`),
- validation client minimale + erreurs backend detaillees.

Compat:
- formulaire integrations reste operationnel,
- champs `api_key` deviennent champs masques/placeholder avec CTA modale.

## 7.2 Help refonte

Fichier:
- `admin-dashboard/app/help/page.tsx`

Modifs:
- navigation par sections,
- barre de recherche locale (faq+links+sections),
- fallback affichage legacy si nouveaux champs absents,
- etat erreur explicite + retry.

## 7.3 Library dynamique

Fichier:
- `admin-dashboard/app/library/page.tsx`

Modifs:
- suppression du tableau statique local,
- consommation de `GET /api/v1/admin/docs/compagnie`,
- filtres `q`, `status`, `ext`, pagination,
- fallback lisible si endpoint indisponible.

## 7.4 Mock/proxy dev

Fichiers:
- `admin-dashboard/lib/mocks.ts`
- `admin-dashboard/app/api/proxy/[...path]/route.ts`

Ajouts fallback:
- `/api/v1/admin/secrets/schema`
- `/api/v1/admin/secrets`
- `/api/v1/admin/docs/compagnie`

## 8. Documentation et scripts

## 8.1 Nouveaux fichiers

- `scripts/utilities/generate_compagniedocs_catalog.py`
- `docs/reference/COMPAGNIEDOCS_CATALOG.md`

## 8.2 Fichiers modifies

- `docs/README.md` (ajout section reference + operations)
- `docs/api/admin_v1.md` (nouveaux endpoints secrets/docs)
- `docs/operations/COMPAGNIE_DOCS_INGESTION.md` (ajout etape generation catalogue)
- `.env.example` (ajout `APP_ENCRYPTION_KEY` + note generation Fernet key)

## 8.3 Commande catalogue

```powershell
python scripts/utilities/generate_compagniedocs_catalog.py `
  --index "assets/reference/compagnie_docs/index/corpus_index.json" `
  --output "docs/reference/COMPAGNIEDOCS_CATALOG.md"
```

## 9. Plan de tests

## 9.1 Backend tests (pytest)

Nouveaux:
- `tests/test_admin_secrets_api.py`
  - schema list,
  - upsert/list/delete,
  - masquage,
  - erreurs (`APP_ENCRYPTION_KEY` absente).
- `tests/test_admin_compagnie_docs_api.py`
  - lecture index,
  - filtres/pagination,
  - index absent/corrompu.
- `tests/test_secrets_migration_from_integrations.py`
  - migration plaintext,
  - idempotence,
  - non-regression de `/integrations`.

Mises a jour:
- `tests/test_admin_integrations_api.py`
  - assert qu'aucun secret en clair n'est retourne ni persiste en config.
- `tests/test_admin_help_api.py`
  - assert champs legacy + nouveaux champs optionnels.
- tests services (`research_service`, `ollama_service`, `assistant_service`) pour verifier resolution DB>env.

## 9.2 Frontend tests (vitest)

- test modal secrets (chargement schema, save, delete, gestion erreur).
- test `/help` search + fallback legacy.
- test `/library` dynamique (render liste + filtres + pagination + etat vide).
- test proxy fallback local pour nouveaux endpoints.

## 9.3 Validation globale

- `pytest`
- `npm run lint` (admin-dashboard)
- `npm run test` (admin-dashboard)

## 10. Rollout et sequencing PR

1. **PR A - Backend Secrets Core**
   - `secrets_manager`, endpoints `/secrets/*`, migration lazy, integration sanitization.
2. **PR B - Docs API + Help payload v2**
   - endpoint `/docs/compagnie`, extension `/help`, docs API update.
3. **PR C - Frontend UX**
   - modale secrets settings, help refonte, library dynamique, proxy/mocks.
4. **PR D - Documentation automation**
   - script catalogue + docs markdown updates.

Post-deploiement:
- verifier audit logs `secret_upserted/secret_deleted/integrations_updated`,
- verifier absence de secrets dans `admin_integration_configs.config_json`,
- verifier pages `/settings`, `/help`, `/library` en mode upstream + dev-fallback.

## 11. Risques et mitigations

1. **`APP_ENCRYPTION_KEY` manquante en prod**
   - mitigation: endpoint `PUT /secrets` retourne erreur explicite, health warning dans logs.
2. **Regression integrations existantes**
   - mitigation: compat shape conservee + migration idempotente + tests non-regression.
3. **Services hors admin sans session DB**
   - mitigation: resolver central avec fallback env si DB indisponible.
4. **Index CompagnieDocs corrompu**
   - mitigation: gestion erreur 500 explicite + fallback UI.

## 12. Assumptions explicites et defaults choisis

1. `APP_ENCRYPTION_KEY` est fournie au runtime sous forme Fernet valide.
2. `APP_ENCRYPTION_KEY` n'est **jamais** stockee dans le vault chiffre (bootstrap secret).
3. `JWT_SECRET` reste prioritairement variable d'environnement; la gestion DB est V2 (read-only info dans schema).
4. Les secrets existants en env OS restent fallback tant qu'ils ne sont pas saisis en DB.
5. La bibliotheque affiche uniquement metadonnees d'index (pas de rendu PDF/FIG inline en V1).

