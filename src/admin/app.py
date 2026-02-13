from __future__ import annotations

import base64
import csv
import hashlib
import hmac
import json
import os
import secrets
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, time as datetime_time, timedelta
from io import StringIO
from pathlib import Path
from threading import Lock
from typing import Annotated, Any

from fastapi import APIRouter, Depends, FastAPI, File, Form, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, Response
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, or_, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.requests import Request

from ..core.database import DATABASE_URL, Base, SessionLocal, engine, get_db
from ..core.db_migrations import ensure_sqlite_schema_compatibility
from ..core.db_models import (
    DBAccountProfile,
    DBAdminRole,
    DBAdminSession,
    DBAdminSetting,
    DBAdminUser,
    DBAdminUserRole,
    DBAssistantAction,
    DBAssistantRun,
    DBAuditLog,
    DBBillingInvoice,
    DBBillingProfile,
    DBCompany,
    DBIntegrationConfig,
    DBLead,
    DBNotification,
    DBNotificationPreference,
    DBProject,
    DBReportRun,
    DBReportSchedule,
    DBTask,
    DBWebhookConfig,
)
from ..core.logging import configure_logging, get_logger
from ..core.models import Company, Interaction, Lead, LeadStage, LeadStatus
from ..scoring.engine import ScoringEngine
from . import assistant_service as _ast_svc
from . import assistant_store as _ast_store
from .assistant_types import AssistantConfirmRequest, AssistantRunRequest
from .diagnostics_service import (
    get_latest_autofix,
    get_latest_diagnostics,
    run_intelligent_diagnostics,
)
from .import_service import commit_csv_import, preview_csv_import
from .research_service import run_web_research
from .stats_service import compute_core_funnel_stats, list_leads


templates = Jinja2Templates(directory=str(Path(__file__).with_name("templates")))
scoring_engine = ScoringEngine()
logger = get_logger(__name__)


DEFAULT_ADMIN_USERNAME = "admin"
DEFAULT_ADMIN_PASSWORD = "change-me"
DEFAULT_ADMIN_AUTH_MODE = "hybrid"
DEFAULT_ACCESS_TOKEN_TTL_MINUTES = 15
DEFAULT_REFRESH_TOKEN_TTL_DAYS = 7
DEFAULT_AUTH_COOKIE_SECURE = "auto"

ACCESS_TOKEN_COOKIE_NAME = "admin_access_token"
REFRESH_TOKEN_COOKIE_NAME = "admin_refresh_token"
JWT_ALGORITHM = "HS256"

if hasattr(status, "HTTP_422_UNPROCESSABLE_CONTENT"):
    HTTP_422_STATUS = status.HTTP_422_UNPROCESSABLE_CONTENT
else:  # pragma: no cover
    HTTP_422_STATUS = 422

DEFAULT_ADMIN_SETTINGS: dict[str, Any] = {
    "organization_name": "Prospect",
    "locale": "fr-FR",
    "timezone": "Europe/Paris",
    "default_page_size": 25,
    "dashboard_refresh_seconds": 30,
    "support_email": "support@example.com",
    "theme": "system",
    "default_refresh_mode": "polling",
    "notifications": {"email": True, "in_app": True},
}

DEFAULT_INTEGRATION_CATALOG: dict[str, dict[str, Any]] = {
    "duckduckgo": {
        "enabled": True,
        "config": {"region": "us-en", "safe_search": "moderate"},
        "meta": {
            "category": "research",
            "free_tier": "Free (no API key required)",
            "description": "Open web search fallback for advanced research.",
        },
    },
    "perplexity": {
        "enabled": False,
        "config": {
            "api_key_env": "PERPLEXITY_API_KEY",
            "model": "sonar",
            "max_tokens": 550,
        },
        "meta": {
            "category": "research",
            "free_tier": "Free trial / free credits available depending on account",
            "description": "AI-powered web research with cited sources.",
        },
    },
    "firecrawl": {
        "enabled": False,
        "config": {
            "api_key_env": "FIRECRAWL_API_KEY",
            "country": "us",
            "lang": "en",
            "formats": ["markdown"],
        },
        "meta": {
            "category": "research",
            "free_tier": "Free tier available",
            "description": "Structured crawl and extraction from live web pages.",
        },
    },
    "slack": {
        "enabled": False,
        "config": {"webhook": ""},
        "meta": {
            "category": "automation",
            "free_tier": "Free plan available",
            "description": "Send admin alerts and pipeline events to Slack.",
        },
    },
    "zapier": {
        "enabled": False,
        "config": {"zap_id": ""},
        "meta": {
            "category": "automation",
            "free_tier": "Free plan available",
            "description": "Automate admin workflows with no-code triggers.",
        },
    },
}

PROJECT_STATUSES = {"Planning", "In Progress", "On Hold", "Completed", "Cancelled"}
TASK_STATUSES = {"To Do", "In Progress", "Done"}
TASK_PRIORITIES = {"Low", "Medium", "High", "Critical"}
USER_STATUSES = {"active", "invited", "disabled"}
THEME_OPTIONS = {"light", "dark", "system"}
REFRESH_MODES = {"manual", "polling"}
ROLE_LABELS = {
    "admin": "Administrateur",
    "manager": "Manager",
    "sales": "Commercial",
}
NOTIFICATION_CHANNELS = {"email", "in_app"}
NOTIFICATION_EVENT_KEYS = {
    "lead_created",
    "lead_updated",
    "task_created",
    "task_completed",
    "project_created",
    "report_ready",
    "report_failed",
    "billing_invoice_due",
    "assistant_run_completed",
}
REPORT_FREQUENCIES = {"daily", "weekly", "monthly"}
REPORT_FORMATS = {"pdf", "csv"}


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._lock = Lock()
        self._hits: dict[str, list[float]] = {}

    def allow(self, key: str, limit: int, window_seconds: int) -> bool:
        now = time.time()
        window_start = now - window_seconds
        with self._lock:
            entries = self._hits.get(key, [])
            entries = [stamp for stamp in entries if stamp >= window_start]
            if len(entries) >= limit:
                self._hits[key] = entries
                return False
            entries.append(now)
            self._hits[key] = entries
            return True


class InMemoryRequestMetrics:
    _DYNAMIC_SEGMENT_RE = None  # Lazy-compiled regex

    def __init__(self) -> None:
        self._lock = Lock()
        self._total_requests = 0
        self._total_errors = 0
        self._all_latencies_ms: list[float] = []
        self._by_endpoint: dict[str, dict[str, Any]] = {}
        self._max_samples_per_endpoint = 512
        self._max_global_samples = 4096
        self._max_endpoints = 1024

    @classmethod
    def _normalize_path(cls, path: str) -> str:
        """Replace dynamic path segments (UUIDs, numeric IDs) with placeholders."""
        import re
        if cls._DYNAMIC_SEGMENT_RE is None:
            cls._DYNAMIC_SEGMENT_RE = re.compile(
                r"/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
                r"|/\d+",
                re.IGNORECASE,
            )
        return cls._DYNAMIC_SEGMENT_RE.sub("/:id", path)

    def observe(self, *, path: str, status_code: int, latency_ms: float) -> None:
        endpoint = self._normalize_path(path) if path else "unknown"
        is_error = status_code >= 400
        with self._lock:
            self._total_requests += 1
            if is_error:
                self._total_errors += 1

            self._all_latencies_ms.append(latency_ms)
            if len(self._all_latencies_ms) > self._max_global_samples:
                self._all_latencies_ms = self._all_latencies_ms[-self._max_global_samples :]

            bucket = self._by_endpoint.get(endpoint)
            if not bucket:
                # Evict least-used endpoint if at capacity
                if len(self._by_endpoint) >= self._max_endpoints:
                    victim = min(self._by_endpoint, key=lambda k: self._by_endpoint[k]["request_count"])
                    del self._by_endpoint[victim]
                bucket = {
                    "request_count": 0,
                    "error_count": 0,
                    "latencies_ms": [],
                }
                self._by_endpoint[endpoint] = bucket

            bucket["request_count"] += 1
            if is_error:
                bucket["error_count"] += 1
            bucket["latencies_ms"].append(latency_ms)
            if len(bucket["latencies_ms"]) > self._max_samples_per_endpoint:
                bucket["latencies_ms"] = bucket["latencies_ms"][-self._max_samples_per_endpoint :]

    @staticmethod
    def _p95(values: list[float]) -> float:
        if not values:
            return 0.0
        ordered = sorted(values)
        index = max(0, min(len(ordered) - 1, int(round(0.95 * (len(ordered) - 1)))))
        return round(float(ordered[index]), 2)

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            total = self._total_requests
            errors = self._total_errors
            global_latencies = list(self._all_latencies_ms)
            endpoints_payload: list[dict[str, Any]] = []
            for path, bucket in self._by_endpoint.items():
                request_count = int(bucket["request_count"])
                error_count = int(bucket["error_count"])
                latencies = list(bucket["latencies_ms"])
                endpoints_payload.append(
                    {
                        "path": path,
                        "request_count": request_count,
                        "error_rate": round((error_count / request_count) * 100, 2) if request_count else 0.0,
                        "p95_ms": self._p95(latencies),
                    }
                )

        endpoints_payload.sort(key=lambda item: item["request_count"], reverse=True)
        return {
            "request_count": total,
            "error_rate": round((errors / total) * 100, 2) if total else 0.0,
            "p95_ms": self._p95(global_latencies),
            "endpoints": endpoints_payload[:50],
        }


rate_limiter = InMemoryRateLimiter()
request_metrics = InMemoryRequestMetrics()


class AdminLeadCreateRequest(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    phone: str | None = None
    company_name: str
    status: str | None = None
    segment: str | None = None


class AdminBulkDeleteRequest(BaseModel):
    ids: list[str] = Field(default_factory=list)
    segment: str | None = None


class AdminTaskCreateRequest(BaseModel):
    title: str
    status: str | None = None
    priority: str | None = None
    due_date: str | None = None
    assigned_to: str | None = None
    lead_id: str | None = None


class AdminTaskUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1)
    status: str | None = None
    priority: str | None = None
    due_date: str | None = None
    assigned_to: str | None = None
    lead_id: str | None = None


class AdminProjectCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None
    status: str | None = None
    lead_id: str | None = None
    due_date: str | None = None


class AdminProjectUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    description: str | None = None
    status: str | None = None
    lead_id: str | None = None
    due_date: str | None = None


class AdminSettingsPayload(BaseModel):
    organization_name: str
    locale: str
    timezone: str
    default_page_size: int
    dashboard_refresh_seconds: int
    support_email: EmailStr
    theme: str = "system"
    default_refresh_mode: str = "polling"
    notifications: dict[str, bool] = Field(
        default_factory=lambda: {"email": True, "in_app": True}
    )


class AdminSettingsUpdatePayload(BaseModel):
    organization_name: str | None = None
    locale: str | None = None
    timezone: str | None = None
    default_page_size: int | None = None
    dashboard_refresh_seconds: int | None = None
    support_email: EmailStr | None = None
    theme: str | None = None
    default_refresh_mode: str | None = None
    notifications: dict[str, bool] | None = None


class AdminSearchResultItem(BaseModel):
    type: str
    id: str
    title: str
    subtitle: str
    href: str


class AdminHelpPayload(BaseModel):
    support_email: EmailStr
    faqs: list[dict[str, str]]
    links: list[dict[str, str]]


class AdminDiagnosticsRunRequest(BaseModel):
    auto_fix: bool = False


class AdminUserInviteRequest(BaseModel):
    email: EmailStr
    display_name: str | None = None
    roles: list[str] = Field(default_factory=lambda: ["sales"])


class AdminUserUpdateRequest(BaseModel):
    display_name: str | None = None
    status: str | None = None
    roles: list[str] | None = None


class AdminWebhookCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    url: str = Field(min_length=8)
    events: list[str] = Field(default_factory=list)
    enabled: bool = True


class AdminIntegrationItemPayload(BaseModel):
    enabled: bool = False
    config: dict[str, Any] = Field(default_factory=dict)


class AdminIntegrationsPayload(BaseModel):
    providers: dict[str, AdminIntegrationItemPayload] = Field(default_factory=dict)


class AdminAccountPayload(BaseModel):
    full_name: str = ""
    email: EmailStr
    title: str = ""
    locale: str = "fr-FR"
    timezone: str = "Europe/Paris"
    preferences: dict[str, Any] = Field(default_factory=dict)


class AdminBillingProfilePayload(BaseModel):
    plan_name: str = "Business"
    billing_cycle: str = "monthly"
    status: str = "active"
    currency: str = "EUR"
    amount_cents: int = Field(default=9900, ge=0)
    company_name: str = ""
    billing_email: EmailStr
    vat_number: str = ""
    address_line: str = ""
    city: str = ""
    postal_code: str = ""
    country: str = ""
    notes: str = ""


class AdminBillingInvoiceCreateRequest(BaseModel):
    invoice_number: str = Field(min_length=3)
    period_start: str | None = None
    period_end: str | None = None
    due_at: str | None = None
    status: str = "issued"
    currency: str = "EUR"
    amount_cents: int = Field(default=0, ge=0)
    notes: str | None = None


class AdminNotificationCreateRequest(BaseModel):
    event_key: str = Field(min_length=3)
    title: str = Field(min_length=3)
    message: str = Field(min_length=3)
    channel: str = "in_app"
    entity_type: str | None = None
    entity_id: str | None = None
    link_href: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class AdminNotificationMarkReadRequest(BaseModel):
    ids: list[str] = Field(default_factory=list)


class AdminNotificationPreferencesUpdatePayload(BaseModel):
    channels: dict[str, dict[str, bool]] = Field(default_factory=dict)


class AdminReportScheduleCreateRequest(BaseModel):
    name: str = Field(min_length=3)
    frequency: str = "weekly"
    timezone: str = "Europe/Paris"
    hour_local: int = Field(default=9, ge=0, le=23)
    minute_local: int = Field(default=0, ge=0, le=59)
    format: str = "pdf"
    recipients: list[EmailStr] = Field(default_factory=list)
    filters: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class AdminReportScheduleUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=3)
    frequency: str | None = None
    timezone: str | None = None
    hour_local: int | None = Field(default=None, ge=0, le=23)
    minute_local: int | None = Field(default=None, ge=0, le=59)
    format: str | None = None
    recipients: list[EmailStr] | None = None
    filters: dict[str, Any] | None = None
    enabled: bool | None = None


class ResearchRequest(BaseModel):
    query: str
    limit: int = 5
    provider: str = "perplexity"  # perplexity, duckduckgo, firecrawl


class AdminAuthLoginRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


def _is_production() -> bool:
    env_name = (
        os.getenv("APP_ENV")
        or os.getenv("ENV")
        or os.getenv("ENVIRONMENT")
        or "development"
    )
    return env_name.strip().lower() in {"prod", "production"}


def _validate_admin_credentials_security() -> None:
    if not _is_production():
        return

    username = os.getenv("ADMIN_USERNAME", DEFAULT_ADMIN_USERNAME)
    password = os.getenv("ADMIN_PASSWORD", DEFAULT_ADMIN_PASSWORD)
    insecure_username = username == DEFAULT_ADMIN_USERNAME
    insecure_password = password == DEFAULT_ADMIN_PASSWORD
    if insecure_username or insecure_password:
        raise RuntimeError(
            "Refusing startup in production with default admin credentials. "
            "Set ADMIN_USERNAME and ADMIN_PASSWORD."
        )

    if _get_admin_auth_mode() in {"jwt", "hybrid"}:
        jwt_secret = _get_jwt_secret()
        if jwt_secret == _default_jwt_secret():
            raise RuntimeError(
                "Refusing startup in production with default JWT secret. "
                "Set JWT_SECRET."
            )


def _parse_cors_origins() -> list[str]:
    raw = os.getenv(
        "ADMIN_CORS_ALLOW_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001",
    )
    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    return origins or [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ]


def _init_admin_db() -> None:
    Base.metadata.create_all(bind=engine)
    if DATABASE_URL.startswith("sqlite"):
        ensure_sqlite_schema_compatibility(engine)


def _get_admin_auth_mode() -> str:
    mode = os.getenv("ADMIN_AUTH_MODE", DEFAULT_ADMIN_AUTH_MODE).strip().lower()
    if mode in {"jwt", "hybrid", "basic"}:
        return mode
    return DEFAULT_ADMIN_AUTH_MODE


def _default_jwt_secret() -> str:
    return "dev-jwt-secret-change-me"


def _get_jwt_secret() -> str:
    return os.getenv("JWT_SECRET", _default_jwt_secret())


def _get_access_token_ttl_minutes() -> int:
    raw = os.getenv("JWT_ACCESS_TTL_MINUTES", str(DEFAULT_ACCESS_TOKEN_TTL_MINUTES))
    try:
        return max(1, min(int(raw), 1440))
    except ValueError:
        return DEFAULT_ACCESS_TOKEN_TTL_MINUTES


def _get_refresh_token_ttl_days() -> int:
    raw = os.getenv("JWT_REFRESH_TTL_DAYS", str(DEFAULT_REFRESH_TOKEN_TTL_DAYS))
    try:
        return max(1, min(int(raw), 30))
    except ValueError:
        return DEFAULT_REFRESH_TOKEN_TTL_DAYS


def _get_expected_admin_credentials() -> tuple[str, str]:
    expected_username = os.getenv("ADMIN_USERNAME", DEFAULT_ADMIN_USERNAME)
    expected_password = os.getenv("ADMIN_PASSWORD", DEFAULT_ADMIN_PASSWORD)
    return expected_username, expected_password


def _is_valid_admin_credentials(username: str, password: str) -> bool:
    expected_username, expected_password = _get_expected_admin_credentials()
    return (
        hmac.compare_digest(username, expected_username)
        and hmac.compare_digest(password, expected_password)
    )


def _base64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _base64url_decode(raw: str) -> bytes:
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(raw + padding)


def _encode_jwt(payload: dict[str, Any]) -> str:
    header = {"alg": JWT_ALGORITHM, "typ": "JWT"}
    signing_input = (
        f"{_base64url_encode(json.dumps(header, separators=(',', ':')).encode('utf-8'))}."
        f"{_base64url_encode(json.dumps(payload, separators=(',', ':')).encode('utf-8'))}"
    )
    signature = hmac.new(
        _get_jwt_secret().encode("utf-8"),
        signing_input.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return f"{signing_input}.{_base64url_encode(signature)}"


def _decode_jwt(token: str) -> dict[str, Any]:
    try:
        header_b64, payload_b64, signature_b64 = token.split(".")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token format.") from exc

    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    expected_signature = hmac.new(
        _get_jwt_secret().encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()
    provided_signature = _base64url_decode(signature_b64)
    if not hmac.compare_digest(expected_signature, provided_signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token signature.")

    try:
        payload = json.loads(_base64url_decode(payload_b64).decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload.") from exc

    exp = payload.get("exp")
    if not isinstance(exp, int) or exp <= int(time.time()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Access token expired.")
    return payload


def _create_access_token(*, username: str, session_id: str) -> tuple[str, datetime]:
    expires_at = datetime.utcnow() + timedelta(minutes=_get_access_token_ttl_minutes())
    payload = {
        "sub": username,
        "sid": session_id,
        "iat": int(time.time()),
        "exp": int(expires_at.timestamp()),
    }
    return _encode_jwt(payload), expires_at


def _extract_authorization_value(request: Request, prefix: str) -> str | None:
    raw_auth = request.headers.get("authorization")
    if not raw_auth:
        return None
    expected_prefix = f"{prefix} "
    if not raw_auth.lower().startswith(expected_prefix.lower()):
        return None
    value = raw_auth[len(expected_prefix) :].strip()
    return value or None


def _extract_basic_credentials(request: Request) -> tuple[str, str] | None:
    encoded = _extract_authorization_value(request, "Basic")
    if not encoded:
        return None
    try:
        decoded = base64.b64decode(encoded).decode("utf-8")
        username, password = decoded.split(":", 1)
        return username, password
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed basic authorization header.",
            headers={"WWW-Authenticate": "Basic"},
        )


def _extract_access_payload(request: Request) -> dict[str, Any] | None:
    bearer = _extract_authorization_value(request, "Bearer")
    if bearer:
        return _decode_jwt(bearer)
    cookie_token = request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)
    if cookie_token:
        return _decode_jwt(cookie_token)
    return None


def _refresh_token_hash(token: str) -> str:
    secret = _get_jwt_secret()
    return hashlib.sha256(f"{secret}:{token}".encode("utf-8")).hexdigest()


def _client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _should_use_secure_cookies() -> bool:
    raw = os.getenv("AUTH_COOKIE_SECURE", DEFAULT_AUTH_COOKIE_SECURE).strip().lower()
    if raw in {"1", "true", "yes"}:
        return True
    if raw in {"0", "false", "no"}:
        return False
    return _is_production()


def _set_auth_cookies(
    response: Response,
    *,
    access_token: str,
    refresh_token: str,
    access_expires_at: datetime,
    refresh_expires_at: datetime,
) -> None:
    secure_cookie = _should_use_secure_cookies()
    access_max_age = max(1, int((access_expires_at - datetime.utcnow()).total_seconds()))
    refresh_max_age = max(1, int((refresh_expires_at - datetime.utcnow()).total_seconds()))
    response.set_cookie(
        ACCESS_TOKEN_COOKIE_NAME,
        access_token,
        httponly=True,
        secure=secure_cookie,
        samesite="lax",
        max_age=access_max_age,
        path="/",
    )
    response.set_cookie(
        REFRESH_TOKEN_COOKIE_NAME,
        refresh_token,
        httponly=True,
        secure=secure_cookie,
        samesite="lax",
        max_age=refresh_max_age,
        path="/",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_TOKEN_COOKIE_NAME, path="/")
    response.delete_cookie(REFRESH_TOKEN_COOKIE_NAME, path="/")


def _create_refresh_session(
    db: Session,
    *,
    username: str,
    refresh_token: str,
    request: Request,
    rotated_from_session_id: str | None = None,
) -> DBAdminSession:
    now = datetime.utcnow()
    session = DBAdminSession(
        id=str(uuid.uuid4()),
        username=username,
        refresh_token_hash=_refresh_token_hash(refresh_token),
        rotated_from_session_id=rotated_from_session_id,
        user_agent=request.headers.get("user-agent"),
        ip_address=_client_ip(request),
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(days=_get_refresh_token_ttl_days()),
        revoked_at=None,
    )
    db.add(session)
    db.flush()
    return session


def require_admin(request: Request, db: Session = Depends(get_db)) -> str:
    auth_mode = _get_admin_auth_mode()

    payload: dict[str, Any] | None = None
    try:
        payload = _extract_access_payload(request)
    except HTTPException as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=exc.detail,
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    if payload:
        username = str(payload.get("sub") or "").strip()
        session_id = str(payload.get("sid") or "").strip()
        if not username or not session_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid access token payload.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        session = db.query(DBAdminSession).filter(DBAdminSession.id == session_id).first()
        if not session or session.revoked_at is not None or session.expires_at <= datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session revoked or expired.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        # Only persist last_seen_at if stale by 2+ minutes to avoid write-per-request
        _now = datetime.utcnow()
        if not session.last_seen_at or (_now - session.last_seen_at).total_seconds() > 120:
            session.last_seen_at = _now
            db.commit()
        return username

    if auth_mode in {"basic", "hybrid"}:
        credentials = _extract_basic_credentials(request)
        if credentials:
            username, password = credentials
            if _is_valid_admin_credentials(username, password):
                return username
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid admin credentials.",
                headers={"WWW-Authenticate": "Basic"},
            )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_rate_limit(request: Request) -> None:
    try:
        limit = int(os.getenv("ADMIN_RATE_LIMIT_PER_MINUTE", "120"))
    except ValueError:
        limit = 120
    try:
        window_seconds = int(os.getenv("ADMIN_RATE_LIMIT_WINDOW_SECONDS", "60"))
    except ValueError:
        window_seconds = 60

    client_host = request.client.host if request.client else "unknown"
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        client_host = forwarded_for.split(",")[0].strip()
    bucket_key = f"{client_host}:{request.url.path}"

    allowed = rate_limiter.allow(bucket_key, limit=limit, window_seconds=window_seconds)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please retry later.",
        )


def _parse_datetime_field(raw_value: str | None, field_name: str) -> datetime | None:
    if raw_value is None:
        return None
    cleaned = raw_value.strip()
    if not cleaned:
        return None
    try:
        normalized = cleaned.replace("Z", "+00:00")
        return datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise HTTPException(
            status_code=HTTP_422_STATUS,
            detail=f"Invalid datetime for {field_name}: {raw_value}",
        ) from exc


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
    raise HTTPException(
        status_code=HTTP_422_STATUS,
        detail=f"Unsupported project status: {raw_status}",
    )


def _coerce_task_status(raw_status: str | None) -> str:
    if not raw_status:
        return "To Do"
    candidate = raw_status.strip()
    for known in TASK_STATUSES:
        if known.lower() == candidate.lower():
            return known
    raise HTTPException(
        status_code=HTTP_422_STATUS,
        detail=f"Unsupported task status: {raw_status}",
    )


def _coerce_task_priority(raw_priority: str | None) -> str:
    if not raw_priority:
        return "Medium"
    candidate = raw_priority.strip()
    for known in TASK_PRIORITIES:
        if known.lower() == candidate.lower():
            return known
    raise HTTPException(
        status_code=HTTP_422_STATUS,
        detail=f"Unsupported task priority: {raw_priority}",
    )


def _coerce_theme(raw_theme: str | None) -> str:
    candidate = (raw_theme or "system").strip().lower()
    if candidate in THEME_OPTIONS:
        return candidate
    return "system"


def _coerce_refresh_mode(raw_mode: str | None) -> str:
    candidate = (raw_mode or "polling").strip().lower()
    if candidate in REFRESH_MODES:
        return candidate
    return "polling"


def _normalize_notifications(raw_value: Any) -> dict[str, bool]:
    defaults = dict(DEFAULT_ADMIN_SETTINGS["notifications"])
    if isinstance(raw_value, dict):
        for key in ("email", "in_app"):
            if key in raw_value:
                defaults[key] = bool(raw_value[key])
    return defaults


def _coerce_user_status(raw_status: str | None) -> str:
    candidate = (raw_status or "active").strip().lower()
    if candidate in USER_STATUSES:
        return candidate
    raise HTTPException(
        status_code=HTTP_422_STATUS,
        detail=f"Unsupported user status: {raw_status}",
    )


def _coerce_notification_channel(raw_channel: str | None) -> str:
    candidate = (raw_channel or "in_app").strip().lower()
    if candidate in NOTIFICATION_CHANNELS:
        return candidate
    raise HTTPException(
        status_code=HTTP_422_STATUS,
        detail=f"Unsupported notification channel: {raw_channel}",
    )


def _coerce_notification_event(raw_event: str | None) -> str:
    candidate = (raw_event or "").strip().lower()
    if candidate in NOTIFICATION_EVENT_KEYS:
        return candidate
    raise HTTPException(
        status_code=HTTP_422_STATUS,
        detail=f"Unsupported notification event key: {raw_event}",
    )


def _coerce_report_frequency(raw_frequency: str | None) -> str:
    candidate = (raw_frequency or "weekly").strip().lower()
    if candidate in REPORT_FREQUENCIES:
        return candidate
    raise HTTPException(
        status_code=HTTP_422_STATUS,
        detail=f"Unsupported report frequency: {raw_frequency}",
    )


def _coerce_report_format(raw_format: str | None) -> str:
    candidate = (raw_format or "pdf").strip().lower()
    if candidate in REPORT_FORMATS:
        return candidate
    raise HTTPException(
        status_code=HTTP_422_STATUS,
        detail=f"Unsupported report format: {raw_format}",
    )


def _compute_next_run_at(
    *,
    frequency: str,
    hour_local: int,
    minute_local: int,
    reference: datetime | None = None,
) -> datetime:
    now = reference or datetime.now()
    next_run = now.replace(hour=hour_local, minute=minute_local, second=0, microsecond=0)
    if next_run <= now:
        if frequency == "daily":
            next_run = next_run + timedelta(days=1)
        elif frequency == "weekly":
            next_run = next_run + timedelta(days=7)
        else:
            next_run = next_run + timedelta(days=30)
    return next_run


def _ensure_default_roles(db: Session) -> None:
    changed = False
    for role_key, role_label in ROLE_LABELS.items():
        existing = db.query(DBAdminRole).filter(DBAdminRole.key == role_key).first()
        if existing:
            continue
        db.add(DBAdminRole(key=role_key, label=role_label))
        changed = True
    if changed:
        db.commit()


def _serialize_role(role: DBAdminRole) -> dict[str, Any]:
    return {
        "id": role.id,
        "key": role.key,
        "label": role.label,
    }


def _serialize_user(user: DBAdminUser) -> dict[str, Any]:
    role_keys = sorted(
        {
            link.role.key
            for link in user.role_links
            if link.role is not None and getattr(link.role, "key", None)
        }
    )
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "status": user.status,
        "roles": role_keys,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
    }


def _serialize_webhook(webhook: DBWebhookConfig) -> dict[str, Any]:
    return {
        "id": webhook.id,
        "name": webhook.name,
        "url": webhook.url,
        "events": webhook.events or [],
        "enabled": bool(webhook.enabled),
        "created_at": webhook.created_at.isoformat() if webhook.created_at else None,
        "updated_at": webhook.updated_at.isoformat() if webhook.updated_at else None,
    }


def _serialize_account_profile(profile: DBAccountProfile) -> dict[str, Any]:
    return {
        "full_name": profile.full_name or "",
        "email": profile.email or DEFAULT_ADMIN_SETTINGS["support_email"],
        "title": profile.title or "",
        "locale": profile.locale or DEFAULT_ADMIN_SETTINGS["locale"],
        "timezone": profile.timezone or DEFAULT_ADMIN_SETTINGS["timezone"],
        "preferences": profile.preferences_json or {},
        "updated_at": profile.updated_at.isoformat() if profile.updated_at else None,
    }


def _serialize_billing_profile(profile: DBBillingProfile) -> dict[str, Any]:
    return {
        "plan_name": profile.plan_name,
        "billing_cycle": profile.billing_cycle,
        "status": profile.status,
        "currency": profile.currency,
        "amount_cents": int(profile.amount_cents or 0),
        "company_name": profile.company_name or "",
        "billing_email": profile.billing_email or DEFAULT_ADMIN_SETTINGS["support_email"],
        "vat_number": profile.vat_number or "",
        "address_line": profile.address_line or "",
        "city": profile.city or "",
        "postal_code": profile.postal_code or "",
        "country": profile.country or "",
        "notes": profile.notes or "",
        "updated_at": profile.updated_at.isoformat() if profile.updated_at else None,
    }


def _serialize_billing_invoice(invoice: DBBillingInvoice) -> dict[str, Any]:
    return {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "period_start": invoice.period_start.isoformat() if invoice.period_start else None,
        "period_end": invoice.period_end.isoformat() if invoice.period_end else None,
        "issued_at": invoice.issued_at.isoformat() if invoice.issued_at else None,
        "due_at": invoice.due_at.isoformat() if invoice.due_at else None,
        "status": invoice.status,
        "currency": invoice.currency,
        "amount_cents": int(invoice.amount_cents or 0),
        "notes": invoice.notes or "",
        "created_at": invoice.created_at.isoformat() if invoice.created_at else None,
    }


def _serialize_notification(notification: DBNotification) -> dict[str, Any]:
    return {
        "id": notification.id,
        "event_key": notification.event_key,
        "title": notification.title,
        "message": notification.message,
        "channel": notification.channel,
        "entity_type": notification.entity_type,
        "entity_id": notification.entity_id,
        "link_href": notification.link_href,
        "is_read": bool(notification.is_read),
        "sent_at": notification.sent_at.isoformat() if notification.sent_at else None,
        "metadata": notification.metadata_json or {},
        "created_at": notification.created_at.isoformat() if notification.created_at else None,
    }


def _serialize_report_schedule(schedule: DBReportSchedule) -> dict[str, Any]:
    return {
        "id": schedule.id,
        "name": schedule.name,
        "frequency": schedule.frequency,
        "timezone": schedule.timezone,
        "hour_local": int(schedule.hour_local),
        "minute_local": int(schedule.minute_local),
        "format": schedule.format,
        "recipients": schedule.recipients_json or [],
        "filters": schedule.filters_json or {},
        "enabled": bool(schedule.enabled),
        "last_run_at": schedule.last_run_at.isoformat() if schedule.last_run_at else None,
        "next_run_at": schedule.next_run_at.isoformat() if schedule.next_run_at else None,
        "created_at": schedule.created_at.isoformat() if schedule.created_at else None,
        "updated_at": schedule.updated_at.isoformat() if schedule.updated_at else None,
    }


def _serialize_report_run(run: DBReportRun) -> dict[str, Any]:
    return {
        "id": run.id,
        "schedule_id": run.schedule_id,
        "status": run.status,
        "output_format": run.output_format,
        "recipient_count": int(run.recipient_count or 0),
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "message": run.message or "",
        "created_at": run.created_at.isoformat() if run.created_at else None,
    }


def _audit_log(
    db: Session,
    *,
    actor: str,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    entry = DBAuditLog(
        id=str(uuid.uuid4()),
        actor=actor,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata_json=metadata or {},
    )
    db.add(entry)
    db.commit()


def _upsert_user_roles(db: Session, user: DBAdminUser, role_keys: list[str]) -> None:
    normalized = {key.strip().lower() for key in role_keys if key and key.strip()}
    if not normalized:
        normalized = {"sales"}

    known_roles = (
        db.query(DBAdminRole)
        .filter(DBAdminRole.key.in_(sorted(normalized)))
        .all()
    )
    known_keys = {role.key for role in known_roles}
    missing = sorted(normalized - known_keys)
    if missing:
        raise HTTPException(
            status_code=HTTP_422_STATUS,
            detail=f"Unknown roles: {', '.join(missing)}",
        )

    db.query(DBAdminUserRole).filter(DBAdminUserRole.user_id == user.id).delete()
    for role in known_roles:
        db.add(DBAdminUserRole(user_id=user.id, role_id=role.id))


def _db_to_lead(db_lead: DBLead) -> Lead:
    company = Company(
        name=db_lead.company.name if db_lead.company else "Unknown",
        domain=db_lead.company.domain if db_lead.company else None,
        industry=db_lead.company.industry if db_lead.company else None,
        size_range=db_lead.company.size_range if db_lead.company else None,
        revenue_range=db_lead.company.revenue_range if db_lead.company else None,
        linkedin_url=db_lead.company.linkedin_url if db_lead.company else None,
        location=db_lead.company.location if db_lead.company else None,
        tech_stack=db_lead.company.tech_stack if db_lead.company else [],
        description=db_lead.company.description if db_lead.company else None,
    )

    interactions = [
        Interaction(
            id=f"{db_lead.id}-{interaction.id}",
            type=interaction.type,
            timestamp=interaction.timestamp,
            details=interaction.details or {},
        )
        for interaction in db_lead.interactions
    ]

    return Lead(
        id=db_lead.id,
        first_name=db_lead.first_name or "Unknown",
        last_name=db_lead.last_name or "",
        email=db_lead.email,
        title=db_lead.title,
        phone=db_lead.phone,
        linkedin_url=db_lead.linkedin_url,
        company=company,
        status=db_lead.status,
        segment=db_lead.segment,
        interactions=interactions,
        details=db_lead.details or {},
        tags=db_lead.tags or [],
        created_at=db_lead.created_at,
        updated_at=db_lead.updated_at,
    )


def _serialize_task(task: DBTask) -> dict[str, Any]:
    return {
        "id": task.id,
        "title": task.title,
        "status": task.status,
        "priority": task.priority,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "assigned_to": task.assigned_to,
        "lead_id": task.lead_id,
        "created_at": task.created_at.isoformat() if task.created_at else None,
    }


def _serialize_project(project: DBProject) -> dict[str, Any]:
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "status": project.status,
        "lead_id": project.lead_id,
        "due_date": project.due_date.isoformat() if project.due_date else None,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "updated_at": project.updated_at.isoformat() if project.updated_at else None,
    }


def _create_lead_payload(db: Session, payload: AdminLeadCreateRequest) -> dict[str, Any]:
    existing = db.query(DBLead).filter(DBLead.email == str(payload.email)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Lead already exists for email {payload.email}.",
        )

    company = (
        db.query(DBCompany)
        .filter(DBCompany.name == payload.company_name.strip())
        .first()
    )
    if not company:
        company = DBCompany(name=payload.company_name.strip(), domain=None)
        db.add(company)
        db.flush()

    db_lead = DBLead(
        id=str(payload.email),
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        email=str(payload.email),
        phone=payload.phone.strip() if payload.phone else None,
        company_id=company.id,
        status=_coerce_lead_status(payload.status),
        segment=(payload.segment or "General").strip(),
        stage=LeadStage.NEW,
    )
    db.add(db_lead)
    try:
        db.commit()
        db.refresh(db_lead)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to create lead from admin API.", extra={"error": str(exc)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create lead.",
        ) from exc

    return {
        "id": db_lead.id,
        "email": db_lead.email,
        "first_name": db_lead.first_name,
        "last_name": db_lead.last_name,
        "status": db_lead.status.value if hasattr(db_lead.status, "value") else str(db_lead.status),
        "segment": db_lead.segment,
        "company_name": company.name,
        "created_at": db_lead.created_at.isoformat() if db_lead.created_at else None,
    }


def _delete_lead_payload(db: Session, lead_id: str) -> dict[str, Any]:
    lead = db.query(DBLead).filter(DBLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")

    db.delete(lead)
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to delete lead.", extra={"error": str(exc), "lead_id": lead_id})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete lead.",
        ) from exc
    return {"deleted": True, "id": lead_id}


def _bulk_delete_leads_payload(db: Session, lead_ids: list[str]) -> dict[str, Any]:
    deleted_count = 0
    try:
        query = db.query(DBLead).filter(DBLead.id.in_(lead_ids))
        deleted_count = query.delete(synchronize_session=False)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to bulk delete leads.", extra={"error": str(exc), "count": len(lead_ids)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to bulk delete leads.",
        ) from exc
    return {"deleted": True, "count": deleted_count}


def _create_task_payload(db: Session, payload: AdminTaskCreateRequest) -> dict[str, Any]:
    task = DBTask(
        id=str(uuid.uuid4()),
        title=payload.title.strip(),
        status=_coerce_task_status(payload.status),
        priority=_coerce_task_priority(payload.priority),
        due_date=_parse_datetime_field(payload.due_date, "due_date"),
        assigned_to=(payload.assigned_to or "You").strip(),
        lead_id=payload.lead_id,
    )
    db.add(task)
    try:
        db.commit()
        db.refresh(task)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to create task.", extra={"error": str(exc)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create task.",
        ) from exc
    return _serialize_task(task)


def _update_task_payload(
    db: Session,
    task_id: str,
    payload: AdminTaskUpdateRequest,
) -> dict[str, Any]:
    task = db.query(DBTask).filter(DBTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")

    update_data = payload.model_dump(exclude_unset=True)
    if "title" in update_data and payload.title is not None:
        task.title = payload.title.strip()
    if "status" in update_data:
        task.status = _coerce_task_status(payload.status)
    if "priority" in update_data:
        task.priority = _coerce_task_priority(payload.priority)
    if "due_date" in update_data:
        task.due_date = _parse_datetime_field(payload.due_date, "due_date")
    if "assigned_to" in update_data:
        task.assigned_to = (payload.assigned_to or "You").strip()
    if "lead_id" in update_data:
        task.lead_id = payload.lead_id

    try:
        db.commit()
        db.refresh(task)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to update task.", extra={"error": str(exc), "task_id": task_id})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update task.",
        ) from exc
    return _serialize_task(task)


def _delete_task_payload(db: Session, task_id: str) -> dict[str, Any]:
    task = db.query(DBTask).filter(DBTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")

    db.delete(task)
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to delete task.", extra={"error": str(exc), "task_id": task_id})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete task.",
        ) from exc
    return {"deleted": True, "id": task_id}


def _create_project_payload(db: Session, payload: AdminProjectCreateRequest) -> dict[str, Any]:
    project = DBProject(
        id=str(uuid.uuid4()),
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        status=_coerce_project_status(payload.status),
        lead_id=payload.lead_id,
        due_date=_parse_datetime_field(payload.due_date, "due_date"),
    )
    db.add(project)
    try:
        db.commit()
        db.refresh(project)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to create project.", extra={"error": str(exc)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create project.",
        ) from exc
    return _serialize_project(project)


def _update_project_payload(
    db: Session,
    project_id: str,
    payload: AdminProjectUpdateRequest,
) -> dict[str, Any]:
    project = db.query(DBProject).filter(DBProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    update_data = payload.model_dump(exclude_unset=True)
    if "name" in update_data and payload.name is not None:
        project.name = payload.name.strip()
    if "description" in update_data:
        project.description = payload.description.strip() if payload.description else None
    if "status" in update_data:
        project.status = _coerce_project_status(payload.status)
    if "lead_id" in update_data:
        project.lead_id = payload.lead_id
    if "due_date" in update_data:
        project.due_date = _parse_datetime_field(payload.due_date, "due_date")

    try:
        db.commit()
        db.refresh(project)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to update project.", extra={"error": str(exc)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update project.",
        ) from exc
    return _serialize_project(project)


def _delete_project_payload(db: Session, project_id: str) -> dict[str, Any]:
    project = db.query(DBProject).filter(DBProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    db.delete(project)
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to delete project.", extra={"error": str(exc)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete project.",
        ) from exc
    return {"deleted": True, "id": project_id}


def _get_stats_payload(db: Session) -> dict[str, Any]:
    return compute_core_funnel_stats(
        db=db,
        qualification_threshold=scoring_engine.qualification_threshold,
    )


def _get_leads_payload(
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
) -> dict[str, Any]:
    return list_leads(
        db=db,
        page=page,
        page_size=page_size,
        search=search,
        status_filter=status_filter,
        segment_filter=segment_filter,
        tier_filter=tier_filter,
        heat_status_filter=heat_status_filter,
        company_filter=company_filter,
        industry_filter=industry_filter,
        location_filter=location_filter,
        tag_filter=tag_filter,
        min_score=min_score,
        max_score=max_score,
        has_email=has_email,
        has_phone=has_phone,
        has_linkedin=has_linkedin,
        created_from=created_from,
        created_to=created_to,
        last_scored_from=last_scored_from,
        last_scored_to=last_scored_to,
        sort_by=sort_by,
        sort_desc=sort_desc,
    )


def _get_tasks_payload(
    db: Session,
    page: int,
    page_size: int,
    search: str | None = None,
    status_filter: str | None = None,
    sort_by: str = "created_at",
    sort_desc: bool = True,
) -> dict[str, Any]:
    query = db.query(DBTask)

    if search and search.strip():
        pattern = f"%{search.strip()}%"
        query = query.filter(
            or_(
                DBTask.title.ilike(pattern),
                DBTask.assigned_to.ilike(pattern),
                DBTask.lead_id.ilike(pattern),
            )
        )

    if status_filter and status_filter.strip():
        query = query.filter(DBTask.status == _coerce_task_status(status_filter))

    total = query.count()

    sort_map = {
        "created_at": DBTask.created_at,
        "title": DBTask.title,
        "status": DBTask.status,
        "priority": DBTask.priority,
        "due_date": DBTask.due_date,
        "assigned_to": DBTask.assigned_to,
    }
    sort_column = sort_map.get(sort_by, DBTask.created_at)
    if sort_desc:
        query = query.order_by(sort_column.desc(), DBTask.id.desc())
    else:
        query = query.order_by(sort_column.asc(), DBTask.id.asc())

    offset = (page - 1) * page_size
    rows = query.offset(offset).limit(page_size).all()

    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "items": [_serialize_task(task) for task in rows],
    }


def _rescore_payload(db: Session) -> dict[str, Any]:
    updated = 0
    failed = 0
    leads = db.query(DBLead).all()
    for db_lead in leads:
        try:
            lead = _db_to_lead(db_lead)
            lead = scoring_engine.score_lead(lead)
        except (ValueError, TypeError, AttributeError) as exc:
            failed += 1
            logger.warning(
                "Skipping lead during rescore due to malformed payload.",
                extra={"lead_id": db_lead.id, "error": str(exc)},
            )
            continue

        db_lead.icp_score = lead.score.icp_score
        db_lead.heat_score = lead.score.heat_score
        db_lead.total_score = lead.score.total_score
        db_lead.tier = lead.score.tier
        db_lead.heat_status = lead.score.heat_status
        db_lead.next_best_action = lead.score.next_best_action
        db_lead.icp_breakdown = lead.score.icp_breakdown
        db_lead.heat_breakdown = lead.score.heat_breakdown
        db_lead.score_breakdown = {
            "icp": lead.score.icp_breakdown,
            "heat": lead.score.heat_breakdown,
        }
        db_lead.last_scored_at = lead.score.last_scored_at
        db_lead.tags = lead.tags
        db_lead.details = lead.details
        updated += 1

    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to commit lead rescoring.", extra={"error": str(exc)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to persist rescored leads.",
        ) from exc
    return {"updated": updated, "failed": failed}


def _preview_payload(lead: Lead) -> dict[str, Any]:
    scored = scoring_engine.score_lead(lead)
    return {
        "lead_id": scored.id,
        "company_name": scored.company.name,
        "icp_score": scored.score.icp_score,
        "heat_score": scored.score.heat_score,
        "total_score": scored.score.total_score,
        "tier": scored.score.tier,
        "heat_status": scored.score.heat_status,
        "next_best_action": scored.score.next_best_action,
        "icp_breakdown": scored.score.icp_breakdown,
        "heat_breakdown": scored.score.heat_breakdown,
        "tags": scored.tags,
        "details": {
            "should_send_loom": scored.details.get("should_send_loom", False),
            "propose_stripe_link": scored.details.get("propose_stripe_link", False),
            "tier_action": scored.details.get("tier_action"),
            "heat_action": scored.details.get("heat_action"),
        },
    }


def _get_admin_settings_payload(db: Session) -> dict[str, Any]:
    payload = dict(DEFAULT_ADMIN_SETTINGS)
    rows = db.query(DBAdminSetting).all()
    for row in rows:
        if row.key in payload:
            payload[row.key] = row.value_json

    payload["organization_name"] = str(payload.get("organization_name") or DEFAULT_ADMIN_SETTINGS["organization_name"])
    payload["locale"] = str(payload.get("locale") or DEFAULT_ADMIN_SETTINGS["locale"])
    payload["timezone"] = str(payload.get("timezone") or DEFAULT_ADMIN_SETTINGS["timezone"])

    try:
        payload["default_page_size"] = int(payload.get("default_page_size") or DEFAULT_ADMIN_SETTINGS["default_page_size"])
    except (TypeError, ValueError):
        payload["default_page_size"] = int(DEFAULT_ADMIN_SETTINGS["default_page_size"])
    payload["default_page_size"] = max(5, min(payload["default_page_size"], 200))

    try:
        payload["dashboard_refresh_seconds"] = int(payload.get("dashboard_refresh_seconds") or DEFAULT_ADMIN_SETTINGS["dashboard_refresh_seconds"])
    except (TypeError, ValueError):
        payload["dashboard_refresh_seconds"] = int(DEFAULT_ADMIN_SETTINGS["dashboard_refresh_seconds"])
    payload["dashboard_refresh_seconds"] = max(10, min(payload["dashboard_refresh_seconds"], 3600))

    payload["support_email"] = str(payload.get("support_email") or DEFAULT_ADMIN_SETTINGS["support_email"])
    payload["theme"] = _coerce_theme(str(payload.get("theme") or DEFAULT_ADMIN_SETTINGS["theme"]))
    payload["default_refresh_mode"] = _coerce_refresh_mode(
        str(payload.get("default_refresh_mode") or DEFAULT_ADMIN_SETTINGS["default_refresh_mode"])
    )
    payload["notifications"] = _normalize_notifications(payload.get("notifications"))
    return AdminSettingsPayload(**payload).model_dump()


def _save_admin_settings_payload(db: Session, payload: AdminSettingsPayload) -> dict[str, Any]:
    normalized = payload.model_dump()
    normalized["default_page_size"] = max(5, min(int(normalized["default_page_size"]), 200))
    normalized["dashboard_refresh_seconds"] = max(
        10,
        min(int(normalized["dashboard_refresh_seconds"]), 3600),
    )
    normalized["theme"] = _coerce_theme(normalized.get("theme"))
    normalized["default_refresh_mode"] = _coerce_refresh_mode(
        normalized.get("default_refresh_mode")
    )
    normalized["notifications"] = _normalize_notifications(normalized.get("notifications"))

    for key, value in normalized.items():
        row = db.query(DBAdminSetting).filter(DBAdminSetting.key == key).first()
        if not row:
            row = DBAdminSetting(key=key, value_json=value)
            db.add(row)
        else:
            row.value_json = value

    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to persist admin settings.", extra={"error": str(exc)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save settings.",
        ) from exc

    return _get_admin_settings_payload(db)


def _get_analytics_payload(db: Session) -> dict[str, Any]:
    total_leads = db.query(DBLead).count()
    status_rows = db.query(DBLead.status, func.count(DBLead.id)).group_by(DBLead.status).all()
    leads_by_status: dict[str, int] = {}
    for status_value, count in status_rows:
        key = status_value.value if hasattr(status_value, "value") else str(status_value)
        leads_by_status[key] = int(count)

    total_tasks = db.query(DBTask).count()
    completed_tasks = db.query(DBTask).filter(DBTask.status == "Done").count()
    task_completion_rate = round((completed_tasks / total_tasks) * 100, 2) if total_tasks else 0.0

    pipeline_raw = db.query(func.sum(DBLead.total_score)).scalar() or 0.0
    pipeline_value = round(float(pipeline_raw) * 1000, 2)

    today_start = datetime.combine(datetime.now().date(), datetime_time.min)
    new_leads_today = db.query(DBLead).filter(DBLead.created_at >= today_start).count()

    return {
        "total_leads": total_leads,
        "leads_by_status": leads_by_status,
        "task_completion_rate": task_completion_rate,
        "pipeline_value": pipeline_value,
        "new_leads_today": new_leads_today,
    }


def _search_payload(db: Session, query: str, limit: int) -> dict[str, Any]:
    clean_query = query.strip()
    if not clean_query:
        return {"query": query, "total": 0, "items": []}

    result_limit = max(1, min(limit, 50))
    pattern = f"%{clean_query}%"

    items: list[dict[str, str]] = []

    lead_rows = (
        db.query(DBLead)
        .filter(
            or_(
                DBLead.first_name.ilike(pattern),
                DBLead.last_name.ilike(pattern),
                DBLead.email.ilike(pattern),
            )
        )
        .order_by(DBLead.created_at.desc())
        .limit(result_limit)
        .all()
    )
    for lead in lead_rows:
        lead_name = f"{lead.first_name or ''} {lead.last_name or ''}".strip() or lead.email
        items.append(
            {
                "type": "lead",
                "id": lead.id,
                "title": lead_name,
                "subtitle": lead.email,
                "href": f"/leads?lead_id={lead.id}",
            }
        )

    task_rows = (
        db.query(DBTask)
        .filter(
            or_(
                DBTask.title.ilike(pattern),
                DBTask.status.ilike(pattern),
                DBTask.assigned_to.ilike(pattern),
            )
        )
        .order_by(DBTask.created_at.desc())
        .limit(result_limit)
        .all()
    )
    for task in task_rows:
        items.append(
            {
                "type": "task",
                "id": task.id,
                "title": task.title,
                "subtitle": f"{task.status} - {task.priority}",
                "href": f"/tasks?task_id={task.id}",
            }
        )

    project_rows = (
        db.query(DBProject)
        .filter(
            or_(
                DBProject.name.ilike(pattern),
                DBProject.status.ilike(pattern),
                DBProject.description.ilike(pattern),
            )
        )
        .order_by(DBProject.created_at.desc())
        .limit(result_limit)
        .all()
    )
    for project in project_rows:
        items.append(
            {
                "type": "project",
                "id": project.id,
                "title": project.name,
                "subtitle": project.status,
                "href": f"/projects?project_id={project.id}",
            }
        )

    unique_items: list[dict[str, str]] = []
    seen = set()
    for item in items:
        unique_key = (item["type"], item["id"])
        if unique_key in seen:
            continue
        seen.add(unique_key)
        unique_items.append(item)
        if len(unique_items) >= result_limit:
            break

    return {
        "query": query,
        "total": len(unique_items),
        "items": unique_items,
    }


def _help_payload(db: Session) -> dict[str, Any]:
    settings = _get_admin_settings_payload(db)
    payload = AdminHelpPayload(
        support_email=settings["support_email"],
        faqs=[
            {
                "question": "Comment creer un lead rapidement ?",
                "answer": "Utilisez le bouton 'Creation rapide de lead' dans la barre laterale.",
            },
            {
                "question": "Comment convertir une tache en projet ?",
                "answer": "Depuis la table des taches, utilisez l'action 'Convertir en projet'.",
            },
            {
                "question": "Ou modifier les parametres globaux ?",
                "answer": "Allez sur la page Parametres puis enregistrez vos preferences.",
            },
        ],
        links=[
            {"label": "Centre d'aide complet", "href": "/help"},
            {"label": "Bibliotheque commerciale", "href": "/library"},
            {"label": "Rapports d'equipe", "href": "/reports"},
            {"label": "Assistant operations", "href": "/assistant"},
            {"label": "Console backend", "href": "/admin"},
            {"label": "Guide API FastAPI", "href": "https://fastapi.tiangolo.com/"},
        ],
    )
    return payload.model_dump()


def _list_roles_payload(db: Session) -> list[dict[str, Any]]:
    _ensure_default_roles(db)
    roles = db.query(DBAdminRole).order_by(DBAdminRole.id.asc()).all()
    return [_serialize_role(role) for role in roles]


def _list_users_payload(db: Session) -> list[dict[str, Any]]:
    _ensure_default_roles(db)
    users = db.query(DBAdminUser).order_by(DBAdminUser.created_at.desc()).all()
    return [_serialize_user(user) for user in users]


def _invite_user_payload(
    db: Session,
    payload: AdminUserInviteRequest,
    *,
    actor: str,
) -> dict[str, Any]:
    _ensure_default_roles(db)

    existing = db.query(DBAdminUser).filter(DBAdminUser.email == str(payload.email)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"User already exists for email {payload.email}.",
        )

    user = DBAdminUser(
        id=str(uuid.uuid4()),
        email=str(payload.email),
        display_name=(payload.display_name or "").strip() or None,
        status="invited",
    )
    db.add(user)
    db.flush()
    _upsert_user_roles(db, user, payload.roles)
    db.commit()
    db.refresh(user)

    _audit_log(
        db,
        actor=actor,
        action="user_invited",
        entity_type="admin_user",
        entity_id=user.id,
        metadata={"email": user.email, "roles": payload.roles},
    )
    return _serialize_user(user)


def _update_user_payload(
    db: Session,
    user_id: str,
    payload: AdminUserUpdateRequest,
    *,
    actor: str,
) -> dict[str, Any]:
    _ensure_default_roles(db)
    user = db.query(DBAdminUser).filter(DBAdminUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    update_data = payload.model_dump(exclude_unset=True)
    if "display_name" in update_data:
        user.display_name = (payload.display_name or "").strip() or None
    if "status" in update_data:
        user.status = _coerce_user_status(payload.status)
    if "roles" in update_data and payload.roles is not None:
        _upsert_user_roles(db, user, payload.roles)

    db.commit()
    db.refresh(user)
    _audit_log(
        db,
        actor=actor,
        action="user_updated",
        entity_type="admin_user",
        entity_id=user.id,
        metadata={"status": user.status, "roles": payload.roles},
    )
    return _serialize_user(user)


def _list_audit_logs_payload(db: Session, cursor: str | None, limit: int) -> dict[str, Any]:
    query = db.query(DBAuditLog)
    if cursor:
        cursor_date = _parse_datetime_field(cursor, "cursor")
        if cursor_date is not None:
            query = query.filter(DBAuditLog.created_at < cursor_date)

    rows = (
        query.order_by(DBAuditLog.created_at.desc())
        .limit(max(1, min(limit, 100)))
        .all()
    )
    items = [
        {
            "id": row.id,
            "actor": row.actor,
            "action": row.action,
            "entity_type": row.entity_type,
            "entity_id": row.entity_id,
            "metadata": row.metadata_json or {},
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]
    next_cursor = items[-1]["created_at"] if items else None
    return {"items": items, "next_cursor": next_cursor}


def _csv_default_fields(entity: str) -> list[str]:
    if entity == "leads":
        return ["id", "email", "first_name", "last_name", "status", "segment", "total_score"]
    if entity == "tasks":
        return ["id", "title", "status", "priority", "assigned_to", "lead_id", "due_date"]
    return ["id", "name", "status", "lead_id", "due_date", "created_at"]


def _export_csv_payload(db: Session, *, entity: str, fields: str | None) -> tuple[str, str]:
    selected_entity = entity.strip().lower()
    if selected_entity not in {"leads", "tasks", "projects"}:
        raise HTTPException(
            status_code=HTTP_422_STATUS,
            detail=f"Unsupported export entity: {entity}",
        )

    columns = [part.strip() for part in (fields or "").split(",") if part.strip()]
    if not columns:
        columns = _csv_default_fields(selected_entity)

    if selected_entity == "leads":
        rows = db.query(DBLead).order_by(DBLead.created_at.desc()).all()
        serialized = [
            {
                "id": row.id,
                "email": row.email,
                "first_name": row.first_name or "",
                "last_name": row.last_name or "",
                "status": row.status.value if hasattr(row.status, "value") else str(row.status),
                "segment": row.segment or "",
                "total_score": row.total_score or 0,
                "created_at": row.created_at.isoformat() if row.created_at else "",
            }
            for row in rows
        ]
    elif selected_entity == "tasks":
        rows = db.query(DBTask).order_by(DBTask.created_at.desc()).all()
        serialized = [
            {
                "id": row.id,
                "title": row.title,
                "status": row.status,
                "priority": row.priority,
                "assigned_to": row.assigned_to,
                "lead_id": row.lead_id or "",
                "due_date": row.due_date.isoformat() if row.due_date else "",
                "created_at": row.created_at.isoformat() if row.created_at else "",
            }
            for row in rows
        ]
    else:
        rows = db.query(DBProject).order_by(DBProject.created_at.desc()).all()
        serialized = [
            {
                "id": row.id,
                "name": row.name,
                "description": row.description or "",
                "status": row.status,
                "lead_id": row.lead_id or "",
                "due_date": row.due_date.isoformat() if row.due_date else "",
                "created_at": row.created_at.isoformat() if row.created_at else "",
            }
            for row in rows
        ]

    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for row in serialized:
        writer.writerow({field: row.get(field, "") for field in columns})
    return output.getvalue(), f"{selected_entity}.csv"


def _default_integrations_payload() -> dict[str, dict[str, Any]]:
    providers: dict[str, dict[str, Any]] = {}
    for key, value in DEFAULT_INTEGRATION_CATALOG.items():
        providers[key] = {
            "enabled": bool(value.get("enabled")),
            "config": dict(value.get("config") or {}),
            "meta": dict(value.get("meta") or {}),
            "updated_at": None,
        }
    return providers


def _list_integrations_payload(db: Session) -> dict[str, Any]:
    rows = db.query(DBIntegrationConfig).order_by(DBIntegrationConfig.key.asc()).all()
    providers = _default_integrations_payload()
    for row in rows:
        key = row.key.strip().lower()
        current = providers.get(
            key,
            {
                "enabled": False,
                "config": {},
                "meta": {
                    "category": "custom",
                    "free_tier": "Unknown",
                    "description": "Custom provider",
                },
                "updated_at": None,
            },
        )
        current_config = current.get("config") if isinstance(current.get("config"), dict) else {}
        row_config = row.config_json if isinstance(row.config_json, dict) else {}
        current["enabled"] = bool(row.enabled)
        current["config"] = {**current_config, **row_config}
        current["updated_at"] = row.updated_at.isoformat() if row.updated_at else None
        providers[key] = current
    ordered = {key: providers[key] for key in sorted(providers.keys())}
    return {"providers": ordered}


def _save_integrations_payload(
    db: Session,
    payload: AdminIntegrationsPayload,
    *,
    actor: str,
) -> dict[str, Any]:
    for key, value in payload.providers.items():
        clean_key = key.strip().lower()
        if not clean_key:
            continue
        row = db.query(DBIntegrationConfig).filter(DBIntegrationConfig.key == clean_key).first()
        if not row:
            row = DBIntegrationConfig(key=clean_key)
            db.add(row)
        row.enabled = bool(value.enabled)
        row.config_json = value.config or {}

    db.commit()
    _audit_log(
        db,
        actor=actor,
        action="integrations_updated",
        entity_type="integration",
        metadata={"providers": sorted(payload.providers.keys())},
    )
    return _list_integrations_payload(db)


def _web_research_payload(
    db: Session,
    *,
    query: str,
    provider: str,
    limit: int,
) -> dict[str, Any]:
    integrations = _list_integrations_payload(db).get("providers", {})
    return run_web_research(
        query=query,
        limit=limit,
        provider_selector=provider,
        provider_configs=integrations,
    )


def _list_webhooks_payload(db: Session) -> dict[str, Any]:
    rows = db.query(DBWebhookConfig).order_by(DBWebhookConfig.created_at.desc()).all()
    return {"items": [_serialize_webhook(row) for row in rows]}


def _create_webhook_payload(
    db: Session,
    payload: AdminWebhookCreateRequest,
    *,
    actor: str,
) -> dict[str, Any]:
    if not payload.url.startswith("http://") and not payload.url.startswith("https://"):
        raise HTTPException(
            status_code=HTTP_422_STATUS,
            detail="Webhook URL must start with http:// or https://",
        )

    webhook = DBWebhookConfig(
        id=str(uuid.uuid4()),
        name=payload.name.strip(),
        url=payload.url.strip(),
        events=[event.strip() for event in payload.events if event.strip()],
        enabled=bool(payload.enabled),
    )
    db.add(webhook)
    db.commit()
    db.refresh(webhook)
    _audit_log(
        db,
        actor=actor,
        action="webhook_created",
        entity_type="webhook",
        entity_id=webhook.id,
        metadata={"name": webhook.name},
    )
    return _serialize_webhook(webhook)


def _delete_webhook_payload(db: Session, webhook_id: str, *, actor: str) -> dict[str, Any]:
    webhook = db.query(DBWebhookConfig).filter(DBWebhookConfig.id == webhook_id).first()
    if not webhook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found.")

    db.delete(webhook)
    db.commit()
    _audit_log(
        db,
        actor=actor,
        action="webhook_deleted",
        entity_type="webhook",
        entity_id=webhook_id,
    )
    return {"deleted": True, "id": webhook_id}


def _get_or_create_account_profile(db: Session) -> DBAccountProfile:
    profile = db.query(DBAccountProfile).filter(DBAccountProfile.key == "primary").first()
    if profile:
        return profile

    settings = _get_admin_settings_payload(db)
    profile = DBAccountProfile(
        key="primary",
        full_name="Admin Prospect",
        email=settings["support_email"],
        title="Operations Manager",
        locale=settings["locale"],
        timezone=settings["timezone"],
        preferences_json={
            "density": "comfortable",
            "keyboard_shortcuts": True,
            "start_page": "/dashboard",
        },
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def _get_account_payload(db: Session) -> dict[str, Any]:
    profile = _get_or_create_account_profile(db)
    return _serialize_account_profile(profile)


def _save_account_payload(db: Session, payload: AdminAccountPayload) -> dict[str, Any]:
    profile = _get_or_create_account_profile(db)
    profile.full_name = payload.full_name.strip() or profile.full_name
    profile.email = str(payload.email)
    profile.title = payload.title.strip()
    profile.locale = payload.locale.strip() or "fr-FR"
    profile.timezone = payload.timezone.strip() or "Europe/Paris"
    profile.preferences_json = payload.preferences or {}
    db.commit()
    db.refresh(profile)
    return _serialize_account_profile(profile)


def _get_or_create_billing_profile(db: Session) -> DBBillingProfile:
    profile = db.query(DBBillingProfile).filter(DBBillingProfile.key == "primary").first()
    if profile:
        return profile

    settings = _get_admin_settings_payload(db)
    profile = DBBillingProfile(
        key="primary",
        plan_name="Business",
        billing_cycle="monthly",
        status="active",
        currency="EUR",
        amount_cents=9900,
        company_name=settings["organization_name"],
        billing_email=settings["support_email"],
        country="France",
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def _list_billing_invoices_payload(db: Session, *, limit: int = 50) -> list[dict[str, Any]]:
    rows = (
        db.query(DBBillingInvoice)
        .order_by(DBBillingInvoice.issued_at.desc(), DBBillingInvoice.created_at.desc())
        .limit(max(1, min(limit, 200)))
        .all()
    )
    return [_serialize_billing_invoice(row) for row in rows]


def _get_billing_payload(db: Session) -> dict[str, Any]:
    profile = _get_or_create_billing_profile(db)
    invoices = _list_billing_invoices_payload(db, limit=100)

    outstanding_cents = sum(
        int(item["amount_cents"])
        for item in invoices
        if item["status"] in {"issued", "open", "overdue"}
    )
    paid_cents = sum(
        int(item["amount_cents"])
        for item in invoices
        if item["status"] == "paid"
    )

    return {
        "profile": _serialize_billing_profile(profile),
        "invoices": invoices,
        "summary": {
            "invoice_count": len(invoices),
            "outstanding_cents": outstanding_cents,
            "paid_cents": paid_cents,
        },
    }


def _save_billing_profile_payload(db: Session, payload: AdminBillingProfilePayload) -> dict[str, Any]:
    profile = _get_or_create_billing_profile(db)
    profile.plan_name = payload.plan_name.strip() or "Business"
    profile.billing_cycle = payload.billing_cycle.strip() or "monthly"
    profile.status = payload.status.strip() or "active"
    profile.currency = payload.currency.strip().upper() or "EUR"
    profile.amount_cents = int(payload.amount_cents)
    profile.company_name = payload.company_name.strip()
    profile.billing_email = str(payload.billing_email)
    profile.vat_number = payload.vat_number.strip()
    profile.address_line = payload.address_line.strip()
    profile.city = payload.city.strip()
    profile.postal_code = payload.postal_code.strip()
    profile.country = payload.country.strip()
    profile.notes = payload.notes.strip()
    db.commit()
    db.refresh(profile)
    return _serialize_billing_profile(profile)


def _create_billing_invoice_payload(
    db: Session,
    payload: AdminBillingInvoiceCreateRequest,
) -> dict[str, Any]:
    existing = (
        db.query(DBBillingInvoice)
        .filter(DBBillingInvoice.invoice_number == payload.invoice_number.strip())
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Invoice already exists: {payload.invoice_number}",
        )

    invoice = DBBillingInvoice(
        id=str(uuid.uuid4()),
        invoice_number=payload.invoice_number.strip(),
        period_start=_parse_datetime_field(payload.period_start, "period_start"),
        period_end=_parse_datetime_field(payload.period_end, "period_end"),
        due_at=_parse_datetime_field(payload.due_at, "due_at"),
        status=payload.status.strip() or "issued",
        currency=payload.currency.strip().upper() or "EUR",
        amount_cents=int(payload.amount_cents),
        notes=(payload.notes or "").strip() or None,
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return _serialize_billing_invoice(invoice)


def _default_notification_channels() -> dict[str, dict[str, bool]]:
    events = sorted(NOTIFICATION_EVENT_KEYS)
    return {
        "in_app": {event: True for event in events},
        "email": {event: event in {"report_ready", "report_failed", "billing_invoice_due"} for event in events},
    }


def _seed_notification_preferences(db: Session) -> None:
    defaults = _default_notification_channels()
    changed = False
    for channel, events in defaults.items():
        for event_key, enabled in events.items():
            row = (
                db.query(DBNotificationPreference)
                .filter(
                    DBNotificationPreference.channel == channel,
                    DBNotificationPreference.event_key == event_key,
                )
                .first()
            )
            if row:
                continue
            db.add(
                DBNotificationPreference(
                    channel=channel,
                    event_key=event_key,
                    enabled=bool(enabled),
                )
            )
            changed = True
    if changed:
        db.commit()


def _list_notification_preferences_payload(db: Session) -> dict[str, Any]:
    _seed_notification_preferences(db)
    channels = _default_notification_channels()
    rows = db.query(DBNotificationPreference).all()
    for row in rows:
        channels.setdefault(row.channel, {})
        channels[row.channel][row.event_key] = bool(row.enabled)
    return {"channels": channels}


def _save_notification_preferences_payload(
    db: Session,
    payload: AdminNotificationPreferencesUpdatePayload,
) -> dict[str, Any]:
    _seed_notification_preferences(db)
    for channel, events in payload.channels.items():
        clean_channel = _coerce_notification_channel(channel)
        for event_key, enabled in events.items():
            clean_event_key = _coerce_notification_event(event_key)
            row = (
                db.query(DBNotificationPreference)
                .filter(
                    DBNotificationPreference.channel == clean_channel,
                    DBNotificationPreference.event_key == clean_event_key,
                )
                .first()
            )
            if not row:
                row = DBNotificationPreference(
                    channel=clean_channel,
                    event_key=clean_event_key,
                )
                db.add(row)
            row.enabled = bool(enabled)
    db.commit()
    return _list_notification_preferences_payload(db)


def _is_notification_enabled(db: Session, *, channel: str, event_key: str) -> bool:
    _seed_notification_preferences(db)
    row = (
        db.query(DBNotificationPreference)
        .filter(
            DBNotificationPreference.channel == channel,
            DBNotificationPreference.event_key == event_key,
        )
        .first()
    )
    if not row:
        return True
    return bool(row.enabled)


def _send_notification_email(subject: str, message: str, recipient: str) -> None:
    # Local fallback: only persist notifications when SMTP is not configured.
    smtp_host = os.getenv("SMTP_HOST")
    if not smtp_host:
        return

    import smtplib
    from email.message import EmailMessage

    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USERNAME")
    smtp_pass = os.getenv("SMTP_PASSWORD", "")
    smtp_from = os.getenv("SMTP_FROM", "noreply@prospect.local")
    smtp_tls = os.getenv("SMTP_USE_TLS", "1").strip().lower() not in {"0", "false", "no"}

    email = EmailMessage()
    email["Subject"] = subject
    email["From"] = smtp_from
    email["To"] = recipient
    email.set_content(message)

    with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as smtp:
        if smtp_tls:
            smtp.starttls()
        if smtp_user:
            smtp.login(smtp_user, smtp_pass)
        smtp.send_message(email)


def _create_notification_payload(
    db: Session,
    payload: AdminNotificationCreateRequest,
) -> list[dict[str, Any]]:
    event_key = _coerce_notification_event(payload.event_key)
    channel = _coerce_notification_channel(payload.channel)
    channels = [channel] if channel != "in_app" else ["in_app"]

    created_rows: list[DBNotification] = []
    for selected_channel in channels:
        if not _is_notification_enabled(db, channel=selected_channel, event_key=event_key):
            continue
        row = DBNotification(
            id=str(uuid.uuid4()),
            event_key=event_key,
            title=payload.title.strip(),
            message=payload.message.strip(),
            channel=selected_channel,
            entity_type=(payload.entity_type or "").strip() or None,
            entity_id=(payload.entity_id or "").strip() or None,
            link_href=(payload.link_href or "").strip() or None,
            metadata_json=payload.metadata or {},
            sent_at=datetime.now() if selected_channel == "email" else None,
        )
        db.add(row)
        created_rows.append(row)
    db.commit()
    for row in created_rows:
        db.refresh(row)

    for row in created_rows:
        if row.channel != "email":
            continue
        try:
            account = _get_account_payload(db)
            _send_notification_email(row.title, row.message, account["email"])
            row.sent_at = datetime.now()
        except Exception as exc:  # pragma: no cover - SMTP can be unavailable in local test env
            logger.warning("Unable to send email notification.", extra={"error": str(exc)})
    db.commit()
    return [_serialize_notification(row) for row in created_rows]


def _list_notifications_payload(
    db: Session,
    *,
    limit: int,
    cursor: str | None,
    channel: str | None,
    event_key: str | None,
    only_unread: bool,
) -> dict[str, Any]:
    query = db.query(DBNotification)
    if cursor:
        cursor_date = _parse_datetime_field(cursor, "cursor")
        if cursor_date is not None:
            query = query.filter(DBNotification.created_at < cursor_date)
    if channel:
        query = query.filter(DBNotification.channel == _coerce_notification_channel(channel))
    if event_key:
        query = query.filter(DBNotification.event_key == _coerce_notification_event(event_key))
    if only_unread:
        query = query.filter(DBNotification.is_read.is_(False))

    rows = (
        query.order_by(DBNotification.created_at.desc())
        .limit(max(1, min(limit, 100)))
        .all()
    )
    unread_count = db.query(DBNotification).filter(DBNotification.is_read.is_(False)).count()
    items = [_serialize_notification(row) for row in rows]
    return {
        "items": items,
        "unread_count": unread_count,
        "next_cursor": items[-1]["created_at"] if items else None,
    }


def _mark_notifications_read_payload(db: Session, notification_ids: list[str]) -> dict[str, Any]:
    clean_ids = sorted({item.strip() for item in notification_ids if item and item.strip()})
    if not clean_ids:
        return {"updated": 0}

    rows = db.query(DBNotification).filter(DBNotification.id.in_(clean_ids)).all()
    updated = 0
    for row in rows:
        if row.is_read:
            continue
        row.is_read = True
        updated += 1
    db.commit()
    return {"updated": updated}


def _mark_all_notifications_read_payload(db: Session) -> dict[str, Any]:
    rows = db.query(DBNotification).filter(DBNotification.is_read.is_(False)).all()
    updated = 0
    for row in rows:
        row.is_read = True
        updated += 1
    db.commit()
    return {"updated": updated}


def _build_report_snapshot(db: Session) -> dict[str, Any]:
    stats = _get_stats_payload(db)
    analytics = _get_analytics_payload(db)
    return {
        "stats": stats,
        "analytics": analytics,
    }


def _pdf_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _build_simple_pdf(title: str, lines: list[str]) -> bytes:
    content_lines = [title, ""] + lines
    stream_lines = ["BT", "/F1 11 Tf", "14 TL", "72 790 Td"]
    for line in content_lines:
        stream_lines.append(f"({_pdf_escape(line)}) Tj")
        stream_lines.append("T*")
    stream_lines.append("ET")
    stream = "\n".join(stream_lines)
    stream_bytes = stream.encode("latin-1", errors="ignore")

    objects = [
        "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
        f"4 0 obj\n<< /Length {len(stream_bytes)} >>\nstream\n{stream}\nendstream\nendobj\n",
        "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    ]

    payload = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objects:
        offsets.append(len(payload))
        payload.extend(obj.encode("latin-1"))
    xref_start = len(payload)
    payload.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    payload.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        payload.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    payload.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_start}\n%%EOF".encode("ascii")
    )
    return bytes(payload)


def _export_pdf_payload(
    db: Session,
    *,
    period: str,
    dashboard: str,
) -> tuple[bytes, str]:
    snapshot = _build_report_snapshot(db)
    analytics = snapshot["analytics"]
    stats = snapshot["stats"]
    now = datetime.now()
    lines = [
        f"Periode: {period}",
        f"Tableau: {dashboard}",
        f"Genere le: {now.isoformat()}",
        f"Leads total: {analytics['total_leads']}",
        f"Nouveaux leads du jour: {analytics['new_leads_today']}",
        f"Taches completees (%): {analytics['task_completion_rate']}",
        f"Valeur pipeline estimee: {analytics['pipeline_value']}",
        f"Leads qualifies: {stats['qualified_total']}",
        f"Leads contactes: {stats['contacted_total']}",
        f"Opportunites gagnees: {stats['closed_total']}",
    ]
    for key, value in sorted((analytics.get("leads_by_status") or {}).items()):
        lines.append(f"Statut {key}: {value}")

    file_name = f"report-{dashboard}-{now.strftime('%Y%m%d-%H%M%S')}.pdf"
    return _build_simple_pdf("Rapport Prospect", lines), file_name


def _emit_event_notification(
    db: Session,
    *,
    event_key: str,
    title: str,
    message: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
    link_href: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    for channel in ("in_app", "email"):
        payload = AdminNotificationCreateRequest(
            event_key=event_key,
            title=title,
            message=message,
            channel=channel,
            entity_type=entity_type,
            entity_id=entity_id,
            link_href=link_href,
            metadata=metadata or {},
        )
        _create_notification_payload(db, payload)


def _list_report_schedules_payload(db: Session) -> dict[str, Any]:
    rows = db.query(DBReportSchedule).order_by(DBReportSchedule.created_at.desc()).all()
    return {"items": [_serialize_report_schedule(row) for row in rows]}


def _create_report_schedule_payload(
    db: Session,
    payload: AdminReportScheduleCreateRequest,
) -> dict[str, Any]:
    frequency = _coerce_report_frequency(payload.frequency)
    export_format = _coerce_report_format(payload.format)
    schedule = DBReportSchedule(
        id=str(uuid.uuid4()),
        name=payload.name.strip(),
        frequency=frequency,
        timezone=payload.timezone.strip() or "Europe/Paris",
        hour_local=int(payload.hour_local),
        minute_local=int(payload.minute_local),
        format=export_format,
        recipients_json=sorted({str(item).strip().lower() for item in payload.recipients if str(item).strip()}),
        filters_json=payload.filters or {},
        enabled=bool(payload.enabled),
        next_run_at=_compute_next_run_at(
            frequency=frequency,
            hour_local=int(payload.hour_local),
            minute_local=int(payload.minute_local),
        ),
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return _serialize_report_schedule(schedule)


def _update_report_schedule_payload(
    db: Session,
    schedule_id: str,
    payload: AdminReportScheduleUpdateRequest,
) -> dict[str, Any]:
    schedule = db.query(DBReportSchedule).filter(DBReportSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report schedule not found.")

    update_data = payload.model_dump(exclude_unset=True)
    if "name" in update_data and payload.name is not None:
        schedule.name = payload.name.strip()
    if "frequency" in update_data and payload.frequency is not None:
        schedule.frequency = _coerce_report_frequency(payload.frequency)
    if "timezone" in update_data and payload.timezone is not None:
        schedule.timezone = payload.timezone.strip() or "Europe/Paris"
    if "hour_local" in update_data and payload.hour_local is not None:
        schedule.hour_local = int(payload.hour_local)
    if "minute_local" in update_data and payload.minute_local is not None:
        schedule.minute_local = int(payload.minute_local)
    if "format" in update_data and payload.format is not None:
        schedule.format = _coerce_report_format(payload.format)
    if "recipients" in update_data and payload.recipients is not None:
        schedule.recipients_json = sorted(
            {str(item).strip().lower() for item in payload.recipients if str(item).strip()}
        )
    if "filters" in update_data and payload.filters is not None:
        schedule.filters_json = payload.filters or {}
    if "enabled" in update_data and payload.enabled is not None:
        schedule.enabled = bool(payload.enabled)

    schedule.next_run_at = _compute_next_run_at(
        frequency=schedule.frequency,
        hour_local=int(schedule.hour_local),
        minute_local=int(schedule.minute_local),
    )
    db.commit()
    db.refresh(schedule)
    return _serialize_report_schedule(schedule)


def _delete_report_schedule_payload(db: Session, schedule_id: str) -> dict[str, Any]:
    schedule = db.query(DBReportSchedule).filter(DBReportSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report schedule not found.")
    db.delete(schedule)
    db.commit()
    return {"deleted": True, "id": schedule_id}


def _execute_report_schedule_payload(
    db: Session,
    schedule: DBReportSchedule,
) -> dict[str, Any]:
    started_at = datetime.now()
    run = DBReportRun(
        id=str(uuid.uuid4()),
        schedule_id=schedule.id,
        status="running",
        output_format=schedule.format,
        recipient_count=len(schedule.recipients_json or []),
        started_at=started_at,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    try:
        if schedule.format == "csv":
            _export_csv_payload(db, entity="leads", fields=None)
            message = "Rapport CSV genere."
        else:
            _export_pdf_payload(db, period="scheduled", dashboard="operations")
            message = "Rapport PDF genere."

        run.status = "success"
        run.message = message
        schedule.last_run_at = started_at
        schedule.next_run_at = _compute_next_run_at(
            frequency=schedule.frequency,
            hour_local=int(schedule.hour_local),
            minute_local=int(schedule.minute_local),
            reference=started_at + timedelta(minutes=1),
        )
        _emit_event_notification(
            db,
            event_key="report_ready",
            title="Rapport planifie pret",
            message=f"{schedule.name} a ete genere avec succes.",
            entity_type="report_schedule",
            entity_id=schedule.id,
            link_href="/reports",
            metadata={"schedule_id": schedule.id, "run_id": run.id},
        )
    except Exception as exc:  # pragma: no cover - protective fallback
        run.status = "failed"
        run.message = str(exc)
        _emit_event_notification(
            db,
            event_key="report_failed",
            title="Echec de rapport planifie",
            message=f"{schedule.name} a echoue: {exc}",
            entity_type="report_schedule",
            entity_id=schedule.id,
            link_href="/reports",
            metadata={"schedule_id": schedule.id, "run_id": run.id},
        )

    run.finished_at = datetime.now()
    db.commit()
    db.refresh(run)
    return _serialize_report_run(run)


def _run_due_report_schedules_payload(db: Session) -> dict[str, Any]:
    now = datetime.now()
    due_rows = (
        db.query(DBReportSchedule)
        .filter(
            DBReportSchedule.enabled.is_(True),
            DBReportSchedule.next_run_at.is_not(None),
            DBReportSchedule.next_run_at <= now,
        )
        .order_by(DBReportSchedule.next_run_at.asc())
        .limit(25)
        .all()
    )
    executed = [_execute_report_schedule_payload(db, row) for row in due_rows]
    return {"executed": len(executed), "items": executed}


def _list_report_runs_payload(
    db: Session,
    *,
    schedule_id: str | None,
    limit: int,
) -> dict[str, Any]:
    query = db.query(DBReportRun)
    if schedule_id:
        query = query.filter(DBReportRun.schedule_id == schedule_id)
    rows = (
        query.order_by(DBReportRun.created_at.desc())
        .limit(max(1, min(limit, 200)))
        .all()
    )
    return {"items": [_serialize_report_run(row) for row in rows]}


def _parse_import_mapping(mapping_json: str | None) -> dict[str, str] | None:
    if not mapping_json:
        return None
    try:
        payload = json.loads(mapping_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=HTTP_422_STATUS,
            detail="Invalid mapping_json payload.",
        ) from exc
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=HTTP_422_STATUS,
            detail="mapping_json must be a JSON object.",
        )
    normalized: dict[str, str] = {}
    for key, value in payload.items():
        if key is None or value is None:
            continue
        normalized[str(key)] = str(value)
    return normalized


def _cleanup_expired_admin_sessions(db: Session) -> int:
    now = datetime.utcnow()
    rows = (
        db.query(DBAdminSession)
        .filter(
            or_(
                DBAdminSession.expires_at <= now,
                DBAdminSession.revoked_at.is_not(None),
            )
        )
        .all()
    )
    count = len(rows)
    for row in rows:
        db.delete(row)
    if count:
        db.commit()
    return count


def _serialize_auth_me(username: str, auth_mode: str) -> dict[str, Any]:
    return {
        "username": username,
        "auth_mode": auth_mode,
        "authenticated": True,
    }


def create_app() -> FastAPI:
    configure_logging()
    _validate_admin_credentials_security()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        db = SessionLocal()
        try:
            _run_due_report_schedules_payload(db)
            removed_sessions = _cleanup_expired_admin_sessions(db)
            if removed_sessions:
                logger.info(
                    "Expired/revoked admin sessions cleaned up.",
                    extra={"removed_sessions": removed_sessions},
                )
        except Exception as exc:  # pragma: no cover - defensive startup fallback
            logger.warning(
                "Unable to complete startup tasks.",
                extra={"error": str(exc)},
            )
        finally:
            db.close()
        yield

    app = FastAPI(
        title="Prospect Admin Dashboard",
        version="1.0.0",
        lifespan=lifespan,
    )
    _init_admin_db()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_parse_cors_origins(),
        allow_origin_regex=r"https://.*\.netlify\.app",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def observe_admin_requests(request: Request, call_next):
        started_at = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception:
            latency_ms = round((time.perf_counter() - started_at) * 1000, 2)
            request_metrics.observe(
                path=request.url.path,
                status_code=status_code,
                latency_ms=latency_ms,
            )
            if request.url.path.startswith("/api/v1/admin"):
                logger.exception(
                    "Admin request failed with unhandled exception.",
                    extra={
                        "method": request.method,
                        "path": request.url.path,
                        "status_code": status_code,
                        "latency_ms": latency_ms,
                        "client_ip": _client_ip(request),
                    },
                )
            raise

        latency_ms = round((time.perf_counter() - started_at) * 1000, 2)
        request_metrics.observe(
            path=request.url.path,
            status_code=status_code,
            latency_ms=latency_ms,
        )
        if request.url.path.startswith("/api/v1/admin"):
            logger.info(
                "admin_request",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": status_code,
                    "latency_ms": latency_ms,
                    "client_ip": _client_ip(request),
                },
            )
        return response

    api_v1 = APIRouter(prefix="/api/v1")
    auth_v1 = APIRouter(
        prefix="/admin/auth",
        dependencies=[Depends(require_rate_limit)],
    )
    admin_v1 = APIRouter(
        prefix="/admin",
        dependencies=[Depends(require_admin), Depends(require_rate_limit)],
    )

    @app.get("/healthz")
    def healthcheck(db: Session = Depends(get_db)) -> dict[str, Any]:
        try:
            db.execute(text("SELECT 1"))
            db_ok = True
        except SQLAlchemyError as exc:
            logger.warning("Healthcheck DB query failed.", extra={"error": str(exc)})
            db_ok = False
        return {"ok": db_ok, "service": "prospect-admin-api"}

    @app.get("/admin", response_class=HTMLResponse)
    def admin_dashboard(
        request: Request,
        _: Annotated[str, Depends(require_admin)],
    ) -> HTMLResponse:
        return templates.TemplateResponse(
            request,
            "admin_dashboard.html",
            {
                "qualification_threshold": scoring_engine.qualification_threshold,
            },
        )

    @auth_v1.post("/login")
    def login_admin_v1(
        payload: AdminAuthLoginRequest,
        request: Request,
        db: Session = Depends(get_db),
    ) -> Response:
        username = payload.username.strip()
        if not _is_valid_admin_credentials(username, payload.password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid admin credentials.",
                headers={"WWW-Authenticate": "Basic"},
            )

        refresh_token = secrets.token_urlsafe(48)
        try:
            session = _create_refresh_session(
                db,
                username=username,
                refresh_token=refresh_token,
                request=request,
            )
            access_token, access_expires_at = _create_access_token(
                username=username,
                session_id=session.id,
            )
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            logger.exception("Failed to create admin login session.", extra={"error": str(exc)})
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Unable to create auth session.",
            ) from exc

        response = JSONResponse(
            {
                "ok": True,
                "username": username,
                "auth_mode": _get_admin_auth_mode(),
                "access_expires_at": access_expires_at.isoformat(),
                "refresh_expires_at": session.expires_at.isoformat(),
            }
        )
        _set_auth_cookies(
            response,
            access_token=access_token,
            refresh_token=refresh_token,
            access_expires_at=access_expires_at,
            refresh_expires_at=session.expires_at,
        )
        return response

    @auth_v1.post("/refresh")
    def refresh_admin_v1(
        request: Request,
        db: Session = Depends(get_db),
    ) -> Response:
        refresh_token = request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)
        if not refresh_token:
            response = JSONResponse(
                {"ok": False, "detail": "Missing refresh token."},
                status_code=status.HTTP_401_UNAUTHORIZED,
            )
            _clear_auth_cookies(response)
            return response

        session = (
            db.query(DBAdminSession)
            .filter(DBAdminSession.refresh_token_hash == _refresh_token_hash(refresh_token))
            .first()
        )
        if not session or session.revoked_at is not None or session.expires_at <= datetime.utcnow():
            response = JSONResponse(
                {"ok": False, "detail": "Refresh token expired or revoked."},
                status_code=status.HTTP_401_UNAUTHORIZED,
            )
            _clear_auth_cookies(response)
            return response

        session.revoked_at = datetime.utcnow()
        session.last_seen_at = datetime.utcnow()

        rotated_refresh_token = secrets.token_urlsafe(48)
        try:
            rotated_session = _create_refresh_session(
                db,
                username=session.username,
                refresh_token=rotated_refresh_token,
                request=request,
                rotated_from_session_id=session.id,
            )
            access_token, access_expires_at = _create_access_token(
                username=session.username,
                session_id=rotated_session.id,
            )
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            logger.exception("Failed to rotate admin refresh session.", extra={"error": str(exc)})
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Unable to refresh auth session.",
            ) from exc

        response = JSONResponse(
            {
                "ok": True,
                "username": session.username,
                "access_expires_at": access_expires_at.isoformat(),
                "refresh_expires_at": rotated_session.expires_at.isoformat(),
            }
        )
        _set_auth_cookies(
            response,
            access_token=access_token,
            refresh_token=rotated_refresh_token,
            access_expires_at=access_expires_at,
            refresh_expires_at=rotated_session.expires_at,
        )
        return response

    @auth_v1.post("/logout")
    def logout_admin_v1(
        request: Request,
        db: Session = Depends(get_db),
    ) -> Response:
        revoked = 0
        refresh_token = request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)
        if refresh_token:
            session = (
                db.query(DBAdminSession)
                .filter(DBAdminSession.refresh_token_hash == _refresh_token_hash(refresh_token))
                .first()
            )
            if session and session.revoked_at is None:
                session.revoked_at = datetime.utcnow()
                session.last_seen_at = datetime.utcnow()
                revoked += 1

        payload = None
        try:
            payload = _extract_access_payload(request)
        except HTTPException:
            payload = None
        if payload:
            session_id = str(payload.get("sid") or "").strip()
            if session_id:
                by_id = db.query(DBAdminSession).filter(DBAdminSession.id == session_id).first()
                if by_id and by_id.revoked_at is None:
                    by_id.revoked_at = datetime.utcnow()
                    by_id.last_seen_at = datetime.utcnow()
                    revoked += 1

        if revoked:
            db.commit()

        response = JSONResponse({"ok": True, "revoked": revoked})
        _clear_auth_cookies(response)
        return response

    @auth_v1.get("/me")
    def auth_me_v1(username: str = Depends(require_admin)) -> dict[str, Any]:
        return _serialize_auth_me(username=username, auth_mode=_get_admin_auth_mode())

    @admin_v1.get("/stats")
    def get_stats_v1(db: Session = Depends(get_db)) -> dict[str, Any]:
        return _get_stats_payload(db)

    @admin_v1.get("/metrics")
    def get_metrics_v1() -> dict[str, Any]:
        return request_metrics.snapshot()

    @admin_v1.get("/leads")
    def get_leads_v1(
        db: Session = Depends(get_db),
        page: int = Query(default=1, ge=1),
        page_size: int = Query(default=25, ge=1, le=100),
        q: str | None = Query(default=None),
        status: str | None = Query(default=None),
        segment: str | None = Query(default=None),
        tier: str | None = Query(default=None),
        heat_status: str | None = Query(default=None),
        company: str | None = Query(default=None),
        industry: str | None = Query(default=None),
        location: str | None = Query(default=None),
        tag: str | None = Query(default=None),
        min_score: float | None = Query(default=None, ge=0, le=100),
        max_score: float | None = Query(default=None, ge=0, le=100),
        has_email: bool | None = Query(default=None),
        has_phone: bool | None = Query(default=None),
        has_linkedin: bool | None = Query(default=None),
        created_from: str | None = Query(default=None),
        created_to: str | None = Query(default=None),
        last_scored_from: str | None = Query(default=None),
        last_scored_to: str | None = Query(default=None),
        sort: str = Query(default="created_at"),
        order: str = Query(default="desc"),
    ) -> dict[str, Any]:
        sort_desc = order.lower() == "desc"
        created_from_dt = _parse_datetime_field(created_from, "created_from")
        created_to_dt = _parse_datetime_field(created_to, "created_to")
        last_scored_from_dt = _parse_datetime_field(last_scored_from, "last_scored_from")
        last_scored_to_dt = _parse_datetime_field(last_scored_to, "last_scored_to")
        return _get_leads_payload(
            db,
            page=page,
            page_size=page_size,
            search=q,
            status_filter=status,
            segment_filter=segment,
            tier_filter=tier,
            heat_status_filter=heat_status,
            company_filter=company,
            industry_filter=industry,
            location_filter=location,
            tag_filter=tag,
            min_score=min_score,
            max_score=max_score,
            has_email=has_email,
            has_phone=has_phone,
            has_linkedin=has_linkedin,
            created_from=created_from_dt,
            created_to=created_to_dt,
            last_scored_from=last_scored_from_dt,
            last_scored_to=last_scored_to_dt,
            sort_by=sort,
            sort_desc=sort_desc
        )

    @admin_v1.get("/leads/{lead_id}")
    def get_lead_v1(
        lead_id: str,
        db: Session = Depends(get_db),
    ) -> Lead:
        db_lead = db.query(DBLead).filter(DBLead.id == lead_id).first()
        if not db_lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        return _db_to_lead(db_lead)

    @admin_v1.patch("/leads/{lead_id}")
    def update_lead_v1(
        lead_id: str,
        payload: dict[str, Any],
        db: Session = Depends(get_db),
    ) -> Lead:
        db_lead = db.query(DBLead).filter(DBLead.id == lead_id).first()
        if not db_lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        
        # Simple update logic for now
        if "status" in payload:
            db_lead.status = _coerce_lead_status(payload["status"])
        if "segment" in payload:
            db_lead.segment = payload["segment"]
        
        try:
            db.commit()
            db.refresh(db_lead)
        except SQLAlchemyError as exc:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(exc))
            
        return _db_to_lead(db_lead)

    @admin_v1.get("/leads/{lead_id}/tasks")
    def get_lead_tasks_v1(
        lead_id: str,
        db: Session = Depends(get_db),
    ) -> list[dict[str, Any]]:
        tasks = db.query(DBTask).filter(DBTask.lead_id == lead_id).order_by(DBTask.created_at.desc()).all()
        return [_serialize_task(task) for task in tasks]

    @admin_v1.get("/leads/{lead_id}/projects")
    def get_lead_projects_v1(
        lead_id: str,
        db: Session = Depends(get_db),
    ) -> list[dict[str, Any]]:
        projects = db.query(DBProject).filter(DBProject.lead_id == lead_id).order_by(DBProject.created_at.desc()).all()
        return [_serialize_project(project) for project in projects]


    @admin_v1.post("/leads")
    def create_lead_v1(
        payload: AdminLeadCreateRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        created = _create_lead_payload(db, payload)
        _emit_event_notification(
            db,
            event_key="lead_created",
            title="Nouveau lead cree",
            message=f"{created.get('email')} a ete ajoute au pipeline.",
            entity_type="lead",
            entity_id=created.get("id"),
            link_href=f"/leads/{created.get('id')}",
            metadata={"email": created.get("email")},
        )
        _audit_log(
            db,
            actor=actor,
            action="lead_created",
            entity_type="lead",
            entity_id=created.get("id"),
            metadata={"email": created.get("email")},
        )
        return created

    @admin_v1.delete("/leads/{lead_id}")
    def delete_lead_v1(
        lead_id: str,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        deleted = _delete_lead_payload(db, lead_id)
        _audit_log(
            db,
            actor=actor,
            action="lead_deleted",
            entity_type="lead",
            entity_id=lead_id,
        )
        return deleted

    @admin_v1.post("/leads/bulk-delete")
    def bulk_delete_leads_v1(
        payload: AdminBulkDeleteRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        result = _bulk_delete_leads_payload(db, payload.ids)
        _audit_log(
            db,
            actor=actor,
            action="leads_bulk_deleted",
            entity_type="lead",
            entity_id="bulk",
            metadata={"count": result.get("count"), "ids": payload.ids},
        )
        return result

    @admin_v1.post("/tasks")
    def create_task_v1(
        payload: AdminTaskCreateRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        created = _create_task_payload(db, payload)
        _emit_event_notification(
            db,
            event_key="task_created",
            title="Nouvelle tache creee",
            message=f"Tache '{created.get('title')}' ajoutee.",
            entity_type="task",
            entity_id=created.get("id"),
            link_href="/tasks",
            metadata={"priority": created.get("priority")},
        )
        _audit_log(
            db,
            actor=actor,
            action="task_created",
            entity_type="task",
            entity_id=created.get("id"),
        )
        return created

    @admin_v1.get("/tasks")
    def list_tasks_v1(
        db: Session = Depends(get_db),
        page: int = Query(default=1, ge=1),
        page_size: int = Query(default=25, ge=1, le=100),
        q: str | None = Query(default=None),
        status: str | None = Query(default=None),
        sort: str = Query(default="created_at"),
        order: str = Query(default="desc"),
    ) -> dict[str, Any]:
        sort_desc = order.lower() == "desc"
        return _get_tasks_payload(
            db,
            page=page,
            page_size=page_size,
            search=q,
            status_filter=status,
            sort_by=sort,
            sort_desc=sort_desc,
        )

    @admin_v1.patch("/tasks/{task_id}")
    def update_task_v1(
        task_id: str,
        payload: AdminTaskUpdateRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        updated = _update_task_payload(db, task_id, payload)
        _audit_log(
            db,
            actor=actor,
            action="task_updated",
            entity_type="task",
            entity_id=task_id,
        )
        return updated

    @admin_v1.delete("/tasks/{task_id}")
    def delete_task_v1(
        task_id: str,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        deleted = _delete_task_payload(db, task_id)
        _audit_log(
            db,
            actor=actor,
            action="task_deleted",
            entity_type="task",
            entity_id=task_id,
        )
        return deleted

    @admin_v1.post("/rescore")
    def rescore_leads_v1(
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        result = _rescore_payload(db)
        _audit_log(
            db,
            actor=actor,
            action="leads_rescored",
            entity_type="lead",
            metadata=result,
        )
        return result

    @admin_v1.get("/projects")
    def list_projects_v1(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
        projects = db.query(DBProject).order_by(DBProject.created_at.desc()).all()
        return [_serialize_project(project) for project in projects]

    @admin_v1.post("/projects")
    def create_project_v1(
        payload: AdminProjectCreateRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        created = _create_project_payload(db, payload)
        _emit_event_notification(
            db,
            event_key="project_created",
            title="Nouveau projet cree",
            message=f"Projet '{created.get('name')}' initialise.",
            entity_type="project",
            entity_id=created.get("id"),
            link_href="/projects",
            metadata={"status": created.get("status")},
        )
        _audit_log(
            db,
            actor=actor,
            action="project_created",
            entity_type="project",
            entity_id=created.get("id"),
        )
        return created

    @admin_v1.patch("/projects/{project_id}")
    def update_project_v1(
        project_id: str,
        payload: AdminProjectUpdateRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        updated = _update_project_payload(db, project_id, payload)
        _audit_log(
            db,
            actor=actor,
            action="project_updated",
            entity_type="project",
            entity_id=project_id,
        )
        return updated

    @admin_v1.delete("/projects/{project_id}")
    def delete_project_v1(
        project_id: str,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        deleted = _delete_project_payload(db, project_id)
        _audit_log(
            db,
            actor=actor,
            action="project_deleted",
            entity_type="project",
            entity_id=project_id,
        )
        return deleted

    @admin_v1.get("/analytics")
    def analytics_v1(db: Session = Depends(get_db)) -> dict[str, Any]:
        return _get_analytics_payload(db)

    @admin_v1.get("/settings")
    def get_settings_v1(db: Session = Depends(get_db)) -> dict[str, Any]:
        return _get_admin_settings_payload(db)

    @admin_v1.put("/settings")
    def put_settings_v1(
        payload: AdminSettingsPayload,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        saved = _save_admin_settings_payload(db, payload)
        _audit_log(
            db,
            actor=actor,
            action="settings_updated",
            entity_type="settings",
            entity_id="global",
        )
        return saved

    @admin_v1.get("/account")
    def get_account_v1(db: Session = Depends(get_db)) -> dict[str, Any]:
        return _get_account_payload(db)

    @admin_v1.put("/account")
    def put_account_v1(
        payload: AdminAccountPayload,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        saved = _save_account_payload(db, payload)
        _audit_log(
            db,
            actor=actor,
            action="account_updated",
            entity_type="account",
            entity_id="primary",
        )
        return saved

    @admin_v1.get("/billing")
    def get_billing_v1(db: Session = Depends(get_db)) -> dict[str, Any]:
        return _get_billing_payload(db)

    @admin_v1.put("/billing")
    def put_billing_v1(
        payload: AdminBillingProfilePayload,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        profile = _save_billing_profile_payload(db, payload)
        _audit_log(
            db,
            actor=actor,
            action="billing_updated",
            entity_type="billing_profile",
            entity_id="primary",
        )
        return {"profile": profile, "invoices": _list_billing_invoices_payload(db, limit=100)}

    @admin_v1.post("/billing/invoices")
    def create_billing_invoice_v1(
        payload: AdminBillingInvoiceCreateRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        invoice = _create_billing_invoice_payload(db, payload)
        _audit_log(
            db,
            actor=actor,
            action="billing_invoice_created",
            entity_type="billing_invoice",
            entity_id=invoice["id"],
            metadata={"invoice_number": invoice["invoice_number"]},
        )
        _emit_event_notification(
            db,
            event_key="billing_invoice_due",
            title="Nouvelle facture creee",
            message=f"Facture {invoice['invoice_number']} en statut {invoice['status']}.",
            entity_type="billing_invoice",
            entity_id=invoice["id"],
            link_href="/billing",
            metadata={"invoice_number": invoice["invoice_number"]},
        )
        return invoice

    @admin_v1.get("/notifications")
    def list_notifications_v1(
        db: Session = Depends(get_db),
        cursor: str | None = Query(default=None),
        limit: int = Query(default=25, ge=1, le=100),
        channel: str | None = Query(default=None),
        event_key: str | None = Query(default=None),
        unread_only: bool = Query(default=False),
    ) -> dict[str, Any]:
        return _list_notifications_payload(
            db,
            limit=limit,
            cursor=cursor,
            channel=channel,
            event_key=event_key,
            only_unread=unread_only,
        )

    @admin_v1.post("/notifications")
    def create_notification_v1(
        payload: AdminNotificationCreateRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        created = _create_notification_payload(db, payload)
        _audit_log(
            db,
            actor=actor,
            action="notification_created",
            entity_type="notification",
            metadata={"event_key": payload.event_key, "count": len(created)},
        )
        return {"items": created}

    @admin_v1.post("/notifications/mark-read")
    def mark_notifications_read_v1(
        payload: AdminNotificationMarkReadRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        result = _mark_notifications_read_payload(db, payload.ids)
        _audit_log(
            db,
            actor=actor,
            action="notifications_mark_read",
            entity_type="notification",
            metadata=result,
        )
        return result

    @admin_v1.post("/notifications/mark-all-read")
    def mark_all_notifications_read_v1(
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        result = _mark_all_notifications_read_payload(db)
        _audit_log(
            db,
            actor=actor,
            action="notifications_mark_all_read",
            entity_type="notification",
            metadata=result,
        )
        return result

    @admin_v1.get("/notifications/preferences")
    def get_notification_preferences_v1(db: Session = Depends(get_db)) -> dict[str, Any]:
        return _list_notification_preferences_payload(db)

    @admin_v1.put("/notifications/preferences")
    def put_notification_preferences_v1(
        payload: AdminNotificationPreferencesUpdatePayload,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        saved = _save_notification_preferences_payload(db, payload)
        _audit_log(
            db,
            actor=actor,
            action="notification_preferences_updated",
            entity_type="notification_preferences",
            entity_id="global",
        )
        return saved

    @admin_v1.get("/reports/schedules")
    def list_report_schedules_v1(db: Session = Depends(get_db)) -> dict[str, Any]:
        _run_due_report_schedules_payload(db)
        return _list_report_schedules_payload(db)

    @admin_v1.post("/reports/schedules")
    def create_report_schedule_v1(
        payload: AdminReportScheduleCreateRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        created = _create_report_schedule_payload(db, payload)
        _audit_log(
            db,
            actor=actor,
            action="report_schedule_created",
            entity_type="report_schedule",
            entity_id=created["id"],
        )
        return created

    @admin_v1.patch("/reports/schedules/{schedule_id}")
    def update_report_schedule_v1(
        schedule_id: str,
        payload: AdminReportScheduleUpdateRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        updated = _update_report_schedule_payload(db, schedule_id, payload)
        _audit_log(
            db,
            actor=actor,
            action="report_schedule_updated",
            entity_type="report_schedule",
            entity_id=schedule_id,
        )
        return updated

    @admin_v1.delete("/reports/schedules/{schedule_id}")
    def delete_report_schedule_v1(
        schedule_id: str,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        deleted = _delete_report_schedule_payload(db, schedule_id)
        _audit_log(
            db,
            actor=actor,
            action="report_schedule_deleted",
            entity_type="report_schedule",
            entity_id=schedule_id,
        )
        return deleted

    @admin_v1.get("/reports/schedules/runs")
    def list_report_runs_v1(
        db: Session = Depends(get_db),
        schedule_id: str | None = Query(default=None),
        limit: int = Query(default=50, ge=1, le=200),
    ) -> dict[str, Any]:
        return _list_report_runs_payload(db, schedule_id=schedule_id, limit=limit)

    @admin_v1.post("/reports/schedules/run-due")
    def run_due_report_schedules_v1(
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        result = _run_due_report_schedules_payload(db)
        _audit_log(
            db,
            actor=actor,
            action="report_schedules_run_due",
            entity_type="report_schedule",
            metadata={"executed": result.get("executed", 0)},
        )
        return result

    @admin_v1.get("/reports/export/pdf")
    def export_pdf_v1(
        db: Session = Depends(get_db),
        period: str = Query(default="30d"),
        dashboard: str = Query(default="operations"),
    ) -> Response:
        payload, file_name = _export_pdf_payload(db, period=period, dashboard=dashboard)
        return Response(
            content=payload,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{file_name}"'},
        )

    @admin_v1.get("/roles")
    def list_roles_v1(db: Session = Depends(get_db)) -> dict[str, Any]:
        return {"items": _list_roles_payload(db)}

    @admin_v1.get("/users")
    def list_users_v1(db: Session = Depends(get_db)) -> dict[str, Any]:
        return {"items": _list_users_payload(db)}

    @admin_v1.post("/users/invite")
    def invite_user_v1(
        payload: AdminUserInviteRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        return _invite_user_payload(db, payload, actor=actor)

    @admin_v1.patch("/users/{user_id}")
    def update_user_v1(
        user_id: str,
        payload: AdminUserUpdateRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        return _update_user_payload(db, user_id, payload, actor=actor)

    @admin_v1.get("/audit-log")
    def list_audit_log_v1(
        db: Session = Depends(get_db),
        cursor: str | None = Query(default=None),
        limit: int = Query(default=25, ge=1, le=100),
    ) -> dict[str, Any]:
        return _list_audit_logs_payload(db, cursor=cursor, limit=limit)

    @admin_v1.get("/export/csv", response_class=PlainTextResponse)
    def export_csv_v1(
        entity: str = Query(default="leads"),
        fields: str | None = Query(default=None),
        db: Session = Depends(get_db),
    ) -> PlainTextResponse:
        content, file_name = _export_csv_payload(db, entity=entity, fields=fields)
        return PlainTextResponse(
            content,
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{file_name}"'},
        )

    @admin_v1.get("/integrations")
    def integrations_v1(db: Session = Depends(get_db)) -> dict[str, Any]:
        return _list_integrations_payload(db)

    @admin_v1.put("/integrations")
    def put_integrations_v1(
        payload: AdminIntegrationsPayload,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        return _save_integrations_payload(db, payload, actor=actor)

    @admin_v1.get("/webhooks")
    def list_webhooks_v1(db: Session = Depends(get_db)) -> dict[str, Any]:
        return _list_webhooks_payload(db)

    @admin_v1.post("/webhooks")
    def create_webhook_v1(
        payload: AdminWebhookCreateRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        return _create_webhook_payload(db, payload, actor=actor)

    @admin_v1.delete("/webhooks/{webhook_id}")
    def delete_webhook_v1(
        webhook_id: str,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        return _delete_webhook_payload(db, webhook_id, actor=actor)

    @admin_v1.get("/search")
    def search_v1(
        db: Session = Depends(get_db),
        q: str = Query(default=""),
        limit: int = Query(default=20, ge=1, le=50),
    ) -> dict[str, Any]:
        return _search_payload(db, query=q, limit=limit)

    @admin_v1.get("/research/web")
    def web_research_v1(
        db: Session = Depends(get_db),
        q: str = Query(default=""),
        provider: str = Query(default="auto"),
        limit: int = Query(default=8, ge=1, le=25),
    ) -> dict[str, Any]:
        return _web_research_payload(
            db,
            query=q,
            provider=provider,
            limit=limit,
        )

    @admin_v1.get("/help")
    def help_v1(db: Session = Depends(get_db)) -> dict[str, Any]:
        return _help_payload(db)

    @admin_v1.post("/import/csv/preview")
    async def import_csv_preview_v1(
        file: UploadFile = File(...),
        table: str | None = Form(default=None),
        mapping_json: str | None = Form(default=None),
    ) -> dict[str, Any]:
        content = await file.read()
        mapping = _parse_import_mapping(mapping_json)
        return preview_csv_import(content=content, table=table, mapping=mapping)

    @admin_v1.post("/import/csv/commit")
    async def import_csv_commit_v1(
        actor: str = "admin",
        db: Session = Depends(get_db),
        file: UploadFile = File(...),
        table: str | None = Form(default=None),
        mapping_json: str | None = Form(default=None),
    ) -> dict[str, Any]:
        content = await file.read()
        mapping = _parse_import_mapping(mapping_json)
        result = commit_csv_import(db=db, content=content, table=table, mapping=mapping)
        _audit_log(
            db,
            actor=actor,
            action="csv_import_committed",
            entity_type="import",
            metadata={
                "table": result.get("table"),
                "processed_rows": result.get("processed_rows"),
                "created": result.get("created"),
                "updated": result.get("updated"),
                "skipped": result.get("skipped"),
            },
        )
        return result

    @admin_v1.post("/diagnostics/run")
    def diagnostics_run_v1(
        payload: AdminDiagnosticsRunRequest | None = None,
    ) -> dict[str, Any]:
        auto_fix = bool(payload.auto_fix) if payload else False
        return run_intelligent_diagnostics(auto_fix=auto_fix)

    @admin_v1.get("/diagnostics/latest")
    def diagnostics_latest_v1() -> dict[str, Any]:
        return get_latest_diagnostics()

    @admin_v1.post("/autofix/run")
    def autofix_run_v1() -> dict[str, Any]:
        return run_intelligent_diagnostics(auto_fix=True)

    @admin_v1.get("/autofix/latest")
    def autofix_latest_v1() -> dict[str, Any]:
        return get_latest_autofix()

    @api_v1.post(
        "/score/preview",
        dependencies=[Depends(require_admin), Depends(require_rate_limit)],
    )
    def preview_score_v1(lead: Lead) -> dict[str, Any]:
        return _preview_payload(lead)

    # ── Assistant Prospect ────────────────────────────────────────
    def _serialize_assistant_action(a: DBAssistantAction) -> dict:
        return {
            "id": a.id,
            "action_type": a.action_type,
            "entity_type": a.entity_type,
            "payload": a.payload_json or {},
            "requires_confirm": bool(a.requires_confirm),
            "status": a.status,
            "result": a.result_json or {},
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "executed_at": a.executed_at.isoformat() if a.executed_at else None,
        }

    def _serialize_assistant_run(run: DBAssistantRun, include_actions: bool = False) -> dict:
        data = {
            "id": run.id,
            "prompt": run.prompt,
            "status": run.status,
            "actor": run.actor,
            "summary": run.summary,
            "config": run.config_json or {},
            "created_at": run.created_at.isoformat() if run.created_at else None,
            "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        }
        if include_actions:
            data["actions"] = [_serialize_assistant_action(a) for a in (run.actions or [])]
        else:
            data["action_count"] = len(run.actions or [])
        return data

    def _check_prospect_enabled(db: Session) -> None:
        setting = db.query(DBAdminSetting).filter_by(key="assistant_prospect_enabled").first()
        if setting and setting.value_json is True:
            return
        if setting and isinstance(setting.value_json, dict) and setting.value_json.get("enabled") is True:
            return
        # Default: allow in development, block in production
        if _is_production():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Prospect AI is not enabled. Set assistant_prospect_enabled to true in settings.",
            )

    @admin_v1.post("/research")
    def research_query_v1(
        payload: ResearchRequest,
        username: str = Depends(require_admin),
    ) -> Response:
        """Run a web search using the specified provider (default: Perplexity)."""
        try:
            results = run_web_research(
                query=payload.query,
                limit=payload.limit,
                provider_selector=payload.provider,
                provider_configs={
                    "perplexity": {"enabled": True},
                    "duckduckgo": {"enabled": True},
                    "firecrawl": {"enabled": True},
                },
            )
            return JSONResponse(results)
        except Exception as exc:
            logger.error("Research error: %s", exc)
            raise HTTPException(status_code=500, detail=str(exc))

    @admin_v1.post("/assistant/prospect/execute")
    def assistant_prospect_execute(
        body: AssistantRunRequest,
        db: Session = Depends(get_db),
        admin_user: str = Depends(require_admin),
    ) -> dict:
        _check_prospect_enabled(db)
        config = {
            "max_leads": body.max_leads,
            "source": body.source,
            "auto_confirm": body.auto_confirm,
        }
        run = _ast_store.create_run(db, prompt=body.prompt, actor=admin_user, config=config)
        _audit_log(
            db,
            actor=admin_user,
            action="assistant_run_started",
            entity_type="assistant_run",
            entity_id=run.id,
            metadata={"prompt": body.prompt},
        )
        try:
            plan = _ast_svc.call_khoj(body.prompt, config)
            _ast_svc.execute_plan(db, run.id, plan, auto_confirm=body.auto_confirm)
        except Exception as exc:
            _ast_store.finish_run(db, run.id, status="failed", summary=str(exc))
            logger.error("Assistant run %s failed: %s", run.id, exc)

        db.refresh(run)
        return _serialize_assistant_run(run, include_actions=True)

    @admin_v1.get("/assistant/prospect/runs")
    def assistant_prospect_list_runs(
        limit: int = Query(default=25, ge=1, le=100),
        offset: int = Query(default=0, ge=0),
        db: Session = Depends(get_db),
    ) -> dict:
        _check_prospect_enabled(db)
        runs = _ast_store.list_runs(db, limit=limit, offset=offset)
        return {
            "items": [_serialize_assistant_run(r) for r in runs],
            "total": db.query(DBAssistantRun).count(),
            "limit": limit,
            "offset": offset,
        }

    @admin_v1.get("/assistant/prospect/runs/{run_id}")
    def assistant_prospect_get_run(
        run_id: str,
        db: Session = Depends(get_db),
    ) -> dict:
        _check_prospect_enabled(db)
        run = _ast_store.get_run(db, run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
        return _serialize_assistant_run(run, include_actions=True)

    @admin_v1.post("/assistant/prospect/confirm")
    def assistant_prospect_confirm(
        body: AssistantConfirmRequest,
        db: Session = Depends(get_db),
        admin_user: str = Depends(require_admin),
    ) -> dict:
        _check_prospect_enabled(db)
        if body.approve:
            results = _ast_svc.execute_confirmed_actions(db, body.action_ids)
            _audit_log(
                db,
                actor=admin_user,
                action="assistant_actions_approved",
                entity_type="assistant_action",
                metadata={"action_ids": body.action_ids, "results": results},
            )
            return {"approved": True, "results": results}
        else:
            count = _ast_svc.reject_actions(db, body.action_ids)
            _audit_log(
                db,
                actor=admin_user,
                action="assistant_actions_rejected",
                entity_type="assistant_action",
                metadata={"action_ids": body.action_ids},
            )
            return {"rejected": True, "count": count}

    api_v1.include_router(auth_v1)
    api_v1.include_router(admin_v1)
    app.include_router(api_v1)

    return app


app = create_app()
