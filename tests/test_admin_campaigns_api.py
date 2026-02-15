from __future__ import annotations

from src.core.db_models import DBLead
from src.core.models import LeadStage, LeadStatus


def _seed_leads(db_session):
    db_session.add_all(
        [
            DBLead(
                id="campaign-alpha@example.com",
                email="campaign-alpha@example.com",
                first_name="Alpha",
                last_name="Lead",
                status=LeadStatus.NEW,
                stage=LeadStage.NEW,
                total_score=61,
                details={"company_name": "Alpha Health", "industry": "Healthcare"},
            ),
            DBLead(
                id="campaign-beta@example.com",
                email="campaign-beta@example.com",
                first_name="Beta",
                last_name="Lead",
                status=LeadStatus.NEW,
                stage=LeadStage.NEW,
                total_score=48,
                details={"company_name": "Beta Dental", "industry": "Dental"},
            ),
        ]
    )
    db_session.commit()


def test_campaign_and_sequence_crud_and_enrollment(client, db_session):
    _seed_leads(db_session)

    sequence_response = client.post(
        "/api/v1/admin/sequences",
        auth=("admin", "secret"),
        json={
            "name": "Q1 Nurture Sequence",
            "description": "Three-step outreach",
            "status": "draft",
            "channels": ["email", "call"],
            "steps": [
                {"channel": "email", "template_key": "step_1", "delay_days": 0},
                {"channel": "call", "template_key": "step_2", "delay_days": 2},
            ],
        },
    )
    assert sequence_response.status_code == 200, sequence_response.text
    sequence = sequence_response.json()
    assert sequence["name"] == "Q1 Nurture Sequence"
    assert len(sequence["steps"]) == 2

    simulate_response = client.post(
        f"/api/v1/admin/sequences/{sequence['id']}/simulate",
        auth=("admin", "secret"),
        json={"lead_context": {"heat_score": 45}},
    )
    assert simulate_response.status_code == 200, simulate_response.text
    simulation = simulate_response.json()
    assert simulation["sequence_id"] == sequence["id"]
    assert len(simulation["timeline"]) == 2

    campaign_response = client.post(
        "/api/v1/admin/campaigns",
        auth=("admin", "secret"),
        json={
            "name": "Q1 Healthcare Campaign",
            "description": "Focus on healthcare clinics",
            "status": "draft",
            "sequence_id": sequence["id"],
            "channel_strategy": {"primary": "email"},
            "enrollment_filter": {"statuses": ["NEW"]},
        },
    )
    assert campaign_response.status_code == 200, campaign_response.text
    campaign = campaign_response.json()
    assert campaign["status"] == "draft"
    assert campaign["sequence_id"] == sequence["id"]

    activate_response = client.post(
        f"/api/v1/admin/campaigns/{campaign['id']}/activate",
        auth=("admin", "secret"),
    )
    assert activate_response.status_code == 200, activate_response.text
    assert activate_response.json()["status"] == "active"

    enroll_response = client.post(
        f"/api/v1/admin/campaigns/{campaign['id']}/enroll",
        auth=("admin", "secret"),
        json={
            "lead_ids": ["campaign-alpha@example.com", "campaign-beta@example.com"],
            "max_leads": 10,
        },
    )
    assert enroll_response.status_code == 200, enroll_response.text
    enroll_payload = enroll_response.json()
    assert enroll_payload["created"] == 2
    assert len(enroll_payload["items"]) == 2

    campaigns_list_response = client.get(
        "/api/v1/admin/campaigns?limit=10&offset=0",
        auth=("admin", "secret"),
    )
    assert campaigns_list_response.status_code == 200
    campaigns_payload = campaigns_list_response.json()
    assert campaigns_payload["total"] >= 1
    assert any(item["id"] == campaign["id"] for item in campaigns_payload["items"])


def test_assistant_nurture_creates_campaign_runs(client, db_session):
    _seed_leads(db_session)

    execute_response = client.post(
        "/api/v1/admin/assistant/prospect/execute",
        auth=("admin", "secret"),
        json={
            "prompt": "Nurture all new leads with follow-up tasks",
            "max_leads": 5,
            "auto_confirm": True,
        },
    )
    assert execute_response.status_code == 200, execute_response.text
    run_payload = execute_response.json()
    actions = run_payload.get("actions", [])
    nurture_actions = [item for item in actions if item.get("action_type") == "nurture"]
    assert nurture_actions, "Expected at least one nurture action in assistant plan."

    nurture_result = nurture_actions[0].get("result", {})
    campaign_id = nurture_result.get("campaign_id")
    assert campaign_id, "Expected campaign_id from nurture result."
    assert int(nurture_result.get("runs_created", 0)) >= 1

    runs_response = client.get(
        f"/api/v1/admin/campaigns/{campaign_id}/runs",
        auth=("admin", "secret"),
    )
    assert runs_response.status_code == 200, runs_response.text
    runs_payload = runs_response.json()
    assert runs_payload["total"] >= 1
    assert any(item.get("status") == "executed" for item in runs_payload["items"])
