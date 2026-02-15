from __future__ import annotations

import importlib.util
import json
from pathlib import Path

def _load_ingest_module():
    module_path = Path(__file__).resolve().parents[1] / "scripts" / "utilities" / "ingest_compagnie_docs.py"
    spec = importlib.util.spec_from_file_location("ingest_compagnie_docs", module_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _write_minimal_pdf_bytes(path: Path) -> None:
    path.write_bytes(b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF")


def _read_index_json(target_dir: Path) -> dict:
    index_path = target_dir / "index" / "corpus_index.json"
    return json.loads(index_path.read_text(encoding="utf-8"))


def test_ingest_creates_outputs_for_pdf_and_fig(tmp_path):
    ingest_module = _load_ingest_module()
    source_dir = tmp_path / "CompagnieDocs"
    target_dir = tmp_path / "assets" / "reference" / "compagnie_docs"
    source_dir.mkdir(parents=True, exist_ok=True)

    _write_minimal_pdf_bytes(source_dir / "Doc A.pdf")
    (source_dir / "Pitch.fig").write_bytes(b"fig-content-1")

    def _fake_pdf_extraction(_: Path) -> dict:
        return {
            "ok": True,
            "error": None,
            "page_count": 1,
            "pages": [{"page": 1, "text": "sample extracted text", "char_count": 21}],
            "full_text": "sample extracted text",
            "extraction_warnings": [],
        }

    ingest_module._extract_pdf_content = _fake_pdf_extraction

    result = ingest_module.ingest_compagnie_docs(
        source_dir=source_dir,
        target_dir=target_dir,
        mode="full",
        enable_figma_export=False,
    )

    assert result["stats"]["total_files"] == 2
    assert result["stats"]["processed_pdf"] == 1
    assert result["stats"]["processed_fig"] == 1
    assert result["stats"]["pending_fig_conversion"] == 1
    assert result["stats"]["failed"] == 0

    index_payload = _read_index_json(target_dir)
    pdf_docs = [doc for doc in index_payload["documents"] if doc["ext"] == ".pdf"]
    fig_docs = [doc for doc in index_payload["documents"] if doc["ext"] == ".fig"]
    assert len(pdf_docs) == 1
    assert len(fig_docs) == 1

    pdf_doc = pdf_docs[0]
    assert pdf_doc["status"] == "processed"
    pdf_json_path = Path(pdf_doc["processing"]["pdf"]["json_path"])
    pdf_md_path = Path(pdf_doc["processing"]["pdf"]["markdown_path"])
    assert pdf_json_path.exists()
    assert pdf_md_path.exists()
    pdf_payload = json.loads(pdf_json_path.read_text(encoding="utf-8"))
    assert pdf_payload["page_count"] == 1
    assert pdf_payload["full_text"] == "sample extracted text"

    fig_doc = fig_docs[0]
    assert fig_doc["status"] == "pending_conversion"
    fig_manifest_path = Path(fig_doc["processing"]["fig"]["manifest_path"])
    assert fig_manifest_path.exists()
    fig_manifest = json.loads(fig_manifest_path.read_text(encoding="utf-8"))
    assert fig_manifest["conversion_status"] == "pending_conversion"


def test_ingest_is_idempotent_and_deduplicates_by_hash(tmp_path):
    ingest_module = _load_ingest_module()
    source_dir = tmp_path / "CompagnieDocs"
    target_dir = tmp_path / "assets" / "reference" / "compagnie_docs"
    source_dir.mkdir(parents=True, exist_ok=True)

    _write_minimal_pdf_bytes(source_dir / "Manual.pdf")
    duplicate_payload = b"same-fig-binary"
    (source_dir / "Design A.fig").write_bytes(duplicate_payload)
    (source_dir / "Design B.fig").write_bytes(duplicate_payload)

    def _fake_pdf_extraction(_: Path) -> dict:
        return {
            "ok": True,
            "error": None,
            "page_count": 1,
            "pages": [{"page": 1, "text": "", "char_count": 0}],
            "full_text": "",
            "extraction_warnings": ["page_1_empty"],
        }

    ingest_module._extract_pdf_content = _fake_pdf_extraction

    first = ingest_module.ingest_compagnie_docs(
        source_dir=source_dir,
        target_dir=target_dir,
        mode="full",
        enable_figma_export=False,
    )
    second = ingest_module.ingest_compagnie_docs(
        source_dir=source_dir,
        target_dir=target_dir,
        mode="full",
        enable_figma_export=False,
    )

    assert first["stats"]["duplicates"] == 1
    assert second["stats"]["duplicates"] == 1

    first_docs = {(doc["source_path"], doc["ext"]): doc["doc_id"] for doc in first["documents"]}
    second_docs = {(doc["source_path"], doc["ext"]): doc["doc_id"] for doc in second["documents"]}
    assert first_docs == second_docs

    raw_fig_files = list((target_dir / "raw").glob("*.fig"))
    assert len(raw_fig_files) == 1


def test_ingest_creates_index_backups_on_second_run(tmp_path):
    ingest_module = _load_ingest_module()
    source_dir = tmp_path / "CompagnieDocs"
    target_dir = tmp_path / "assets" / "reference" / "compagnie_docs"
    source_dir.mkdir(parents=True, exist_ok=True)
    (source_dir / "Brand.fig").write_bytes(b"fig-content")

    ingest_module.ingest_compagnie_docs(
        source_dir=source_dir,
        target_dir=target_dir,
        mode="full",
        enable_figma_export=False,
    )
    ingest_module.ingest_compagnie_docs(
        source_dir=source_dir,
        target_dir=target_dir,
        mode="full",
        enable_figma_export=False,
    )

    index_dir = target_dir / "index"
    assert list(index_dir.glob("corpus_index.json.bak-*"))
    assert list(index_dir.glob("corpus_index.md.bak-*"))
