from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import and_
from sqlalchemy.orm import Session

from ..core.db_models import (
    DBCampaign,
    DBCampaignEnrollment,
    DBCampaignRun,
    DBCampaignSequence,
    DBLead,
    DBTask,
)


CAMPAIGN_STATUSES = {"draft", "active", "paused", "archived"}
SEQUENCE_STATUSES = {"draft", "active", "archived"}
ENROLLMENT_STATUSES = {"active", "paused", "completed"}
RUN_STATUSES = {"pending", "executed", "failed", "skipped"}


def _coerce_campaign_status(raw: str | None) -> str:
    value = (raw or "draft").strip().lower()
    if value in CAMPAIGN_STATUSES:
        return value
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=f"Unsupported campaign status: {raw}",
    )


def _coerce_sequence_status(raw: str | None) -> str:
    value = (raw or "draft").strip().lower()
    if value in SEQUENCE_STATUSES:
        return value
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=f"Unsupported sequence status: {raw}",
    )


def _coerce_enrollment_status(raw: str | None) -> str:
    value = (raw or "active").strip().lower()
    if value in ENROLLMENT_STATUSES:
        return value
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=f"Unsupported enrollment status: {raw}",
    )


def _coerce_run_status(raw: str | None) -> str:
    value = (raw or "pending").strip().lower()
    if value in RUN_STATUSES:
        return value
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=f"Unsupported run status: {raw}",
    )


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _normalize_steps(raw_steps: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    steps = raw_steps or []
    normalized: list[dict[str, Any]] = []
    for index, step in enumerate(steps):
        if not isinstance(step, dict):
            continue
        channel = str(step.get("channel") or "email").strip().lower()
        template_key = str(step.get("template_key") or f"{channel}_step_{index + 1}").strip()
        try:
            delay_days = max(0, int(step.get("delay_days", 0)))
        except (TypeError, ValueError):
            delay_days = 0
        conditions = step.get("conditions") if isinstance(step.get("conditions"), dict) else {}
        normalized.append(
            {
                "step": index + 1,
                "channel": channel,
                "template_key": template_key,
                "delay_days": delay_days,
                "conditions": conditions,
            }
        )
    return normalized


def _normalize_channels(raw_channels: list[str] | None, steps: list[dict[str, Any]]) -> list[str]:
    if raw_channels:
        channels = [str(item).strip().lower() for item in raw_channels if str(item).strip()]
        unique: list[str] = []
        for item in channels:
            if item not in unique:
                unique.append(item)
        if unique:
            return unique

    deduced: list[str] = []
    for step in steps:
        channel = str(step.get("channel") or "").strip().lower()
        if channel and channel not in deduced:
            deduced.append(channel)
    return deduced or ["email"]


def serialize_sequence(row: DBCampaignSequence) -> dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "description": row.description,
        "status": row.status,
        "channels": row.channels_json or [],
        "steps": row.steps_json or [],
        "created_at": _iso(row.created_at),
        "updated_at": _iso(row.updated_at),
    }


def serialize_campaign(row: DBCampaign) -> dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "description": row.description,
        "status": row.status,
        "sequence_id": row.sequence_id,
        "channel_strategy": row.channel_strategy_json or {},
        "enrollment_filter": row.enrollment_filter_json or {},
        "created_at": _iso(row.created_at),
        "updated_at": _iso(row.updated_at),
    }


def serialize_enrollment(row: DBCampaignEnrollment) -> dict[str, Any]:
    return {
        "id": row.id,
        "campaign_id": row.campaign_id,
        "lead_id": row.lead_id,
        "status": row.status,
        "current_step_index": row.current_step_index,
        "next_run_at": _iso(row.next_run_at),
        "last_action_at": _iso(row.last_action_at),
        "created_at": _iso(row.created_at),
        "updated_at": _iso(row.updated_at),
    }


def serialize_run(row: DBCampaignRun) -> dict[str, Any]:
    return {
        "id": row.id,
        "campaign_id": row.campaign_id,
        "enrollment_id": row.enrollment_id,
        "lead_id": row.lead_id,
        "trigger_source": row.trigger_source,
        "action_type": row.action_type,
        "status": row.status,
        "step_index": row.step_index,
        "payload": row.payload_json or {},
        "result": row.result_json or {},
        "error_message": row.error_message,
        "created_at": _iso(row.created_at),
        "executed_at": _iso(row.executed_at),
    }


def create_sequence(
    db: Session,
    *,
    name: str,
    description: str | None = None,
    status_value: str | None = None,
    channels: list[str] | None = None,
    steps: list[dict[str, Any]] | None = None,
) -> DBCampaignSequence:
    clean_name = name.strip()
    if not clean_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Sequence name is required.",
        )
    existing = db.query(DBCampaignSequence).filter(DBCampaignSequence.name == clean_name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Sequence '{clean_name}' already exists.",
        )
    normalized_steps = _normalize_steps(steps)
    row = DBCampaignSequence(
        id=str(uuid.uuid4()),
        name=clean_name,
        description=(description or "").strip() or None,
        status=_coerce_sequence_status(status_value),
        channels_json=_normalize_channels(channels, normalized_steps),
        steps_json=normalized_steps,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_sequences(db: Session, *, limit: int = 50, offset: int = 0) -> list[DBCampaignSequence]:
    return (
        db.query(DBCampaignSequence)
        .order_by(DBCampaignSequence.created_at.desc())
        .offset(max(0, offset))
        .limit(max(1, min(limit, 200)))
        .all()
    )


def get_sequence_or_404(db: Session, sequence_id: str) -> DBCampaignSequence:
    row = db.query(DBCampaignSequence).filter(DBCampaignSequence.id == sequence_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sequence not found.")
    return row


def update_sequence(
    db: Session,
    sequence_id: str,
    *,
    name: str | None = None,
    description: str | None = None,
    status_value: str | None = None,
    channels: list[str] | None = None,
    steps: list[dict[str, Any]] | None = None,
) -> DBCampaignSequence:
    row = get_sequence_or_404(db, sequence_id)

    if name is not None:
        clean_name = name.strip()
        if not clean_name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Sequence name cannot be empty.",
            )
        existing = (
            db.query(DBCampaignSequence)
            .filter(
                and_(
                    DBCampaignSequence.name == clean_name,
                    DBCampaignSequence.id != sequence_id,
                )
            )
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Sequence '{clean_name}' already exists.",
            )
        row.name = clean_name

    if description is not None:
        row.description = (description or "").strip() or None
    if status_value is not None:
        row.status = _coerce_sequence_status(status_value)
    if steps is not None:
        row.steps_json = _normalize_steps(steps)
        if channels is None:
            row.channels_json = _normalize_channels(row.channels_json, row.steps_json or [])
    if channels is not None:
        row.channels_json = _normalize_channels(channels, row.steps_json or [])
    row.updated_at = datetime.now()
    db.commit()
    db.refresh(row)
    return row


def simulate_sequence(
    sequence: DBCampaignSequence,
    *,
    start_at: datetime | None = None,
    lead_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    context = lead_context or {}
    now = start_at or datetime.now()
    cursor = now
    events: list[dict[str, Any]] = []

    for index, step in enumerate(sequence.steps_json or []):
        delay_days = int(step.get("delay_days", 0) or 0)
        if index == 0:
            cursor = now + timedelta(days=max(0, delay_days))
        else:
            cursor = cursor + timedelta(days=max(0, delay_days))

        conditions = step.get("conditions") if isinstance(step.get("conditions"), dict) else {}
        min_heat_score = conditions.get("min_heat_score")
        should_skip = False
        if min_heat_score is not None:
            try:
                if float(context.get("heat_score", 0)) < float(min_heat_score):
                    should_skip = True
            except (TypeError, ValueError):
                should_skip = False

        events.append(
            {
                "step": int(step.get("step", index + 1)),
                "channel": str(step.get("channel") or "email"),
                "template_key": str(step.get("template_key") or ""),
                "delay_days": delay_days,
                "scheduled_at": cursor.isoformat(),
                "skip": should_skip,
                "conditions": conditions,
            }
        )

    return {
        "sequence_id": sequence.id,
        "sequence_name": sequence.name,
        "start_at": now.isoformat(),
        "timeline": events,
    }


def create_campaign(
    db: Session,
    *,
    name: str,
    description: str | None = None,
    status_value: str | None = None,
    sequence_id: str | None = None,
    channel_strategy: dict[str, Any] | None = None,
    enrollment_filter: dict[str, Any] | None = None,
) -> DBCampaign:
    clean_name = name.strip()
    if not clean_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Campaign name is required.",
        )
    existing = db.query(DBCampaign).filter(DBCampaign.name == clean_name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Campaign '{clean_name}' already exists.",
        )
    if sequence_id:
        get_sequence_or_404(db, sequence_id)
    row = DBCampaign(
        id=str(uuid.uuid4()),
        name=clean_name,
        description=(description or "").strip() or None,
        status=_coerce_campaign_status(status_value),
        sequence_id=sequence_id,
        channel_strategy_json=channel_strategy or {},
        enrollment_filter_json=enrollment_filter or {},
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_campaigns(db: Session, *, limit: int = 50, offset: int = 0) -> list[DBCampaign]:
    return (
        db.query(DBCampaign)
        .order_by(DBCampaign.created_at.desc())
        .offset(max(0, offset))
        .limit(max(1, min(limit, 200)))
        .all()
    )


def get_campaign_or_404(db: Session, campaign_id: str) -> DBCampaign:
    row = db.query(DBCampaign).filter(DBCampaign.id == campaign_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found.")
    return row


def update_campaign(
    db: Session,
    campaign_id: str,
    *,
    name: str | None = None,
    description: str | None = None,
    status_value: str | None = None,
    sequence_id: str | None = None,
    channel_strategy: dict[str, Any] | None = None,
    enrollment_filter: dict[str, Any] | None = None,
) -> DBCampaign:
    row = get_campaign_or_404(db, campaign_id)

    if name is not None:
        clean_name = name.strip()
        if not clean_name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Campaign name cannot be empty.",
            )
        existing = (
            db.query(DBCampaign)
            .filter(and_(DBCampaign.name == clean_name, DBCampaign.id != campaign_id))
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Campaign '{clean_name}' already exists.",
            )
        row.name = clean_name

    if description is not None:
        row.description = (description or "").strip() or None
    if status_value is not None:
        row.status = _coerce_campaign_status(status_value)
    if sequence_id is not None:
        if sequence_id:
            get_sequence_or_404(db, sequence_id)
            row.sequence_id = sequence_id
        else:
            row.sequence_id = None
    if channel_strategy is not None:
        row.channel_strategy_json = channel_strategy
    if enrollment_filter is not None:
        row.enrollment_filter_json = enrollment_filter
    row.updated_at = datetime.now()
    db.commit()
    db.refresh(row)
    return row


def set_campaign_status(db: Session, campaign_id: str, status_value: str) -> DBCampaign:
    row = get_campaign_or_404(db, campaign_id)
    row.status = _coerce_campaign_status(status_value)
    row.updated_at = datetime.now()
    db.commit()
    db.refresh(row)
    return row


def _candidate_leads_for_enrollment(
    db: Session,
    *,
    lead_ids: list[str] | None,
    filters: dict[str, Any] | None,
    max_leads: int,
) -> list[DBLead]:
    limit = max(1, min(max_leads, 500))
    if lead_ids:
        ids = [str(item).strip() for item in lead_ids if str(item).strip()]
        if not ids:
            return []
        return db.query(DBLead).filter(DBLead.id.in_(ids)).limit(limit).all()

    payload = filters or {}
    statuses = payload.get("statuses", ["NEW", "ENRICHED", "SCORED", "CONTACTED"])
    min_total_score = payload.get("min_total_score")

    query = db.query(DBLead)
    if isinstance(statuses, list) and statuses:
        normalized = [str(item).strip().upper() for item in statuses if str(item).strip()]
        if normalized:
            query = query.filter(DBLead.status.in_(normalized))
    if min_total_score is not None:
        try:
            query = query.filter(DBLead.total_score >= float(min_total_score))
        except (TypeError, ValueError):
            pass
    return query.order_by(DBLead.created_at.desc()).limit(limit).all()


def enroll_campaign_leads(
    db: Session,
    campaign_id: str,
    *,
    lead_ids: list[str] | None = None,
    filters: dict[str, Any] | None = None,
    max_leads: int = 50,
) -> dict[str, Any]:
    campaign = get_campaign_or_404(db, campaign_id)
    leads = _candidate_leads_for_enrollment(
        db,
        lead_ids=lead_ids,
        filters=filters,
        max_leads=max_leads,
    )
    created: list[DBCampaignEnrollment] = []
    skipped = 0
    now = datetime.now()

    for lead in leads:
        existing = (
            db.query(DBCampaignEnrollment)
            .filter(
                DBCampaignEnrollment.campaign_id == campaign.id,
                DBCampaignEnrollment.lead_id == lead.id,
                DBCampaignEnrollment.status.in_(["active", "paused"]),
            )
            .first()
        )
        if existing:
            skipped += 1
            continue

        row = DBCampaignEnrollment(
            id=str(uuid.uuid4()),
            campaign_id=campaign.id,
            lead_id=lead.id,
            status="active",
            current_step_index=0,
            next_run_at=now,
        )
        db.add(row)
        created.append(row)

    db.commit()
    for row in created:
        db.refresh(row)

    return {
        "campaign_id": campaign.id,
        "created": len(created),
        "skipped": skipped,
        "items": [serialize_enrollment(item) for item in created],
    }


def list_campaign_runs(
    db: Session,
    campaign_id: str,
    *,
    status_filter: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[DBCampaignRun]:
    _ = get_campaign_or_404(db, campaign_id)
    query = db.query(DBCampaignRun).filter(DBCampaignRun.campaign_id == campaign_id)
    if status_filter:
        query = query.filter(DBCampaignRun.status == _coerce_run_status(status_filter))
    return (
        query.order_by(DBCampaignRun.created_at.desc())
        .offset(max(0, offset))
        .limit(max(1, min(limit, 200)))
        .all()
    )


def create_campaign_run(
    db: Session,
    *,
    campaign_id: str,
    lead_id: str | None,
    enrollment_id: str | None,
    trigger_source: str,
    action_type: str,
    step_index: int,
    status_value: str,
    payload: dict[str, Any] | None = None,
    result: dict[str, Any] | None = None,
    error_message: str | None = None,
) -> DBCampaignRun:
    row = DBCampaignRun(
        id=str(uuid.uuid4()),
        campaign_id=campaign_id,
        lead_id=lead_id,
        enrollment_id=enrollment_id,
        trigger_source=(trigger_source or "manual").strip() or "manual",
        action_type=(action_type or "nurture_step").strip() or "nurture_step",
        status=_coerce_run_status(status_value),
        step_index=max(0, int(step_index)),
        payload_json=payload or {},
        result_json=result or {},
        error_message=(error_message or "").strip() or None,
        executed_at=datetime.now() if status_value in {"executed", "failed", "skipped"} else None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def ensure_default_nurture_campaign(db: Session) -> tuple[DBCampaignSequence, DBCampaign]:
    sequence = (
        db.query(DBCampaignSequence)
        .filter(DBCampaignSequence.name == "Default Nurture Sequence")
        .first()
    )
    if not sequence:
        sequence = DBCampaignSequence(
            id=str(uuid.uuid4()),
            name="Default Nurture Sequence",
            description="Default multi-step nurture flow",
            status="active",
            channels_json=["email", "call"],
            steps_json=[
                {
                    "step": 1,
                    "channel": "email",
                    "template_key": "initial_outreach",
                    "delay_days": 0,
                    "conditions": {},
                },
                {
                    "step": 2,
                    "channel": "call",
                    "template_key": "follow_up_call",
                    "delay_days": 2,
                    "conditions": {"min_heat_score": 20},
                },
                {
                    "step": 3,
                    "channel": "email",
                    "template_key": "value_follow_up",
                    "delay_days": 3,
                    "conditions": {},
                },
            ],
        )
        db.add(sequence)
        db.commit()
        db.refresh(sequence)

    campaign = db.query(DBCampaign).filter(DBCampaign.name == "Default Nurture Campaign").first()
    if not campaign:
        campaign = DBCampaign(
            id=str(uuid.uuid4()),
            name="Default Nurture Campaign",
            description="System default nurture campaign",
            status="active",
            sequence_id=sequence.id,
            channel_strategy_json={"primary": "email", "secondary": "call"},
            enrollment_filter_json={"statuses": ["NEW"]},
        )
        db.add(campaign)
        db.commit()
        db.refresh(campaign)
    elif campaign.sequence_id != sequence.id:
        campaign.sequence_id = sequence.id
        db.commit()
        db.refresh(campaign)

    return sequence, campaign


def run_default_nurture(
    db: Session,
    *,
    template: str,
    limit: int = 50,
    actor: str = "assistant",
) -> dict[str, Any]:
    sequence, campaign = ensure_default_nurture_campaign(db)
    enroll_result = enroll_campaign_leads(
        db,
        campaign.id,
        filters={"statuses": ["NEW"]},
        max_leads=limit,
    )

    enrollments = (
        db.query(DBCampaignEnrollment)
        .filter(
            DBCampaignEnrollment.campaign_id == campaign.id,
            DBCampaignEnrollment.status == "active",
            DBCampaignEnrollment.current_step_index == 0,
        )
        .order_by(DBCampaignEnrollment.created_at.desc())
        .limit(limit)
        .all()
    )
    leads_by_id: dict[str, DBLead] = {
        lead.id: lead
        for lead in db.query(DBLead).filter(DBLead.id.in_([item.lead_id for item in enrollments])).all()
    }

    created_tasks = 0
    created_runs = 0
    default_step = (sequence.steps_json or [{}])[0]
    for enrollment in enrollments:
        lead = leads_by_id.get(enrollment.lead_id)
        if not lead:
            continue

        task = DBTask(
            id=str(uuid.uuid4()),
            title=f"[{template}] Relance {lead.first_name or ''} {lead.last_name or ''}".strip(),
            status="To Do",
            priority="Medium",
            assigned_to="You",
            lead_id=lead.id,
            due_date=datetime.now() + timedelta(days=int(default_step.get("delay_days", 0) or 0)),
        )
        db.add(task)
        created_tasks += 1

        run = DBCampaignRun(
            id=str(uuid.uuid4()),
            campaign_id=campaign.id,
            enrollment_id=enrollment.id,
            lead_id=lead.id,
            trigger_source=actor,
            action_type="nurture_step",
            status="executed",
            step_index=1,
            payload_json={
                "template": template,
                "step": default_step,
            },
            result_json={"task_id": task.id, "created": True},
            executed_at=datetime.now(),
        )
        db.add(run)
        created_runs += 1

        enrollment.current_step_index = 1
        enrollment.last_action_at = datetime.now()
        enrollment.next_run_at = datetime.now() + timedelta(days=2)

    db.commit()

    return {
        "campaign_id": campaign.id,
        "sequence_id": sequence.id,
        "enrollments_created": int(enroll_result.get("created", 0)),
        "tasks_created": created_tasks,
        "runs_created": created_runs,
    }
