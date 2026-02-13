from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..core.db_models import DBCompany, DBLead, DBProject, DBTask
from ..core.logging import get_logger
from ..core.models import LeadStage, LeadStatus


logger = get_logger(__name__)

if hasattr(status, "HTTP_422_UNPROCESSABLE_CONTENT"):
    HTTP_422_STATUS = status.HTTP_422_UNPROCESSABLE_CONTENT
else:  # pragma: no cover
    HTTP_422_STATUS = 422

SUPPORTED_TABLES = ("leads", "tasks", "projects")
PREVIEW_LIMIT = 50
MAX_CSV_BYTES = 5 * 1024 * 1024

PROJECT_STATUSES = {"Planning", "In Progress", "On Hold", "Completed", "Cancelled"}
TASK_STATUSES = {"To Do", "In Progress", "Done"}
TASK_PRIORITIES = {"Low", "Medium", "High", "Critical"}

TABLE_ALIASES: dict[str, dict[str, tuple[str, ...]]] = {
    "leads": {
        "first_name": ("first_name", "firstname", "prenom", "first name", "prenom"),
        "last_name": ("last_name", "lastname", "nom", "last name"),
        "email": ("email", "mail", "email_address", "courriel"),
        "phone": ("phone", "telephone", "tel", "mobile", "phone_number"),
        "company_name": ("company", "company_name", "entreprise", "societe", "organization"),
        "status": ("status", "statut", "lead_status"),
        "segment": ("segment", "persona", "category", "categorie"),
    },
    "tasks": {
        "id": ("id", "task_id"),
        "title": ("title", "tache", "task", "name", "nom"),
        "status": ("status", "statut", "task_status"),
        "priority": ("priority", "priorite", "urgence"),
        "due_date": ("due_date", "due", "deadline", "echeance", "date"),
        "assigned_to": ("assigned_to", "owner", "assignee", "responsable"),
        "lead_id": ("lead_id", "lead", "lead_ref"),
    },
    "projects": {
        "id": ("id", "project_id"),
        "name": ("name", "project", "projet", "nom"),
        "description": ("description", "desc", "details", "note"),
        "status": ("status", "statut", "project_status"),
        "lead_id": ("lead_id", "lead", "lead_ref"),
        "due_date": ("due_date", "due", "deadline", "echeance", "date"),
    },
}


def _normalize_header(value: str) -> str:
    return "".join(ch for ch in value.strip().lower() if ch.isalnum() or ch in {"_", " "})


def _decode_csv_content(content: bytes) -> str:
    if len(content) > MAX_CSV_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"CSV too large (max {MAX_CSV_BYTES} bytes).",
        )
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise HTTPException(
        status_code=HTTP_422_STATUS,
        detail="Unable to decode CSV file.",
    )


def _detect_delimiter(sample: str) -> str:
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
        return dialect.delimiter
    except csv.Error:
        return ","


def _parse_csv_rows(content: bytes) -> tuple[list[str], list[dict[str, str]]]:
    text = _decode_csv_content(content)
    sample = text[:4096]
    delimiter = _detect_delimiter(sample)
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    if not reader.fieldnames:
        raise HTTPException(
            status_code=HTTP_422_STATUS,
            detail="CSV headers are missing.",
        )
    headers = [header.strip() for header in reader.fieldnames if header and header.strip()]
    rows: list[dict[str, str]] = []
    for raw_row in reader:
        clean_row: dict[str, str] = {}
        for key, value in raw_row.items():
            if not key:
                continue
            clean_row[key.strip()] = (value or "").strip()
        rows.append(clean_row)
    return headers, rows


def _suggest_mapping(table: str, headers: list[str]) -> dict[str, str]:
    aliases = TABLE_ALIASES[table]
    normalized_headers = {_normalize_header(header): header for header in headers}
    mapping: dict[str, str] = {}
    for field_name, field_aliases in aliases.items():
        for alias in field_aliases:
            match = normalized_headers.get(_normalize_header(alias))
            if match:
                mapping[field_name] = match
                break
    return mapping


def _detect_table(headers: list[str]) -> tuple[str, float]:
    normalized_headers = {_normalize_header(header) for header in headers}
    best_table = "leads"
    best_score = -1
    for table in SUPPORTED_TABLES:
        aliases = TABLE_ALIASES[table]
        score = 0
        for field_aliases in aliases.values():
            if any(_normalize_header(alias) in normalized_headers for alias in field_aliases):
                score += 1
        if score > best_score:
            best_table = table
            best_score = score
    total_fields = max(1, len(TABLE_ALIASES[best_table]))
    confidence = round(best_score / total_fields, 2)
    return best_table, confidence


def _pick_value(
    row: dict[str, str],
    field_name: str,
    mapping: dict[str, str],
) -> str | None:
    header = mapping.get(field_name)
    if not header:
        return None
    return (row.get(header) or "").strip() or None


def _parse_datetime(raw_value: str | None) -> datetime | None:
    if not raw_value:
        return None
    candidate = raw_value.strip()
    if not candidate:
        return None
    normalized = candidate.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        pass
    for fmt in (
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%Y-%m-%d %H:%M",
        "%Y/%m/%d %H:%M",
        "%d/%m/%Y %H:%M",
    ):
        try:
            return datetime.strptime(candidate, fmt)
        except ValueError:
            continue
    raise ValueError(f"Invalid datetime value: {raw_value}")


def _coerce_lead_status(raw_status: str | None) -> LeadStatus:
    if not raw_status:
        return LeadStatus.NEW
    normalized = raw_status.strip().upper()
    try:
        return LeadStatus(normalized)
    except ValueError:
        return LeadStatus.NEW


def _coerce_project_status(raw_status: str | None) -> str:
    if not raw_status:
        return "Planning"
    candidate = raw_status.strip()
    for known in PROJECT_STATUSES:
        if known.lower() == candidate.lower():
            return known
    raise ValueError(f"Unsupported project status: {raw_status}")


def _coerce_task_status(raw_status: str | None) -> str:
    if not raw_status:
        return "To Do"
    candidate = raw_status.strip()
    for known in TASK_STATUSES:
        if known.lower() == candidate.lower():
            return known
    raise ValueError(f"Unsupported task status: {raw_status}")


def _coerce_task_priority(raw_priority: str | None) -> str:
    if not raw_priority:
        return "Medium"
    candidate = raw_priority.strip()
    for known in TASK_PRIORITIES:
        if known.lower() == candidate.lower():
            return known
    raise ValueError(f"Unsupported task priority: {raw_priority}")


def _validate_row(
    table: str,
    row: dict[str, str],
    mapping: dict[str, str],
) -> dict[str, Any]:
    if table == "leads":
        email = _pick_value(row, "email", mapping)
        if not email:
            raise ValueError("Lead email is required.")
        first_name = _pick_value(row, "first_name", mapping) or "Unknown"
        last_name = _pick_value(row, "last_name", mapping) or ""
        company_name = _pick_value(row, "company_name", mapping) or "Unknown Company"
        return {
            "first_name": first_name,
            "last_name": last_name,
            "email": email,
            "phone": _pick_value(row, "phone", mapping),
            "company_name": company_name,
            "status": _coerce_lead_status(_pick_value(row, "status", mapping)).value,
            "segment": _pick_value(row, "segment", mapping) or "General",
        }

    if table == "tasks":
        title = _pick_value(row, "title", mapping)
        if not title:
            raise ValueError("Task title is required.")
        return {
            "id": _pick_value(row, "id", mapping),
            "title": title,
            "status": _coerce_task_status(_pick_value(row, "status", mapping)),
            "priority": _coerce_task_priority(_pick_value(row, "priority", mapping)),
            "due_date": _parse_datetime(_pick_value(row, "due_date", mapping)),
            "assigned_to": _pick_value(row, "assigned_to", mapping) or "You",
            "lead_id": _pick_value(row, "lead_id", mapping),
        }

    if table == "projects":
        name = _pick_value(row, "name", mapping)
        if not name:
            raise ValueError("Project name is required.")
        return {
            "id": _pick_value(row, "id", mapping),
            "name": name,
            "description": _pick_value(row, "description", mapping),
            "status": _coerce_project_status(_pick_value(row, "status", mapping)),
            "lead_id": _pick_value(row, "lead_id", mapping),
            "due_date": _parse_datetime(_pick_value(row, "due_date", mapping)),
        }

    raise ValueError(f"Unsupported table: {table}")


def preview_csv_import(
    *,
    content: bytes,
    table: str | None = None,
    mapping: dict[str, str] | None = None,
    limit: int = PREVIEW_LIMIT,
) -> dict[str, Any]:
    headers, rows = _parse_csv_rows(content)
    detected_table, confidence = _detect_table(headers)
    selected_table = (table or detected_table).strip().lower()
    if selected_table not in SUPPORTED_TABLES:
        raise HTTPException(
            status_code=HTTP_422_STATUS,
            detail=f"Unsupported table '{selected_table}'.",
        )

    suggested_mapping = _suggest_mapping(selected_table, headers)
    effective_mapping = mapping or suggested_mapping

    preview_rows: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    valid_rows = 0
    invalid_rows = 0

    for index, row in enumerate(rows, start=2):
        try:
            normalized = _validate_row(selected_table, row, effective_mapping)
            valid_rows += 1
            if len(preview_rows) < max(1, min(limit, PREVIEW_LIMIT)):
                if isinstance(normalized.get("due_date"), datetime):
                    normalized["due_date"] = normalized["due_date"].isoformat()
                preview_rows.append(normalized)
        except ValueError as exc:
            invalid_rows += 1
            if len(errors) < PREVIEW_LIMIT:
                errors.append({"row": index, "message": str(exc)})

    return {
        "detected_table": detected_table,
        "selected_table": selected_table,
        "table_confidence": confidence,
        "headers": headers,
        "suggested_mapping": suggested_mapping,
        "effective_mapping": effective_mapping,
        "total_rows": len(rows),
        "valid_rows": valid_rows,
        "invalid_rows": invalid_rows,
        "errors": errors,
        "preview": preview_rows,
    }


def _get_or_create_company(db: Session, company_name: str) -> DBCompany:
    existing = db.query(DBCompany).filter(DBCompany.name == company_name).first()
    if existing:
        return existing
    company = DBCompany(name=company_name, domain=None)
    db.add(company)
    db.flush()
    return company


def _upsert_lead(db: Session, row: dict[str, Any]) -> str:
    email = str(row["email"]).strip()
    existing = db.query(DBLead).filter(DBLead.email == email).first()
    company = _get_or_create_company(db, row["company_name"])
    if existing:
        existing.first_name = row["first_name"]
        existing.last_name = row["last_name"]
        existing.phone = row["phone"]
        existing.status = _coerce_lead_status(row.get("status"))
        existing.segment = row["segment"]
        existing.company_id = company.id
        return "updated"

    lead = DBLead(
        id=email,
        first_name=row["first_name"],
        last_name=row["last_name"],
        email=email,
        phone=row["phone"],
        company_id=company.id,
        status=_coerce_lead_status(row.get("status")),
        segment=row["segment"],
        stage=LeadStage.NEW,
    )
    db.add(lead)
    return "created"


def _upsert_task(db: Session, row: dict[str, Any]) -> str:
    task_id = str(row.get("id") or "").strip() or None
    task = db.query(DBTask).filter(DBTask.id == task_id).first() if task_id else None
    if task:
        task.title = row["title"]
        task.status = row["status"]
        task.priority = row["priority"]
        task.due_date = row["due_date"]
        task.assigned_to = row["assigned_to"]
        task.lead_id = row["lead_id"]
        return "updated"

    new_task = DBTask(
        id=task_id or str(uuid.uuid4()),
        title=row["title"],
        status=row["status"],
        priority=row["priority"],
        due_date=row["due_date"],
        assigned_to=row["assigned_to"],
        lead_id=row["lead_id"],
    )
    db.add(new_task)
    return "created"


def _upsert_project(db: Session, row: dict[str, Any]) -> str:
    project_id = str(row.get("id") or "").strip() or None
    project = db.query(DBProject).filter(DBProject.id == project_id).first() if project_id else None
    if project:
        project.name = row["name"]
        project.description = row["description"]
        project.status = row["status"]
        project.lead_id = row["lead_id"]
        project.due_date = row["due_date"]
        return "updated"

    new_project = DBProject(
        id=project_id or str(uuid.uuid4()),
        name=row["name"],
        description=row["description"],
        status=row["status"],
        lead_id=row["lead_id"],
        due_date=row["due_date"],
    )
    db.add(new_project)
    return "created"


def commit_csv_import(
    *,
    db: Session,
    content: bytes,
    table: str | None = None,
    mapping: dict[str, str] | None = None,
) -> dict[str, Any]:
    preview = preview_csv_import(content=content, table=table, mapping=mapping, limit=10)
    selected_table = str(preview["selected_table"])
    effective_mapping = dict(preview["effective_mapping"])

    _, rows = _parse_csv_rows(content)

    created = 0
    updated = 0
    skipped = 0
    errors: list[dict[str, Any]] = []

    for index, row in enumerate(rows, start=2):
        try:
            normalized = _validate_row(selected_table, row, effective_mapping)
        except ValueError as exc:
            skipped += 1
            if len(errors) < PREVIEW_LIMIT:
                errors.append({"row": index, "message": str(exc)})
            continue

        try:
            if selected_table == "leads":
                result = _upsert_lead(db, normalized)
            elif selected_table == "tasks":
                result = _upsert_task(db, normalized)
            elif selected_table == "projects":
                result = _upsert_project(db, normalized)
            else:
                raise ValueError(f"Unsupported table: {selected_table}")
            if result == "created":
                created += 1
            else:
                updated += 1
        except (SQLAlchemyError, ValueError) as exc:
            logger.warning(
                "Failed to import CSV row.",
                extra={"row": index, "error": str(exc), "table": selected_table},
            )
            skipped += 1
            if len(errors) < PREVIEW_LIMIT:
                errors.append({"row": index, "message": str(exc)})

    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("CSV import commit failed.", extra={"error": str(exc)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to persist CSV import.",
        ) from exc

    return {
        "table": selected_table,
        "processed_rows": len(rows),
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
    }
