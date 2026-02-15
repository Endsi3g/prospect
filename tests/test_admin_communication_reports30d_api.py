from __future__ import annotations

from datetime import datetime, timedelta

from src.core.db_models import DBLead


def test_lead_communication_plan_auto_create_and_history(client, db_session):
    lead_email = "tier.a@example.com"
    create_response = client.post(
        "/api/v1/admin/leads",
        auth=("admin", "secret"),
        json={
            "first_name": "Alice",
            "last_name": "TierA",
            "email": lead_email,
            "company_name": "ACME",
            "status": "NEW",
            "segment": "B2B",
        },
    )
    assert create_response.status_code == 200
    lead_id = create_response.json()["id"]

    row = db_session.query(DBLead).filter(DBLead.id == lead_id).first()
    assert row is not None
    row.total_score = 91
    row.icp_score = 92
    row.heat_score = 88
    row.tier = "Tier A"
    row.heat_status = "Hot"
    row.next_best_action = "Prioriser un appel qualif"
    row.last_scored_at = datetime.now() - timedelta(minutes=20)
    db_session.commit()

    plan_response = client.get(
        f"/api/v1/admin/leads/{lead_id}/communication-plan",
        auth=("admin", "secret"),
    )
    assert plan_response.status_code == 200
    plan = plan_response.json()
    assert plan["rule"]["id"]
    assert len(plan["recommended_sequence"]) >= 1

    dry_run_response = client.post(
        f"/api/v1/admin/leads/{lead_id}/tasks/auto-create",
        auth=("admin", "secret"),
        json={
            "channels": ["email", "call"],
            "mode": "append",
            "dry_run": True,
        },
    )
    assert dry_run_response.status_code == 200
    assert dry_run_response.json()["created_count"] >= 1

    create_tasks_response = client.post(
        f"/api/v1/admin/leads/{lead_id}/tasks/auto-create",
        auth=("admin", "secret"),
        json={
            "channels": ["email", "linkedin", "call"],
            "mode": "append",
            "dry_run": False,
        },
    )
    assert create_tasks_response.status_code == 200
    created_payload = create_tasks_response.json()
    assert created_payload["created_count"] >= 1

    tasks_response = client.get(
        f"/api/v1/admin/leads/{lead_id}/tasks",
        auth=("admin", "secret"),
    )
    assert tasks_response.status_code == 200
    tasks = tasks_response.json()
    assert len(tasks) >= created_payload["created_count"]
    assert all(task["source"] in {"manual", "auto-rule", "assistant"} for task in tasks)

    history_response = client.get(
        f"/api/v1/admin/leads/{lead_id}/history?window=30d",
        auth=("admin", "secret"),
    )
    assert history_response.status_code == 200
    history = history_response.json()
    event_types = {item["event_type"] for item in history["items"]}
    assert "lead_scored" in event_types
    assert "task_created" in event_types


def test_reports_30d_payload_shape(client):
    response = client.get("/api/v1/admin/reports/30d?window=30d", auth=("admin", "secret"))
    assert response.status_code == 200
    payload = response.json()
    assert "window" in payload
    assert payload["window"]["label"] == "30d"
    assert "kpis" in payload
    assert "daily_trend" in payload
    assert len(payload["daily_trend"]) == 30
    assert "timeline_items" in payload
    assert "channel_breakdown" in payload
    assert "quality_flags" in payload
