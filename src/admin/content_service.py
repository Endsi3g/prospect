from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ..core.db_models import DBContentGeneration, DBLead


ALLOWED_CHANNELS = {"email", "call", "dm"}


def _render_email(lead: DBLead | None, step: int, context: dict[str, Any]) -> tuple[str, str]:
    first_name = (lead.first_name if lead and lead.first_name else "Bonjour").strip()
    company = ""
    if lead and isinstance(lead.details, dict):
        company = str(lead.details.get("company_name") or "").strip()
    if not company:
        company = str(context.get("company_name") or "votre entreprise").strip()
    pain = str(context.get("pain_point") or "l'optimisation de votre prospection").strip()

    if step <= 1:
        subject = f"{first_name}, 15 min pour accelerer {company}"
        body = (
            f"Bonjour {first_name},\n\n"
            f"J'ai identifie une opportunite concrete autour de {pain}.\n"
            "Je peux vous partager un plan actionnable en 15 minutes.\n"
            "Ouvert a un echange cette semaine ?"
        )
    else:
        subject = f"Relance rapide sur {pain}"
        body = (
            f"Bonjour {first_name},\n\n"
            "Je me permets une relance rapide.\n"
            "Je peux vous envoyer un mini plan personnalise et 2 actions prioritaires.\n"
            "Souhaitez-vous que je vous le partage ?"
        )
    return subject, body


def _render_call_script(lead: DBLead | None, context: dict[str, Any]) -> str:
    first_name = (lead.first_name if lead and lead.first_name else "bonjour").strip()
    company = ""
    if lead and isinstance(lead.details, dict):
        company = str(lead.details.get("company_name") or "").strip()
    if not company:
        company = str(context.get("company_name") or "votre structure").strip()
    goal = str(context.get("goal") or "reduire le temps de suivi commercial").strip()
    return (
        f"Intro: Bonjour {first_name}, ici [Votre Nom].\n"
        f"Contexte: J'aide des equipes comme {company} a {goal}.\n"
        "Question de qualification: Comment gerez-vous ce sujet aujourd'hui ?\n"
        "Proposition: Je peux vous montrer un plan en 15 minutes.\n"
        "CTA: Avez-vous un creneau mardi ou mercredi ?"
    )


def _render_dm(lead: DBLead | None, context: dict[str, Any]) -> str:
    first_name = (lead.first_name if lead and lead.first_name else "").strip()
    hook = str(context.get("hook") or "votre activite").strip()
    if first_name:
        return (
            f"Bonjour {first_name}, j'ai remarque {hook}. "
            "On a un playbook concret pour augmenter les RDV qualifies rapidement. "
            "Ouvert a un echange de 10 minutes ?"
        )
    return (
        f"Bonjour, j'ai remarque {hook}. "
        "On a un playbook concret pour augmenter les RDV qualifies rapidement. "
        "Ouvert a un echange de 10 minutes ?"
    )


def _extract_variables(lead: DBLead | None, context: dict[str, Any]) -> list[str]:
    keys: list[str] = []
    if lead:
        keys.extend(["first_name", "last_name", "email"])
    keys.extend(sorted(context.keys()))
    unique: list[str] = []
    for item in keys:
        if item not in unique:
            unique.append(item)
    return unique


def serialize_content_generation(row: DBContentGeneration) -> dict[str, Any]:
    output = row.output_json or {}
    return {
        "id": row.id,
        "lead_id": row.lead_id,
        "channel": row.channel,
        "step": row.step,
        "template_key": row.template_key,
        "provider": row.provider,
        "subject": output.get("subject"),
        "body": output.get("body"),
        "call_script": output.get("call_script"),
        "variables_used": row.variables_used_json or [],
        "confidence": row.confidence,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def generate_content(
    db: Session,
    *,
    lead_id: str | None,
    channel: str,
    step: int = 1,
    template_key: str | None = None,
    context: dict[str, Any] | None = None,
    provider: str = "deterministic",
) -> DBContentGeneration:
    normalized_channel = (channel or "").strip().lower()
    if normalized_channel not in ALLOWED_CHANNELS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported channel '{channel}'.",
        )

    lead: DBLead | None = None
    if lead_id:
        lead = db.query(DBLead).filter(DBLead.id == lead_id).first()
        if not lead:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")

    payload = context or {}
    output: dict[str, Any]
    if normalized_channel == "email":
        subject, body = _render_email(lead, max(1, step), payload)
        output = {"subject": subject, "body": body}
    elif normalized_channel == "call":
        output = {"call_script": _render_call_script(lead, payload)}
    else:
        output = {"body": _render_dm(lead, payload)}

    confidence = 0.62
    if lead:
        confidence += 0.18
    if payload:
        confidence += 0.12
    confidence = min(confidence, 0.95)

    row = DBContentGeneration(
        id=str(uuid.uuid4()),
        lead_id=lead.id if lead else None,
        channel=normalized_channel,
        step=max(1, int(step)),
        template_key=(template_key or "").strip() or None,
        provider=(provider or "deterministic").strip() or "deterministic",
        prompt_context_json=payload,
        output_json=output,
        variables_used_json=_extract_variables(lead, payload),
        confidence=round(confidence, 2),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
