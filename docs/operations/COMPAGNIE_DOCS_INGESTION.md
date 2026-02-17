# CompagnieDocs Ingestion Runbook

This runbook describes how to ingest files from `CompagnieDocs` into a structured internal corpus under `assets/reference/compagnie_docs`.

## 0. Prerequisites

Install project dependencies before running ingestion:

```powershell
pip install -r requirements.txt
```

If `pypdf` is not installed, PDF documents are still indexed and copied, but extraction is marked as failed with `missing_dependency:pypdf`.

## 1. Scope

The ingestion pipeline handles:

- source copy into `raw/`,
- PDF text extraction into markdown and JSON,
- `.fig` manifest generation with optional Figma API export,
- consolidated corpus index generation.

Output root:

- `assets/reference/compagnie_docs/`

## 2. Command

Default command:

```powershell
python scripts/utilities/ingest_compagnie_docs.py `
  --source "C:\prospect\prospect\CompagnieDocs" `
  --target "assets/reference/compagnie_docs" `
  --mode full
```

Copy/index only (no PDF extraction, no Figma export):

```powershell
python scripts/utilities/ingest_compagnie_docs.py --mode copy-only
```

Disable remote Figma export explicitly:

```powershell
python scripts/utilities/ingest_compagnie_docs.py --disable-figma-export
```

## 3. Output layout

The script creates:

- `assets/reference/compagnie_docs/raw/`
- `assets/reference/compagnie_docs/processed/pdf_markdown/`
- `assets/reference/compagnie_docs/processed/pdf_json/`
- `assets/reference/compagnie_docs/processed/fig_exports/`
- `assets/reference/compagnie_docs/index/corpus_index.json`
- `assets/reference/compagnie_docs/index/corpus_index.md`

## 4. Optional Figma API configuration

`.fig` files are always indexed. Remote conversion/export is optional and requires environment variables.

Supported variables:

- `FIGMA_ACCESS_TOKEN`: personal access token. Treat this as a secret credential:
  - never commit it to git or plaintext docs,
  - store it in environment variables or a secrets manager (Vault / cloud secret stores),
  - keep `.env` files out of version control,
  - use least-privilege scopes and rotate regularly,
  - inject via secure CI/CD variables (never hardcode in pipelines).
- `FIGMA_FILE_KEY`: default Figma file key for `.fig` exports.
- `FIGMA_FILE_KEY_MAP_PATH`: path to JSON map for per-document keys.
- `FIGMA_NODE_IDS`: optional comma-separated node IDs for image export.

Example `FIGMA_FILE_KEY_MAP_PATH` JSON:

```json
{
  "Pitch,+Easy!.fig": "abc123-file-key",
  "pitch-easy": "abc123-file-key"
}
```

If credentials or keys are missing, `.fig` manifests remain in `pending_conversion`.

## 5. Idempotence and backups

The pipeline is idempotent:

- document IDs are deterministic (`slug + sha256_prefix`),
- duplicate source files are detected by SHA-256,
- reruns do not duplicate raw artifacts.

Before writing fresh indexes, existing index files are backed up:

- `corpus_index.json.bak-<timestamp>`
- `corpus_index.md.bak-<timestamp>`

## 6. Validation checklist

After a run, verify:

1. `index/corpus_index.json` exists and lists all source files.
2. each PDF has `processed/pdf_markdown/<doc_id>.md` and `processed/pdf_json/<doc_id>.json`.
3. if Figma export is enabled (credentials present and not explicitly disabled), each `.fig` has `processed/fig_exports/<doc_id>.json`; otherwise this artifact is optional.
4. `stats.failed` in the index is `0` or accompanied by explicit error details.
