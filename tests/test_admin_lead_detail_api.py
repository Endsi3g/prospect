from __future__ import annotations

from datetime import datetime

from src.core.db_models import DBInteraction
from src.core.models import InteractionType


def _create_lead(client, email: str = "lead-detail@example.com") -> str:
    response = client.post(
        "/api/v1/admin/leads",
        auth=("admin", "secret"),
        json={
            "first_name": "Lead",
            "last_name": "Detail",
            "email": email,
            "company_name": "Acme Clinic",
            "status": "NEW",
            "segment": "SMB",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["id"]


def test_lead_detail_update_notes_opportunities_and_history(client, db_session):
    lead_id = _create_lead(client)

    update_response = client.patch(
        f"/api/v1/admin/leads/{lead_id}",
        auth=("admin", "secret"),
        json={
            "first_name": "Lea",
            "last_name": "Martin",
            "phone": "+33 6 00 00 00 00",
            "status": "CONTACTED",
            "company_name": "Acme Dental",
            "company_location": "Paris",
            "tags": ["priority", "france"],
        },
    )
    assert update_response.status_code == 200, update_response.text
    updated = update_response.json()
    assert updated["first_name"] == "Lea"
    assert updated["status"] == "CONTACTED"
    assert updated["company"]["name"] == "Acme Dental"

    notes_response = client.put(
        f"/api/v1/admin/leads/{lead_id}/notes",
        auth=("admin", "secret"),
        json={
            "items": [
                {
                    "id": "note-1",
                    "content": "Premier echange qualifie.",
                    "author": "admin",
                }
            ]
        },
    )
    assert notes_response.status_code == 200, notes_response.text
    assert len(notes_response.json()["items"]) == 1

    list_notes_response = client.get(
        f"/api/v1/admin/leads/{lead_id}/notes",
        auth=("admin", "secret"),
    )
    assert list_notes_response.status_code == 200
    assert list_notes_response.json()["items"][0]["content"] == "Premier echange qualifie."

    opp_create_response = client.post(
        f"/api/v1/admin/leads/{lead_id}/opportunities",
        auth=("admin", "secret"),
        json={
            "name": "Pack annuel",
            "stage": "proposal",
            "amount": 4500,
            "probability": 55,
        },
    )
    assert opp_create_response.status_code == 200, opp_create_response.text
    opportunity_id = opp_create_response.json()["id"]

    opp_update_response = client.patch(
        f"/api/v1/admin/leads/{lead_id}/opportunities/{opportunity_id}",
        auth=("admin", "secret"),
        json={"status": "won", "stage": "won", "probability": 100},
    )
    assert opp_update_response.status_code == 200, opp_update_response.text
    assert opp_update_response.json()["status"] == "won"

    list_opp_response = client.get(
        f"/api/v1/admin/leads/{lead_id}/opportunities",
        auth=("admin", "secret"),
    )
    assert list_opp_response.status_code == 200
    assert len(list_opp_response.json()) == 1

    db_session.add(
        DBInteraction(
            lead_id=lead_id,
            type=InteractionType.EMAIL_SENT,
            timestamp=datetime.now(),
            details={"subject": "Intro email"},
        )
    )
    db_session.commit()

    interactions_response = client.get(
        f"/api/v1/admin/leads/{lead_id}/interactions",
        auth=("admin", "secret"),
    )
    assert interactions_response.status_code == 200
    assert len(interactions_response.json()) >= 1
    assert interactions_response.json()[0]["type"] == "EMAIL_SENT"

    history_response = client.get(
        f"/api/v1/admin/leads/{lead_id}/history?window=30d",
        auth=("admin", "secret"),
    )
    assert history_response.status_code == 200
    event_types = {item["event_type"] for item in history_response.json()["items"]}
    assert "lead_updated" in event_types
    assert "lead_notes_updated" in event_types
    assert "lead_opportunity_created" in event_types
    assert "lead_opportunity_updated" in event_types


def test_lead_add_to_campaign_quick_action_endpoint(client):
    lead_id = _create_lead(client, email="lead-campaign-link@example.com")

    sequence_response = client.post(
        "/api/v1/admin/sequences",
        auth=("admin", "secret"),
        json={
            "name": "Quick Sequence",
            "description": "Basic two steps",
            "status": "draft",
            "channels": ["email"],
            "steps": [{"channel": "email", "template_key": "s1", "delay_days": 0}],
        },
    )
    assert sequence_response.status_code == 200, sequence_response.text
    sequence_id = sequence_response.json()["id"]

    campaign_response = client.post(
        "/api/v1/admin/campaigns",
        auth=("admin", "secret"),
        json={
            "name": "Quick Campaign",
            "description": "For lead detail quick action",
            "status": "active",
            "sequence_id": sequence_id,
            "channel_strategy": {"primary": "email"},
            "enrollment_filter": {},
        },
    )
    assert campaign_response.status_code == 200, campaign_response.text
    campaign_id = campaign_response.json()["id"]

    link_response = client.post(
        f"/api/v1/admin/leads/{lead_id}/add-to-campaign",
        auth=("admin", "secret"),
        json={"campaign_id": campaign_id},
    )
    assert link_response.status_code == 200, link_response.text
    payload = link_response.json()
    assert int(payload.get("created", 0)) == 1
