from __future__ import annotations

from datetime import datetime, timedelta

from src.core.db_models import DBCompany, DBLead
from src.core.models import LeadStage, LeadStatus


def _seed_leads(db_session):
    alpha_company = DBCompany(
        name="Alpha Labs",
        domain="alpha.example",
        industry="SaaS",
        location="New York",
        linkedin_url="https://linkedin.com/company/alpha",
    )
    beta_company = DBCompany(
        name="Beta Health",
        domain="beta.example",
        industry="Healthcare",
        location="Miami",
        linkedin_url="",
    )
    db_session.add_all([alpha_company, beta_company])
    db_session.flush()

    now = datetime.now()
    hot_lead = DBLead(
        id="alpha.owner@example.com",
        email="alpha.owner@example.com",
        first_name="Alice",
        last_name="Alpha",
        phone="+1-555-0100",
        linkedin_url="https://linkedin.com/in/alice-alpha",
        company_id=alpha_company.id,
        status=LeadStatus.CONTACTED,
        segment="Enterprise",
        stage=LeadStage.CONTACTED,
        total_score=88,
        tier="Tier A",
        heat_status="Hot",
        tags=["saas", "priority"],
        created_at=now - timedelta(days=1),
        last_scored_at=now - timedelta(hours=2),
    )
    cold_lead = DBLead(
        id="beta.owner@example.com",
        email="beta.owner@example.com",
        first_name="Bob",
        last_name="Beta",
        phone="",
        linkedin_url="",
        company_id=beta_company.id,
        status=LeadStatus.NEW,
        segment="SMB",
        stage=LeadStage.NEW,
        total_score=32,
        tier="Tier C",
        heat_status="Cold",
        tags=["healthcare"],
        created_at=now - timedelta(days=12),
        last_scored_at=now - timedelta(days=8),
    )
    db_session.add_all([hot_lead, cold_lead])
    db_session.commit()


def test_leads_support_advanced_score_and_profile_filters(client, db_session):
    _seed_leads(db_session)
    response = client.get(
        "/api/v1/admin/leads"
        "?page=1&page_size=25"
        "&min_score=80"
        "&tier=Tier%20A"
        "&heat_status=Hot"
        "&company=alpha"
        "&industry=saas"
        "&location=new%20york"
        "&has_phone=true"
        "&has_linkedin=true"
        "&tag=priority",
        auth=("admin", "secret"),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["items"][0]["id"] == "alpha.owner@example.com"


def test_leads_support_advanced_date_and_boolean_filters(client, db_session):
    _seed_leads(db_session)
    created_from = (datetime.now() - timedelta(days=3)).isoformat()
    created_to = datetime.now().isoformat()
    response = client.get(
        "/api/v1/admin/leads"
        f"?page=1&page_size=25&created_from={created_from}&created_to={created_to}&has_phone=false",
        auth=("admin", "secret"),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 0

    response = client.get(
        "/api/v1/admin/leads?page=1&page_size=25&has_phone=false&max_score=40",
        auth=("admin", "secret"),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] >= 1
    ids = {item["id"] for item in payload["items"]}
    assert "beta.owner@example.com" in ids
