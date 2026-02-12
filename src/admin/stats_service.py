from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Dict, List

from sqlalchemy import String, func, or_
from sqlalchemy.orm import Session, joinedload

from ..core.db_models import DBCompany, DBInteraction, DBLead
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
    segment_filter: str | None = None,
    tier_filter: str | None = None,
    heat_status_filter: str | None = None,
    company_filter: str | None = None,
    industry_filter: str | None = None,
    location_filter: str | None = None,
    tag_filter: str | None = None,
    min_score: float | None = None,
    max_score: float | None = None,
    has_email: bool | None = None,
    has_phone: bool | None = None,
    has_linkedin: bool | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    last_scored_from: datetime | None = None,
    last_scored_to: datetime | None = None,
    sort_by: str = "created_at",
    sort_desc: bool = True,
) -> Dict[str, Any]:
    page_size = max(1, min(page_size, 100))
    page = max(page, 1)

    query = db.query(DBLead).options(joinedload(DBLead.company))

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                func.lower(func.coalesce(DBLead.first_name, "")).like(term.lower()),
                func.lower(func.coalesce(DBLead.last_name, "")).like(term.lower()),
                func.lower(func.coalesce(DBLead.email, "")).like(term.lower()),
                DBLead.company.has(func.lower(func.coalesce(DBCompany.name, "")).like(term.lower())),
                DBLead.company.has(func.lower(func.coalesce(DBCompany.industry, "")).like(term.lower())),
                DBLead.company.has(func.lower(func.coalesce(DBCompany.location, "")).like(term.lower())),
            )
        )

    if status_filter and status_filter.strip():
        try:
            status_enum = LeadStatus(status_filter)
            query = query.filter(DBLead.status == status_enum)
        except ValueError:
            pass

    if segment_filter and segment_filter.strip():
        query = query.filter(func.lower(func.coalesce(DBLead.segment, "")).like(f"%{segment_filter.strip().lower()}%"))

    if tier_filter and tier_filter.strip():
        query = query.filter(func.lower(func.coalesce(DBLead.tier, "")).like(f"%{tier_filter.strip().lower()}%"))

    if heat_status_filter and heat_status_filter.strip():
        query = query.filter(func.lower(func.coalesce(DBLead.heat_status, "")).like(f"%{heat_status_filter.strip().lower()}%"))

    if company_filter and company_filter.strip():
        query = query.filter(
            DBLead.company.has(
                func.lower(func.coalesce(DBCompany.name, "")).like(f"%{company_filter.strip().lower()}%")
            )
        )

    if industry_filter and industry_filter.strip():
        query = query.filter(
            DBLead.company.has(
                func.lower(func.coalesce(DBCompany.industry, "")).like(f"%{industry_filter.strip().lower()}%")
            )
        )

    if location_filter and location_filter.strip():
        query = query.filter(
            DBLead.company.has(
                func.lower(func.coalesce(DBCompany.location, "")).like(f"%{location_filter.strip().lower()}%")
            )
        )

    if tag_filter and tag_filter.strip():
        term = f"%{tag_filter.strip().lower()}%"
        query = query.filter(func.lower(func.cast(DBLead.tags, String)).like(term))

    if min_score is not None:
        query = query.filter(func.coalesce(DBLead.total_score, 0.0) >= float(min_score))

    if max_score is not None:
        query = query.filter(func.coalesce(DBLead.total_score, 0.0) <= float(max_score))

    if has_email is True:
        query = query.filter(func.trim(func.coalesce(DBLead.email, "")) != "")
    elif has_email is False:
        query = query.filter(func.trim(func.coalesce(DBLead.email, "")) == "")

    if has_phone is True:
        query = query.filter(func.trim(func.coalesce(DBLead.phone, "")) != "")
    elif has_phone is False:
        query = query.filter(func.trim(func.coalesce(DBLead.phone, "")) == "")

    if has_linkedin is True:
        query = query.filter(
            or_(
                func.trim(func.coalesce(DBLead.linkedin_url, "")) != "",
                DBLead.company.has(func.trim(func.coalesce(DBCompany.linkedin_url, "")) != ""),
            )
        )
    elif has_linkedin is False:
        query = query.filter(
            func.trim(func.coalesce(DBLead.linkedin_url, "")) == "",
            DBLead.company.has(func.trim(func.coalesce(DBCompany.linkedin_url, "")) == ""),
        )

    if created_from is not None:
        query = query.filter(DBLead.created_at >= created_from)
    if created_to is not None:
        query = query.filter(DBLead.created_at <= created_to)
    if last_scored_from is not None:
        query = query.filter(DBLead.last_scored_at.isnot(None), DBLead.last_scored_at >= last_scored_from)
    if last_scored_to is not None:
        query = query.filter(DBLead.last_scored_at.isnot(None), DBLead.last_scored_at <= last_scored_to)

    if min_score is not None and max_score is not None and float(min_score) > float(max_score):
        return {
            "page": page,
            "page_size": page_size,
            "total": 0,
            "items": [],
        }

    sort_column = DBLead.created_at
    if sort_by == "total_score":
        sort_column = DBLead.total_score
    elif sort_by == "last_scored_at":
        sort_column = DBLead.last_scored_at
    elif sort_by == "updated_at":
        sort_column = DBLead.updated_at
    elif sort_by == "first_name":
        sort_column = DBLead.first_name
    elif sort_by == "last_name":
        sort_column = DBLead.last_name
    elif sort_by == "status":
        sort_column = DBLead.status
    elif sort_by == "tier":
        sort_column = DBLead.tier
    elif sort_by == "heat_status":
        sort_column = DBLead.heat_status
    elif sort_by == "company_name":
        query = query.outerjoin(DBLead.company)
        sort_column = DBCompany.name

    if sort_desc:
        query = query.order_by(sort_column.desc(), DBLead.id.desc())
    else:
        query = query.order_by(sort_column.asc(), DBLead.id.asc())

    total = query.count()
    offset = (page - 1) * page_size
    rows = query.offset(offset).limit(page_size).all()

    items = []
    for lead in rows:
        company_name = lead.company.name if lead.company else None
        company_industry = lead.company.industry if lead.company else None
        company_location = lead.company.location if lead.company else None
        linkedin_url = lead.linkedin_url or (lead.company.linkedin_url if lead.company else None)
        items.append(
            {
                "id": lead.id,
                "email": lead.email,
                "first_name": lead.first_name,
                "last_name": lead.last_name,
                "phone": lead.phone,
                "linkedin_url": linkedin_url,
                "company_name": company_name,
                "company_industry": company_industry,
                "company_location": company_location,
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
                "updated_at": lead.updated_at.isoformat() if lead.updated_at else None,
            }
        )
    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "items": items,
    }
