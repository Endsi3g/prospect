"""Pydantic models for the Assistant Prospect subsystem."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


# ── Request models ──────────────────────────────────────────────

class AssistantRunRequest(BaseModel):
    """Payload to start a new AI prospect run."""

    prompt: str = Field(min_length=1, description="Natural-language instruction for the AI")
    max_leads: int = Field(default=20, ge=1, le=200)
    source: str = Field(default="apify", description="Lead source: apify | manual")
    auto_confirm: bool = Field(
        default=True,
        description="Auto-execute safe actions (create/update). Dangerous ones always require confirm.",
    )


class AssistantConfirmRequest(BaseModel):
    """Approve or reject pending actions."""

    action_ids: list[str] = Field(min_length=1)
    approve: bool = True


# ── Internal plan models (returned by Khoj / mock) ─────────────

class AssistantActionSpec(BaseModel):
    """Single step inside an AI-generated plan."""

    action_type: str  # source_leads | nurture | rescore | create_lead | create_task | delete_lead | …
    entity_type: str | None = None  # lead | task | project
    payload: dict[str, Any] = Field(default_factory=dict)
    requires_confirm: bool = False


class AssistantPlan(BaseModel):
    """Structured action plan returned by the LLM."""

    actions: list[AssistantActionSpec] = Field(default_factory=list)
    summary: str = ""


# ── Response models ─────────────────────────────────────────────

class AssistantActionResponse(BaseModel):
    id: str
    action_type: str
    entity_type: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    requires_confirm: bool = False
    status: str = "pending"
    result: dict[str, Any] = Field(default_factory=dict)
    created_at: str | None = None
    executed_at: str | None = None


class AssistantRunResponse(BaseModel):
    id: str
    prompt: str
    status: str
    actor: str
    summary: str | None = None
    config: dict[str, Any] = Field(default_factory=dict)
    created_at: str | None = None
    finished_at: str | None = None
    actions: list[AssistantActionResponse] = Field(default_factory=list)


class AssistantRunListItem(BaseModel):
    id: str
    prompt: str
    status: str
    actor: str
    summary: str | None = None
    action_count: int = 0
    created_at: str | None = None
    finished_at: str | None = None
