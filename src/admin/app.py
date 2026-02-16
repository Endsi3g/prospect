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
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, Response
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, or_, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException
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
    DBCampaign,
    DBCampaignRun,
    DBCampaignSequence,
    DBCompany,
    DBIntegrationConfig,
    DBInteraction,
    DBLead,
    DBNotification,
    DBNotificationPreference,
    DBOpportunity,
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
from . import campaign_service as _campaign_svc
from . import content_service as _content_svc
from . import enrichment_service as _enrichment_svc
from . import funnel_service as _funnel_svc
from .assistant_types import AssistantConfirmRequest, AssistantRunRequest
from .diagnostics_service import (
    get_latest_autofix,
    get_latest_diagnostics,
    run_intelligent_diagnostics,
)
from .import_service import commit_csv_import, preview_csv_import
from .research_service import run_web_research
from . import secrets_manager as _sec_svc
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
PASSWORD_HASH_ITERATIONS = 260_000

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
    "ollama": {
        "enabled": False,
        "config": {
            "api_base_url": "",
            "api_key_env": "OLLAMA_API_KEY",
            "model_research": "llama3.1:8b-instruct",
            "model_content": "llama3.1:8b-instruct",
            "model_assistant": "llama3.1:8b-instruct",
            "temperature": 0.2,
            "max_tokens": 700,
            "timeout_seconds": 25,
        },
        "meta": {
            "category": "ai",
            "free_tier": "Open-source self-hosted model runtime",
            "description": "Hosted Ollama instance for online open-source AI inference.",
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
TASK_CHANNELS = {"email", "linkedin", "call"}
TASK_SOURCES = {"manual", "auto-rule", "assistant"}
OPPORTUNITY_STAGES = {
    "qualification",
    "discovery",
    "proposal",
    "negotiation",
    "won",
    "lost",
}
OPPORTUNITY_STATUSES = {"open", "won", "lost"}
OPPORTUNITY_PIPELINE_STAGES = ("Prospect", "Qualified", "Proposed", "Won", "Lost")
OPPORTUNITY_PIPELINE_STAGE_SET = set(OPPORTUNITY_PIPELINE_STAGES)
AUTO_TASK_DEFAULT_CHANNELS = ["email", "linkedin", "call"]
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
SYNC_STALE_WARNING_SECONDS = 5 * 60
SYNC_STALE_ERROR_SECONDS = 30 * 60
INTEGRITY_STALE_UNSCORED_DAYS = 14
FUNNEL_CONFIG_SETTING_KEY = "funnel_config"
DEFAULT_FUNNEL_CONFIG: dict[str, Any] = {
    "stages": list(_funnel_svc.CANONICAL_STAGES),
    "terminal_stages": sorted(list(_funnel_svc.TERMINAL_STAGES)),
    "stage_sla_hours": dict(_funnel_svc.STAGE_SLA_HOURS),
    "next_action_hours": dict(_funnel_svc.NEXT_ACTION_HOURS),
    "model": "canonical_v1",
}


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


class AdminLeadUpdateRequest(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: EmailStr | None = None
    title: str | None = None
    phone: str | None = None
    linkedin_url: str | None = None
    status: str | None = None
    segment: str | None = None
    tags: list[str] | None = None
    company_name: str | None = None
    company_domain: str | None = None
    company_industry: str | None = None
    company_location: str | None = None


class AdminLeadOpportunityCreateRequest(BaseModel):
    name: str = Field(min_length=2)
    stage: str | None = None
    status: str | None = None
    amount: float | None = Field(default=None, ge=0)
    probability: int | None = Field(default=None, ge=0, le=100)
    expected_close_date: str | None = None
    details: dict[str, Any] | None = None


class AdminLeadOpportunityUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2)
    stage: str | None = None
    status: str | None = None
    amount: float | None = Field(default=None, ge=0)
    probability: int | None = Field(default=None, ge=0, le=100)
    expected_close_date: str | None = None
    details: dict[str, Any] | None = None


class AdminOpportunityCreateRequest(BaseModel):
    prospect_id: str = Field(min_length=1)
    amount: float = Field(ge=0)
    stage: str
    probability: int = Field(ge=0, le=100)
    close_date: str | None = None
    assigned_to: str | None = None
    name: str | None = None


class AdminOpportunityUpdateRequest(BaseModel):
    prospect_id: str | None = Field(default=None, min_length=1)
    amount: float | None = Field(default=None, ge=0)
    stage: str | None = None
    probability: int | None = Field(default=None, ge=0, le=100)
    close_date: str | None = None
    assigned_to: str | None = None
    name: str | None = Field(default=None, min_length=2)


class AdminOpportunityQuickLeadRequest(BaseModel):
    first_name: str = Field(min_length=1)
    last_name: str = Field(min_length=1)
    email: EmailStr
    company_name: str = Field(min_length=1)


class AdminLeadNoteItemPayload(BaseModel):
    id: str | None = None
    content: str = Field(min_length=1)
    author: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class AdminLeadNotesUpdateRequest(BaseModel):
    items: list[AdminLeadNoteItemPayload] = Field(default_factory=list)


class AdminLeadAddToCampaignRequest(BaseModel):
    campaign_id: str = Field(min_length=1)


class AdminBulkDeleteRequest(BaseModel):
    ids: list[str] = Field(default_factory=list)
    segment: str | None = None


class AdminTaskCreateRequest(BaseModel):
    title: str
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    due_date: str | None = None
    assigned_to: str | None = None
    lead_id: str | None = None
    project_id: str | None = None
    project_name: str | None = None
    channel: str | None = None
    sequence_step: int | None = Field(default=None, ge=1, le=30)
    source: str | None = None
    rule_id: str | None = None
    score_snapshot: dict[str, Any] | None = None
    subtasks: list[dict[str, Any]] | None = None
    attachments: list[dict[str, Any]] | None = None


class AdminTaskUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1)
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    due_date: str | None = None
    assigned_to: str | None = None
    lead_id: str | None = None
    project_id: str | None = None
    project_name: str | None = None
    channel: str | None = None
    sequence_step: int | None = Field(default=None, ge=1, le=30)
    source: str | None = None
    rule_id: str | None = None
    score_snapshot: dict[str, Any] | None = None
    subtasks: list[dict[str, Any]] | None = None
    comments: list[dict[str, Any]] | None = None
    attachments: list[dict[str, Any]] | None = None


class AdminTaskCommentCreateRequest(BaseModel):
    body: str = Field(min_length=1)
    mentions: list[str] = Field(default_factory=list)
    author: str | None = None


class AdminTaskCloseRequest(BaseModel):
    note: str | None = None


class AdminLeadAutoTaskCreateRequest(BaseModel):
    channels: list[str] = Field(default_factory=lambda: list(AUTO_TASK_DEFAULT_CHANNELS))
    mode: str = "append"
    dry_run: bool = False
    assigned_to: str | None = None


class AdminLeadStageTransitionRequest(BaseModel):
    to_stage: str = Field(min_length=2)
    reason: str | None = None
    source: str = "manual"
    sync_legacy: bool = True


class AdminOpportunityStageTransitionRequest(BaseModel):
    to_stage: str = Field(min_length=2)
    reason: str | None = None
    source: str = "manual"


class AdminLeadReassignRequest(BaseModel):
    owner_user_id: str | None = None
    owner_email: EmailStr | None = None
    owner_display_name: str | None = None
    reason: str | None = None


class AdminTaskBulkAssignRequest(BaseModel):
    task_ids: list[str] = Field(default_factory=list)
    assigned_to: str = Field(min_length=1)
    reason: str | None = None


class AdminFunnelConfigUpdatePayload(BaseModel):
    stages: list[str] | None = None
    terminal_stages: list[str] | None = None
    stage_sla_hours: dict[str, int] | None = None
    next_action_hours: dict[str, int] | None = None
    model: str | None = None


class AdminHandoffCreateRequest(BaseModel):
    lead_id: str | None = None
    opportunity_id: str | None = None
    to_user_id: str | None = None
    to_user_email: EmailStr | None = None
    to_user_display_name: str | None = None
    note: str | None = None


class AdminProjectCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None
    status: str | None = None
    lead_id: str | None = None
    progress_percent: int | None = Field(default=None, ge=0, le=100)
    budget_total: float | None = Field(default=None, ge=0)
    budget_spent: float | None = Field(default=None, ge=0)
    team: list[dict[str, Any]] | None = None
    timeline: list[dict[str, Any]] | None = None
    deliverables: list[dict[str, Any]] | None = None
    due_date: str | None = None


class AdminProjectUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    description: str | None = None
    status: str | None = None
    lead_id: str | None = None
    progress_percent: int | None = Field(default=None, ge=0, le=100)
    budget_total: float | None = Field(default=None, ge=0)
    budget_spent: float | None = Field(default=None, ge=0)
    team: list[dict[str, Any]] | None = None
    timeline: list[dict[str, Any]] | None = None
    deliverables: list[dict[str, Any]] | None = None
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


class AdminSecretUpsertPayload(BaseModel):
    key: str = Field(min_length=1)
    value: str = Field(min_length=1)


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


class CampaignSequenceCreateRequest(BaseModel):
    name: str = Field(min_length=2)
    description: str | None = None
    status: str = "draft"
    channels: list[str] = Field(default_factory=list)
    steps: list[dict[str, Any]] = Field(default_factory=list)


class CampaignSequenceUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2)
    description: str | None = None
    status: str | None = None
    channels: list[str] | None = None
    steps: list[dict[str, Any]] | None = None


class CampaignSequenceSimulateRequest(BaseModel):
    lead_context: dict[str, Any] = Field(default_factory=dict)
    start_at: str | None = None


class CampaignCreateRequest(BaseModel):
    name: str = Field(min_length=2)
    description: str | None = None
    status: str = "draft"
    sequence_id: str | None = None
    channel_strategy: dict[str, Any] = Field(default_factory=dict)
    enrollment_filter: dict[str, Any] = Field(default_factory=dict)


class CampaignUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2)
    description: str | None = None
    status: str | None = None
    sequence_id: str | None = None
    channel_strategy: dict[str, Any] | None = None
    enrollment_filter: dict[str, Any] | None = None


class CampaignEnrollRequest(BaseModel):
    lead_ids: list[str] = Field(default_factory=list)
    filters: dict[str, Any] = Field(default_factory=dict)
    max_leads: int = Field(default=50, ge=1, le=500)


class ContentGenerateRequest(BaseModel):
    lead_id: str | None = None
    channel: str = Field(min_length=2)
    step: int = Field(default=1, ge=1, le=20)
    template_key: str | None = None
    context: dict[str, Any] = Field(default_factory=dict)
    provider: str = "deterministic"


class EnrichmentRunRequest(BaseModel):
    query: str = Field(min_length=2)
    lead_id: str | None = None
    provider: str = "mock"
    context: dict[str, Any] = Field(default_factory=dict)


class ResearchRequest(BaseModel):
    query: str
    limit: int = 5
    provider: str = "perplexity"  # perplexity, duckduckgo, firecrawl, ollama


class AdminAuthLoginRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class AdminAuthSignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)
    display_name: str | None = Field(default=None, max_length=120)


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


def _normalize_admin_email(value: str) -> str:
    return value.strip().lower()


def _hash_admin_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_HASH_ITERATIONS,
    )
    return (
        f"pbkdf2_sha256${PASSWORD_HASH_ITERATIONS}"
        f"${_base64url_encode(salt)}${_base64url_encode(digest)}"
    )


def _verify_admin_password(password: str, stored_hash: str | None) -> bool:
    if not stored_hash:
        return False
    try:
        algorithm, iterations_raw, salt_raw, digest_raw = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_raw)
        if iterations <= 0:
            return False
        salt = _base64url_decode(salt_raw)
        expected_digest = _base64url_decode(digest_raw)
    except Exception:
        return False

    computed = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        iterations,
    )
    return hmac.compare_digest(computed, expected_digest)


def _resolve_db_admin_subject(db: Session, username: str, password: str) -> str | None:
    normalized_email = _normalize_admin_email(username)
    if not normalized_email:
        return None
    user = (
        db.query(DBAdminUser)
        .filter(func.lower(DBAdminUser.email) == normalized_email)
        .first()
    )
    if not user:
        return None
    if user.status != "active":
        return None
    if not _verify_admin_password(password, user.password_hash):
        return None
    return user.email


def _resolve_admin_subject(db: Session, username: str, password: str) -> str | None:
    candidate = username.strip()
    if not candidate:
        return None
    if _is_valid_admin_credentials(candidate, password):
        return candidate
    return _resolve_db_admin_subject(db, candidate, password)


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


def _status_error_code(status_code: int) -> str:
    if status_code == status.HTTP_400_BAD_REQUEST:
        return "BAD_REQUEST"
    if status_code == status.HTTP_401_UNAUTHORIZED:
        return "UNAUTHORIZED"
    if status_code == status.HTTP_403_FORBIDDEN:
        return "FORBIDDEN"
    if status_code == status.HTTP_404_NOT_FOUND:
        return "NOT_FOUND"
    if status_code == status.HTTP_409_CONFLICT:
        return "CONFLICT"
    if status_code in {HTTP_422_STATUS, status.HTTP_422_UNPROCESSABLE_ENTITY}:
        return "VALIDATION_ERROR"
    if status_code == status.HTTP_429_TOO_MANY_REQUESTS:
        return "RATE_LIMITED"
    if status_code in {
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        status.HTTP_502_BAD_GATEWAY,
        status.HTTP_503_SERVICE_UNAVAILABLE,
        status.HTTP_504_GATEWAY_TIMEOUT,
    }:
        return "UPSTREAM_UNAVAILABLE" if status_code in {502, 503, 504} else "INTERNAL_ERROR"
    return "HTTP_ERROR"


def _is_retryable_status(status_code: int) -> bool:
    return status_code in {
        status.HTTP_408_REQUEST_TIMEOUT,
        status.HTTP_429_TOO_MANY_REQUESTS,
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        status.HTTP_502_BAD_GATEWAY,
        status.HTTP_503_SERVICE_UNAVAILABLE,
        status.HTTP_504_GATEWAY_TIMEOUT,
    }


def _extract_error_message_and_details(detail: Any) -> tuple[str, dict[str, Any]]:
    if isinstance(detail, str):
        return detail, {}
    if isinstance(detail, list):
        return "Request validation failed.", {"issues": detail}
    if isinstance(detail, dict):
        message = detail.get("message")
        if not isinstance(message, str) or not message.strip():
            message = "Request failed."
        details = {k: v for k, v in detail.items() if k != "message"}
        return message, details
    if detail is None:
        return "Request failed.", {}
    return str(detail), {}


def _error_response(
    request: Request,
    *,
    status_code: int,
    code: str | None = None,
    message: str,
    details: dict[str, Any] | None = None,
    retryable: bool | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None) or request.headers.get("x-request-id")
    payload = {
        "error": {
            "code": code or _status_error_code(status_code),
            "message": message,
            "details": details or {},
            "retryable": _is_retryable_status(status_code) if retryable is None else bool(retryable),
            "request_id": request_id,
        },
        "detail": message,
    }
    response = JSONResponse(status_code=status_code, content=payload)
    if request_id:
        response.headers["x-request-id"] = str(request_id)
    if headers:
        for key, value in headers.items():
            if value is None:
                continue
            response.headers[key] = value
    return response


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
            subject = _resolve_admin_subject(db, username, password)
            if subject:
                return subject
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


def _validate_lead_status(raw_status: str) -> LeadStatus:
    normalized = raw_status.strip().upper()
    try:
        return LeadStatus(normalized)
    except ValueError as exc:
        allowed = ", ".join(sorted(item.value for item in LeadStatus))
        raise HTTPException(
            status_code=HTTP_422_STATUS,
            detail=f"Unsupported lead status: {raw_status}. Allowed: {allowed}",
        ) from exc


def _coerce_opportunity_stage(raw_value: str | None) -> str:
    if not raw_value:
        return "qualification"
    candidate = raw_value.strip().lower()
    if candidate not in OPPORTUNITY_STAGES:
        allowed = ", ".join(sorted(OPPORTUNITY_STAGES))
        raise HTTPException(
            status_code=HTTP_422_STATUS,
            detail=f"Unsupported opportunity stage: {raw_value}. Allowed: {allowed}",
        )
    return candidate


def _coerce_opportunity_status(raw_value: str | None) -> str:
    if not raw_value:
        return "open"
    candidate = raw_value.strip().lower()
    if candidate not in OPPORTUNITY_STATUSES:
        allowed = ", ".join(sorted(OPPORTUNITY_STATUSES))
        raise HTTPException(
            status_code=HTTP_422_STATUS,
            detail=f"Unsupported opportunity status: {raw_value}. Allowed: {allowed}",
        )
    return candidate


def _coerce_pipeline_opportunity_stage(raw_value: str | None) -> str:
    if not raw_value:
        return "Prospect"
    candidate = raw_value.strip().lower()
    aliases = {
        "prospect": "Prospect",
        "qualified": "Qualified",
        "proposed": "Proposed",
        "won": "Won",
        "lost": "Lost",
        "qualification": "Prospect",
        "discovery": "Qualified",
        "proposal": "Proposed",
        "negotiation": "Proposed",
    }
    if candidate in aliases:
        return aliases[candidate]
    for known in OPPORTUNITY_PIPELINE_STAGES:
        if known.lower() == candidate:
            return known
    allowed = ", ".join(OPPORTUNITY_PIPELINE_STAGES)
    raise HTTPException(
        status_code=HTTP_422_STATUS,
        detail=f"Unsupported opportunity stage: {raw_value}. Allowed: {allowed}",
    )


def _infer_opportunity_status_from_stage(stage: str) -> str:
    lowered = stage.strip().lower()
    if lowered == "won":
        return "won"
    if lowered == "lost":
        return "lost"
    return "open"


def _coerce_assigned_to(raw_value: str | None) -> str:
    cleaned = (raw_value or "").strip()
    if cleaned:
        return cleaned
    return "Vous"


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


def _coerce_progress_percent(raw_value: int | None) -> int:
    if raw_value is None:
        return 0
    return max(0, min(int(raw_value), 100))


def _coerce_budget_value(raw_value: float | None, *, default_zero: bool = False) -> float | None:
    if raw_value is None:
        return 0.0 if default_zero else None
    value = float(raw_value)
    if value < 0:
        raise HTTPException(
            status_code=HTTP_422_STATUS,
            detail="Budget values must be greater than or equal to 0.",
        )
    return round(value, 2)


def _normalize_project_list_payload(raw_items: list[dict[str, Any]] | None, *, field_name: str) -> list[dict[str, Any]]:
    if not raw_items:
        return []
    normalized: list[dict[str, Any]] = []
    for index, item in enumerate(raw_items):
        if not isinstance(item, dict):
            continue
        clean = dict(item)
        if not clean.get("id"):
            clean["id"] = f"{field_name}-{index + 1}"
        normalized.append(clean)
    return normalized


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


def _coerce_task_channel(raw_channel: str | None) -> str:
    if not raw_channel:
        return "email"
    candidate = raw_channel.strip().lower()
    if candidate in TASK_CHANNELS:
        return candidate
    raise HTTPException(
        status_code=HTTP_422_STATUS,
        detail=f"Unsupported task channel: {raw_channel}",
    )


def _coerce_task_source(raw_source: str | None) -> str:
    if not raw_source:
        return "manual"
    candidate = raw_source.strip().lower()
    if candidate in TASK_SOURCES:
        return candidate
    raise HTTPException(
        status_code=HTTP_422_STATUS,
        detail=f"Unsupported task source: {raw_source}",
    )


def _normalize_task_subtasks_payload(raw_items: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    if not raw_items:
        return []
    now_iso = datetime.now().isoformat()
    normalized: list[dict[str, Any]] = []
    for index, item in enumerate(raw_items):
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        normalized.append(
            {
                "id": str(item.get("id") or f"subtask-{index + 1}"),
                "title": title,
                "done": bool(item.get("done", False)),
                "created_at": str(item.get("created_at") or now_iso),
                "updated_at": str(item.get("updated_at") or now_iso),
            }
        )
    return normalized


def _normalize_task_comments_payload(raw_items: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    if not raw_items:
        return []
    now_iso = datetime.now().isoformat()
    normalized: list[dict[str, Any]] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        body = str(item.get("body") or "").strip()
        if not body:
            continue
        raw_mentions = item.get("mentions")
        mentions = (
            [str(mention).strip() for mention in raw_mentions if str(mention).strip()]
            if isinstance(raw_mentions, list)
            else []
        )
        normalized.append(
            {
                "id": str(item.get("id") or str(uuid.uuid4())),
                "body": body,
                "author": str(item.get("author") or "Vous"),
                "mentions": mentions,
                "created_at": str(item.get("created_at") or now_iso),
            }
        )
    return normalized


def _normalize_task_attachments_payload(raw_items: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    if not raw_items:
        return []
    now_iso = datetime.now().isoformat()
    normalized: list[dict[str, Any]] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        url = str(item.get("url") or "").strip()
        name = str(item.get("name") or url or "").strip()
        if not name:
            continue
        try:
            size_kb = float(item.get("size_kb", 0) or 0)
        except (TypeError, ValueError):
            size_kb = 0.0
        normalized.append(
            {
                "id": str(item.get("id") or str(uuid.uuid4())),
                "name": name,
                "url": url or None,
                "size_kb": size_kb,
                "created_at": str(item.get("created_at") or now_iso),
            }
        )
    return normalized


def _normalize_task_timeline_payload(raw_items: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    if not raw_items:
        return []
    normalized: list[dict[str, Any]] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        event_type = str(item.get("event_type") or "").strip()
        message = str(item.get("message") or "").strip()
        if not event_type and not message:
            continue
        normalized.append(
            {
                "id": str(item.get("id") or str(uuid.uuid4())),
                "event_type": event_type or "updated",
                "message": message or "Tache mise a jour.",
                "actor": str(item.get("actor") or "system"),
                "created_at": str(item.get("created_at") or datetime.now().isoformat()),
                "metadata": item.get("metadata") if isinstance(item.get("metadata"), dict) else {},
            }
        )
    normalized.sort(key=lambda item: str(item.get("created_at") or ""), reverse=True)
    return normalized


def _append_task_timeline_entry(
    task: DBTask,
    *,
    event_type: str,
    message: str,
    actor: str = "system",
    metadata: dict[str, Any] | None = None,
    created_at: datetime | None = None,
) -> None:
    timeline = _normalize_task_timeline_payload(list(task.timeline_json or []))
    timeline.insert(
        0,
        {
            "id": str(uuid.uuid4()),
            "event_type": event_type,
            "message": message,
            "actor": actor,
            "created_at": (created_at or datetime.now()).isoformat(),
            "metadata": metadata or {},
        },
    )
    task.timeline_json = timeline[:200]


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


def _parse_window_days(window: str | None, *, default_days: int = 30) -> tuple[str, int]:
    candidate = (window or f"{default_days}d").strip().lower()
    if candidate == "ytd":
        now = datetime.now()
        start = datetime(now.year, 1, 1)
        return "ytd", max(1, (now - start).days + 1)
    if candidate.endswith("d"):
        raw_days = candidate[:-1]
        try:
            days = int(raw_days)
        except ValueError as exc:
            raise HTTPException(
                status_code=HTTP_422_STATUS,
                detail=f"Unsupported window: {window}",
            ) from exc
        if days <= 0 or days > 365:
            raise HTTPException(
                status_code=HTTP_422_STATUS,
                detail=f"Unsupported window: {window}",
            )
        return candidate, days
    raise HTTPException(
        status_code=HTTP_422_STATUS,
        detail=f"Unsupported window: {window}",
    )


def _normalize_task_channels(raw_channels: list[str] | None) -> list[str]:
    if not raw_channels:
        return list(AUTO_TASK_DEFAULT_CHANNELS)
    cleaned: list[str] = []
    for channel in raw_channels:
        normalized = _coerce_task_channel(channel)
        if normalized not in cleaned:
            cleaned.append(normalized)
    return cleaned


def _lead_score_snapshot(db_lead: DBLead) -> dict[str, Any]:
    return {
        "total_score": round(float(db_lead.total_score or 0.0), 2),
        "icp_score": round(float(db_lead.icp_score or 0.0), 2),
        "heat_score": round(float(db_lead.heat_score or 0.0), 2),
        "tier": db_lead.tier or "Tier D",
        "heat_status": db_lead.heat_status or "Cold",
        "next_best_action": db_lead.next_best_action,
        "last_scored_at": db_lead.last_scored_at.isoformat() if db_lead.last_scored_at else None,
    }


def _communication_rule_for_lead(db_lead: DBLead) -> dict[str, Any]:
    total_score = float(db_lead.total_score or 0.0)
    tier = (db_lead.tier or "Tier D").strip()
    heat_status = (db_lead.heat_status or "Cold").strip().lower()
    next_best_action = (db_lead.next_best_action or "").strip()

    if total_score >= 85 or tier.upper() == "TIER A":
        return {
            "rule_id": "tier_a_hot_accelerated",
            "name": "Acceleration niveau A",
            "priority": "high",
            "confidence": 0.9,
            "steps": [
                {"day_offset": 0, "channel": "call", "priority": "Critical"},
                {"day_offset": 0, "channel": "email", "priority": "High"},
                {"day_offset": 2, "channel": "linkedin", "priority": "High"},
            ],
            "reasoning": [
                f"Score eleve ({round(total_score, 1)}/100) ou tier premium ({tier}).",
                "Cadence serree recommandee pour maximiser le taux de conversion.",
            ],
        }

    if heat_status in {"hot", "warm"} or total_score >= 65:
        return {
            "rule_id": "warm_nurture_multichannel",
            "name": "Nurturing multicanal",
            "priority": "medium",
            "confidence": 0.78,
            "steps": [
                {"day_offset": 0, "channel": "email", "priority": "High"},
                {"day_offset": 2, "channel": "linkedin", "priority": "Medium"},
                {"day_offset": 5, "channel": "call", "priority": "Medium"},
            ],
            "reasoning": [
                "Signal de chaleur present, necessite une sequence reguliere.",
                f"Next best action: {next_best_action or 'n/a'}.",
            ],
        }

    return {
        "rule_id": "cold_light_touch",
        "name": "Approche progressive",
        "priority": "low",
        "confidence": 0.62,
        "steps": [
            {"day_offset": 0, "channel": "email", "priority": "Medium"},
            {"day_offset": 5, "channel": "linkedin", "priority": "Low"},
            {"day_offset": 10, "channel": "call", "priority": "Low"},
        ],
        "reasoning": [
            "Lead froid ou score modeste, sequence douce recommandee.",
            "Objectif: qualification progressive sans pression excessive.",
        ],
    }


def _build_communication_plan_payload(
    db_lead: DBLead,
    *,
    channels: list[str] | None = None,
) -> dict[str, Any]:
    available_channels = _normalize_task_channels(channels)
    rule = _communication_rule_for_lead(db_lead)
    sequence: list[dict[str, Any]] = []
    step_index = 1
    for step in rule["steps"]:
        channel = step["channel"]
        if channel not in available_channels:
            continue
        sequence.append(
            {
                "step": step_index,
                "day_offset": int(step["day_offset"]),
                "channel": channel,
                "title": f"{channel.upper()} - {db_lead.first_name or db_lead.email}",
                "priority": step["priority"],
                "suggested_message": db_lead.next_best_action
                or "Relance personnalisee selon profil et dernier signal detecte.",
            }
        )
        step_index += 1

    return {
        "lead_id": db_lead.id,
        "version": "v1",
        "generated_at": datetime.now().isoformat(),
        "rule": {
            "id": rule["rule_id"],
            "name": rule["name"],
            "priority": rule["priority"],
        },
        "confidence": rule["confidence"],
        "reasoning": rule["reasoning"],
        "available_channels": available_channels,
        "recommended_sequence": sequence,
        "score_snapshot": _lead_score_snapshot(db_lead),
    }


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

    score_payload = {
        "icp_score": float(db_lead.icp_score or 0.0),
        "heat_score": float(db_lead.heat_score or 0.0),
        "total_score": float(db_lead.total_score or 0.0),
        "tier": db_lead.tier or "Tier D",
        "heat_status": db_lead.heat_status or "Cold",
        "next_best_action": db_lead.next_best_action,
        "icp_breakdown": db_lead.icp_breakdown or {},
        "heat_breakdown": db_lead.heat_breakdown or {},
        "last_scored_at": db_lead.last_scored_at,
    }

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
        total_score=score_payload["total_score"],
        score=score_payload,
        interactions=interactions,
        outcome=db_lead.outcome,
        stage=db_lead.stage or LeadStage.NEW,
        stage_canonical=_funnel_svc.canonical_from_lead(db_lead),
        lead_owner_user_id=db_lead.lead_owner_user_id,
        stage_entered_at=db_lead.stage_entered_at,
        sla_due_at=db_lead.sla_due_at,
        next_action_at=db_lead.next_action_at,
        confidence_score=float(db_lead.confidence_score or 0.0),
        playbook_id=db_lead.playbook_id,
        handoff_required=bool(db_lead.handoff_required),
        handoff_completed_at=db_lead.handoff_completed_at,
        details=db_lead.details or {},
        tags=db_lead.tags or [],
        created_at=db_lead.created_at,
        updated_at=db_lead.updated_at,
    )


def _serialize_task_lead_summary(lead: DBLead) -> dict[str, Any]:
    full_name = f"{lead.first_name or ''} {lead.last_name or ''}".strip() or lead.email
    return {
        "id": lead.id,
        "name": full_name,
        "email": lead.email,
        "status": lead.status.value if hasattr(lead.status, "value") else str(lead.status),
        "stage_canonical": _funnel_svc.canonical_from_lead(lead),
        "owner_user_id": lead.lead_owner_user_id,
        "company_name": lead.company.name if lead.company else None,
        "total_score": float(lead.total_score or 0.0),
        "tier": lead.tier or "Tier D",
        "heat_status": lead.heat_status or "Cold",
    }


def _serialize_task_project_summary(project: DBProject | None, *, project_name: str | None = None) -> dict[str, Any] | None:
    if project is None and not project_name:
        return None
    return {
        "id": project.id if project else None,
        "name": project.name if project else project_name,
        "status": project.status if project else None,
        "due_date": project.due_date.isoformat() if project and project.due_date else None,
    }


def _serialize_task(
    task: DBTask,
    *,
    lead: DBLead | None = None,
    project: DBProject | None = None,
) -> dict[str, Any]:
    payload = {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "priority": task.priority,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "assigned_to": task.assigned_to,
        "lead_id": task.lead_id,
        "project_id": task.project_id,
        "project_name": task.project_name,
        "channel": task.channel or "email",
        "sequence_step": int(task.sequence_step or 1),
        "source": task.source or "manual",
        "rule_id": task.rule_id,
        "related_score_snapshot": task.score_snapshot_json or {},
        "subtasks": list(task.subtasks_json or []),
        "comments": list(task.comments_json or []),
        "attachments": list(task.attachments_json or []),
        "timeline": list(task.timeline_json or []),
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
        "closed_at": task.closed_at.isoformat() if task.closed_at else None,
    }
    if lead is not None:
        payload["lead"] = _serialize_task_lead_summary(lead)
    project_payload = _serialize_task_project_summary(project, project_name=task.project_name)
    if project_payload is not None:
        payload["project"] = project_payload
    return payload


def _serialize_project(project: DBProject) -> dict[str, Any]:
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "status": project.status,
        "lead_id": project.lead_id,
        "progress_percent": int(project.progress_percent or 0),
        "budget_total": float(project.budget_total) if project.budget_total is not None else None,
        "budget_spent": float(project.budget_spent or 0.0),
        "team": list(project.team_json or []),
        "timeline": list(project.timeline_json or []),
        "deliverables": list(project.deliverables_json or []),
        "due_date": project.due_date.isoformat() if project.due_date else None,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "updated_at": project.updated_at.isoformat() if project.updated_at else None,
    }


def _serialize_interaction(interaction: DBInteraction) -> dict[str, Any]:
    interaction_type = interaction.type.value if hasattr(interaction.type, "value") else str(interaction.type)
    return {
        "id": str(interaction.id),
        "lead_id": interaction.lead_id,
        "type": interaction_type,
        "timestamp": interaction.timestamp.isoformat() if interaction.timestamp else None,
        "details": interaction.details or {},
    }


def _serialize_opportunity(opportunity: DBOpportunity) -> dict[str, Any]:
    close_date = opportunity.expected_close_date.isoformat() if opportunity.expected_close_date else None
    return {
        "id": opportunity.id,
        "lead_id": opportunity.lead_id,
        "prospect_id": opportunity.lead_id,
        "name": opportunity.name,
        "stage": opportunity.stage,
        "stage_canonical": _funnel_svc.canonical_from_opportunity(opportunity),
        "status": opportunity.status,
        "owner_user_id": opportunity.owner_user_id,
        "amount": float(opportunity.amount) if opportunity.amount is not None else None,
        "probability": int(opportunity.probability or 0),
        "assigned_to": _coerce_assigned_to(opportunity.assigned_to),
        "expected_close_date": close_date,
        "close_date": close_date,
        "details": dict(opportunity.details_json or {}),
        "stage_entered_at": opportunity.stage_entered_at.isoformat() if opportunity.stage_entered_at else None,
        "sla_due_at": opportunity.sla_due_at.isoformat() if opportunity.sla_due_at else None,
        "next_action_at": opportunity.next_action_at.isoformat() if opportunity.next_action_at else None,
        "confidence_score": float(opportunity.confidence_score or 0.0),
        "playbook_id": opportunity.playbook_id,
        "handoff_required": bool(opportunity.handoff_required),
        "handoff_completed_at": opportunity.handoff_completed_at.isoformat() if opportunity.handoff_completed_at else None,
        "created_at": opportunity.created_at.isoformat() if opportunity.created_at else None,
        "updated_at": opportunity.updated_at.isoformat() if opportunity.updated_at else None,
    }


def _normalize_lead_notes(raw_notes: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_notes, list):
        return []
    normalized: list[dict[str, Any]] = []
    for item in raw_notes:
        if not isinstance(item, dict):
            continue
        content = str(item.get("content") or "").strip()
        if not content:
            continue
        normalized.append(
            {
                "id": str(item.get("id") or str(uuid.uuid4())),
                "content": content,
                "author": str(item.get("author") or "admin"),
                "created_at": str(item.get("created_at") or datetime.utcnow().isoformat()),
                "updated_at": str(item.get("updated_at") or datetime.utcnow().isoformat()),
            }
        )
    return normalized


def _lead_notes_from_details(details: dict[str, Any] | None) -> list[dict[str, Any]]:
    payload = details if isinstance(details, dict) else {}
    return _normalize_lead_notes(payload.get("notes"))


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
        stage_canonical="new",
        stage_entered_at=datetime.utcnow(),
    )
    _funnel_svc.ensure_lead_funnel_defaults(db, db_lead)
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
        "stage_canonical": db_lead.stage_canonical or "new",
        "lead_owner_user_id": db_lead.lead_owner_user_id,
        "segment": db_lead.segment,
        "company_name": company.name,
        "created_at": db_lead.created_at.isoformat() if db_lead.created_at else None,
    }


def _apply_lead_update_payload(
    db: Session,
    *,
    db_lead: DBLead,
    payload: AdminLeadUpdateRequest,
) -> tuple[Lead, dict[str, dict[str, Any]]]:
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return _db_to_lead(db_lead), {}

    changes: dict[str, dict[str, Any]] = {}

    def track_change(field: str, before: Any, after: Any) -> None:
        if before == after:
            return
        changes[field] = {"from": before, "to": after}

    if "first_name" in update_data:
        next_value = (payload.first_name or "").strip()
        if not next_value:
            raise HTTPException(status_code=HTTP_422_STATUS, detail="first_name cannot be empty.")
        track_change("first_name", db_lead.first_name, next_value)
        db_lead.first_name = next_value

    if "last_name" in update_data:
        next_value = (payload.last_name or "").strip()
        if not next_value:
            raise HTTPException(status_code=HTTP_422_STATUS, detail="last_name cannot be empty.")
        track_change("last_name", db_lead.last_name, next_value)
        db_lead.last_name = next_value

    if "email" in update_data:
        next_email = str(payload.email).strip().lower() if payload.email is not None else ""
        if not next_email:
            raise HTTPException(status_code=HTTP_422_STATUS, detail="email cannot be empty.")
        if next_email != db_lead.email:
            existing = db.query(DBLead).filter(DBLead.email == next_email, DBLead.id != db_lead.id).first()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Lead already exists for email {next_email}.",
                )
        track_change("email", db_lead.email, next_email)
        db_lead.email = next_email

    if "title" in update_data:
        next_value = (payload.title or "").strip() or None
        track_change("title", db_lead.title, next_value)
        db_lead.title = next_value

    if "phone" in update_data:
        next_value = (payload.phone or "").strip() or None
        track_change("phone", db_lead.phone, next_value)
        db_lead.phone = next_value

    if "linkedin_url" in update_data:
        next_value = (payload.linkedin_url or "").strip() or None
        track_change("linkedin_url", db_lead.linkedin_url, next_value)
        db_lead.linkedin_url = next_value

    if "status" in update_data and payload.status is not None:
        next_status = _validate_lead_status(payload.status)
        current_status = db_lead.status.value if hasattr(db_lead.status, "value") else str(db_lead.status)
        track_change("status", current_status, next_status.value)
        db_lead.status = next_status
        mapped_stage = _funnel_svc.LEGACY_STATUS_TO_CANONICAL.get(next_status.value)
        if mapped_stage:
            track_change("stage_canonical", db_lead.stage_canonical, mapped_stage)
            db_lead.stage_canonical = mapped_stage
            now = datetime.utcnow()
            db_lead.stage_entered_at = now
            db_lead.sla_due_at = now + timedelta(
                hours=int(_funnel_svc.STAGE_SLA_HOURS.get(mapped_stage, 24))
            )
            db_lead.next_action_at = now + timedelta(
                hours=int(_funnel_svc.NEXT_ACTION_HOURS.get(mapped_stage, 8))
            )

    if "segment" in update_data:
        next_value = (payload.segment or "").strip() or None
        track_change("segment", db_lead.segment, next_value)
        db_lead.segment = next_value

    if "tags" in update_data:
        unique_tags = sorted({str(item).strip() for item in (payload.tags or []) if str(item).strip()})
        track_change("tags", db_lead.tags or [], unique_tags)
        db_lead.tags = unique_tags

    company = db_lead.company
    if any(
        key in update_data
        for key in ("company_name", "company_domain", "company_industry", "company_location")
    ):
        if company is None:
            fallback_name = (payload.company_name or "Unknown").strip() or "Unknown"
            company = DBCompany(name=fallback_name)
            db.add(company)
            db.flush()
            db_lead.company_id = company.id

        if "company_name" in update_data:
            next_name = (payload.company_name or "").strip()
            if not next_name:
                raise HTTPException(status_code=HTTP_422_STATUS, detail="company_name cannot be empty.")
            track_change("company_name", company.name, next_name)
            company.name = next_name
        if "company_domain" in update_data:
            next_domain = (payload.company_domain or "").strip() or None
            track_change("company_domain", company.domain, next_domain)
            company.domain = next_domain
        if "company_industry" in update_data:
            next_industry = (payload.company_industry or "").strip() or None
            track_change("company_industry", company.industry, next_industry)
            company.industry = next_industry
        if "company_location" in update_data:
            next_location = (payload.company_location or "").strip() or None
            track_change("company_location", company.location, next_location)
            company.location = next_location

    _funnel_svc.ensure_lead_funnel_defaults(db, db_lead)

    try:
        db.commit()
        db.refresh(db_lead)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to update lead.", extra={"error": str(exc), "lead_id": db_lead.id})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update lead.",
        ) from exc

    return _db_to_lead(db_lead), changes


def _delete_lead_payload(db: Session, lead_id: str) -> dict[str, Any]:
    lead = db.query(DBLead).filter(DBLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")

    db.query(DBTask).filter(DBTask.lead_id == lead_id).delete(synchronize_session=False)
    db.query(DBProject).filter(DBProject.lead_id == lead_id).delete(synchronize_session=False)
    db.query(DBInteraction).filter(DBInteraction.lead_id == lead_id).delete(synchronize_session=False)
    db.query(DBOpportunity).filter(DBOpportunity.lead_id == lead_id).delete(synchronize_session=False)
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
    project_id = (payload.project_id or "").strip() or None
    project: DBProject | None = None
    if project_id:
        project = db.query(DBProject).filter(DBProject.id == project_id).first()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    now = datetime.now()
    task = DBTask(
        id=str(uuid.uuid4()),
        title=payload.title.strip(),
        description=(payload.description or "").strip() or None,
        status=_coerce_task_status(payload.status),
        priority=_coerce_task_priority(payload.priority),
        due_date=_parse_datetime_field(payload.due_date, "due_date"),
        assigned_to=(payload.assigned_to or "You").strip(),
        lead_id=payload.lead_id,
        project_id=project_id,
        project_name=(payload.project_name or (project.name if project else "")).strip() or None,
        channel=_coerce_task_channel(payload.channel),
        sequence_step=int(payload.sequence_step or 1),
        source=_coerce_task_source(payload.source),
        rule_id=(payload.rule_id or "").strip() or None,
        score_snapshot_json=payload.score_snapshot or {},
        subtasks_json=_normalize_task_subtasks_payload(payload.subtasks),
        comments_json=[],
        attachments_json=_normalize_task_attachments_payload(payload.attachments),
        timeline_json=[],
        created_at=now,
        updated_at=now,
    )
    _append_task_timeline_entry(
        task,
        event_type="task_created",
        message="Tache creee.",
        actor="system",
        metadata={"status": task.status, "priority": task.priority},
        created_at=now,
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


def _get_task_payload(db: Session, task_id: str) -> dict[str, Any]:
    task = db.query(DBTask).filter(DBTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")

    lead = db.query(DBLead).filter(DBLead.id == task.lead_id).first() if task.lead_id else None
    project = db.query(DBProject).filter(DBProject.id == task.project_id).first() if task.project_id else None
    if project is None and task.lead_id:
        project = (
            db.query(DBProject)
            .filter(DBProject.lead_id == task.lead_id)
            .order_by(DBProject.updated_at.desc(), DBProject.created_at.desc())
            .first()
        )
    return _serialize_task(task, lead=lead, project=project)


def _update_task_payload(
    db: Session,
    task_id: str,
    payload: AdminTaskUpdateRequest,
) -> dict[str, Any]:
    task = db.query(DBTask).filter(DBTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")

    now = datetime.now()
    update_data = payload.model_dump(exclude_unset=True)
    if "title" in update_data and payload.title is not None:
        next_title = payload.title.strip()
        if next_title != task.title:
            _append_task_timeline_entry(
                task,
                event_type="task_updated",
                message=f"Titre mis a jour: '{task.title}' -> '{next_title}'.",
                actor="system",
                created_at=now,
            )
            task.title = next_title
    if "description" in update_data:
        next_description = (payload.description or "").strip() or None
        if next_description != task.description:
            _append_task_timeline_entry(
                task,
                event_type="task_updated",
                message="Description mise a jour.",
                actor="system",
                created_at=now,
            )
            task.description = next_description
    if "status" in update_data:
        next_status = _coerce_task_status(payload.status)
        if next_status != task.status:
            previous_status = task.status
            task.status = next_status
            _append_task_timeline_entry(
                task,
                event_type="status_changed",
                message=f"Statut: {previous_status} -> {next_status}.",
                actor="system",
                metadata={"from": previous_status, "to": next_status},
                created_at=now,
            )
            if next_status == "Done":
                task.closed_at = now
            elif previous_status == "Done":
                task.closed_at = None
    if "priority" in update_data:
        next_priority = _coerce_task_priority(payload.priority)
        if next_priority != task.priority:
            previous_priority = task.priority
            task.priority = next_priority
            _append_task_timeline_entry(
                task,
                event_type="priority_changed",
                message=f"Priorite: {previous_priority} -> {next_priority}.",
                actor="system",
                metadata={"from": previous_priority, "to": next_priority},
                created_at=now,
            )
    if "due_date" in update_data:
        next_due_date = _parse_datetime_field(payload.due_date, "due_date")
        if next_due_date != task.due_date:
            task.due_date = next_due_date
            _append_task_timeline_entry(
                task,
                event_type="task_updated",
                message="Echeance mise a jour.",
                actor="system",
                created_at=now,
            )
    if "assigned_to" in update_data:
        next_assignee = (payload.assigned_to or "You").strip()
        if next_assignee != task.assigned_to:
            task.assigned_to = next_assignee
            _append_task_timeline_entry(
                task,
                event_type="assignee_changed",
                message=f"Tache assignee a {next_assignee}.",
                actor="system",
                metadata={"assigned_to": next_assignee},
                created_at=now,
            )
    if "lead_id" in update_data:
        if payload.lead_id != task.lead_id:
            task.lead_id = payload.lead_id
            _append_task_timeline_entry(
                task,
                event_type="lead_linked",
                message=f"Lead lie: {task.lead_id or 'aucun'}.",
                actor="system",
                metadata={"lead_id": task.lead_id},
                created_at=now,
            )
    if "project_id" in update_data:
        project_id = (payload.project_id or "").strip() or None
        project: DBProject | None = None
        if project_id:
            project = db.query(DBProject).filter(DBProject.id == project_id).first()
            if not project:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
        if project_id != task.project_id:
            task.project_id = project_id
            if project:
                task.project_name = project.name
            _append_task_timeline_entry(
                task,
                event_type="project_linked",
                message=f"Projet lie: {(project.name if project else project_id) or 'aucun'}.",
                actor="system",
                metadata={"project_id": project_id},
                created_at=now,
            )
    if "project_name" in update_data:
        next_project_name = (payload.project_name or "").strip() or None
        if next_project_name != task.project_name:
            task.project_name = next_project_name
            _append_task_timeline_entry(
                task,
                event_type="task_updated",
                message="Nom de projet mis a jour.",
                actor="system",
                created_at=now,
            )
    if "channel" in update_data:
        next_channel = _coerce_task_channel(payload.channel)
        if next_channel != task.channel:
            task.channel = next_channel
            _append_task_timeline_entry(
                task,
                event_type="channel_changed",
                message=f"Canal: {next_channel}.",
                actor="system",
                metadata={"channel": next_channel},
                created_at=now,
            )
    if "sequence_step" in update_data:
        next_step = int(payload.sequence_step or 1)
        if next_step != int(task.sequence_step or 1):
            task.sequence_step = next_step
            _append_task_timeline_entry(
                task,
                event_type="task_updated",
                message=f"Etape de sequence: {next_step}.",
                actor="system",
                created_at=now,
            )
    if "source" in update_data:
        next_source = _coerce_task_source(payload.source)
        if next_source != task.source:
            task.source = next_source
            _append_task_timeline_entry(
                task,
                event_type="task_updated",
                message=f"Source: {next_source}.",
                actor="system",
                created_at=now,
            )
    if "rule_id" in update_data:
        next_rule_id = (payload.rule_id or "").strip() or None
        if next_rule_id != task.rule_id:
            task.rule_id = next_rule_id
            _append_task_timeline_entry(
                task,
                event_type="task_updated",
                message="Regle liee mise a jour.",
                actor="system",
                created_at=now,
            )
    if "score_snapshot" in update_data:
        task.score_snapshot_json = payload.score_snapshot or {}
    if "subtasks" in update_data:
        previous_subtasks = _normalize_task_subtasks_payload(list(task.subtasks_json or []))
        next_subtasks = _normalize_task_subtasks_payload(payload.subtasks)
        if previous_subtasks != next_subtasks:
            task.subtasks_json = next_subtasks
            done_count = len([item for item in next_subtasks if bool(item.get("done"))])
            _append_task_timeline_entry(
                task,
                event_type="subtasks_updated",
                message=f"Checklist mise a jour ({done_count}/{len(next_subtasks)}).",
                actor="system",
                metadata={"done": done_count, "total": len(next_subtasks)},
                created_at=now,
            )
    if "comments" in update_data:
        previous_comments = _normalize_task_comments_payload(list(task.comments_json or []))
        next_comments = _normalize_task_comments_payload(payload.comments)
        previous_ids = {str(item.get("id")) for item in previous_comments}
        new_comments = [item for item in next_comments if str(item.get("id")) not in previous_ids]
        if previous_comments != next_comments:
            task.comments_json = next_comments
            for comment in new_comments:
                _append_task_timeline_entry(
                    task,
                    event_type="comment_added",
                    message="Nouveau commentaire ajoute.",
                    actor=str(comment.get("author") or "Vous"),
                    metadata={"comment_id": comment.get("id"), "mentions": comment.get("mentions") or []},
                    created_at=now,
                )
    if "attachments" in update_data:
        previous_attachments = _normalize_task_attachments_payload(list(task.attachments_json or []))
        next_attachments = _normalize_task_attachments_payload(payload.attachments)
        if previous_attachments != next_attachments:
            task.attachments_json = next_attachments
            _append_task_timeline_entry(
                task,
                event_type="attachments_updated",
                message=f"Pieces jointes mises a jour ({len(next_attachments)}).",
                actor="system",
                metadata={"total": len(next_attachments)},
                created_at=now,
            )

    task.updated_at = now

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


def _add_task_comment_payload(
    db: Session,
    task_id: str,
    payload: AdminTaskCommentCreateRequest,
) -> dict[str, Any]:
    task = db.query(DBTask).filter(DBTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")

    now = datetime.now()
    comment = {
        "id": str(uuid.uuid4()),
        "body": payload.body.strip(),
        "author": (payload.author or "Vous").strip() or "Vous",
        "mentions": [str(item).strip() for item in payload.mentions if str(item).strip()],
        "created_at": now.isoformat(),
    }
    comments = _normalize_task_comments_payload(list(task.comments_json or []))
    comments.append(comment)
    task.comments_json = comments
    task.updated_at = now
    _append_task_timeline_entry(
        task,
        event_type="comment_added",
        message="Nouveau commentaire ajoute.",
        actor=comment["author"],
        metadata={"comment_id": comment["id"], "mentions": comment["mentions"]},
        created_at=now,
    )

    try:
        db.commit()
        db.refresh(task)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to add task comment.", extra={"error": str(exc), "task_id": task_id})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to add task comment.",
        ) from exc
    return _get_task_payload(db, task_id)


def _close_task_payload(
    db: Session,
    task_id: str,
    payload: AdminTaskCloseRequest | None = None,
) -> dict[str, Any]:
    task = db.query(DBTask).filter(DBTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")

    now = datetime.now()
    task.status = "Done"
    task.closed_at = now
    task.updated_at = now
    _append_task_timeline_entry(
        task,
        event_type="task_closed",
        message="Tache fermee.",
        actor="system",
        created_at=now,
    )
    note = (payload.note.strip() if payload and payload.note else "")
    if note:
        comments = _normalize_task_comments_payload(list(task.comments_json or []))
        comments.append(
            {
                "id": str(uuid.uuid4()),
                "body": note,
                "author": "Vous",
                "mentions": [],
                "created_at": now.isoformat(),
            }
        )
        task.comments_json = comments

    try:
        db.commit()
        db.refresh(task)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to close task.", extra={"error": str(exc), "task_id": task_id})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to close task.",
        ) from exc
    return _get_task_payload(db, task_id)


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


def _build_lead_history_payload(
    db: Session,
    *,
    lead_id: str,
    window: str = "30d",
) -> dict[str, Any]:
    db_lead = db.query(DBLead).filter(DBLead.id == lead_id).first()
    if not db_lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")

    window_label, window_days = _parse_window_days(window, default_days=30)
    now = datetime.now()
    start_at = now - timedelta(days=window_days - 1)

    items: list[dict[str, Any]] = []
    if db_lead.created_at and db_lead.created_at >= start_at:
        items.append(
            {
                "id": f"lead-created-{db_lead.id}",
                "event_type": "lead_created",
                "timestamp": db_lead.created_at.isoformat(),
                "title": "Lead cree",
                "description": f"{db_lead.first_name or ''} {db_lead.last_name or ''}".strip() or db_lead.email,
                "lead_id": db_lead.id,
            }
        )
    if db_lead.last_scored_at and db_lead.last_scored_at >= start_at:
        snapshot = _lead_score_snapshot(db_lead)
        items.append(
            {
                "id": f"lead-scored-{db_lead.id}",
                "event_type": "lead_scored",
                "timestamp": db_lead.last_scored_at.isoformat(),
                "title": "Lead rescored",
                "description": f"Score total {snapshot['total_score']} ({snapshot['tier']}, {snapshot['heat_status']})",
                "lead_id": db_lead.id,
                "score_snapshot": snapshot,
            }
        )
    if db_lead.updated_at and db_lead.updated_at >= start_at:
        items.append(
            {
                "id": f"lead-status-{db_lead.id}",
                "event_type": "lead_status",
                "timestamp": db_lead.updated_at.isoformat(),
                "title": "Mise a jour du lead",
                "description": f"Statut courant: {db_lead.status.value if hasattr(db_lead.status, 'value') else db_lead.status}",
                "lead_id": db_lead.id,
            }
        )

    task_rows = (
        db.query(DBTask)
        .filter(DBTask.lead_id == lead_id, DBTask.created_at >= start_at)
        .order_by(DBTask.created_at.desc())
        .all()
    )
    for task in task_rows:
        items.append(
            {
                "id": f"task-{task.id}",
                "event_type": "task_created",
                "timestamp": task.created_at.isoformat() if task.created_at else now.isoformat(),
                "title": task.title,
                "description": f"{task.channel or 'email'} | {task.status} | {task.priority}",
                "lead_id": lead_id,
                "task_id": task.id,
                "channel": task.channel or "email",
                "source": task.source or "manual",
                "status": task.status,
            }
        )

    interaction_rows = (
        db.query(DBInteraction)
        .filter(DBInteraction.lead_id == lead_id, DBInteraction.timestamp >= start_at)
        .order_by(DBInteraction.timestamp.desc())
        .all()
    )
    for interaction in interaction_rows:
        interaction_type = interaction.type.value if hasattr(interaction.type, "value") else str(interaction.type)
        items.append(
            {
                "id": f"interaction-{interaction.id}",
                "event_type": "interaction",
                "timestamp": interaction.timestamp.isoformat() if interaction.timestamp else now.isoformat(),
                "title": interaction_type,
                "description": "Interaction enregistree",
                "lead_id": lead_id,
                "interaction_id": interaction.id,
                "interaction_type": interaction_type,
                "details": interaction.details or {},
            }
        )

    project_rows = (
        db.query(DBProject)
        .filter(DBProject.lead_id == lead_id, DBProject.created_at >= start_at)
        .order_by(DBProject.created_at.desc())
        .all()
    )
    for project in project_rows:
        items.append(
            {
                "id": f"project-{project.id}",
                "event_type": "project_created",
                "timestamp": project.created_at.isoformat() if project.created_at else now.isoformat(),
                "title": project.name,
                "description": f"Projet ({project.status})",
                "lead_id": lead_id,
                "project_id": project.id,
            }
        )

    opportunity_rows = (
        db.query(DBOpportunity)
        .filter(DBOpportunity.lead_id == lead_id, DBOpportunity.created_at >= start_at)
        .order_by(DBOpportunity.created_at.desc())
        .all()
    )
    for opportunity in opportunity_rows:
        items.append(
            {
                "id": f"opportunity-{opportunity.id}",
                "event_type": "opportunity",
                "timestamp": opportunity.created_at.isoformat() if opportunity.created_at else now.isoformat(),
                "title": opportunity.name,
                "description": f"{opportunity.stage} | {opportunity.status}",
                "lead_id": lead_id,
                "opportunity_id": opportunity.id,
                "details": _serialize_opportunity(opportunity),
            }
        )

    audit_rows = (
        db.query(DBAuditLog)
        .filter(
            DBAuditLog.entity_type == "lead",
            DBAuditLog.entity_id == lead_id,
            DBAuditLog.created_at >= start_at,
        )
        .order_by(DBAuditLog.created_at.desc())
        .all()
    )
    audit_title_map = {
        "lead_updated": "Infos lead modifiees",
        "lead_notes_updated": "Notes mises a jour",
        "lead_opportunity_created": "Opportunite creee",
        "lead_opportunity_updated": "Opportunite mise a jour",
        "lead_added_to_campaign": "Lead ajoute a une campagne",
    }
    for audit in audit_rows:
        metadata = audit.metadata_json or {}
        description = ""
        changes = metadata.get("changes")
        if isinstance(changes, dict) and changes:
            preview: list[str] = []
            for index, (field_name, diff_payload) in enumerate(changes.items()):
                if index >= 4:
                    break
                if isinstance(diff_payload, dict):
                    previous = diff_payload.get("from")
                    next_value = diff_payload.get("to")
                    preview.append(f"{field_name}: {previous} -> {next_value}")
            description = "; ".join(preview)
        elif metadata:
            description = json.dumps(metadata, ensure_ascii=True)[:240]
        items.append(
            {
                "id": f"audit-{audit.id}",
                "event_type": audit.action,
                "timestamp": audit.created_at.isoformat() if audit.created_at else now.isoformat(),
                "title": audit_title_map.get(audit.action, audit.action.replace("_", " ")),
                "description": description or None,
                "lead_id": lead_id,
                "actor": audit.actor,
                "metadata": metadata,
            }
        )

    items.sort(key=lambda item: item.get("timestamp") or "", reverse=True)
    return {
        "lead_id": lead_id,
        "window": window_label,
        "from": start_at.isoformat(),
        "to": now.isoformat(),
        "total": len(items),
        "items": items,
    }


def _get_lead_or_404(db: Session, lead_id: str) -> DBLead:
    db_lead = db.query(DBLead).filter(DBLead.id == lead_id).first()
    if not db_lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")
    return db_lead


def _list_lead_interactions_payload(db: Session, *, lead_id: str) -> list[dict[str, Any]]:
    _get_lead_or_404(db, lead_id)
    rows = (
        db.query(DBInteraction)
        .filter(DBInteraction.lead_id == lead_id)
        .order_by(DBInteraction.timestamp.desc())
        .all()
    )
    return [_serialize_interaction(row) for row in rows]


def _list_lead_opportunities_payload(db: Session, *, lead_id: str) -> list[dict[str, Any]]:
    _get_lead_or_404(db, lead_id)
    rows = (
        db.query(DBOpportunity)
        .filter(DBOpportunity.lead_id == lead_id)
        .order_by(DBOpportunity.updated_at.desc(), DBOpportunity.created_at.desc())
        .all()
    )
    return [_serialize_opportunity(row) for row in rows]


def _create_lead_opportunity_payload(
    db: Session,
    *,
    lead_id: str,
    payload: AdminLeadOpportunityCreateRequest,
) -> dict[str, Any]:
    _get_lead_or_404(db, lead_id)
    stage = _coerce_opportunity_stage(payload.stage)
    inferred_status = "open"
    if stage == "won":
        inferred_status = "won"
    elif stage == "lost":
        inferred_status = "lost"
    status_value = _coerce_opportunity_status(payload.status or inferred_status)
    row = DBOpportunity(
        id=str(uuid.uuid4()),
        lead_id=lead_id,
        name=payload.name.strip(),
        stage=stage,
        status=status_value,
        stage_canonical=_funnel_svc.LEGACY_OPPORTUNITY_STAGE_TO_CANONICAL.get(stage.lower(), "opportunity"),
        stage_entered_at=datetime.utcnow(),
        amount=float(payload.amount) if payload.amount is not None else None,
        probability=int(payload.probability or 10),
        assigned_to="Vous",
        expected_close_date=_parse_datetime_field(payload.expected_close_date, "expected_close_date"),
        details_json=payload.details or {},
    )
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to create lead opportunity.", extra={"error": str(exc), "lead_id": lead_id})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create opportunity.",
        ) from exc
    return _serialize_opportunity(row)


def _update_lead_opportunity_payload(
    db: Session,
    *,
    lead_id: str,
    opportunity_id: str,
    payload: AdminLeadOpportunityUpdateRequest,
) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    row = (
        db.query(DBOpportunity)
        .filter(DBOpportunity.id == opportunity_id, DBOpportunity.lead_id == lead_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity not found.")

    update_data = payload.model_dump(exclude_unset=True)
    changes: dict[str, dict[str, Any]] = {}

    def track_change(field: str, before: Any, after: Any) -> None:
        if before == after:
            return
        changes[field] = {"from": before, "to": after}

    if "name" in update_data and payload.name is not None:
        next_name = payload.name.strip()
        track_change("name", row.name, next_name)
        row.name = next_name
    if "stage" in update_data:
        next_stage = _coerce_opportunity_stage(payload.stage)
        track_change("stage", row.stage, next_stage)
        row.stage = next_stage
        row.stage_canonical = _funnel_svc.LEGACY_OPPORTUNITY_STAGE_TO_CANONICAL.get(
            str(next_stage).lower(),
            "opportunity",
        )
        row.stage_entered_at = datetime.utcnow()
    if "status" in update_data:
        next_status = _coerce_opportunity_status(payload.status)
        track_change("status", row.status, next_status)
        row.status = next_status
    if "amount" in update_data:
        next_amount = float(payload.amount) if payload.amount is not None else None
        track_change("amount", row.amount, next_amount)
        row.amount = next_amount
    if "probability" in update_data:
        next_probability = int(payload.probability or 0)
        track_change("probability", row.probability, next_probability)
        row.probability = next_probability
    if "expected_close_date" in update_data:
        next_close_date = _parse_datetime_field(payload.expected_close_date, "expected_close_date")
        previous_close_date = row.expected_close_date.isoformat() if row.expected_close_date else None
        next_close_date_iso = next_close_date.isoformat() if next_close_date else None
        track_change("expected_close_date", previous_close_date, next_close_date_iso)
        row.expected_close_date = next_close_date
    if "details" in update_data:
        next_details = payload.details or {}
        track_change("details", row.details_json or {}, next_details)
        row.details_json = next_details

    try:
        db.commit()
        db.refresh(row)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception(
            "Failed to update lead opportunity.",
            extra={"error": str(exc), "lead_id": lead_id, "opportunity_id": opportunity_id},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update opportunity.",
        ) from exc
    return _serialize_opportunity(row), changes


def _serialize_opportunity_prospect_summary(lead: DBLead | None) -> dict[str, Any] | None:
    if lead is None:
        return None
    full_name = f"{lead.first_name or ''} {lead.last_name or ''}".strip() or lead.email
    return {
        "id": lead.id,
        "name": full_name,
        "email": lead.email,
        "company_name": lead.company.name if lead.company else None,
    }


def _serialize_opportunity_board_item(
    opportunity: DBOpportunity,
    *,
    lead: DBLead | None = None,
) -> dict[str, Any]:
    close_date = opportunity.expected_close_date.isoformat() if opportunity.expected_close_date else None
    prospect_name = None
    if lead is not None:
        prospect_name = f"{lead.first_name or ''} {lead.last_name or ''}".strip() or lead.email
    if not prospect_name:
        prospect_name = opportunity.name
    return {
        "id": opportunity.id,
        "prospect_id": opportunity.lead_id,
        "prospect_name": prospect_name,
        "amount": float(opportunity.amount or 0.0),
        "stage": _coerce_pipeline_opportunity_stage(opportunity.stage),
        "stage_canonical": _funnel_svc.canonical_from_opportunity(opportunity),
        "probability": int(opportunity.probability or 0),
        "assigned_to": _coerce_assigned_to(opportunity.assigned_to),
        "owner_user_id": opportunity.owner_user_id,
        "close_date": close_date,
        "next_action_at": opportunity.next_action_at.isoformat() if opportunity.next_action_at else None,
        "sla_due_at": opportunity.sla_due_at.isoformat() if opportunity.sla_due_at else None,
        "created_at": opportunity.created_at.isoformat() if opportunity.created_at else None,
        "updated_at": opportunity.updated_at.isoformat() if opportunity.updated_at else None,
        "is_overdue": bool(opportunity.expected_close_date and opportunity.expected_close_date < datetime.utcnow()),
        "prospect": _serialize_opportunity_prospect_summary(lead),
    }


def _parse_query_datetime(raw_value: str | None, field_name: str) -> datetime | None:
    if raw_value is None:
        return None
    return _parse_datetime_field(raw_value, field_name)


def _parse_query_datetime_end(raw_value: str | None, field_name: str) -> datetime | None:
    parsed = _parse_query_datetime(raw_value, field_name)
    if parsed is None:
        return None
    cleaned = raw_value.strip() if raw_value else ""
    if len(cleaned) == 10 and "T" not in cleaned:
        return parsed + timedelta(days=1) - timedelta(microseconds=1)
    return parsed


def _build_opportunities_query(
    db: Session,
    *,
    search: str | None = None,
    stage_filter: str | None = None,
    assigned_to_filter: str | None = None,
    amount_min: float | None = None,
    amount_max: float | None = None,
    date_field: str = "close",
    date_from: datetime | None = None,
    date_to: datetime | None = None,
):
    query = (
        db.query(DBOpportunity, DBLead)
        .join(DBLead, DBOpportunity.lead_id == DBLead.id)
    )

    if search and search.strip():
        pattern = f"%{search.strip()}%"
        query = query.filter(
            or_(
                DBLead.first_name.ilike(pattern),
                DBLead.last_name.ilike(pattern),
                DBLead.email.ilike(pattern),
                DBOpportunity.name.ilike(pattern),
                DBOpportunity.assigned_to.ilike(pattern),
            )
        )

    if stage_filter and stage_filter.strip():
        target_stage = _coerce_pipeline_opportunity_stage(stage_filter)
        stage_candidates = {
            "Prospect": {"prospect", "qualification"},
            "Qualified": {"qualified", "discovery"},
            "Proposed": {"proposed", "proposal", "negotiation"},
            "Won": {"won"},
            "Lost": {"lost"},
        }
        allowed_values = stage_candidates.get(target_stage, {target_stage.lower()})
        query = query.filter(func.lower(DBOpportunity.stage).in_(allowed_values))

    if assigned_to_filter and assigned_to_filter.strip():
        query = query.filter(DBOpportunity.assigned_to == assigned_to_filter.strip())

    if amount_min is not None:
        query = query.filter(DBOpportunity.amount >= float(amount_min))
    if amount_max is not None:
        query = query.filter(DBOpportunity.amount <= float(amount_max))

    date_column = DBOpportunity.expected_close_date if date_field == "close" else DBOpportunity.created_at
    if date_from is not None:
        query = query.filter(date_column >= date_from)
    if date_to is not None:
        query = query.filter(date_column <= date_to)

    return query


def _list_opportunities_payload(
    db: Session,
    *,
    page: int,
    page_size: int,
    search: str | None = None,
    stage_filter: str | None = None,
    assigned_to_filter: str | None = None,
    amount_min: float | None = None,
    amount_max: float | None = None,
    date_field: str = "close",
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    sort_by: str = "created_at",
    sort_desc: bool = True,
) -> dict[str, Any]:
    query = _build_opportunities_query(
        db,
        search=search,
        stage_filter=stage_filter,
        assigned_to_filter=assigned_to_filter,
        amount_min=amount_min,
        amount_max=amount_max,
        date_field=date_field,
        date_from=date_from,
        date_to=date_to,
    )

    total = query.count()

    sort_map = {
        "created_at": DBOpportunity.created_at,
        "updated_at": DBOpportunity.updated_at,
        "amount": DBOpportunity.amount,
        "probability": DBOpportunity.probability,
        "close_date": DBOpportunity.expected_close_date,
        "stage": DBOpportunity.stage,
        "assigned_to": DBOpportunity.assigned_to,
        "prospect_name": DBLead.first_name,
    }
    sort_column = sort_map.get(sort_by, DBOpportunity.created_at)
    if sort_desc:
        query = query.order_by(sort_column.desc(), DBOpportunity.id.desc())
    else:
        query = query.order_by(sort_column.asc(), DBOpportunity.id.asc())

    offset = (page - 1) * page_size
    rows = query.offset(offset).limit(page_size).all()

    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "items": [
            _serialize_opportunity_board_item(opportunity, lead=lead)
            for opportunity, lead in rows
        ],
    }


def _build_opportunities_summary_payload(
    db: Session,
    *,
    search: str | None = None,
    stage_filter: str | None = None,
    assigned_to_filter: str | None = None,
    amount_min: float | None = None,
    amount_max: float | None = None,
    date_field: str = "close",
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> dict[str, Any]:
    rows = _build_opportunities_query(
        db,
        search=search,
        stage_filter=stage_filter,
        assigned_to_filter=assigned_to_filter,
        amount_min=amount_min,
        amount_max=amount_max,
        date_field=date_field,
        date_from=date_from,
        date_to=date_to,
    ).all()

    opportunities = [opportunity for opportunity, _ in rows]
    total_count = len(opportunities)
    total_amount = sum(float(opportunity.amount or 0.0) for opportunity in opportunities)
    average_deal_size = (total_amount / total_count) if total_count > 0 else 0.0

    won_count = sum(
        1
        for opportunity in opportunities
        if _coerce_pipeline_opportunity_stage(opportunity.stage).lower() == "won"
    )
    lost_count = sum(
        1
        for opportunity in opportunities
        if _coerce_pipeline_opportunity_stage(opportunity.stage).lower() == "lost"
    )
    closed_count = won_count + lost_count

    win_rate = (won_count / closed_count * 100.0) if closed_count > 0 else 0.0
    close_rate = (closed_count / total_count * 100.0) if total_count > 0 else 0.0

    forecast_by_month: dict[str, dict[str, Any]] = {}
    no_close_date_count = 0
    for opportunity in opportunities:
        amount_value = float(opportunity.amount or 0.0)
        probability_value = max(0, min(100, int(opportunity.probability or 0)))
        if opportunity.expected_close_date is None:
            no_close_date_count += 1
            continue
        month_key = opportunity.expected_close_date.strftime("%Y-%m")
        bucket = forecast_by_month.setdefault(
            month_key,
            {
                "month": month_key,
                "expected_revenue": 0.0,
                "weighted_revenue": 0.0,
                "count": 0,
            },
        )
        bucket["expected_revenue"] += amount_value
        bucket["weighted_revenue"] += amount_value * (probability_value / 100.0)
        bucket["count"] += 1

    forecast_monthly = [
        {
            "month": key,
            "expected_revenue": round(float(value["expected_revenue"]), 2),
            "weighted_revenue": round(float(value["weighted_revenue"]), 2),
            "count": int(value["count"]),
        }
        for key, value in sorted(forecast_by_month.items(), key=lambda item: item[0])
    ]

    return {
        "pipeline_value_total": round(total_amount, 2),
        "win_rate_percent": round(win_rate, 2),
        "avg_deal_size": round(average_deal_size, 2),
        "close_rate_percent": round(close_rate, 2),
        "forecast_monthly": forecast_monthly,
        "without_close_date": no_close_date_count,
        "total_count": total_count,
        "closed_count": closed_count,
        "won_count": won_count,
        "lost_count": lost_count,
    }


def _create_opportunity_payload(
    db: Session,
    payload: AdminOpportunityCreateRequest,
) -> dict[str, Any]:
    lead = _get_lead_or_404(db, payload.prospect_id.strip())
    stage_value = _coerce_pipeline_opportunity_stage(payload.stage)
    status_value = _infer_opportunity_status_from_stage(stage_value)
    opportunity_name = (payload.name or "").strip()
    if not opportunity_name:
        lead_name = f"{lead.first_name or ''} {lead.last_name or ''}".strip() or lead.email
        opportunity_name = f"Opportunite - {lead_name}"

    row = DBOpportunity(
        id=str(uuid.uuid4()),
        lead_id=lead.id,
        name=opportunity_name,
        stage=stage_value,
        status=status_value,
        owner_user_id=lead.lead_owner_user_id,
        stage_canonical=_funnel_svc.LEGACY_OPPORTUNITY_STAGE_TO_CANONICAL.get(
            str(stage_value).strip().lower(),
            "opportunity",
        ),
        stage_entered_at=datetime.utcnow(),
        amount=float(payload.amount),
        probability=int(payload.probability),
        assigned_to=_coerce_assigned_to(payload.assigned_to),
        expected_close_date=_parse_datetime_field(payload.close_date, "close_date"),
        details_json={},
    )
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to create opportunity.", extra={"error": str(exc), "lead_id": lead.id})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create opportunity.",
        ) from exc
    return _serialize_opportunity_board_item(row, lead=lead)


def _update_opportunity_payload(
    db: Session,
    *,
    opportunity_id: str,
    payload: AdminOpportunityUpdateRequest,
) -> dict[str, Any]:
    row = db.query(DBOpportunity).filter(DBOpportunity.id == opportunity_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity not found.")

    update_data = payload.model_dump(exclude_unset=True)
    if "prospect_id" in update_data and payload.prospect_id is not None:
        lead = _get_lead_or_404(db, payload.prospect_id.strip())
        row.lead_id = lead.id
    if "name" in update_data and payload.name is not None:
        row.name = payload.name.strip()
    if "stage" in update_data and payload.stage is not None:
        row.stage = _coerce_pipeline_opportunity_stage(payload.stage)
        row.status = _infer_opportunity_status_from_stage(row.stage)
        row.stage_canonical = _funnel_svc.LEGACY_OPPORTUNITY_STAGE_TO_CANONICAL.get(
            str(row.stage).strip().lower(),
            "opportunity",
        )
        row.stage_entered_at = datetime.utcnow()
    if "amount" in update_data:
        row.amount = float(payload.amount) if payload.amount is not None else 0.0
    if "probability" in update_data:
        row.probability = int(payload.probability or 0)
    if "close_date" in update_data:
        row.expected_close_date = _parse_datetime_field(payload.close_date, "close_date")
    if "assigned_to" in update_data:
        row.assigned_to = _coerce_assigned_to(payload.assigned_to)

    try:
        db.commit()
        db.refresh(row)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception(
            "Failed to update opportunity.",
            extra={"error": str(exc), "opportunity_id": opportunity_id},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update opportunity.",
        ) from exc

    lead = _get_lead_or_404(db, row.lead_id)
    return _serialize_opportunity_board_item(row, lead=lead)


def _delete_opportunity_payload(db: Session, *, opportunity_id: str) -> dict[str, Any]:
    row = db.query(DBOpportunity).filter(DBOpportunity.id == opportunity_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity not found.")
    db.delete(row)
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception(
            "Failed to delete opportunity.",
            extra={"error": str(exc), "opportunity_id": opportunity_id},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete opportunity.",
        ) from exc
    return {"deleted": True, "id": opportunity_id}


def _quick_create_opportunity_lead_payload(
    db: Session,
    payload: AdminOpportunityQuickLeadRequest,
) -> dict[str, Any]:
    existing = db.query(DBLead).filter(DBLead.email == str(payload.email)).first()
    if existing:
        return {"created": False, "lead": _serialize_opportunity_prospect_summary(existing)}

    lead_payload = AdminLeadCreateRequest(
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        email=payload.email,
        company_name=payload.company_name.strip(),
        status="NEW",
        segment="General",
    )
    created = _create_lead_payload(db, lead_payload)
    created_lead = _get_lead_or_404(db, created["id"])
    return {"created": True, "lead": _serialize_opportunity_prospect_summary(created_lead)}


def _list_lead_notes_payload(db: Session, *, lead_id: str) -> dict[str, Any]:
    db_lead = _get_lead_or_404(db, lead_id)
    return {"items": _lead_notes_from_details(db_lead.details)}


def _save_lead_notes_payload(
    db: Session,
    *,
    lead_id: str,
    payload: AdminLeadNotesUpdateRequest,
    actor: str,
) -> tuple[dict[str, Any], dict[str, int]]:
    db_lead = _get_lead_or_404(db, lead_id)
    existing_notes = _lead_notes_from_details(db_lead.details)
    existing_by_id = {str(item.get("id")): item for item in existing_notes if item.get("id")}
    now_iso = datetime.utcnow().isoformat()

    next_notes: list[dict[str, Any]] = []
    for item in payload.items:
        note_id = (item.id or "").strip() or str(uuid.uuid4())
        previous = existing_by_id.get(note_id, {})
        content = item.content.strip()
        if not content:
            continue
        created_at = (
            str(previous.get("created_at"))
            if previous.get("created_at")
            else str(item.created_at or now_iso)
        )
        note_payload = {
            "id": note_id,
            "content": content,
            "author": (item.author or str(previous.get("author") or actor)).strip() or actor,
            "created_at": created_at,
            "updated_at": now_iso,
        }
        next_notes.append(note_payload)

    details_payload = dict(db_lead.details or {})
    details_payload["notes"] = next_notes
    db_lead.details = details_payload

    try:
        db.commit()
        db.refresh(db_lead)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to save lead notes.", extra={"error": str(exc), "lead_id": lead_id})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save lead notes.",
        ) from exc

    new_ids = {item["id"] for item in next_notes}
    old_ids = {item["id"] for item in existing_notes}
    stats = {
        "created": len(new_ids - old_ids),
        "updated": len(new_ids & old_ids),
        "deleted": len(old_ids - new_ids),
        "total": len(next_notes),
    }
    return {"items": next_notes}, stats


def _create_auto_tasks_for_lead_payload(
    db: Session,
    *,
    lead_id: str,
    payload: AdminLeadAutoTaskCreateRequest,
) -> dict[str, Any]:
    db_lead = db.query(DBLead).filter(DBLead.id == lead_id).first()
    if not db_lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")

    mode = (payload.mode or "append").strip().lower()
    if mode not in {"append", "replace"}:
        raise HTTPException(
            status_code=HTTP_422_STATUS,
            detail=f"Unsupported mode: {payload.mode}",
        )

    channels = _normalize_task_channels(payload.channels)
    plan = _build_communication_plan_payload(db_lead, channels=channels)
    steps = list(plan.get("recommended_sequence") or [])

    if mode == "replace" and not payload.dry_run:
        db.query(DBTask).filter(
            DBTask.lead_id == lead_id,
            DBTask.source == "auto-rule",
        ).delete(synchronize_session=False)

    created_items: list[dict[str, Any]] = []
    now = datetime.now()
    for step in steps:
        due_date = now + timedelta(days=int(step.get("day_offset") or 0))
        task_payload = {
            "id": str(uuid.uuid4()),
            "title": str(step.get("title") or f"Suivi lead - {db_lead.email}"),
            "status": "To Do",
            "priority": _coerce_task_priority(str(step.get("priority") or "Medium")),
            "due_date": due_date.isoformat(),
            "assigned_to": (payload.assigned_to or "Vous").strip() or "Vous",
            "lead_id": lead_id,
            "channel": _coerce_task_channel(str(step.get("channel") or "email")),
            "sequence_step": int(step.get("step") or 1),
            "source": "auto-rule",
            "rule_id": str(plan.get("rule", {}).get("id") or ""),
            "related_score_snapshot": plan.get("score_snapshot") or {},
        }
        created_items.append(task_payload)

        if payload.dry_run:
            continue

        db.add(
            DBTask(
                id=task_payload["id"],
                title=task_payload["title"],
                status=task_payload["status"],
                priority=task_payload["priority"],
                due_date=_parse_datetime_field(task_payload["due_date"], "due_date"),
                assigned_to=task_payload["assigned_to"],
                lead_id=lead_id,
                channel=task_payload["channel"],
                sequence_step=task_payload["sequence_step"],
                source=task_payload["source"],
                rule_id=task_payload["rule_id"] or None,
                score_snapshot_json=task_payload["related_score_snapshot"],
            )
        )

    if not payload.dry_run:
        try:
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            logger.exception("Failed to auto-create communication tasks.", extra={"error": str(exc), "lead_id": lead_id})
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create automatic communication tasks.",
            ) from exc

    return {
        "lead_id": lead_id,
        "mode": mode,
        "dry_run": bool(payload.dry_run),
        "rule": plan.get("rule") or {},
        "created_count": len(created_items),
        "items": created_items,
    }


def _create_project_payload(db: Session, payload: AdminProjectCreateRequest) -> dict[str, Any]:
    project = DBProject(
        id=str(uuid.uuid4()),
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        status=_coerce_project_status(payload.status),
        lead_id=payload.lead_id,
        progress_percent=_coerce_progress_percent(payload.progress_percent),
        budget_total=_coerce_budget_value(payload.budget_total),
        budget_spent=_coerce_budget_value(payload.budget_spent, default_zero=True),
        team_json=_normalize_project_list_payload(payload.team, field_name="team"),
        timeline_json=_normalize_project_list_payload(payload.timeline, field_name="timeline"),
        deliverables_json=_normalize_project_list_payload(payload.deliverables, field_name="deliverable"),
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
    if "progress_percent" in update_data:
        project.progress_percent = _coerce_progress_percent(payload.progress_percent)
    if "budget_total" in update_data:
        project.budget_total = _coerce_budget_value(payload.budget_total)
    if "budget_spent" in update_data:
        project.budget_spent = _coerce_budget_value(payload.budget_spent, default_zero=True)
    if "team" in update_data:
        project.team_json = _normalize_project_list_payload(payload.team, field_name="team")
    if "timeline" in update_data:
        project.timeline_json = _normalize_project_list_payload(payload.timeline, field_name="timeline")
    if "deliverables" in update_data:
        project.deliverables_json = _normalize_project_list_payload(payload.deliverables, field_name="deliverable")
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


def _get_project_payload(db: Session, project_id: str) -> dict[str, Any]:
    project = db.query(DBProject).filter(DBProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return _serialize_project(project)


def _build_project_activity_payload(
    db: Session,
    *,
    project_id: str,
    limit: int = 40,
) -> dict[str, Any]:
    project = db.query(DBProject).filter(DBProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    items: list[dict[str, Any]] = []
    project_label = project.name or project_id

    items.append(
        {
            "id": f"project-{project.id}",
            "timestamp": project.created_at.isoformat() if project.created_at else datetime.now().isoformat(),
            "actor": "system",
            "action": "project_created",
            "title": f"Projet cree: {project_label}",
            "description": f"Statut initial: {project.status}",
            "entity_type": "project",
            "entity_id": project.id,
            "metadata": {},
        }
    )
    if project.updated_at and project.created_at and project.updated_at > project.created_at:
        items.append(
            {
                "id": f"project-update-{project.id}",
                "timestamp": project.updated_at.isoformat(),
                "actor": "system",
                "action": "project_updated",
                "title": "Projet mis a jour",
                "description": f"Derniere mise a jour du projet {project_label}",
                "entity_type": "project",
                "entity_id": project.id,
                "metadata": {},
            }
        )

    task_rows = (
        db.query(DBTask)
        .filter(DBTask.project_id == project_id)
        .order_by(DBTask.created_at.desc())
        .limit(max(1, min(limit, 200)))
        .all()
    )
    for task in task_rows:
        items.append(
            {
                "id": f"task-{task.id}",
                "timestamp": task.created_at.isoformat() if task.created_at else datetime.now().isoformat(),
                "actor": task.assigned_to or "team",
                "action": "task_linked",
                "title": task.title,
                "description": f"{task.status} | {task.priority}",
                "entity_type": "task",
                "entity_id": task.id,
                "metadata": {
                    "status": task.status,
                    "priority": task.priority,
                    "channel": task.channel,
                },
            }
        )

    audit_rows = (
        db.query(DBAuditLog)
        .order_by(DBAuditLog.created_at.desc())
        .limit(max(50, min(limit * 4, 400)))
        .all()
    )
    for row in audit_rows:
        metadata = row.metadata_json or {}
        metadata_project_id = str(metadata.get("project_id") or "")
        if row.entity_id != project_id and metadata_project_id != project_id:
            continue
        items.append(
            {
                "id": f"audit-{row.id}",
                "timestamp": row.created_at.isoformat() if row.created_at else datetime.now().isoformat(),
                "actor": row.actor,
                "action": row.action,
                "title": row.action.replace("_", " "),
                "description": row.entity_type,
                "entity_type": row.entity_type,
                "entity_id": row.entity_id,
                "metadata": metadata,
            }
        )

    items.sort(key=lambda item: item.get("timestamp") or "", reverse=True)
    return {
        "project_id": project_id,
        "total": len(items),
        "items": items[: max(1, min(limit, 200))],
    }


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
    channel_filter: str | None = None,
    source_filter: str | None = None,
    project_filter: str | None = None,
    sort_by: str = "created_at",
    sort_desc: bool = True,
) -> dict[str, Any]:
    query = db.query(DBTask)

    if search and search.strip():
        pattern = f"%{search.strip()}%"
        query = query.filter(
            or_(
                DBTask.title.ilike(pattern),
                DBTask.description.ilike(pattern),
                DBTask.assigned_to.ilike(pattern),
                DBTask.lead_id.ilike(pattern),
                DBTask.project_id.ilike(pattern),
                DBTask.project_name.ilike(pattern),
                DBTask.channel.ilike(pattern),
                DBTask.source.ilike(pattern),
            )
        )

    if status_filter and status_filter.strip():
        query = query.filter(DBTask.status == _coerce_task_status(status_filter))
    if channel_filter and channel_filter.strip():
        query = query.filter(DBTask.channel == _coerce_task_channel(channel_filter))
    if source_filter and source_filter.strip():
        query = query.filter(DBTask.source == _coerce_task_source(source_filter))
    if project_filter and project_filter.strip():
        query = query.filter(DBTask.project_id == project_filter.strip())

    total = query.count()

    sort_map = {
        "created_at": DBTask.created_at,
        "title": DBTask.title,
        "status": DBTask.status,
        "priority": DBTask.priority,
        "due_date": DBTask.due_date,
        "assigned_to": DBTask.assigned_to,
        "project_id": DBTask.project_id,
        "project_name": DBTask.project_name,
        "channel": DBTask.channel,
        "sequence_step": DBTask.sequence_step,
        "source": DBTask.source,
        "updated_at": DBTask.updated_at,
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


def _normalize_funnel_config_payload(raw_value: Any) -> dict[str, Any]:
    payload = dict(DEFAULT_FUNNEL_CONFIG)
    if isinstance(raw_value, dict):
        payload.update(raw_value)

    payload["stages"] = [
        _funnel_svc.normalize_stage(item)
        for item in (payload.get("stages") or list(_funnel_svc.CANONICAL_STAGES))
        if str(item).strip()
    ]
    if not payload["stages"]:
        payload["stages"] = list(_funnel_svc.CANONICAL_STAGES)

    payload["terminal_stages"] = [
        _funnel_svc.normalize_stage(item)
        for item in (payload.get("terminal_stages") or list(_funnel_svc.TERMINAL_STAGES))
        if str(item).strip()
    ]
    if not payload["terminal_stages"]:
        payload["terminal_stages"] = sorted(list(_funnel_svc.TERMINAL_STAGES))

    stage_sla_hours = payload.get("stage_sla_hours")
    if not isinstance(stage_sla_hours, dict):
        stage_sla_hours = dict(_funnel_svc.STAGE_SLA_HOURS)
    normalized_sla: dict[str, int] = {}
    for stage, hours in stage_sla_hours.items():
        stage_key = str(stage).strip().lower()
        if not stage_key:
            continue
        try:
            normalized_sla[stage_key] = max(1, min(int(hours), 24 * 30))
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=HTTP_422_STATUS,
                detail=f"Invalid stage_sla_hours value for '{stage_key}': {hours}",
            ) from exc
    payload["stage_sla_hours"] = normalized_sla

    next_action_hours = payload.get("next_action_hours")
    if not isinstance(next_action_hours, dict):
        next_action_hours = dict(_funnel_svc.NEXT_ACTION_HOURS)
    normalized_next_actions: dict[str, int] = {}
    for stage, hours in next_action_hours.items():
        stage_key = str(stage).strip().lower()
        if not stage_key:
            continue
        try:
            normalized_next_actions[stage_key] = max(1, min(int(hours), 24 * 14))
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=HTTP_422_STATUS,
                detail=f"Invalid next_action_hours value for '{stage_key}': {hours}",
            ) from exc
    payload["next_action_hours"] = normalized_next_actions

    payload["model"] = str(payload.get("model") or DEFAULT_FUNNEL_CONFIG["model"])
    return payload


def _get_funnel_config_payload(db: Session) -> dict[str, Any]:
    row = db.query(DBAdminSetting).filter(DBAdminSetting.key == FUNNEL_CONFIG_SETTING_KEY).first()
    return _normalize_funnel_config_payload(row.value_json if row else {})


def _save_funnel_config_payload(db: Session, payload: AdminFunnelConfigUpdatePayload) -> dict[str, Any]:
    existing = _get_funnel_config_payload(db)
    updates = payload.model_dump(exclude_unset=True)
    merged = {**existing, **updates}
    normalized = _normalize_funnel_config_payload(merged)

    row = db.query(DBAdminSetting).filter(DBAdminSetting.key == FUNNEL_CONFIG_SETTING_KEY).first()
    if not row:
        row = DBAdminSetting(key=FUNNEL_CONFIG_SETTING_KEY, value_json=normalized)
        db.add(row)
    else:
        row.value_json = normalized

    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to persist funnel config.", extra={"error": str(exc)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save funnel configuration.",
        ) from exc
    return normalized


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
                "href": f"/tasks/{task.id}",
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
    if entity == "systems":
        return ["system_key", "system_type", "status", "item_count", "updated_at", "details"]
    return ["id", "name", "status", "lead_id", "due_date", "created_at"]


def _build_system_export_rows(db: Session) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    settings_payload = _get_admin_settings_payload(db)
    settings_updated_at = (
        db.query(func.max(DBAdminSetting.updated_at)).scalar()
    )
    rows.append(
        {
            "system_key": "admin_settings",
            "system_type": "settings",
            "status": "configured",
            "item_count": len(settings_payload),
            "updated_at": settings_updated_at.isoformat() if settings_updated_at else "",
            "details": json.dumps(
                {
                    "locale": settings_payload.get("locale"),
                    "timezone": settings_payload.get("timezone"),
                    "theme": settings_payload.get("theme"),
                    "refresh_mode": settings_payload.get("default_refresh_mode"),
                },
                ensure_ascii=False,
            ),
        }
    )

    integrations_payload = _list_integrations_payload(db).get("providers", {})
    for key, payload in integrations_payload.items():
        rows.append(
            {
                "system_key": key,
                "system_type": "integration",
                "status": "enabled" if payload.get("enabled") else "disabled",
                "item_count": 1,
                "updated_at": payload.get("updated_at") or "",
                "details": json.dumps(payload.get("meta") or {}, ensure_ascii=False),
            }
        )

    webhook_rows = db.query(DBWebhookConfig).order_by(DBWebhookConfig.created_at.desc()).all()
    if webhook_rows:
        for webhook in webhook_rows:
            rows.append(
                {
                    "system_key": webhook.id,
                    "system_type": "webhook",
                    "status": "enabled" if webhook.enabled else "disabled",
                    "item_count": len(webhook.events or []),
                    "updated_at": webhook.updated_at.isoformat() if webhook.updated_at else "",
                    "details": json.dumps(
                        {
                            "name": webhook.name,
                            "url": webhook.url,
                            "events": webhook.events or [],
                        },
                        ensure_ascii=False,
                    ),
                }
            )
    else:
        rows.append(
            {
                "system_key": "webhooks",
                "system_type": "webhook",
                "status": "not_configured",
                "item_count": 0,
                "updated_at": "",
                "details": "{}",
            }
        )

    schedule_rows = db.query(DBReportSchedule).order_by(DBReportSchedule.created_at.desc()).all()
    if schedule_rows:
        for schedule in schedule_rows:
            rows.append(
                {
                    "system_key": schedule.id,
                    "system_type": "report_schedule",
                    "status": "enabled" if schedule.enabled else "disabled",
                    "item_count": len(schedule.recipients_json or []),
                    "updated_at": schedule.updated_at.isoformat() if schedule.updated_at else "",
                    "details": json.dumps(
                        {
                            "name": schedule.name,
                            "frequency": schedule.frequency,
                            "format": schedule.format,
                            "timezone": schedule.timezone,
                        },
                        ensure_ascii=False,
                    ),
                }
            )
    else:
        rows.append(
            {
                "system_key": "report_schedules",
                "system_type": "report_schedule",
                "status": "not_configured",
                "item_count": 0,
                "updated_at": "",
                "details": "{}",
            }
        )

    total_users = db.query(DBAdminUser).count()
    active_users = db.query(DBAdminUser).filter(DBAdminUser.status == "active").count()
    rows.append(
        {
            "system_key": "admin_users",
            "system_type": "security",
            "status": "configured" if total_users else "not_configured",
            "item_count": total_users,
            "updated_at": "",
            "details": json.dumps(
                {"active_users": active_users, "inactive_users": max(0, total_users - active_users)},
                ensure_ascii=False,
            ),
        }
    )

    return rows


def _export_csv_payload(db: Session, *, entity: str, fields: str | None) -> tuple[str, str]:
    selected_entity = entity.strip().lower()
    if selected_entity not in {"leads", "tasks", "projects", "systems"}:
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
    elif selected_entity == "systems":
        serialized = _build_system_export_rows(db)
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


def _list_integrations_payload(
    db: Session,
    *,
    include_runtime_secrets: bool = False,
) -> dict[str, Any]:
    try:
        _sec_svc.migrate_plaintext_integration_secrets_if_needed(db)
    except _sec_svc.SecretsManagerError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

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
        merged_config = {**current_config, **row_config}
        current["config"] = _sec_svc.apply_integration_secret_fields(
            db=db,
            provider_key=key,
            config=merged_config,
            include_runtime_values=include_runtime_secrets,
        )
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
    try:
        _sec_svc.migrate_plaintext_integration_secrets_if_needed(db)
    except _sec_svc.SecretsManagerError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    configured_providers: list[str] = []
    secret_updates: dict[str, str] = {}

    for key, value in payload.providers.items():
        clean_key = key.strip().lower()
        if not clean_key:
            continue
        configured_providers.append(clean_key)
        row = db.query(DBIntegrationConfig).filter(DBIntegrationConfig.key == clean_key).first()
        if not row:
            row = DBIntegrationConfig(key=clean_key)
            db.add(row)
        row.enabled = bool(value.enabled)
        clean_config, extracted_secrets = _sec_svc.sanitize_integration_config(
            provider_key=clean_key,
            config=value.config or {},
        )
        row.config_json = clean_config
        for secret_key, secret_value in extracted_secrets.items():
            if not secret_value:
                continue
            secret_updates[secret_key] = secret_value

    try:
        if secret_updates:
            _sec_svc.upsert_many_secrets(
                db,
                secrets_payload=secret_updates,
                actor=actor,
            )
        else:
            db.commit()
    except _sec_svc.SecretsManagerError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to persist integrations.", extra={"error": str(exc)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save integrations.",
        ) from exc

    _audit_log(
        db,
        actor=actor,
        action="integrations_updated",
        entity_type="integration",
        metadata={
            "providers": sorted(configured_providers),
            "secret_keys": sorted(secret_updates.keys()),
        },
    )
    return _list_integrations_payload(db)


def _web_research_payload(
    db: Session,
    *,
    query: str,
    provider: str,
    limit: int,
) -> dict[str, Any]:
    integrations = _list_integrations_payload(db, include_runtime_secrets=True).get("providers", {})
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


def _serialize_optional_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat()


def _build_sync_source_payload(
    *,
    entity: str,
    count: int,
    latest_at: datetime | None,
    now: datetime,
) -> tuple[dict[str, Any], datetime | None]:
    stale_seconds: int | None = None
    if latest_at is not None:
        stale_seconds = max(0, int((now - latest_at).total_seconds()))

    if count <= 0:
        status_value = "empty"
    elif stale_seconds is None:
        status_value = "warning"
    elif stale_seconds >= SYNC_STALE_ERROR_SECONDS:
        status_value = "error"
    elif stale_seconds >= SYNC_STALE_WARNING_SECONDS:
        status_value = "warning"
    else:
        status_value = "ok"

    return (
        {
            "entity": entity,
            "count": int(count),
            "last_updated_at": _serialize_optional_datetime(latest_at),
            "stale_seconds": stale_seconds,
            "status": status_value,
        },
        latest_at,
    )


def _build_sync_health_payload(db: Session) -> dict[str, Any]:
    now = datetime.now()

    lead_count = db.query(DBLead).count()
    lead_latest = db.query(func.max(DBLead.updated_at)).scalar()
    if lead_latest is None:
        lead_latest = db.query(func.max(DBLead.created_at)).scalar()

    task_count = db.query(DBTask).count()
    task_latest = db.query(func.max(DBTask.created_at)).scalar()

    project_count = db.query(DBProject).count()
    project_latest = db.query(func.max(DBProject.updated_at)).scalar()
    if project_latest is None:
        project_latest = db.query(func.max(DBProject.created_at)).scalar()

    report_run_count = db.query(DBReportRun).count()
    report_run_latest = db.query(func.max(DBReportRun.created_at)).scalar()

    assistant_run_count = db.query(DBAssistantRun).count()
    assistant_run_latest = db.query(func.max(DBAssistantRun.created_at)).scalar()

    notification_count = db.query(DBNotification).count()
    notification_latest = db.query(func.max(DBNotification.created_at)).scalar()

    sources_with_dates = [
        _build_sync_source_payload(entity="leads", count=lead_count, latest_at=lead_latest, now=now),
        _build_sync_source_payload(entity="tasks", count=task_count, latest_at=task_latest, now=now),
        _build_sync_source_payload(entity="projects", count=project_count, latest_at=project_latest, now=now),
        _build_sync_source_payload(
            entity="report_runs",
            count=report_run_count,
            latest_at=report_run_latest,
            now=now,
        ),
        _build_sync_source_payload(
            entity="assistant_runs",
            count=assistant_run_count,
            latest_at=assistant_run_latest,
            now=now,
        ),
        _build_sync_source_payload(
            entity="notifications",
            count=notification_count,
            latest_at=notification_latest,
            now=now,
        ),
    ]
    sources = [payload for payload, _ in sources_with_dates]
    latest_candidates = [stamp for _, stamp in sources_with_dates if stamp is not None]
    last_sync_at = max(latest_candidates) if latest_candidates else None
    stale_seconds = max(0, int((now - last_sync_at).total_seconds())) if last_sync_at else None

    statuses = {item["status"] for item in sources}
    if "error" in statuses:
        status_value = "error"
    elif "warning" in statuses:
        status_value = "warning"
    elif statuses == {"empty"}:
        status_value = "empty"
    else:
        status_value = "ok"

    return {
        "generated_at": now.isoformat(),
        "status": status_value,
        "ok": status_value in {"ok", "empty"},
        "last_sync_at": _serialize_optional_datetime(last_sync_at),
        "stale_seconds": stale_seconds,
        "sources": sources,
    }


def _build_data_integrity_payload(db: Session) -> dict[str, Any]:
    now = datetime.now()
    stale_before = now - timedelta(days=INTEGRITY_STALE_UNSCORED_DAYS)

    lead_total = db.query(DBLead).count()
    task_total = db.query(DBTask).count()
    project_total = db.query(DBProject).count()

    orphan_tasks = (
        db.query(DBTask.id)
        .outerjoin(DBLead, DBTask.lead_id == DBLead.id)
        .filter(DBTask.lead_id.is_not(None), DBLead.id.is_(None))
        .count()
    )
    orphan_projects = (
        db.query(DBProject.id)
        .outerjoin(DBLead, DBProject.lead_id == DBLead.id)
        .filter(DBProject.lead_id.is_not(None), DBLead.id.is_(None))
        .count()
    )
    tasks_without_assignee = (
        db.query(DBTask.id)
        .filter(func.trim(func.coalesce(DBTask.assigned_to, "")) == "")
        .count()
    )
    stale_unscored_leads = (
        db.query(DBLead.id)
        .filter(or_(DBLead.last_scored_at.is_(None), DBLead.last_scored_at < stale_before))
        .count()
    )
    failed_report_runs_30d = (
        db.query(DBReportRun.id)
        .filter(DBReportRun.status == "failed", DBReportRun.created_at >= now - timedelta(days=30))
        .count()
    )

    duplicate_email_rows = (
        db.query(func.lower(DBLead.email), func.count(DBLead.id))
        .filter(DBLead.email.is_not(None))
        .group_by(func.lower(DBLead.email))
        .having(func.count(DBLead.id) > 1)
        .all()
    )
    duplicate_lead_emails = sum(int(count) - 1 for _, count in duplicate_email_rows)

    issues: list[dict[str, Any]] = []
    if orphan_tasks > 0:
        issues.append(
            {
                "code": "orphan_tasks",
                "severity": "error",
                "count": orphan_tasks,
                "message": "Certaines taches referencent un lead inexistant.",
            }
        )
    if orphan_projects > 0:
        issues.append(
            {
                "code": "orphan_projects",
                "severity": "error",
                "count": orphan_projects,
                "message": "Certains projets referencent un lead inexistant.",
            }
        )
    if duplicate_lead_emails > 0:
        issues.append(
            {
                "code": "duplicate_lead_emails",
                "severity": "error",
                "count": duplicate_lead_emails,
                "message": "Des leads partagent la meme adresse email.",
            }
        )
    if tasks_without_assignee > 0:
        issues.append(
            {
                "code": "tasks_without_assignee",
                "severity": "warning",
                "count": tasks_without_assignee,
                "message": "Des taches n'ont pas d'assigne explicite.",
            }
        )
    if stale_unscored_leads > 0:
        issues.append(
            {
                "code": "stale_unscored_leads",
                "severity": "warning",
                "count": stale_unscored_leads,
                "message": "Des leads ne sont pas rescored recemment.",
            }
        )
    if failed_report_runs_30d > 0:
        issues.append(
            {
                "code": "failed_report_runs_30d",
                "severity": "warning",
                "count": failed_report_runs_30d,
                "message": "Des executions de rapports ont echoue sur les 30 derniers jours.",
            }
        )

    severities = {item["severity"] for item in issues}
    if "error" in severities:
        status_value = "error"
    elif "warning" in severities:
        status_value = "warning"
    else:
        status_value = "ok"

    return {
        "generated_at": now.isoformat(),
        "status": status_value,
        "ok": status_value == "ok",
        "totals": {
            "leads": lead_total,
            "tasks": task_total,
            "projects": project_total,
        },
        "checks": {
            "orphan_tasks": orphan_tasks,
            "orphan_projects": orphan_projects,
            "duplicate_lead_emails": duplicate_lead_emails,
            "tasks_without_assignee": tasks_without_assignee,
            "stale_unscored_leads": stale_unscored_leads,
            "failed_report_runs_30d": failed_report_runs_30d,
        },
        "issues": issues,
    }


def _build_metrics_overview_payload(db: Session) -> dict[str, Any]:
    report_30d = _build_report_30d_payload(db, window="30d")
    sync_health = _build_sync_health_payload(db)
    integrity = _build_data_integrity_payload(db)
    return {
        "generated_at": datetime.now().isoformat(),
        "request": request_metrics.snapshot(),
        "funnel": _get_stats_payload(db),
        "analytics": _get_analytics_payload(db),
        "report_30d": {
            "window": report_30d["window"],
            "kpis": report_30d["kpis"],
            "quality_flags": report_30d["quality_flags"],
        },
        "sync": {
            "status": sync_health["status"],
            "ok": sync_health["ok"],
            "last_sync_at": sync_health["last_sync_at"],
            "stale_seconds": sync_health["stale_seconds"],
        },
        "integrity": {
            "status": integrity["status"],
            "ok": integrity["ok"],
            "issue_count": len(integrity["issues"]),
        },
    }


def _build_report_30d_payload(db: Session, *, window: str = "30d") -> dict[str, Any]:
    window_label, window_days = _parse_window_days(window, default_days=30)
    now = datetime.now()
    start_at = now - timedelta(days=window_days - 1)

    contacted_statuses = [
        LeadStatus.CONTACTED,
        LeadStatus.INTERESTED,
        LeadStatus.CONVERTED,
        LeadStatus.LOST,
    ]

    leads_created_total = db.query(DBLead).filter(DBLead.created_at >= start_at).count()
    leads_scored_total = (
        db.query(DBLead)
        .filter(DBLead.last_scored_at.is_not(None), DBLead.last_scored_at >= start_at)
        .count()
    )
    leads_contacted_total = (
        db.query(DBLead)
        .filter(DBLead.updated_at >= start_at, DBLead.status.in_(contacted_statuses))
        .count()
    )
    leads_closed_total = (
        db.query(DBLead)
        .filter(DBLead.updated_at >= start_at, DBLead.status == LeadStatus.CONVERTED)
        .count()
    )

    tasks_created_total = db.query(DBTask).filter(DBTask.created_at >= start_at).count()
    tasks_completed_total = (
        db.query(DBTask)
        .filter(DBTask.created_at >= start_at, DBTask.status == "Done")
        .count()
    )
    task_completion_rate = round((tasks_completed_total / tasks_created_total) * 100, 2) if tasks_created_total else 0.0

    buckets: dict[str, dict[str, Any]] = {}
    for offset in range(window_days):
        day = (start_at + timedelta(days=offset)).date().isoformat()
        buckets[day] = {
            "date": day,
            "created": 0,
            "scored": 0,
            "contacted": 0,
            "closed": 0,
            "tasks_created": 0,
            "tasks_completed": 0,
        }

    created_rows = (
        db.query(func.date(DBLead.created_at), func.count(DBLead.id))
        .filter(DBLead.created_at >= start_at)
        .group_by(func.date(DBLead.created_at))
        .all()
    )
    for day_value, count in created_rows:
        key = str(day_value)
        if key in buckets:
            buckets[key]["created"] = int(count)

    scored_rows = (
        db.query(func.date(DBLead.last_scored_at), func.count(DBLead.id))
        .filter(DBLead.last_scored_at.is_not(None), DBLead.last_scored_at >= start_at)
        .group_by(func.date(DBLead.last_scored_at))
        .all()
    )
    for day_value, count in scored_rows:
        key = str(day_value)
        if key in buckets:
            buckets[key]["scored"] = int(count)

    contacted_rows = (
        db.query(func.date(DBLead.updated_at), func.count(DBLead.id))
        .filter(DBLead.updated_at >= start_at, DBLead.status.in_(contacted_statuses))
        .group_by(func.date(DBLead.updated_at))
        .all()
    )
    for day_value, count in contacted_rows:
        key = str(day_value)
        if key in buckets:
            buckets[key]["contacted"] = int(count)

    closed_rows = (
        db.query(func.date(DBLead.updated_at), func.count(DBLead.id))
        .filter(DBLead.updated_at >= start_at, DBLead.status == LeadStatus.CONVERTED)
        .group_by(func.date(DBLead.updated_at))
        .all()
    )
    for day_value, count in closed_rows:
        key = str(day_value)
        if key in buckets:
            buckets[key]["closed"] = int(count)

    task_created_rows = (
        db.query(func.date(DBTask.created_at), func.count(DBTask.id))
        .filter(DBTask.created_at >= start_at)
        .group_by(func.date(DBTask.created_at))
        .all()
    )
    for day_value, count in task_created_rows:
        key = str(day_value)
        if key in buckets:
            buckets[key]["tasks_created"] = int(count)

    task_done_rows = (
        db.query(func.date(DBTask.created_at), func.count(DBTask.id))
        .filter(DBTask.created_at >= start_at, DBTask.status == "Done")
        .group_by(func.date(DBTask.created_at))
        .all()
    )
    for day_value, count in task_done_rows:
        key = str(day_value)
        if key in buckets:
            buckets[key]["tasks_completed"] = int(count)

    channel_agg: dict[str, dict[str, Any]] = {}
    task_rows = (
        db.query(DBTask.channel, DBTask.status)
        .filter(DBTask.created_at >= start_at)
        .all()
    )
    for channel, status in task_rows:
        key = (channel or "email").strip().lower() or "email"
        payload = channel_agg.setdefault(key, {"channel": key, "count": 0, "completed": 0})
        payload["count"] += 1
        if status == "Done":
            payload["completed"] += 1
    channel_breakdown = sorted(channel_agg.values(), key=lambda item: item["count"], reverse=True)

    timeline_items: list[dict[str, Any]] = []
    lead_rows = (
        db.query(DBLead)
        .filter(DBLead.created_at >= start_at)
        .order_by(DBLead.created_at.desc())
        .limit(120)
        .all()
    )
    for row in lead_rows:
        timeline_items.append(
            {
                "id": f"lead-{row.id}",
                "event_type": "lead_created",
                "timestamp": row.created_at.isoformat() if row.created_at else now.isoformat(),
                "title": "Lead cree",
                "description": row.email,
                "lead_id": row.id,
            }
        )

    score_rows = (
        db.query(DBLead)
        .filter(DBLead.last_scored_at.is_not(None), DBLead.last_scored_at >= start_at)
        .order_by(DBLead.last_scored_at.desc())
        .limit(120)
        .all()
    )
    for row in score_rows:
        timeline_items.append(
            {
                "id": f"score-{row.id}",
                "event_type": "lead_scored",
                "timestamp": row.last_scored_at.isoformat() if row.last_scored_at else now.isoformat(),
                "title": "Lead rescored",
                "description": f"Score total {round(float(row.total_score or 0.0), 1)}",
                "lead_id": row.id,
            }
        )

    task_timeline_rows = (
        db.query(DBTask)
        .filter(DBTask.created_at >= start_at)
        .order_by(DBTask.created_at.desc())
        .limit(200)
        .all()
    )
    for row in task_timeline_rows:
        timeline_items.append(
            {
                "id": f"task-{row.id}",
                "event_type": "task_created",
                "timestamp": row.created_at.isoformat() if row.created_at else now.isoformat(),
                "title": row.title,
                "description": f"{row.channel or 'email'} | {row.status}",
                "task_id": row.id,
                "lead_id": row.lead_id,
                "channel": row.channel or "email",
                "source": row.source or "manual",
            }
        )

    run_rows = (
        db.query(DBReportRun)
        .filter(DBReportRun.created_at >= start_at)
        .order_by(DBReportRun.created_at.desc())
        .limit(60)
        .all()
    )
    for row in run_rows:
        timeline_items.append(
            {
                "id": f"report-run-{row.id}",
                "event_type": "report_run",
                "timestamp": row.created_at.isoformat() if row.created_at else now.isoformat(),
                "title": "Execution de rapport",
                "description": f"{row.status} ({row.output_format})",
                "run_id": row.id,
            }
        )

    timeline_items.sort(key=lambda item: item.get("timestamp") or "", reverse=True)

    stale_unscored = (
        db.query(DBLead)
        .filter(or_(DBLead.last_scored_at.is_(None), DBLead.last_scored_at < start_at))
        .count()
    )
    unassigned_tasks = (
        db.query(DBTask)
        .filter(DBTask.created_at >= start_at, or_(DBTask.assigned_to.is_(None), DBTask.assigned_to == ""))
        .count()
    )

    return {
        "window": {
            "label": window_label,
            "days": window_days,
            "from": start_at.isoformat(),
            "to": now.isoformat(),
        },
        "kpis": {
            "leads_created_total": leads_created_total,
            "leads_scored_total": leads_scored_total,
            "leads_contacted_total": leads_contacted_total,
            "leads_closed_total": leads_closed_total,
            "tasks_created_total": tasks_created_total,
            "tasks_completed_total": tasks_completed_total,
            "task_completion_rate": task_completion_rate,
        },
        "daily_trend": list(buckets.values()),
        "timeline_items": timeline_items[:250],
        "channel_breakdown": channel_breakdown,
        "quality_flags": {
            "stale_unscored_leads": stale_unscored,
            "unassigned_tasks": unassigned_tasks,
        },
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
        allow_origin_regex=r"https://.*\.(netlify|vercel)\.app",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def observe_admin_requests(request: Request, call_next):
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = request_id
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
                        "request_id": request_id,
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
                    "request_id": request_id,
                },
            )
        response.headers["x-request-id"] = request_id
        return response

    @app.exception_handler(HTTPException)
    async def fastapi_http_exception_handler(request: Request, exc: HTTPException):
        message, details = _extract_error_message_and_details(exc.detail)
        code: str | None = None
        if isinstance(exc.detail, dict):
            maybe_code = exc.detail.get("code")
            if isinstance(maybe_code, str) and maybe_code.strip():
                code = maybe_code.strip().upper()
        return _error_response(
            request,
            status_code=exc.status_code,
            code=code,
            message=message,
            details=details,
            headers=exc.headers,
        )

    @app.exception_handler(StarletteHTTPException)
    async def starlette_http_exception_handler(request: Request, exc: StarletteHTTPException):
        message, details = _extract_error_message_and_details(exc.detail)
        return _error_response(
            request,
            status_code=exc.status_code,
            message=message,
            details=details,
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return _error_response(
            request,
            status_code=HTTP_422_STATUS,
            code="VALIDATION_ERROR",
            message="Request validation failed.",
            details={"issues": exc.errors()},
            retryable=False,
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.exception(
            "Unhandled exception",
            extra={
                "path": request.url.path,
                "method": request.method,
                "request_id": getattr(request.state, "request_id", None),
            },
        )
        details = {}
        if not _is_production():
            details = {"type": exc.__class__.__name__, "message": str(exc)}
        return _error_response(
            request,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            code="INTERNAL_ERROR",
            message="Internal server error.",
            details=details,
            retryable=True,
        )

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
        subject = _resolve_admin_subject(db, username, payload.password)
        if not subject:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid admin credentials.",
                headers={"WWW-Authenticate": "Basic"},
            )

        refresh_token = secrets.token_urlsafe(48)
        try:
            session = _create_refresh_session(
                db,
                username=subject,
                refresh_token=refresh_token,
                request=request,
            )
            access_token, access_expires_at = _create_access_token(
                username=subject,
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
                "username": subject,
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

    @auth_v1.post("/signup")
    def signup_admin_v1(
        payload: AdminAuthSignupRequest,
        request: Request,
        db: Session = Depends(get_db),
    ) -> Response:
        normalized_email = _normalize_admin_email(str(payload.email))
        existing = (
            db.query(DBAdminUser)
            .filter(func.lower(DBAdminUser.email) == normalized_email)
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"User already exists for email {normalized_email}.",
            )

        _ensure_default_roles(db)
        now = datetime.utcnow()
        user = DBAdminUser(
            id=str(uuid.uuid4()),
            email=normalized_email,
            display_name=(payload.display_name or "").strip() or None,
            password_hash=_hash_admin_password(payload.password),
            password_updated_at=now,
            status="active",
            created_at=now,
            updated_at=now,
        )
        refresh_token = secrets.token_urlsafe(48)

        try:
            db.add(user)
            db.flush()
            _upsert_user_roles(db, user, ["sales"])
            session = _create_refresh_session(
                db,
                username=user.email,
                refresh_token=refresh_token,
                request=request,
            )
            access_token, access_expires_at = _create_access_token(
                username=user.email,
                session_id=session.id,
            )
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            logger.exception("Failed to create admin signup session.", extra={"error": str(exc)})
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Unable to create account.",
            ) from exc

        response = JSONResponse(
            {
                "ok": True,
                "username": user.email,
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

    @admin_v1.get("/metrics/overview")
    def get_metrics_overview_v1(db: Session = Depends(get_db)) -> dict[str, Any]:
        return _build_metrics_overview_payload(db)

    @admin_v1.get("/sync/health")
    def get_sync_health_v1(db: Session = Depends(get_db)) -> dict[str, Any]:
        return _build_sync_health_payload(db)

    @admin_v1.get("/data/integrity")
    def get_data_integrity_v1(db: Session = Depends(get_db)) -> dict[str, Any]:
        return _build_data_integrity_payload(db)

    @admin_v1.get("/funnel/config")
    def get_funnel_config_v1(db: Session = Depends(get_db)) -> dict[str, Any]:
        return _get_funnel_config_payload(db)

    @admin_v1.put("/funnel/config")
    def update_funnel_config_v1(
        payload: AdminFunnelConfigUpdatePayload,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        saved = _save_funnel_config_payload(db, payload)
        _audit_log(
            db,
            actor=actor,
            action="funnel_config_updated",
            entity_type="funnel",
            entity_id="config",
            metadata={"keys": sorted(payload.model_dump(exclude_unset=True).keys())},
        )
        return saved

    @admin_v1.post("/leads/{lead_id}/stage-transition")
    def transition_lead_stage_v1(
        lead_id: str,
        payload: AdminLeadStageTransitionRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        lead = _get_lead_or_404(db, lead_id)
        event = _funnel_svc.transition_lead_stage(
            db,
            lead=lead,
            to_stage=payload.to_stage,
            actor=actor,
            reason=payload.reason,
            source=payload.source,
            sync_legacy=payload.sync_legacy,
        )
        _audit_log(
            db,
            actor=actor,
            action="lead_stage_transitioned",
            entity_type="lead",
            entity_id=lead_id,
            metadata={
                "from_stage": event.get("from_stage"),
                "to_stage": event.get("to_stage"),
                "reason": payload.reason,
                "source": payload.source,
            },
        )
        return {"lead": _db_to_lead(lead).model_dump(mode="json"), "event": event}

    @admin_v1.post("/opportunities/{opportunity_id}/stage-transition")
    def transition_opportunity_stage_v1(
        opportunity_id: str,
        payload: AdminOpportunityStageTransitionRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        opportunity = db.query(DBOpportunity).filter(DBOpportunity.id == opportunity_id).first()
        if not opportunity:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity not found.")
        event = _funnel_svc.transition_opportunity_stage(
            db,
            opportunity=opportunity,
            to_stage=payload.to_stage,
            actor=actor,
            reason=payload.reason,
            source=payload.source,
        )
        lead_event = None
        if event.get("to_stage") in {"won", "post_sale", "lost", "disqualified"}:
            lead = _get_lead_or_404(db, opportunity.lead_id)
            lead_event = _funnel_svc.transition_lead_stage(
                db,
                lead=lead,
                to_stage=event["to_stage"],
                actor=actor,
                reason=f"Synced from opportunity {opportunity_id}",
                source="opportunity_sync",
                sync_legacy=True,
            )
        _audit_log(
            db,
            actor=actor,
            action="opportunity_stage_transitioned",
            entity_type="opportunity",
            entity_id=opportunity_id,
            metadata={
                "from_stage": event.get("from_stage"),
                "to_stage": event.get("to_stage"),
                "reason": payload.reason,
                "source": payload.source,
            },
        )
        lead = _get_lead_or_404(db, opportunity.lead_id)
        return {
            "opportunity": _serialize_opportunity_board_item(opportunity, lead=lead),
            "event": event,
            "lead_event": lead_event,
        }

    @admin_v1.get("/workload/owners")
    def get_workload_owners_v1(db: Session = Depends(get_db)) -> dict[str, Any]:
        return _funnel_svc.workload_by_owner(db)

    @admin_v1.post("/leads/{lead_id}/reassign")
    def reassign_lead_v1(
        lead_id: str,
        payload: AdminLeadReassignRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        lead = _get_lead_or_404(db, lead_id)
        owner = _funnel_svc.resolve_owner_user(
            db,
            user_id=payload.owner_user_id,
            email=str(payload.owner_email) if payload.owner_email else None,
            display_name=payload.owner_display_name,
        )
        result = _funnel_svc.reassign_lead_owner(
            db,
            lead=lead,
            owner_user=owner,
            actor=actor,
            reason=payload.reason,
        )
        _audit_log(
            db,
            actor=actor,
            action="lead_reassigned",
            entity_type="lead",
            entity_id=lead_id,
            metadata={"to_user_id": owner.id, "to_email": owner.email, "reason": payload.reason},
        )
        return result

    @admin_v1.post("/tasks/bulk-assign")
    def bulk_assign_tasks_v1(
        payload: AdminTaskBulkAssignRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        result = _funnel_svc.bulk_assign_tasks(
            db,
            task_ids=payload.task_ids,
            assigned_to=payload.assigned_to,
            actor=actor,
            reason=payload.reason,
        )
        _audit_log(
            db,
            actor=actor,
            action="tasks_bulk_assigned",
            entity_type="task",
            entity_id="bulk",
            metadata={
                "updated": result.get("updated"),
                "requested": result.get("requested"),
                "assigned_to": payload.assigned_to,
                "reason": payload.reason,
            },
        )
        return result

    @admin_v1.get("/recommendations")
    def list_recommendations_v1(
        db: Session = Depends(get_db),
        status_filter: str = Query(default="pending", alias="status"),
        limit: int = Query(default=50, ge=1, le=200),
        offset: int = Query(default=0, ge=0),
        seed: bool = Query(default=True),
    ) -> dict[str, Any]:
        return _funnel_svc.list_recommendations(
            db,
            status_filter=(status_filter or "").strip().lower(),
            limit=limit,
            offset=offset,
            seed=seed,
        )

    @admin_v1.post("/recommendations/{recommendation_id}/apply")
    def apply_recommendation_v1(
        recommendation_id: str,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        result = _funnel_svc.apply_recommendation(db, recommendation_id=recommendation_id, actor=actor)
        _audit_log(
            db,
            actor=actor,
            action="recommendation_applied",
            entity_type="recommendation",
            entity_id=recommendation_id,
            metadata={"result": result.get("result")},
        )
        return result

    @admin_v1.post("/recommendations/{recommendation_id}/dismiss")
    def dismiss_recommendation_v1(
        recommendation_id: str,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        result = _funnel_svc.dismiss_recommendation(db, recommendation_id=recommendation_id, actor=actor)
        _audit_log(
            db,
            actor=actor,
            action="recommendation_dismissed",
            entity_type="recommendation",
            entity_id=recommendation_id,
        )
        return result

    @admin_v1.post("/handoffs")
    def create_handoff_v1(
        payload: AdminHandoffCreateRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        lead = _get_lead_or_404(db, payload.lead_id) if payload.lead_id else None
        opportunity = (
            db.query(DBOpportunity).filter(DBOpportunity.id == payload.opportunity_id).first()
            if payload.opportunity_id
            else None
        )
        if payload.opportunity_id and opportunity is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity not found.")

        to_user = None
        if payload.to_user_id or payload.to_user_email or payload.to_user_display_name:
            to_user = _funnel_svc.resolve_owner_user(
                db,
                user_id=payload.to_user_id,
                email=str(payload.to_user_email) if payload.to_user_email else None,
                display_name=payload.to_user_display_name,
            )
        result = _funnel_svc.create_handoff(
            db,
            lead=lead,
            opportunity=opportunity,
            to_user=to_user,
            actor=actor,
            note=payload.note,
        )
        _audit_log(
            db,
            actor=actor,
            action="handoff_created",
            entity_type=result.get("entity_type") or "handoff",
            entity_id=result.get("entity_id"),
            metadata={"to_user_id": to_user.id if to_user else None, "note": payload.note},
        )
        return result

    @admin_v1.get("/conversion/funnel")
    def get_conversion_funnel_v1(
        db: Session = Depends(get_db),
        days: int = Query(default=30, ge=1, le=365),
    ) -> dict[str, Any]:
        return _funnel_svc.conversion_funnel_summary(db, days=days)

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
        db_lead = _get_lead_or_404(db, lead_id)
        return _db_to_lead(db_lead)

    @admin_v1.patch("/leads/{lead_id}")
    def update_lead_v1(
        lead_id: str,
        payload: AdminLeadUpdateRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> Lead:
        db_lead = _get_lead_or_404(db, lead_id)
        updated_lead, changes = _apply_lead_update_payload(db, db_lead=db_lead, payload=payload)
        if changes:
            _audit_log(
                db,
                actor=actor,
                action="lead_updated",
                entity_type="lead",
                entity_id=lead_id,
                metadata={"changes": changes},
            )
        return updated_lead

    @admin_v1.get("/leads/{lead_id}/interactions")
    def get_lead_interactions_v1(
        lead_id: str,
        db: Session = Depends(get_db),
    ) -> list[dict[str, Any]]:
        return _list_lead_interactions_payload(db, lead_id=lead_id)

    @admin_v1.get("/leads/{lead_id}/opportunities")
    def get_lead_opportunities_v1(
        lead_id: str,
        db: Session = Depends(get_db),
    ) -> list[dict[str, Any]]:
        return _list_lead_opportunities_payload(db, lead_id=lead_id)

    @admin_v1.post("/leads/{lead_id}/opportunities")
    def create_lead_opportunity_v1(
        lead_id: str,
        payload: AdminLeadOpportunityCreateRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        created = _create_lead_opportunity_payload(db, lead_id=lead_id, payload=payload)
        _audit_log(
            db,
            actor=actor,
            action="lead_opportunity_created",
            entity_type="lead",
            entity_id=lead_id,
            metadata={"opportunity_id": created.get("id"), "name": created.get("name")},
        )
        return created

    @admin_v1.patch("/leads/{lead_id}/opportunities/{opportunity_id}")
    def update_lead_opportunity_v1(
        lead_id: str,
        opportunity_id: str,
        payload: AdminLeadOpportunityUpdateRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        updated, changes = _update_lead_opportunity_payload(
            db,
            lead_id=lead_id,
            opportunity_id=opportunity_id,
            payload=payload,
        )
        if changes:
            _audit_log(
                db,
                actor=actor,
                action="lead_opportunity_updated",
                entity_type="lead",
                entity_id=lead_id,
                metadata={"opportunity_id": opportunity_id, "changes": changes},
            )
        return updated

    @admin_v1.get("/leads/{lead_id}/notes")
    def get_lead_notes_v1(
        lead_id: str,
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        return _list_lead_notes_payload(db, lead_id=lead_id)

    @admin_v1.put("/leads/{lead_id}/notes")
    def put_lead_notes_v1(
        lead_id: str,
        payload: AdminLeadNotesUpdateRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        saved_payload, stats = _save_lead_notes_payload(
            db,
            lead_id=lead_id,
            payload=payload,
            actor=actor,
        )
        _audit_log(
            db,
            actor=actor,
            action="lead_notes_updated",
            entity_type="lead",
            entity_id=lead_id,
            metadata=stats,
        )
        return saved_payload

    @admin_v1.post("/leads/{lead_id}/add-to-campaign")
    def add_lead_to_campaign_v1(
        lead_id: str,
        payload: AdminLeadAddToCampaignRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        _get_lead_or_404(db, lead_id)
        result = _campaign_svc.enroll_campaign_leads(
            db,
            payload.campaign_id,
            lead_ids=[lead_id],
            filters=None,
            max_leads=1,
        )
        _audit_log(
            db,
            actor=actor,
            action="lead_added_to_campaign",
            entity_type="lead",
            entity_id=lead_id,
            metadata={"campaign_id": payload.campaign_id, "created": result.get("created", 0)},
        )
        return result

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

    @admin_v1.get("/leads/{lead_id}/communication-plan")
    def get_lead_communication_plan_v1(
        lead_id: str,
        channels: str | None = Query(default=None),
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        db_lead = db.query(DBLead).filter(DBLead.id == lead_id).first()
        if not db_lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        raw_channels = (
            [item.strip() for item in channels.split(",") if item.strip()]
            if channels and channels.strip()
            else None
        )
        return _build_communication_plan_payload(db_lead, channels=raw_channels)

    @admin_v1.post("/leads/{lead_id}/tasks/auto-create")
    def auto_create_lead_tasks_v1(
        lead_id: str,
        payload: AdminLeadAutoTaskCreateRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        result = _create_auto_tasks_for_lead_payload(db, lead_id=lead_id, payload=payload)
        _audit_log(
            db,
            actor=actor,
            action="lead_tasks_auto_created",
            entity_type="lead",
            entity_id=lead_id,
            metadata={
                "dry_run": payload.dry_run,
                "mode": payload.mode,
                "created_count": result.get("created_count", 0),
                "rule_id": result.get("rule", {}).get("id"),
            },
        )
        return result

    @admin_v1.get("/leads/{lead_id}/history")
    def get_lead_history_v1(
        lead_id: str,
        window: str = Query(default="30d"),
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        return _build_lead_history_payload(db, lead_id=lead_id, window=window)


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
            link_href=f"/tasks/{created.get('id')}",
            metadata={"priority": created.get("priority")},
        )
        _audit_log(
            db,
            actor=actor,
            action="task_created",
            entity_type="task",
            entity_id=created.get("id"),
            metadata={"project_id": created.get("project_id")},
        )
        return created

    @admin_v1.get("/tasks")
    def list_tasks_v1(
        db: Session = Depends(get_db),
        page: int = Query(default=1, ge=1),
        page_size: int = Query(default=25, ge=1, le=100),
        q: str | None = Query(default=None),
        status: str | None = Query(default=None),
        channel: str | None = Query(default=None),
        source: str | None = Query(default=None),
        project_id: str | None = Query(default=None),
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
            channel_filter=channel,
            source_filter=source,
            project_filter=project_id,
            sort_by=sort,
            sort_desc=sort_desc,
        )

    @admin_v1.get("/tasks/{task_id}")
    def get_task_v1(
        task_id: str,
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        return _get_task_payload(db, task_id)

    @admin_v1.post("/tasks/{task_id}/comments")
    def add_task_comment_v1(
        task_id: str,
        payload: AdminTaskCommentCreateRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        updated = _add_task_comment_payload(db, task_id, payload)
        _audit_log(
            db,
            actor=actor,
            action="task_comment_added",
            entity_type="task",
            entity_id=task_id,
            metadata={"mentions": payload.mentions},
        )
        return updated

    @admin_v1.post("/tasks/{task_id}/close")
    def close_task_v1(
        task_id: str,
        payload: AdminTaskCloseRequest | None = None,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        closed = _close_task_payload(db, task_id, payload)
        _emit_event_notification(
            db,
            event_key="task_completed",
            title="Tache terminee",
            message=f"Tache '{closed.get('title')}' terminee.",
            entity_type="task",
            entity_id=task_id,
            link_href=f"/tasks/{task_id}",
            metadata={"priority": closed.get("priority")},
        )
        _audit_log(
            db,
            actor=actor,
            action="task_closed",
            entity_type="task",
            entity_id=task_id,
        )
        return closed

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
            metadata={"project_id": updated.get("project_id")},
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

    @admin_v1.get("/opportunities")
    def list_opportunities_v1(
        db: Session = Depends(get_db),
        page: int = Query(default=1, ge=1),
        page_size: int = Query(default=100, ge=1, le=500),
        q: str | None = Query(default=None),
        status: str | None = Query(default=None),
        assigned_to: str | None = Query(default=None),
        amount_min: float | None = Query(default=None, ge=0),
        amount_max: float | None = Query(default=None, ge=0),
        date_field: str = Query(default="close"),
        date_from: str | None = Query(default=None),
        date_to: str | None = Query(default=None),
        sort: str = Query(default="created_at"),
        order: str = Query(default="desc"),
    ) -> dict[str, Any]:
        if date_field not in {"close", "created"}:
            raise HTTPException(
                status_code=HTTP_422_STATUS,
                detail="date_field must be one of: close, created.",
            )
        if amount_min is not None and amount_max is not None and amount_min > amount_max:
            raise HTTPException(
                status_code=HTTP_422_STATUS,
                detail="amount_min must be lower or equal to amount_max.",
            )
        sort_desc = order.lower() == "desc"
        date_from_dt = _parse_query_datetime(date_from, "date_from")
        date_to_dt = _parse_query_datetime_end(date_to, "date_to")
        return _list_opportunities_payload(
            db,
            page=page,
            page_size=page_size,
            search=q,
            stage_filter=status,
            assigned_to_filter=assigned_to,
            amount_min=amount_min,
            amount_max=amount_max,
            date_field=date_field,
            date_from=date_from_dt,
            date_to=date_to_dt,
            sort_by=sort,
            sort_desc=sort_desc,
        )

    @admin_v1.get("/opportunities/summary")
    def opportunities_summary_v1(
        db: Session = Depends(get_db),
        q: str | None = Query(default=None),
        status: str | None = Query(default=None),
        assigned_to: str | None = Query(default=None),
        amount_min: float | None = Query(default=None, ge=0),
        amount_max: float | None = Query(default=None, ge=0),
        date_field: str = Query(default="close"),
        date_from: str | None = Query(default=None),
        date_to: str | None = Query(default=None),
    ) -> dict[str, Any]:
        if date_field not in {"close", "created"}:
            raise HTTPException(
                status_code=HTTP_422_STATUS,
                detail="date_field must be one of: close, created.",
            )
        if amount_min is not None and amount_max is not None and amount_min > amount_max:
            raise HTTPException(
                status_code=HTTP_422_STATUS,
                detail="amount_min must be lower or equal to amount_max.",
            )
        date_from_dt = _parse_query_datetime(date_from, "date_from")
        date_to_dt = _parse_query_datetime_end(date_to, "date_to")
        return _build_opportunities_summary_payload(
            db,
            search=q,
            stage_filter=status,
            assigned_to_filter=assigned_to,
            amount_min=amount_min,
            amount_max=amount_max,
            date_field=date_field,
            date_from=date_from_dt,
            date_to=date_to_dt,
        )

    @admin_v1.post("/opportunities/quick-lead")
    def create_opportunity_quick_lead_v1(
        payload: AdminOpportunityQuickLeadRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        result = _quick_create_opportunity_lead_payload(db, payload)
        if result.get("lead", {}).get("id"):
            _audit_log(
                db,
                actor=actor,
                action="opportunity_quick_lead",
                entity_type="lead",
                entity_id=result["lead"]["id"],
                metadata={"created": result.get("created", False)},
            )
        return result

    @admin_v1.post("/opportunities")
    def create_opportunity_v1(
        payload: AdminOpportunityCreateRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        created = _create_opportunity_payload(db, payload)
        _audit_log(
            db,
            actor=actor,
            action="opportunity_created",
            entity_type="opportunity",
            entity_id=created.get("id"),
            metadata={"prospect_id": created.get("prospect_id"), "stage": created.get("stage")},
        )
        return created

    @admin_v1.patch("/opportunities/{opportunity_id}")
    def update_opportunity_v1(
        opportunity_id: str,
        payload: AdminOpportunityUpdateRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        updated = _update_opportunity_payload(
            db,
            opportunity_id=opportunity_id,
            payload=payload,
        )
        _audit_log(
            db,
            actor=actor,
            action="opportunity_updated",
            entity_type="opportunity",
            entity_id=opportunity_id,
            metadata={"stage": updated.get("stage")},
        )
        return updated

    @admin_v1.delete("/opportunities/{opportunity_id}")
    def delete_opportunity_v1(
        opportunity_id: str,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        deleted = _delete_opportunity_payload(db, opportunity_id=opportunity_id)
        _audit_log(
            db,
            actor=actor,
            action="opportunity_deleted",
            entity_type="opportunity",
            entity_id=opportunity_id,
        )
        return deleted

    @admin_v1.get("/projects")
    def list_projects_v1(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
        projects = db.query(DBProject).order_by(DBProject.created_at.desc()).all()
        return [_serialize_project(project) for project in projects]

    @admin_v1.get("/projects/{project_id}")
    def get_project_v1(
        project_id: str,
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        return _get_project_payload(db, project_id)

    @admin_v1.get("/projects/{project_id}/activity")
    def project_activity_v1(
        project_id: str,
        limit: int = Query(default=40, ge=1, le=200),
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        return _build_project_activity_payload(db, project_id=project_id, limit=limit)

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
        changed_fields = sorted(payload.model_dump(exclude_unset=True).keys())
        updated = _update_project_payload(db, project_id, payload)
        _audit_log(
            db,
            actor=actor,
            action="project_updated",
            entity_type="project",
            entity_id=project_id,
            metadata={"changed_fields": changed_fields, "project_id": project_id},
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

    @admin_v1.post("/sequences")
    def create_sequence_v1(
        payload: CampaignSequenceCreateRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        created = _campaign_svc.create_sequence(
            db,
            name=payload.name,
            description=payload.description,
            status_value=payload.status,
            channels=payload.channels,
            steps=payload.steps,
        )
        _audit_log(
            db,
            actor=actor,
            action="sequence_created",
            entity_type="campaign_sequence",
            entity_id=created.id,
        )
        return _campaign_svc.serialize_sequence(created)

    @admin_v1.get("/sequences")
    def list_sequences_v1(
        limit: int = Query(default=25, ge=1, le=200),
        offset: int = Query(default=0, ge=0),
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        rows = _campaign_svc.list_sequences(db, limit=limit, offset=offset)
        total = db.query(DBCampaignSequence).count()
        return {
            "items": [_campaign_svc.serialize_sequence(row) for row in rows],
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    @admin_v1.get("/sequences/{sequence_id}")
    def get_sequence_v1(
        sequence_id: str,
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        row = _campaign_svc.get_sequence_or_404(db, sequence_id)
        return _campaign_svc.serialize_sequence(row)

    @admin_v1.patch("/sequences/{sequence_id}")
    def update_sequence_v1(
        sequence_id: str,
        payload: CampaignSequenceUpdateRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        updated = _campaign_svc.update_sequence(
            db,
            sequence_id,
            name=payload.name,
            description=payload.description,
            status_value=payload.status,
            channels=payload.channels,
            steps=payload.steps,
        )
        _audit_log(
            db,
            actor=actor,
            action="sequence_updated",
            entity_type="campaign_sequence",
            entity_id=sequence_id,
        )
        return _campaign_svc.serialize_sequence(updated)

    @admin_v1.post("/sequences/{sequence_id}/simulate")
    def simulate_sequence_v1(
        sequence_id: str,
        payload: CampaignSequenceSimulateRequest,
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        row = _campaign_svc.get_sequence_or_404(db, sequence_id)
        start_at = _parse_datetime_field(payload.start_at, "start_at") if payload.start_at else None
        return _campaign_svc.simulate_sequence(
            row,
            start_at=start_at,
            lead_context=payload.lead_context,
        )

    @admin_v1.post("/campaigns")
    def create_campaign_v1(
        payload: CampaignCreateRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        created = _campaign_svc.create_campaign(
            db,
            name=payload.name,
            description=payload.description,
            status_value=payload.status,
            sequence_id=payload.sequence_id,
            channel_strategy=payload.channel_strategy,
            enrollment_filter=payload.enrollment_filter,
        )
        _audit_log(
            db,
            actor=actor,
            action="campaign_created",
            entity_type="campaign",
            entity_id=created.id,
        )
        return _campaign_svc.serialize_campaign(created)

    @admin_v1.get("/campaigns")
    def list_campaigns_v1(
        limit: int = Query(default=25, ge=1, le=200),
        offset: int = Query(default=0, ge=0),
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        rows = _campaign_svc.list_campaigns(db, limit=limit, offset=offset)
        total = db.query(DBCampaign).count()
        return {
            "items": [_campaign_svc.serialize_campaign(row) for row in rows],
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    @admin_v1.get("/campaigns/{campaign_id}")
    def get_campaign_v1(
        campaign_id: str,
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        row = _campaign_svc.get_campaign_or_404(db, campaign_id)
        return _campaign_svc.serialize_campaign(row)

    @admin_v1.patch("/campaigns/{campaign_id}")
    def update_campaign_v1(
        campaign_id: str,
        payload: CampaignUpdateRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        updated = _campaign_svc.update_campaign(
            db,
            campaign_id,
            name=payload.name,
            description=payload.description,
            status_value=payload.status,
            sequence_id=payload.sequence_id,
            channel_strategy=payload.channel_strategy,
            enrollment_filter=payload.enrollment_filter,
        )
        _audit_log(
            db,
            actor=actor,
            action="campaign_updated",
            entity_type="campaign",
            entity_id=campaign_id,
        )
        return _campaign_svc.serialize_campaign(updated)

    @admin_v1.post("/campaigns/{campaign_id}/activate")
    def activate_campaign_v1(
        campaign_id: str,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        updated = _campaign_svc.set_campaign_status(db, campaign_id, "active")
        _audit_log(
            db,
            actor=actor,
            action="campaign_activated",
            entity_type="campaign",
            entity_id=campaign_id,
        )
        return _campaign_svc.serialize_campaign(updated)

    @admin_v1.post("/campaigns/{campaign_id}/pause")
    def pause_campaign_v1(
        campaign_id: str,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        updated = _campaign_svc.set_campaign_status(db, campaign_id, "paused")
        _audit_log(
            db,
            actor=actor,
            action="campaign_paused",
            entity_type="campaign",
            entity_id=campaign_id,
        )
        return _campaign_svc.serialize_campaign(updated)

    @admin_v1.post("/campaigns/{campaign_id}/enroll")
    def enroll_campaign_v1(
        campaign_id: str,
        payload: CampaignEnrollRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        result = _campaign_svc.enroll_campaign_leads(
            db,
            campaign_id,
            lead_ids=payload.lead_ids,
            filters=payload.filters,
            max_leads=payload.max_leads,
        )
        _audit_log(
            db,
            actor=actor,
            action="campaign_enrolled",
            entity_type="campaign",
            entity_id=campaign_id,
            metadata={"created": result.get("created"), "skipped": result.get("skipped")},
        )
        return result

    @admin_v1.get("/campaigns/{campaign_id}/runs")
    def list_campaign_runs_v1(
        campaign_id: str,
        status_filter: str | None = Query(default=None, alias="status"),
        limit: int = Query(default=50, ge=1, le=200),
        offset: int = Query(default=0, ge=0),
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        rows = _campaign_svc.list_campaign_runs(
            db,
            campaign_id,
            status_filter=status_filter,
            limit=limit,
            offset=offset,
        )
        total = db.query(DBCampaignRun).filter(DBCampaignRun.campaign_id == campaign_id).count()
        return {
            "items": [_campaign_svc.serialize_run(row) for row in rows],
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    @admin_v1.post("/content/generate")
    def generate_content_v1(
        payload: ContentGenerateRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        provider_config: dict[str, Any] | None = None
        if (payload.provider or "").strip().lower() == "ollama":
            integrations = _list_integrations_payload(db, include_runtime_secrets=True).get("providers", {})
            ollama_entry = integrations.get("ollama", {}) if isinstance(integrations, dict) else {}
            if isinstance(ollama_entry, dict) and not bool(ollama_entry.get("enabled")):
                raise HTTPException(
                    status_code=HTTP_422_STATUS,
                    detail="Ollama integration is disabled in settings.",
                )
            config_value = ollama_entry.get("config") if isinstance(ollama_entry, dict) else {}
            provider_config = config_value if isinstance(config_value, dict) else {}

        generated = _content_svc.generate_content(
            db,
            lead_id=payload.lead_id,
            channel=payload.channel,
            step=payload.step,
            template_key=payload.template_key,
            context=payload.context,
            provider=payload.provider,
            provider_config=provider_config,
        )
        _audit_log(
            db,
            actor=actor,
            action="content_generated",
            entity_type="content_generation",
            entity_id=generated.id,
            metadata={"channel": payload.channel, "lead_id": payload.lead_id},
        )
        return _content_svc.serialize_content_generation(generated)

    @admin_v1.post("/enrichment/run")
    def run_enrichment_v1(
        payload: EnrichmentRunRequest,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        job = _enrichment_svc.run_enrichment(
            db,
            query=payload.query,
            provider=payload.provider,
            lead_id=payload.lead_id,
            context=payload.context,
        )
        _audit_log(
            db,
            actor=actor,
            action="enrichment_run",
            entity_type="enrichment_job",
            entity_id=job.id,
            metadata={"provider": payload.provider, "lead_id": payload.lead_id},
        )
        return _enrichment_svc.serialize_enrichment_job(job)

    @admin_v1.get("/enrichment/{job_id}")
    def get_enrichment_v1(
        job_id: str,
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        job = _enrichment_svc.get_enrichment_or_404(db, job_id)
        return _enrichment_svc.serialize_enrichment_job(job)

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

    @admin_v1.get("/reports/30d")
    def get_reports_30d_v1(
        window: str = Query(default="30d"),
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        return _build_report_30d_payload(db, window=window)

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

    @admin_v1.get("/secrets/schema")
    def get_secrets_schema_v1() -> dict[str, Any]:
        return _sec_svc.get_secret_schema()

    @admin_v1.get("/secrets")
    def list_secrets_v1(db: Session = Depends(get_db)) -> dict[str, Any]:
        try:
            _sec_svc.migrate_plaintext_integration_secrets_if_needed(db)
            return _sec_svc.list_secret_states(db)
        except _sec_svc.SecretsManagerError as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=str(exc),
            ) from exc

    @admin_v1.put("/secrets")
    def upsert_secret_v1(
        payload: AdminSecretUpsertPayload,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        normalized_key = payload.key.strip()
        try:
            result = _sec_svc.upsert_secret(
                db,
                key=normalized_key,
                value=payload.value,
                actor=actor,
            )
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        except _sec_svc.SecretsManagerError as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=str(exc),
            ) from exc
        _audit_log(
            db,
            actor=actor,
            action="secret_upserted",
            entity_type="secret",
            entity_id=normalized_key,
        )
        return result

    @admin_v1.delete("/secrets/{key}")
    def delete_secret_v1(
        key: str,
        actor: str = "admin",
        db: Session = Depends(get_db),
    ) -> dict[str, Any]:
        normalized_key = key.strip()
        try:
            result = _sec_svc.delete_secret(
                db,
                key=normalized_key,
                actor=actor,
            )
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        except _sec_svc.SecretsManagerError as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=str(exc),
            ) from exc
        _audit_log(
            db,
            actor=actor,
            action="secret_deleted",
            entity_type="secret",
            entity_id=normalized_key,
        )
        return result

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
        db: Session = Depends(get_db),
    ) -> Response:
        """Run a web search using the specified provider (default: Perplexity)."""
        try:
            provider_configs = _list_integrations_payload(
                db,
                include_runtime_secrets=True,
            ).get("providers", {})
            results = run_web_research(
                query=payload.query,
                limit=payload.limit,
                provider_selector=payload.provider,
                provider_configs=provider_configs,
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
        integrations_payload = _list_integrations_payload(db, include_runtime_secrets=True).get("providers", {})
        ollama_entry = integrations_payload.get("ollama", {}) if isinstance(integrations_payload, dict) else {}
        ollama_config = (
            ollama_entry.get("config")
            if isinstance(ollama_entry, dict) and bool(ollama_entry.get("enabled"))
            else {}
        )
        config = {
            "max_leads": body.max_leads,
            "source": body.source,
            "auto_confirm": body.auto_confirm,
            "ollama_config": ollama_config if isinstance(ollama_config, dict) else {},
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
            _ast_svc.execute_plan(
                db,
                run.id,
                plan,
                auto_confirm=body.auto_confirm,
                runtime_config=config,
            )
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
