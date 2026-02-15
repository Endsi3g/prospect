from __future__ import annotations


def _create_lead(
    client,
    *,
    email: str,
    first_name: str = "Test",
    last_name: str = "Lead",
    company_name: str = "Acme Clinic",
) -> str:
    response = client.post(
        "/api/v1/admin/leads",
        auth=("admin", "secret"),
        json={
            "first_name": first_name,
            "last_name": last_name,
            "email": email,
            "company_name": company_name,
            "status": "NEW",
            "segment": "SMB",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["id"]


def _create_opportunity(
    client,
    *,
    prospect_id: str,
    amount: float,
    stage: str,
    probability: int,
    close_date: str,
    assigned_to: str = "Vous",
) -> dict:
    response = client.post(
        "/api/v1/admin/opportunities",
        auth=("admin", "secret"),
        json={
            "prospect_id": prospect_id,
            "amount": amount,
            "stage": stage,
            "probability": probability,
            "close_date": close_date,
            "assigned_to": assigned_to,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_opportunities_crud_filters_and_summary(client):
    lead_1 = _create_lead(client, email="opp-a@example.com", first_name="Alice", last_name="Martin")
    lead_2 = _create_lead(client, email="opp-b@example.com", first_name="Bob", last_name="Durand")

    opp_1 = _create_opportunity(
        client,
        prospect_id=lead_1,
        amount=1000,
        stage="Prospect",
        probability=50,
        close_date="2026-03-10T12:00:00",
        assigned_to="Alice SDR",
    )
    opp_2 = _create_opportunity(
        client,
        prospect_id=lead_2,
        amount=2000,
        stage="Won",
        probability=100,
        close_date="2026-03-20T12:00:00",
        assigned_to="Nicolas AE",
    )
    opp_3 = _create_opportunity(
        client,
        prospect_id=lead_1,
        amount=1500,
        stage="Lost",
        probability=0,
        close_date="2026-03-22T12:00:00",
        assigned_to="Nicolas AE",
    )
    _create_opportunity(
        client,
        prospect_id=lead_2,
        amount=500,
        stage="Qualified",
        probability=30,
        close_date="2026-03-25T12:00:00",
        assigned_to="Alice SDR",
    )

    list_response = client.get(
        "/api/v1/admin/opportunities?page=1&page_size=25&sort=created_at&order=desc",
        auth=("admin", "secret"),
    )
    assert list_response.status_code == 200, list_response.text
    payload = list_response.json()
    assert payload["page"] == 1
    assert payload["page_size"] == 25
    assert payload["total"] >= 4
    assert len(payload["items"]) >= 4
    assert all("prospect_name" in item for item in payload["items"])
    assert all("assigned_to" in item for item in payload["items"])

    status_filtered = client.get(
        "/api/v1/admin/opportunities?status=Won&page=1&page_size=25",
        auth=("admin", "secret"),
    )
    assert status_filtered.status_code == 200
    won_items = status_filtered.json()["items"]
    assert len(won_items) == 1
    assert won_items[0]["stage"] == "Won"

    amount_filtered = client.get(
        "/api/v1/admin/opportunities?amount_min=1400&amount_max=2100&page=1&page_size=25",
        auth=("admin", "secret"),
    )
    assert amount_filtered.status_code == 200
    amount_items = amount_filtered.json()["items"]
    assert len(amount_items) == 2
    assert all(1400 <= float(item["amount"]) <= 2100 for item in amount_items)

    date_filtered = client.get(
        "/api/v1/admin/opportunities?date_field=close&date_from=2026-03-19&date_to=2026-03-21&page=1&page_size=25",
        auth=("admin", "secret"),
    )
    assert date_filtered.status_code == 200
    date_items = date_filtered.json()["items"]
    assert len(date_items) == 1
    assert date_items[0]["id"] == opp_2["id"]

    patch_response = client.patch(
        f"/api/v1/admin/opportunities/{opp_1['id']}",
        auth=("admin", "secret"),
        json={"stage": "Qualified", "probability": 40, "amount": 1200, "close_date": "2026-03-12T10:30:00"},
    )
    assert patch_response.status_code == 200, patch_response.text
    patched = patch_response.json()
    assert patched["stage"] == "Qualified"
    assert patched["probability"] == 40
    assert float(patched["amount"]) == 1200

    summary_response = client.get(
        "/api/v1/admin/opportunities/summary",
        auth=("admin", "secret"),
    )
    assert summary_response.status_code == 200, summary_response.text
    summary = summary_response.json()
    # Total amount after patch: 1200 + 2000 + 1500 + 500 = 5200
    assert float(summary["pipeline_value_total"]) == 5200
    # Won=1, Lost=1 => win rate = 50%
    assert float(summary["win_rate_percent"]) == 50.0
    # Closed=(Won+Lost)=2 over total=4 => close rate = 50%
    assert float(summary["close_rate_percent"]) == 50.0
    # Avg = 5200 / 4
    assert float(summary["avg_deal_size"]) == 1300.0
    assert len(summary["forecast_monthly"]) >= 1
    march_bucket = next((row for row in summary["forecast_monthly"] if row["month"] == "2026-03"), None)
    assert march_bucket is not None
    assert float(march_bucket["expected_revenue"]) == 5200.0
    assert float(march_bucket["weighted_revenue"]) == 2630.0

    delete_response = client.delete(
        f"/api/v1/admin/opportunities/{opp_3['id']}",
        auth=("admin", "secret"),
    )
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted"] is True


def test_opportunity_validation_errors(client):
    lead_id = _create_lead(client, email="opp-validation@example.com")

    invalid_stage = client.post(
        "/api/v1/admin/opportunities",
        auth=("admin", "secret"),
        json={
            "prospect_id": lead_id,
            "amount": 1000,
            "stage": "invalid-stage",
            "probability": 50,
            "close_date": "2026-04-01T12:00:00",
        },
    )
    assert invalid_stage.status_code == 422

    invalid_list = client.get(
        "/api/v1/admin/opportunities?date_field=invalid",
        auth=("admin", "secret"),
    )
    assert invalid_list.status_code == 422

    invalid_range = client.get(
        "/api/v1/admin/opportunities?amount_min=3000&amount_max=1000",
        auth=("admin", "secret"),
    )
    assert invalid_range.status_code == 422


def test_opportunity_quick_lead_endpoint(client):
    first_create = client.post(
        "/api/v1/admin/opportunities/quick-lead",
        auth=("admin", "secret"),
        json={
            "first_name": "Nora",
            "last_name": "Lopez",
            "email": "opp-quick@example.com",
            "company_name": "Quick Dental",
        },
    )
    assert first_create.status_code == 200, first_create.text
    first_payload = first_create.json()
    assert first_payload["created"] is True
    assert first_payload["lead"]["id"]

    second_create = client.post(
        "/api/v1/admin/opportunities/quick-lead",
        auth=("admin", "secret"),
        json={
            "first_name": "Nora",
            "last_name": "Lopez",
            "email": "opp-quick@example.com",
            "company_name": "Quick Dental",
        },
    )
    assert second_create.status_code == 200, second_create.text
    second_payload = second_create.json()
    assert second_payload["created"] is False
    assert second_payload["lead"]["id"] == first_payload["lead"]["id"]

    opp_create = client.post(
        "/api/v1/admin/opportunities",
        auth=("admin", "secret"),
        json={
            "prospect_id": first_payload["lead"]["id"],
            "amount": 2500,
            "stage": "Proposed",
            "probability": 65,
            "close_date": "2026-05-12T09:00:00",
        },
    )
    assert opp_create.status_code == 200, opp_create.text
    assert opp_create.json()["prospect_id"] == first_payload["lead"]["id"]
