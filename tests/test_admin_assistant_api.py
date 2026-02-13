"""Tests for the Assistant Prospect (IA) API endpoints.

Run with:
    pytest tests/test_admin_assistant_api.py -v
"""
from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from src.admin.app import create_app
from src.core.database import SessionLocal


@pytest.fixture(scope="module")
def client():
    app = create_app()
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def auth():
    import os
    username = os.getenv("ADMIN_USERNAME", "admin")
    password = os.getenv("ADMIN_PASSWORD", "change-me")
    return (username, password)


# ---------------------------------------------------------------
# POST /api/v1/admin/assistant/prospect/execute
# ---------------------------------------------------------------
class TestAssistantExecute:
    """Test the execute endpoint (uses mock when Khoj is unavailable)."""

    def test_execute_returns_run_with_actions(self, client: TestClient, auth: tuple[str, str]):
        resp = client.post(
            "/api/v1/admin/assistant/prospect/execute",
            json={
                "prompt": "Trouve 5 leads dentistes à Lyon",
                "max_leads": 5,
                "source": "apify",
                "auto_confirm": True,
            },
            auth=auth,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert data["prompt"] == "Trouve 5 leads dentistes à Lyon"
        assert data["status"] in {"pending", "running", "completed", "completed_with_errors", "failed"}
        assert isinstance(data.get("actions"), list)

    def test_execute_without_prompt_returns_422(self, client: TestClient, auth: tuple[str, str]):
        resp = client.post(
            "/api/v1/admin/assistant/prospect/execute",
            json={"prompt": "", "max_leads": 5},
            auth=auth,
        )
        assert resp.status_code == 422

    def test_execute_requires_auth(self, client: TestClient):
        resp = client.post(
            "/api/v1/admin/assistant/prospect/execute",
            json={"prompt": "test"},
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------
# GET /api/v1/admin/assistant/prospect/runs
# ---------------------------------------------------------------
class TestAssistantListRuns:
    """Test list runs endpoint."""

    def test_list_runs(self, client: TestClient, auth: tuple[str, str]):
        resp = client.get("/api/v1/admin/assistant/prospect/runs", auth=auth)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert isinstance(data["items"], list)

    def test_list_runs_with_limit(self, client: TestClient, auth: tuple[str, str]):
        resp = client.get("/api/v1/admin/assistant/prospect/runs?limit=5&offset=0", auth=auth)
        assert resp.status_code == 200
        data = resp.json()
        assert data["limit"] == 5
        assert data["offset"] == 0


# ---------------------------------------------------------------
# GET /api/v1/admin/assistant/prospect/runs/{run_id}
# ---------------------------------------------------------------
class TestAssistantGetRun:
    """Test get single run endpoint."""

    def test_get_run_not_found(self, client: TestClient, auth: tuple[str, str]):
        resp = client.get("/api/v1/admin/assistant/prospect/runs/nonexistent", auth=auth)
        assert resp.status_code == 404

    def test_get_existing_run(self, client: TestClient, auth: tuple[str, str]):
        # Create a run first
        create_resp = client.post(
            "/api/v1/admin/assistant/prospect/execute",
            json={"prompt": "Test run for detail", "max_leads": 5},
            auth=auth,
        )
        run_id = create_resp.json()["id"]

        resp = client.get(f"/api/v1/admin/assistant/prospect/runs/{run_id}", auth=auth)
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == run_id
        assert "actions" in data


# ---------------------------------------------------------------
# POST /api/v1/admin/assistant/prospect/confirm
# ---------------------------------------------------------------
class TestAssistantConfirm:
    """Test confirm/reject endpoint."""

    def test_confirm_unknown_action_graceful(self, client: TestClient, auth: tuple[str, str]):
        resp = client.post(
            "/api/v1/admin/assistant/prospect/confirm",
            json={"action_ids": ["nonexistent_id"], "approve": True},
            auth=auth,
        )
        # Should succeed, but with no effect
        assert resp.status_code == 200

    def test_reject_actions(self, client: TestClient, auth: tuple[str, str]):
        resp = client.post(
            "/api/v1/admin/assistant/prospect/confirm",
            json={"action_ids": ["nonexistent_id"], "approve": False},
            auth=auth,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("rejected") is True
