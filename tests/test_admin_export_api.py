from __future__ import annotations

from datetime import datetime

from src.core.db_models import DBCompany, DBLead, DBProject, DBTask
from src.core.models import LeadStage, LeadStatus


def _seed_export_data(db_session):
    company = DBCompany(name="Export Corp", domain="exportcorp.com")
    db_session.add(company)
    db_session.flush()

    db_session.add(
        DBLead(
            id="export.lead@example.com",
            email="export.lead@example.com",
            first_name="Export",
            last_name="Lead",
            company_id=company.id,
            status=LeadStatus.NEW,
            stage=LeadStage.NEW,
            total_score=72,
            created_at=datetime.now(),
        )
    )
    db_session.add(
        DBTask(
            id="task-export",
            title="Exporter les donnees",
            status="To Do",
            priority="Medium",
            assigned_to="Vous",
            created_at=datetime.now(),
        )
    )
    db_session.add(
        DBProject(
            id="project-export",
            name="Projet Export",
            status="Planning",
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
    )
    db_session.commit()


def test_export_csv_leads(client, db_session):
    _seed_export_data(db_session)
    response = client.get(
        "/api/v1/admin/export/csv?entity=leads",
        auth=("admin", "secret"),
    )
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    assert "attachment; filename=\"leads.csv\"" in response.headers["content-disposition"]
    assert "export.lead@example.com" in response.text


def test_export_csv_projects_with_custom_fields(client, db_session):
    _seed_export_data(db_session)
    response = client.get(
        "/api/v1/admin/export/csv?entity=projects&fields=id,name,status",
        auth=("admin", "secret"),
    )
    assert response.status_code == 200
    lines = response.text.strip().splitlines()
    assert lines[0] == "id,name,status"
    assert any("project-export,Projet Export,Planning" in line for line in lines[1:])
