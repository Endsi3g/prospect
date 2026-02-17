#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path
from datetime import datetime

logger = logging.getLogger(__name__)

def generate_markdown_catalog(index_data: dict, output_path: Path):
    """Generate a clean Markdown catalog from the corpus index."""
    lines = []
    lines.append("# Catalogue de la Bibliothèque Commerciale (CompagnieDocs)")
    lines.append("")
    lines.append(f"Généré le: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"Statut global: {index_data['stats']['processed_pdf']} PDFs traités, {index_data['stats']['ingested']} fichiers Figma indexés.")
    lines.append("")
    lines.append("## 📄 Documents PDF (Prêts pour analyse)")
    lines.append("")
    lines.append("| Document | Pages | Statut | ID unique |")
    lines.append("| :--- | :--- | :--- | :--- |")
    
    pdfs = [d for d in index_data["documents"] if d["ext"] == ".pdf"]
    for doc in sorted(pdfs, key=lambda x: x["original_name"]):
        status_emoji = "✅" if doc["status"] == "processed" else "⚠️"
        page_count = doc.get("processing", {}).get("pdf", {}).get("page_count", "?")
        lines.append(f"| {doc['original_name']} | {page_count} | {status_emoji} {doc['status']} | `{doc['doc_id']}` |")
    
    lines.append("")
    lines.append("## 🎨 Fichiers Figma (Structure & Design)")
    lines.append("")
    lines.append("| Projet | Extension | Statut | ID unique |")
    lines.append("| :--- | :--- | :--- | :--- |")
    
    figs = [d for d in index_data["documents"] if d["ext"] == ".fig"]
    for doc in sorted(figs, key=lambda x: x["original_name"]):
        lines.append(f"| {doc['original_name']} | `.fig` | {doc['status']} | `{doc['doc_id']}` |")
    
    lines.append("")
    lines.append("## 🛠 Opérations")
    lines.append("- Index source: `assets/reference/compagnie_docs/index/corpus_index.json`")
    lines.append("- Pour mettre à jour: `python scripts/utilities/ingest_compagnie_docs.py` puis relancer ce script.")
    
    output_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Catalogue généré avec succès: {output_path}")

def main():
    parser = argparse.ArgumentParser(description="Génère un catalogue Markdown depuis l'index CompagnieDocs.")
    parser.add_argument("--index", default="assets/reference/compagnie_docs/index/corpus_index.json", help="Chemin vers corpus_index.json")
    parser.add_argument("--output", default="docs/reference/COMPAGNIEDOCS_CATALOG.md", help="Chemin de sortie du catalogue Markdown")
    
    args = parser.parse_args()
    index_path = Path(args.index)
    output_path = Path(args.output)
    
    if not index_path.exists():
        print(f"Erreur: Index non trouvé à {index_path}")
        return 1
        
    try:
        with open(index_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        output_path.parent.mkdir(parents=True, exist_ok=True)
        generate_markdown_catalog(data, output_path)
    except Exception as e:
        print(f"Erreur lors de la génération: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
