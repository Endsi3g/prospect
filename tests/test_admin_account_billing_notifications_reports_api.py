from __future__ import annotations

from datetime import datetime, timedelta

from src.core.db_models import DBNotification, DBReportSchedule


def test_account_get_and_update(client):
    get_response = client.get("/api/v1/admin/account", auth=("admin", "secret"))
    assert get_response.status_code == 200
    payload = get_response.json()
    assert "email" in payload
    assert "preferences" in payload

    update_response = client.put(
        "/api/v1/admin/account",
        auth=("admin", "secret"),
        json={
            "full_name": "Alice Admin",
            "email": "alice.admin@example.com",
            "title": "Revenue Ops Lead",
            "locale": "fr-FR",
            "timezone": "Europe/Paris",
            "preferences": {
                "density": "compact",
                "keyboard_shortcuts": False,
                "start_page": "/reports",
            },
        },
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["full_name"] == "Alice Admin"
    assert updated["email"] == "alice.admin@example.com"
    assert updated["preferences"]["start_page"] == "/reports"


def test_billing_profile_and_invoice_creation(client):
    get_response = client.get("/api/v1/admin/billing", auth=("admin", "secret"))
    assert get_response.status_code == 200
    payload = get_response.json()
    assert "profile" in payload
    assert "invoices" in payload
    assert "summary" in payload

    put_response = client.put(
        "/api/v1/admin/billing",
        auth=("admin", "secret"),
        json={
            "plan_name": "Enterprise",
            "billing_cycle": "quarterly",
            "status": "active",
            "currency": "EUR",
            "amount_cents": 25000,
            "company_name": "Prospect SAS",
            "billing_email": "finance@example.com",
            "vat_number": "FR123456789",
            "address_line": "12 rue de la Paix",
            "city": "Paris",
            "postal_code": "75001",
            "country": "France",
            "notes": "Contrat annuel",
        },
    )
    assert put_response.status_code == 200
    updated = put_response.json()
    assert updated["profile"]["plan_name"] == "Enterprise"
    assert updated["profile"]["amount_cents"] == 25000

    invoice_response = client.post(
        "/api/v1/admin/billing/invoices",
        auth=("admin", "secret"),
        json={
            "invoice_number": "INV-2026-001",
            "amount_cents": 25000,
            "status": "issued",
            "currency": "EUR",
        },
    )
    assert invoice_response.status_code == 200
    invoice = invoice_response.json()
    assert invoice["invoice_number"] == "INV-2026-001"
    assert invoice["amount_cents"] == 25000


def test_notifications_preferences_and_mark_read_flow(client, db_session):
    prefs_response = client.get("/api/v1/admin/notifications/preferences", auth=("admin", "secret"))
    assert prefs_response.status_code == 200
    prefs = prefs_response.json()
    assert "channels" in prefs
    assert "in_app" in prefs["channels"]

    create_response = client.post(
        "/api/v1/admin/notifications",
        auth=("admin", "secret"),
        json={
            "event_key": "report_ready",
            "title": "Rapport pret",
            "message": "Le rapport hebdomadaire est disponible.",
            "channel": "in_app",
            "link_href": "/reports",
        },
    )
    assert create_response.status_code == 200
    created_items = create_response.json()["items"]
    assert len(created_items) == 1
    notification_id = created_items[0]["id"]

    list_response = client.get("/api/v1/admin/notifications?limit=20", auth=("admin", "secret"))
    assert list_response.status_code == 200
    listed = list_response.json()
    assert any(item["id"] == notification_id for item in listed["items"])

    mark_response = client.post(
        "/api/v1/admin/notifications/mark-read",
        auth=("admin", "secret"),
        json={"ids": [notification_id]},
    )
    assert mark_response.status_code == 200
    assert mark_response.json()["updated"] >= 1

    stored = db_session.query(DBNotification).filter(DBNotification.id == notification_id).first()
    assert stored is not None
    assert stored.is_read is True


def test_report_schedules_runs_and_pdf_export(client, db_session):
    create_schedule_response = client.post(
        "/api/v1/admin/reports/schedules",
        auth=("admin", "secret"),
        json={
            "name": "Weekly Ops",
            "frequency": "weekly",
            "timezone": "Europe/Paris",
            "hour_local": 9,
            "minute_local": 0,
            "format": "pdf",
            "recipients": ["ops@example.com"],
            "filters": {"period": "30d"},
            "enabled": True,
        },
    )
    assert create_schedule_response.status_code == 200
    schedule = create_schedule_response.json()
    schedule_id = schedule["id"]

    # Force schedule due for deterministic test.
    row = db_session.query(DBReportSchedule).filter(DBReportSchedule.id == schedule_id).first()
    assert row is not None
    row.next_run_at = datetime.now() - timedelta(minutes=1)
    db_session.commit()

    run_due_response = client.post("/api/v1/admin/reports/schedules/run-due", auth=("admin", "secret"))
    assert run_due_response.status_code == 200
    assert run_due_response.json()["executed"] >= 1

    runs_response = client.get(
        f"/api/v1/admin/reports/schedules/runs?schedule_id={schedule_id}&limit=10",
        auth=("admin", "secret"),
    )
    assert runs_response.status_code == 200
    runs = runs_response.json()["items"]
    assert len(runs) >= 1
    assert runs[0]["status"] in {"success", "failed"}

    pdf_response = client.get(
        "/api/v1/admin/reports/export/pdf?period=30d&dashboard=operations",
        auth=("admin", "secret"),
    )
    assert pdf_response.status_code == 200
    assert "application/pdf" in pdf_response.headers["content-type"]
    assert pdf_response.content.startswith(b"%PDF-")
