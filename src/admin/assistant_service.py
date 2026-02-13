"""Orchestrator service for the Assistant Prospect subsystem.

Calls Khoj (or returns a mock plan), then executes safe actions
and pauses on dangerous ones pending user confirmation.
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime
from typing import Any

import requests
from sqlalchemy.orm import Session

from ..core.db_models import DBLead, DBNotification, DBTask
from ..core.logging import get_logger
from ..scoring.engine import ScoringEngine
from ..core.models import Lead, LeadStatus

from . import assistant_store as store
from .assistant_types import AssistantActionSpec, AssistantPlan

logger = get_logger(__name__)

# Actions that may run without human confirmation
SAFE_ACTION_TYPES = frozenset({
    "source_leads",
    "create_lead",
    "update_lead",
    "create_task",
    "update_task",
    "create_project",
    "nurture",
    "rescore",
})

# Actions that always require manual confirmation
DANGEROUS_ACTION_TYPES = frozenset({
    "delete_lead",
    "delete_task",
    "delete_project",
    "bulk_delete",
})


# ── Khoj communication ─────────────────────────────────────────

def _khoj_base_url() -> str | None:
    return os.getenv("KHOJ_API_BASE_URL") or None


def _khoj_token() -> str:
    return os.getenv("KHOJ_API_BEARER_TOKEN", "")


def call_khoj(prompt: str, config: dict[str, Any] | None = None) -> AssistantPlan:
    """Send a natural-language prompt to Khoj and parse the structured plan.

    Falls back to a deterministic mock plan when Khoj is not configured.
    """
    base_url = _khoj_base_url()
    if not base_url:
        logger.info("Khoj not configured – returning mock plan")
        return _mock_plan(prompt, config)

    try:
        system_prompt = (
            "Tu es un assistant de prospection B2B. "
            "Réponds UNIQUEMENT en JSON valide avec la structure: "
            '{"actions": [{"action_type": "...", "entity_type": "...", "payload": {...}, "requires_confirm": false}], '
            '"summary": "..."}\n'
            "action_type possibles: source_leads, create_lead, create_task, nurture, rescore, delete_lead.\n"
            "entity_type possibles: lead, task, project.\n"
            "Marque requires_confirm=true pour les suppressions et actions bulk."
        )
        payload = {
            "q": prompt,
            "create_new": True,
        }
        headers = {"Content-Type": "application/json"}
        token = _khoj_token()
        if token:
            headers["Authorization"] = f"Bearer {token}"

        resp = requests.post(
            f"{base_url.rstrip('/')}/api/chat",
            json=payload,
            headers=headers,
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()

        # Khoj returns {"response": "..."} – parse the inner JSON
        raw_text = data.get("response", "") if isinstance(data, dict) else str(data)
        # Strip markdown fences if present
        cleaned = raw_text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[-1]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()

        plan_data = json.loads(cleaned)
        return AssistantPlan(**plan_data)
    except Exception as exc:
        logger.error("Khoj call failed: %s", exc)
        raise RuntimeError(f"Khoj indisponible: {exc}") from exc


def _mock_plan(prompt: str, config: dict[str, Any] | None = None) -> AssistantPlan:
    """Return a canned plan useful for local testing without Khoj."""
    max_leads = (config or {}).get("max_leads", 5)
    return AssistantPlan(
        summary=f"Plan simulé pour: {prompt}",
        actions=[
            AssistantActionSpec(
                action_type="source_leads",
                entity_type="lead",
                payload={"query": prompt, "max_results": max_leads, "source": "apify"},
            ),
            AssistantActionSpec(
                action_type="rescore",
                entity_type="lead",
                payload={"scope": "new"},
            ),
            AssistantActionSpec(
                action_type="nurture",
                entity_type="task",
                payload={"template": "initial_outreach"},
            ),
        ],
    )


# ── Plan execution ──────────────────────────────────────────────

def execute_plan(
    db: Session,
    run_id: str,
    plan: AssistantPlan,
    auto_confirm: bool = True,
) -> None:
    """Persist actions from the plan, then execute safe ones immediately."""
    store.start_run(db, run_id)

    # Tag dangerous actions
    specs: list[AssistantActionSpec] = []
    for action in plan.actions:
        if action.action_type in DANGEROUS_ACTION_TYPES:
            action.requires_confirm = True
        elif not auto_confirm:
            action.requires_confirm = True
        specs.append(action)

    db_actions = store.add_actions(db, run_id, specs)

    # Execute each action
    errors: list[str] = []
    for db_action in db_actions:
        if db_action.requires_confirm:
            # Leave as pending – user must confirm via /confirm endpoint
            continue
        try:
            result = _dispatch_action(db, db_action)
            store.update_action_status(db, db_action.id, "executed", result)
        except Exception as exc:
            logger.error("Action %s failed: %s", db_action.id, exc)
            store.update_action_status(db, db_action.id, "failed", {"error": str(exc)})
            errors.append(str(exc))

    # Finalise run
    status = "completed" if not errors else "completed_with_errors"
    summary = plan.summary
    if errors:
        summary = f"{plan.summary} | Erreurs: {'; '.join(errors[:3])}"
    store.finish_run(db, run_id, status=status, summary=summary)

    # Notification
    _notify_run_completed(db, run_id, summary or "Run terminé")


def execute_confirmed_actions(db: Session, action_ids: list[str]) -> dict[str, Any]:
    """Execute previously-confirmed pending actions."""
    actions = store.get_pending_actions(db, action_ids)
    results: dict[str, str] = {}
    for action in actions:
        store.update_action_status(db, action.id, "confirmed")
        try:
            result = _dispatch_action(db, action)
            store.update_action_status(db, action.id, "executed", result)
            results[action.id] = "executed"
        except Exception as exc:
            store.update_action_status(db, action.id, "failed", {"error": str(exc)})
            results[action.id] = f"failed: {exc}"
    return results


def reject_actions(db: Session, action_ids: list[str]) -> int:
    """Reject pending actions."""
    actions = store.get_pending_actions(db, action_ids)
    for action in actions:
        store.update_action_status(db, action.id, "rejected")
    return len(actions)


# ── Action dispatch ─────────────────────────────────────────────

def _dispatch_action(db: Session, action) -> dict[str, Any]:
    """Route a single action to its handler."""
    handler = _ACTION_HANDLERS.get(action.action_type)
    if not handler:
        return {"warning": f"Unknown action_type: {action.action_type}"}
    return handler(db, action.payload_json or {})


def _handle_source_leads(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    """Source leads via Apify (simplified – delegates to existing client if available)."""
    query = payload.get("query", "")
    max_results = payload.get("max_results", 10)

    apify_token = os.getenv("APIFY_API_TOKEN")
    if not apify_token:
        logger.warning("APIFY_API_TOKEN not set – skipping lead sourcing")
        return {"skipped": True, "reason": "APIFY_API_TOKEN not configured"}

    try:
        from ..enrichment.apify_client import ApifyMapsClient

        client = ApifyMapsClient(apify_token)
        raw_leads = client.search_leads({"query": query, "maxResults": max_results})

        created_ids: list[str] = []
        for raw in raw_leads:
            lead_id = raw.get("email") or str(uuid.uuid4())
            existing = db.query(DBLead).filter_by(id=lead_id).first()
            if existing:
                continue
            db_lead = DBLead(
                id=lead_id,
                first_name=raw.get("first_name", ""),
                last_name=raw.get("last_name", ""),
                email=raw.get("email", ""),
                phone=raw.get("phone"),
                details=raw.get("details", {}),
            )
            db.add(db_lead)
            created_ids.append(lead_id)

        db.commit()
        return {"created": len(created_ids), "ids": created_ids}
    except Exception as exc:
        logger.error("Apify sourcing error: %s", exc)
        return {"error": str(exc)}


def _handle_create_lead(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    lead_id = payload.get("email") or str(uuid.uuid4())
    existing = db.query(DBLead).filter_by(id=lead_id).first()
    if existing:
        return {"skipped": True, "reason": "Lead already exists", "id": lead_id}
    db_lead = DBLead(
        id=lead_id,
        first_name=payload.get("first_name", ""),
        last_name=payload.get("last_name", ""),
        email=payload.get("email", ""),
        phone=payload.get("phone"),
    )
    db.add(db_lead)
    db.commit()
    return {"created": True, "id": lead_id}


def _handle_create_task(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    task_id = str(uuid.uuid4())
    db_task = DBTask(
        id=task_id,
        title=payload.get("title", "Tâche IA"),
        status=payload.get("status", "To Do"),
        priority=payload.get("priority", "Medium"),
        lead_id=payload.get("lead_id"),
    )
    db.add(db_task)
    db.commit()
    return {"created": True, "id": task_id}


def _handle_rescore(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    """Rescore leads using the ScoringEngine."""
    scope = payload.get("scope", "all")
    query = db.query(DBLead)
    if scope == "new":
        query = query.filter(DBLead.last_scored_at.is_(None))

    leads = query.limit(200).all()
    engine = ScoringEngine()
    scored = 0
    for db_lead in leads:
        try:
            lead_obj = Lead(
                email=db_lead.email or "",
                first_name=db_lead.first_name or "",
                last_name=db_lead.last_name or "",
                title=db_lead.title or "",
                details=db_lead.details or {},
            )
            result = engine.score_lead(lead_obj)
            db_lead.icp_score = result.icp_score
            db_lead.heat_score = result.heat_score
            db_lead.total_score = result.total_score
            db_lead.tier = result.tier
            db_lead.heat_status = result.heat_status
            db_lead.next_best_action = result.next_best_action
            db_lead.icp_breakdown = result.icp_breakdown
            db_lead.heat_breakdown = result.heat_breakdown
            db_lead.last_scored_at = datetime.now()
            scored += 1
        except Exception as exc:
            logger.warning("Score error for %s: %s", db_lead.id, exc)
    db.commit()
    return {"rescored": scored}


def _handle_nurture(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    """Create follow-up tasks for un-nurtured leads."""
    template = payload.get("template", "follow_up")
    leads = db.query(DBLead).filter(DBLead.status.in_(["NEW", "new"])).limit(50).all()
    created = 0
    for lead in leads:
        task_id = str(uuid.uuid4())
        db_task = DBTask(
            id=task_id,
            title=f"[{template}] Relance {lead.first_name} {lead.last_name}",
            status="To Do",
            priority="Medium",
            lead_id=lead.id,
        )
        db.add(db_task)
        created += 1
    db.commit()
    return {"tasks_created": created}


def _handle_delete_lead(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    lead_id = payload.get("id", "")
    lead = db.query(DBLead).filter_by(id=lead_id).first()
    if not lead:
        return {"deleted": False, "reason": "Not found"}
    db.delete(lead)
    db.commit()
    return {"deleted": True, "id": lead_id}


_ACTION_HANDLERS: dict[str, Any] = {
    "source_leads": _handle_source_leads,
    "create_lead": _handle_create_lead,
    "create_task": _handle_create_task,
    "rescore": _handle_rescore,
    "nurture": _handle_nurture,
    "delete_lead": _handle_delete_lead,
}


# ── Notification helper ─────────────────────────────────────────

def _notify_run_completed(db: Session, run_id: str, summary: str) -> None:
    notif = DBNotification(
        id=str(uuid.uuid4()),
        event_key="assistant_run_completed",
        title="Prospect AI – Run terminé",
        message=summary,
        channel="in_app",
        entity_type="assistant_run",
        entity_id=run_id,
        link_href=f"/assistant?run={run_id}",
    )
    db.add(notif)
    db.commit()
