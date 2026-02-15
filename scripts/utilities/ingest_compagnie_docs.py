from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests


SUPPORTED_EXTENSIONS = {".pdf", ".fig"}
INDEX_DIR_NAME = "index"
RAW_DIR_NAME = "raw"
PROCESSED_DIR_NAME = "processed"
PDF_MARKDOWN_DIR = "pdf_markdown"
PDF_JSON_DIR = "pdf_json"
FIG_EXPORTS_DIR = "fig_exports"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_value).strip("-").lower()
    return slug or "document"


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _backup_if_exists(path: Path) -> Path | None:
    if not path.exists():
        return None
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    backup_path = path.with_name(f"{path.name}.bak-{timestamp}")
    shutil.copy2(path, backup_path)
    return backup_path


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def _write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _resolve_pdf_reader_class():
    try:
        from pypdf import PdfReader as Reader

        return Reader
    except Exception:
        return None


def _extract_pdf_content(pdf_path: Path) -> dict[str, Any]:
    reader_class = _resolve_pdf_reader_class()
    if reader_class is None:
        return {
            "ok": False,
            "error": "missing_dependency:pypdf",
            "page_count": 0,
            "pages": [],
            "full_text": "",
            "extraction_warnings": ["missing_dependency:pypdf"],
        }

    try:
        reader = reader_class(str(pdf_path))
    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
            "page_count": 0,
            "pages": [],
            "full_text": "",
            "extraction_warnings": [f"reader_error:{exc}"],
        }

    pages: list[dict[str, Any]] = []
    warnings: list[str] = []
    full_text_parts: list[str] = []
    for idx, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception as exc:
            text = ""
            warnings.append(f"page_{idx}_extract_error:{exc}")
        if not text.strip():
            warnings.append(f"page_{idx}_empty")
        pages.append({"page": idx, "text": text, "char_count": len(text)})
        full_text_parts.append(text)

    full_text = "\n".join(full_text_parts).strip()
    return {
        "ok": True,
        "error": None,
        "page_count": len(reader.pages),
        "pages": pages,
        "full_text": full_text,
        "extraction_warnings": warnings,
    }


def _render_pdf_markdown(
    *,
    doc_id: str,
    original_name: str,
    source_path: str,
    sha256: str,
    extraction: dict[str, Any],
) -> str:
    lines: list[str] = []
    lines.append(f"# {original_name}")
    lines.append("")
    lines.append(f"- `doc_id`: `{doc_id}`")
    lines.append(f"- `source_path`: `{source_path}`")
    lines.append(f"- `sha256`: `{sha256}`")
    lines.append(f"- `page_count`: `{extraction['page_count']}`")
    lines.append(f"- `generated_at`: `{_utc_now_iso()}`")
    if extraction["extraction_warnings"]:
        lines.append("- `warnings`:")
        for warning in extraction["extraction_warnings"]:
            lines.append(f"  - `{warning}`")
    lines.append("")
    for page in extraction["pages"]:
        lines.append(f"## Page {page['page']}")
        lines.append("")
        text = page["text"].strip()
        lines.append(text if text else "_[empty page]_")
        lines.append("")
    return "\n".join(lines).strip() + "\n"


def _resolve_figma_key_map() -> dict[str, str]:
    key_map_path = os.getenv("FIGMA_FILE_KEY_MAP_PATH", "").strip()
    if not key_map_path:
        return {}
    path = Path(key_map_path).expanduser().resolve()
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    if not isinstance(data, dict):
        return {}
    cleaned: dict[str, str] = {}
    for key, value in data.items():
        if isinstance(key, str) and isinstance(value, str) and key.strip() and value.strip():
            cleaned[key.strip()] = value.strip()
    return cleaned


def _figma_file_key_for_document(
    *,
    original_name: str,
    normalized_name: str,
    figma_key_map: dict[str, str],
) -> str | None:
    if original_name in figma_key_map:
        return figma_key_map[original_name]
    if normalized_name in figma_key_map:
        return figma_key_map[normalized_name]
    file_key = os.getenv("FIGMA_FILE_KEY", "").strip()
    return file_key or None


def _attempt_figma_export(
    *,
    doc_id: str,
    original_name: str,
    normalized_name: str,
    output_dir: Path,
    figma_key_map: dict[str, str],
    enable_export: bool,
) -> dict[str, Any]:
    manifest: dict[str, Any] = {
        "doc_id": doc_id,
        "original_name": original_name,
        "normalized_name": normalized_name,
        "conversion_status": "pending_conversion",
        "attempted_at": _utc_now_iso(),
        "conversion_outputs": [],
        "error": None,
    }

    if not enable_export:
        manifest["error"] = "figma_export_disabled"
        return manifest

    api_token = os.getenv("FIGMA_ACCESS_TOKEN", "").strip()
    file_key = _figma_file_key_for_document(
        original_name=original_name,
        normalized_name=normalized_name,
        figma_key_map=figma_key_map,
    )
    if not api_token or not file_key:
        manifest["error"] = "missing_figma_credentials_or_file_key"
        return manifest

    headers = {"X-Figma-Token": api_token}
    file_url = f"https://api.figma.com/v1/files/{file_key}"
    try:
        file_response = requests.get(file_url, headers=headers, timeout=30)
        file_response.raise_for_status()
        payload = file_response.json()
    except Exception as exc:
        manifest["conversion_status"] = "failed"
        manifest["error"] = f"figma_file_export_error:{exc}"
        manifest["figma_file_key"] = file_key
        return manifest

    output_dir.mkdir(parents=True, exist_ok=True)
    file_json_path = output_dir / f"{doc_id}-file.json"
    _write_json(file_json_path, payload)
    manifest["conversion_outputs"].append(str(file_json_path))
    manifest["figma_file_key"] = file_key

    node_ids = os.getenv("FIGMA_NODE_IDS", "").strip()
    if node_ids:
        image_url = f"https://api.figma.com/v1/images/{file_key}"
        try:
            image_response = requests.get(
                image_url,
                headers=headers,
                params={"ids": node_ids, "format": "png"},
                timeout=30,
            )
            image_response.raise_for_status()
            image_payload = image_response.json()
            image_json_path = output_dir / f"{doc_id}-images.json"
            _write_json(image_json_path, image_payload)
            manifest["conversion_outputs"].append(str(image_json_path))
        except Exception as exc:
            manifest["conversion_status"] = "failed"
            manifest["error"] = f"figma_image_export_error:{exc}"
            return manifest

    manifest["conversion_status"] = "converted"
    return manifest


def _render_index_markdown(index_payload: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append("# CompagnieDocs Corpus Index")
    lines.append("")
    lines.append(f"- `generated_at`: `{index_payload['generated_at']}`")
    lines.append(f"- `source_dir`: `{index_payload['source_dir']}`")
    lines.append(f"- `target_dir`: `{index_payload['target_dir']}`")
    lines.append("")
    lines.append("## Stats")
    for key, value in index_payload["stats"].items():
        lines.append(f"- `{key}`: `{value}`")
    lines.append("")
    lines.append("## Documents")
    lines.append("")
    lines.append("| doc_id | ext | status | original_name | raw_path |")
    lines.append("| --- | --- | --- | --- | --- |")
    for document in index_payload["documents"]:
        lines.append(
            "| {doc_id} | {ext} | {status} | {original_name} | {raw_path} |".format(
                doc_id=document["doc_id"],
                ext=document["ext"],
                status=document["status"],
                original_name=document["original_name"].replace("|", "/"),
                raw_path=document.get("raw_path", "").replace("|", "/"),
            )
        )
    lines.append("")
    return "\n".join(lines)


def ingest_compagnie_docs(
    source_dir: str | Path,
    target_dir: str | Path,
    *,
    mode: str = "full",
    enable_figma_export: bool = True,
) -> dict[str, Any]:
    source = Path(source_dir).expanduser().resolve()
    target = Path(target_dir).expanduser().resolve()
    if not source.exists():
        raise FileNotFoundError(f"Source directory not found: {source}")
    if not source.is_dir():
        raise NotADirectoryError(f"Source path is not a directory: {source}")

    raw_dir = target / RAW_DIR_NAME
    processed_dir = target / PROCESSED_DIR_NAME
    pdf_markdown_dir = processed_dir / PDF_MARKDOWN_DIR
    pdf_json_dir = processed_dir / PDF_JSON_DIR
    fig_exports_dir = processed_dir / FIG_EXPORTS_DIR
    index_dir = target / INDEX_DIR_NAME
    for path in (raw_dir, pdf_markdown_dir, pdf_json_dir, fig_exports_dir, index_dir):
        path.mkdir(parents=True, exist_ok=True)

    index_json_path = index_dir / "corpus_index.json"
    index_md_path = index_dir / "corpus_index.md"

    source_files = sorted([path for path in source.rglob("*") if path.is_file()], key=lambda p: str(p).lower())
    figma_key_map = _resolve_figma_key_map()
    dedupe_hash_to_doc: dict[str, dict[str, Any]] = {}
    documents: list[dict[str, Any]] = []
    stats = {
        "total_files": 0,
        "processed_pdf": 0,
        "processed_fig": 0,
        "pending_fig_conversion": 0,
        "fig_converted": 0,
        "duplicates": 0,
        "failed": 0,
        "unsupported": 0,
    }

    for file_path in source_files:
        ext = file_path.suffix.lower()
        stats["total_files"] += 1
        normalized_name = _slugify(file_path.stem)
        sha256 = _sha256_file(file_path)
        source_path = str(file_path)

        if sha256 in dedupe_hash_to_doc:
            canonical = dedupe_hash_to_doc[sha256]
            document = {
                "doc_id": canonical["doc_id"],
                "original_name": file_path.name,
                "normalized_name": normalized_name,
                "ext": ext,
                "size_bytes": file_path.stat().st_size,
                "sha256": sha256,
                "source_path": source_path,
                "raw_path": canonical["raw_path"],
                "status": "duplicate",
                "processing": {
                    "deduplicated_to": canonical["source_path"],
                    "processed_at": _utc_now_iso(),
                },
            }
            documents.append(document)
            stats["duplicates"] += 1
            continue

        doc_id = f"{normalized_name}-{sha256[:12]}"
        raw_path = raw_dir / f"{doc_id}{ext}"
        if not raw_path.exists():
            shutil.copy2(file_path, raw_path)

        document = {
            "doc_id": doc_id,
            "original_name": file_path.name,
            "normalized_name": normalized_name,
            "ext": ext,
            "size_bytes": file_path.stat().st_size,
            "sha256": sha256,
            "source_path": source_path,
            "raw_path": str(raw_path),
            "status": "ingested",
            "processing": {"processed_at": _utc_now_iso()},
        }
        dedupe_hash_to_doc[sha256] = document

        if ext == ".pdf" and mode == "full":
            extraction = _extract_pdf_content(raw_path)
            payload = {
                "doc_id": doc_id,
                "title_guess": file_path.stem,
                "original_name": file_path.name,
                "page_count": extraction["page_count"],
                "pages": extraction["pages"],
                "full_text": extraction["full_text"],
                "extraction_warnings": extraction["extraction_warnings"],
                "source_path": source_path,
                "raw_path": str(raw_path),
                "sha256": sha256,
                "generated_at": _utc_now_iso(),
            }
            _write_json(pdf_json_dir / f"{doc_id}.json", payload)
            markdown = _render_pdf_markdown(
                doc_id=doc_id,
                original_name=file_path.name,
                source_path=source_path,
                sha256=sha256,
                extraction=extraction,
            )
            _write_text(pdf_markdown_dir / f"{doc_id}.md", markdown)
            if extraction["ok"]:
                document["status"] = "processed"
                stats["processed_pdf"] += 1
            else:
                document["status"] = "failed"
                stats["failed"] += 1
            document["processing"]["pdf"] = {
                "page_count": extraction["page_count"],
                "markdown_path": str(pdf_markdown_dir / f"{doc_id}.md"),
                "json_path": str(pdf_json_dir / f"{doc_id}.json"),
                "warnings": extraction["extraction_warnings"],
                "error": extraction["error"],
            }
        elif ext == ".fig":
            manifest = _attempt_figma_export(
                doc_id=doc_id,
                original_name=file_path.name,
                normalized_name=normalized_name,
                output_dir=fig_exports_dir,
                figma_key_map=figma_key_map,
                enable_export=enable_figma_export and mode == "full",
            )
            manifest["raw_path"] = str(raw_path)
            manifest["sha256"] = sha256
            manifest_path = fig_exports_dir / f"{doc_id}.json"
            _write_json(manifest_path, manifest)
            document["processing"]["fig"] = {
                "manifest_path": str(manifest_path),
                "conversion_status": manifest["conversion_status"],
                "conversion_outputs": manifest["conversion_outputs"],
                "error": manifest["error"],
            }
            if manifest["conversion_status"] == "converted":
                document["status"] = "processed"
                stats["fig_converted"] += 1
            elif manifest["conversion_status"] == "failed":
                document["status"] = "failed"
                stats["failed"] += 1
            else:
                document["status"] = "pending_conversion"
                stats["pending_fig_conversion"] += 1
            stats["processed_fig"] += 1
        elif ext in SUPPORTED_EXTENSIONS and mode != "full":
            document["status"] = "ingested"
        else:
            document["status"] = "unsupported"
            document["processing"]["note"] = "File copied to raw without transformation."
            stats["unsupported"] += 1

        documents.append(document)

    index_payload = {
        "generated_at": _utc_now_iso(),
        "source_dir": str(source),
        "target_dir": str(target),
        "stats": stats,
        "documents": documents,
    }

    _backup_if_exists(index_json_path)
    _backup_if_exists(index_md_path)
    _write_json(index_json_path, index_payload)
    _write_text(index_md_path, _render_index_markdown(index_payload))
    return index_payload


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Ingest CompagnieDocs assets into a structured corpus.")
    parser.add_argument(
        "--source",
        default=str(Path("CompagnieDocs")),
        help="Source directory containing CompagnieDocs files.",
    )
    parser.add_argument(
        "--target",
        default=str(Path("assets/reference/compagnie_docs")),
        help="Target directory for ingested corpus output.",
    )
    parser.add_argument(
        "--mode",
        choices=("full", "copy-only"),
        default="full",
        help="`full` runs extraction/conversion steps; `copy-only` only copies and indexes.",
    )
    parser.add_argument(
        "--disable-figma-export",
        action="store_true",
        help="Disable remote Figma API export attempts for .fig files.",
    )
    return parser


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()
    result = ingest_compagnie_docs(
        source_dir=args.source,
        target_dir=args.target,
        mode="full" if args.mode == "full" else "copy-only",
        enable_figma_export=not args.disable_figma_export,
    )
    print("CompagnieDocs ingestion complete.")
    print(json.dumps(result["stats"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
