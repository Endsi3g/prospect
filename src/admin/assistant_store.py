"""Persistence helpers for the Assistant Prospect subsystem."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Sequence

from sqlalchemy.orm import Session

from ..core.db_models import DBAssistantRun, DBAssistantAction
from .assistant_types import AssistantActionSpec


def _uid() -> str:
    return str(uuid.uuid4())


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


# ── Runs ────────────────────────────────────────────────────────

def create_run(
    db: Session,
    prompt: str,
    actor: str = "admin",
    config: dict[str, Any] | None = None,
) -> DBAssistantRun:
    run = DBAssistantRun(
        id=_uid(),
        prompt=prompt,
        status="pending",
        actor=actor,
        config_json=config or {},
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def start_run(db: Session, run_id: str) -> None:
    run = db.query(DBAssistantRun).filter_by(id=run_id).first()
    if run:
        run.status = "running"
        db.commit()


def finish_run(
    db: Session,
    run_id: str,
    status: str = "completed",
    summary: str | None = None,
) -> None:
    run = db.query(DBAssistantRun).filter_by(id=run_id).first()
    if run:
        run.status = status
        run.summary = summary
        run.finished_at = datetime.now()
        db.commit()


def get_run(db: Session, run_id: str) -> DBAssistantRun | None:
    return db.query(DBAssistantRun).filter_by(id=run_id).first()


def list_runs(
    db: Session,
    limit: int = 25,
    offset: int = 0,
) -> Sequence[DBAssistantRun]:
    return (
        db.query(DBAssistantRun)
        .order_by(DBAssistantRun.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


# ── Actions ─────────────────────────────────────────────────────

def add_actions(
    db: Session,
    run_id: str,
    specs: list[AssistantActionSpec],
) -> list[DBAssistantAction]:
    actions: list[DBAssistantAction] = []
    for spec in specs:
        action = DBAssistantAction(
            id=_uid(),
            run_id=run_id,
            action_type=spec.action_type,
            entity_type=spec.entity_type,
            payload_json=spec.payload,
            requires_confirm=spec.requires_confirm,
            status="pending",
        )
        db.add(action)
        actions.append(action)
    db.commit()
    for a in actions:
        db.refresh(a)
    return actions


def update_action_status(
    db: Session,
    action_id: str,
    status: str,
    result_json: dict[str, Any] | None = None,
) -> None:
    action = db.query(DBAssistantAction).filter_by(id=action_id).first()
    if action:
        action.status = status
        if result_json is not None:
            action.result_json = result_json
        if status in ("executed", "failed"):
            action.executed_at = datetime.now()
        db.commit()


def get_actions_for_run(db: Session, run_id: str) -> Sequence[DBAssistantAction]:
    return (
        db.query(DBAssistantAction)
        .filter_by(run_id=run_id)
        .order_by(DBAssistantAction.created_at)
        .all()
    )


def get_pending_actions(db: Session, action_ids: list[str]) -> Sequence[DBAssistantAction]:
    return (
        db.query(DBAssistantAction)
        .filter(
            DBAssistantAction.id.in_(action_ids),
            DBAssistantAction.status == "pending",
            DBAssistantAction.requires_confirm.is_(True),
        )
        .all()
    )
