from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Dict, List

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..core.db_models import DBInteraction, DBLead
from ..core.models import InteractionType, LeadStatus


CONTACTED_STATUSES = (
    LeadStatus.CONTACTED,
    LeadStatus.INTERESTED,
    LeadStatus.CONVERTED,
    LeadStatus.LOST,
)


def _safe_rate(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return round((numerator / denominator) * 100, 2)


def _extract_tier(tags: Any) -> str:
    if isinstance(tags, list):
        for tag in tags:
            text = str(tag)
            if text.startswith("Tier "):
                return text
    return "Tier Unknown"


def _enum_value(value: Any) -> str:
    if hasattr(value, "value"):
        return str(value.value)
    return str(value)


def _build_daily_trend(db: Session, days: int = 30) -> List[Dict[str, Any]]:
    start_day = date.today() - timedelta(days=days - 1)
    buckets = {}
    for offset in range(days):
        current = start_day + timedelta(days=offset)
        buckets[current.isoformat()] = {
            "date": current.isoformat(),
            "created": 0,
            "scored": 0,
            "contacted": 0,
            "closed": 0,
        }

    created_rows = (
        db.query(func.date(DBLead.created_at), func.count(DBLead.id))
        .filter(DBLead.created_at >= datetime.combine(start_day, datetime.min.time()))
        .group_by(func.date(DBLead.created_at))
        .all()
    )
    for day_value, count in created_rows:
        day_key = str(day_value)
        if day_key in buckets:
            buckets[day_key]["created"] = int(count)

    scored_rows = (
        db.query(func.date(DBLead.last_scored_at), func.count(DBLead.id))
        .filter(DBLead.last_scored_at.isnot(None))
        .filter(DBLead.last_scored_at >= datetime.combine(start_day, datetime.min.time()))
        .group_by(func.date(DBLead.last_scored_at))
        .all()
    )
    for day_value, count in scored_rows:
        day_key = str(day_value)
        if day_key in buckets:
            buckets[day_key]["scored"] = int(count)

    contacted_rows = (
        db.query(func.date(DBLead.updated_at), func.count(DBLead.id))
        .filter(DBLead.status.in_(CONTACTED_STATUSES))
        .filter(DBLead.updated_at >= datetime.combine(start_day, datetime.min.time()))
        .group_by(func.date(DBLead.updated_at))
        .all()
    )
    for day_value, count in contacted_rows:
        day_key = str(day_value)
        if day_key in buckets:
            buckets[day_key]["contacted"] = int(count)

    closed_rows = (
        db.query(func.date(DBLead.updated_at), func.count(DBLead.id))
        .filter(DBLead.status == LeadStatus.CONVERTED)
        .filter(DBLead.updated_at >= datetime.combine(start_day, datetime.min.time()))
        .group_by(func.date(DBLead.updated_at))
        .all()
    )
    for day_value, count in closed_rows:
        day_key = str(day_value)
        if day_key in buckets:
            buckets[day_key]["closed"] = int(count)

    return list(buckets.values())


def compute_core_funnel_stats(db: Session, qualification_threshold: float) -> Dict[str, Any]:
    sourced_total = db.query(DBLead).count()
    qualified_total = (
        db.query(DBLead)
        .filter(DBLead.total_score >= float(qualification_threshold))
        .count()
    )
    contacted_total = (
        db.query(DBLead).filter(DBLead.status.in_(CONTACTED_STATUSES)).count()
    )
    replied_total = (
        db.query(DBInteraction.lead_id)
        .filter(DBInteraction.type == InteractionType.EMAIL_REPLIED)
        .distinct()
        .count()
    )
    booked_total = (
        db.query(DBInteraction.lead_id)
        .filter(DBInteraction.type == InteractionType.MEETING_BOOKED)
        .distinct()
        .count()
    )
    closed_total = (
        db.query(DBLead).filter(DBLead.status == LeadStatus.CONVERTED).count()
    )
    avg_total_score = db.query(func.avg(DBLead.total_score)).scalar() or 0.0

    tier_distribution = {}
    for (tags,) in db.query(DBLead.tags).all():
        tier = _extract_tier(tags)
        tier_distribution[tier] = tier_distribution.get(tier, 0) + 1

    return {
        "sourced_total": sourced_total,
        "qualified_total": qualified_total,
        "contacted_total": contacted_total,
        "replied_total": replied_total,
        "booked_total": booked_total,
        "closed_total": closed_total,
        "qualified_rate": _safe_rate(qualified_total, sourced_total),
        "contact_rate": _safe_rate(contacted_total, qualified_total),
        "reply_rate": _safe_rate(replied_total, contacted_total),
        "book_rate": _safe_rate(booked_total, replied_total),
        "close_rate": _safe_rate(closed_total, booked_total),
        "avg_total_score": round(float(avg_total_score), 2),
        "tier_distribution": tier_distribution,
        "daily_pipeline_trend": _build_daily_trend(db, days=30),
    }


def list_leads(
    db: Session,
    page: int,
    page_size: int,
    search: str | None = None,
    status_filter: str | None = None,
    sort_by: str = "created_at",
    sort_desc: bool = True,
) -> Dict[str, Any]:
    # Validate and clamp page_size
    page_size = max(1, min(page_size, 100))
    
    query = db.query(DBLead).options(joinedload(DBLead.company))

    # Apply Search
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            func.lower(DBLead.first_name).like(term.lower()) |
            func.lower(DBLead.last_name).like(term.lower()) |
            func.lower(DBLead.email).like(term.lower())
        )

    # Apply Status Filter
    if status_filter and status_filter.strip():
        # Try to match enum status
        try:
            status_enum = LeadStatus(status_filter)
            query = query.filter(DBLead.status == status_enum)
        except ValueError:
            pass # Ignore invalid status

    # Apply Sorting
    sort_column = DBLead.created_at # Default
    if sort_by == "total_score":
        sort_column = DBLead.total_score
    elif sort_by == "last_scored_at":
        sort_column = DBLead.last_scored_at
    elif sort_by == "updated_at":
        sort_column = DBLead.updated_at
    
    if sort_desc:
        query = query.order_by(sort_column.desc())
    else:
        query = query.order_by(sort_column.asc())

    # Pagination
    total = query.count()
    offset = max(page - 1, 0) * page_size
    rows = query.offset(offset).limit(page_size).all()

    items = []
    for lead in rows:
        company_name = lead.company.name if lead.company else None
        items.append(
            {
                "id": lead.id,
                "email": lead.email,
                "first_name": lead.first_name,
                "last_name": lead.last_name,
                "company_name": company_name,
                "status": _enum_value(lead.status),
                "segment": lead.segment,
                "icp_score": lead.icp_score,
                "heat_score": lead.heat_score,
                "total_score": lead.total_score,
                "tier": lead.tier,
                "heat_status": lead.heat_status,
                "next_best_action": lead.next_best_action,
                "tags": lead.tags or [],
                "last_scored_at": lead.last_scored_at.isoformat() if lead.last_scored_at else None,
                "created_at": lead.created_at.isoformat() if lead.created_at else None,
            }
        )
    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "items": items,
    }
