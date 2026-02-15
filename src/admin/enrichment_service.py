from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ..core.db_models import DBEnrichmentJob, DBLead


def _score_relevance(query: str, lead: DBLead | None) -> float:
    score = 35.0
    terms = {part.strip().lower() for part in query.split() if part.strip()}
    if not terms:
        return score

    if lead:
        haystack_parts = [
            str(lead.first_name or "").lower(),
            str(lead.last_name or "").lower(),
            str(lead.email or "").lower(),
            str(lead.segment or "").lower(),
            str(lead.tier or "").lower(),
            str(lead.heat_status or "").lower(),
        ]
        if isinstance(lead.details, dict):
            haystack_parts.extend(
                [
                    str(lead.details.get("company_name") or "").lower(),
                    str(lead.details.get("industry") or "").lower(),
                    str(lead.details.get("location") or "").lower(),
                ]
            )
        haystack = " ".join(haystack_parts)
        overlap = sum(1 for term in terms if term in haystack)
        score += min(45.0, overlap * 12.0)

    score += min(20.0, len(terms) * 2.0)
    return round(min(score, 100.0), 2)


def serialize_enrichment_job(row: DBEnrichmentJob) -> dict[str, Any]:
    return {
        "id": row.id,
        "lead_id": row.lead_id,
        "query": row.query,
        "provider": row.provider,
        "status": row.status,
        "relevance_score": row.relevance_score,
        "result": row.result_json or {},
        "error_message": row.error_message,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "finished_at": row.finished_at.isoformat() if row.finished_at else None,
    }


def run_enrichment(
    db: Session,
    *,
    query: str,
    provider: str = "mock",
    lead_id: str | None = None,
    context: dict[str, Any] | None = None,
) -> DBEnrichmentJob:
    clean_query = (query or "").strip()
    if not clean_query:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Query is required.",
        )

    lead: DBLead | None = None
    if lead_id:
        lead = db.query(DBLead).filter(DBLead.id == lead_id).first()
        if not lead:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")

    row = DBEnrichmentJob(
        id=str(uuid.uuid4()),
        lead_id=lead.id if lead else None,
        query=clean_query,
        provider=(provider or "mock").strip() or "mock",
        status="running",
        result_json={},
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    metadata = context or {}
    relevance = _score_relevance(clean_query, lead)
    summary = {
        "company": None,
        "owner": None,
        "signals": [],
        "recommendations": [],
    }
    if lead:
        details = lead.details if isinstance(lead.details, dict) else {}
        summary["company"] = {
            "name": details.get("company_name"),
            "industry": details.get("industry"),
            "location": details.get("location"),
        }
        summary["owner"] = {
            "first_name": lead.first_name,
            "last_name": lead.last_name,
            "email": lead.email,
            "title": lead.title,
        }
        summary["signals"] = [
            {"type": "tier", "value": lead.tier},
            {"type": "heat_status", "value": lead.heat_status},
            {"type": "score", "value": lead.total_score},
        ]

    summary["recommendations"] = [
        "Prioriser un message court avec proposition de valeur concrete.",
        "Adapter le canal selon le score de chaleur et la disponibilite du contact.",
        "Declencher une sequence en 3 etapes avec suivi J+2 puis J+5.",
    ]

    result_payload = {
        "query": clean_query,
        "provider": row.provider,
        "summary": summary,
        "context_used": metadata,
    }

    row.status = "completed"
    row.relevance_score = relevance
    row.result_json = result_payload
    row.finished_at = datetime.now()
    db.commit()
    db.refresh(row)
    return row


def get_enrichment_or_404(db: Session, job_id: str) -> DBEnrichmentJob:
    row = db.query(DBEnrichmentJob).filter(DBEnrichmentJob.id == job_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enrichment job not found.")
    return row
