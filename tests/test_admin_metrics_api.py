from __future__ import annotations

from datetime import datetime, timedelta

from src.core.db_models import DBProject, DBTask


def test_metrics_endpoint_reports_request_stats(client):
    stats_response = client.get("/api/v1/admin/stats", auth=("admin", "secret"))
    assert stats_response.status_code == 200

    metrics_response = client.get("/api/v1/admin/metrics", auth=("admin", "secret"))
    assert metrics_response.status_code == 200
    payload = metrics_response.json()

    assert payload["request_count"] >= 1
    assert "error_rate" in payload
    assert "p95_ms" in payload
    assert isinstance(payload.get("endpoints"), list)


def test_metrics_overview_endpoint_returns_aggregated_sections(client):
    client.get("/api/v1/admin/stats", auth=("admin", "secret"))

    response = client.get("/api/v1/admin/metrics/overview", auth=("admin", "secret"))
    assert response.status_code == 200
    payload = response.json()

    assert "generated_at" in payload
    assert "request" in payload
    assert "funnel" in payload
    assert "analytics" in payload
    assert "report_30d" in payload
    assert "sync" in payload
    assert "integrity" in payload
    assert payload["request"]["request_count"] >= 1


def test_sync_health_and_data_integrity_endpoints_detect_orphans(client, db_session):
    now = datetime.now()
    orphan_task = DBTask(
        id="task-orphan-1",
        title="Task with missing lead",
        lead_id="lead-missing",
        assigned_to="",
        created_at=now - timedelta(days=1),
    )
    orphan_project = DBProject(
        id="project-orphan-1",
        name="Project with missing lead",
        lead_id="lead-missing",
        updated_at=now - timedelta(days=1),
        created_at=now - timedelta(days=2),
    )
    db_session.add_all([orphan_task, orphan_project])
    db_session.commit()

    sync_response = client.get("/api/v1/admin/sync/health", auth=("admin", "secret"))
    assert sync_response.status_code == 200
    sync_payload = sync_response.json()
    assert "status" in sync_payload
    assert "last_sync_at" in sync_payload
    assert isinstance(sync_payload.get("sources"), list)
    assert any(item["entity"] == "tasks" for item in sync_payload["sources"])

    integrity_response = client.get("/api/v1/admin/data/integrity", auth=("admin", "secret"))
    assert integrity_response.status_code == 200
    integrity_payload = integrity_response.json()
    assert integrity_payload["checks"]["orphan_tasks"] >= 1
    assert integrity_payload["checks"]["orphan_projects"] >= 1
    assert integrity_payload["checks"]["tasks_without_assignee"] >= 1
    issue_codes = {item["code"] for item in integrity_payload["issues"]}
    assert "orphan_tasks" in issue_codes
    assert "orphan_projects" in issue_codes
