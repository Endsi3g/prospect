from __future__ import annotations


def test_settings_defaults_and_persistence(client):
    default_response = client.get("/api/v1/admin/settings", auth=("admin", "secret"))
    assert default_response.status_code == 200
    defaults = default_response.json()
    assert "organization_name" in defaults
    assert "support_email" in defaults
    assert defaults["default_page_size"] >= 5
    assert defaults["theme"] in {"light", "dark", "system"}
    assert defaults["default_refresh_mode"] in {"manual", "polling"}
    assert isinstance(defaults["notifications"], dict)

    update_payload = {
        "organization_name": "Prospect France",
        "locale": "fr-FR",
        "timezone": "Europe/Paris",
        "default_page_size": 50,
        "dashboard_refresh_seconds": 45,
        "support_email": "support@example.com",
        "theme": "dark",
        "default_refresh_mode": "manual",
        "notifications": {"email": False, "in_app": True},
    }
    update_response = client.put(
        "/api/v1/admin/settings",
        auth=("admin", "secret"),
        json=update_payload,
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["organization_name"] == "Prospect France"
    assert updated["default_page_size"] == 50
    assert updated["theme"] == "dark"
    assert updated["default_refresh_mode"] == "manual"
    assert updated["notifications"]["email"] is False

    read_back_response = client.get("/api/v1/admin/settings", auth=("admin", "secret"))
    assert read_back_response.status_code == 200
    read_back = read_back_response.json()
    assert read_back["organization_name"] == "Prospect France"
    assert read_back["support_email"] == "support@example.com"


def test_settings_validation(client):
    invalid_payload = {
        "organization_name": "Prospect",
        "locale": "fr-FR",
        "timezone": "Europe/Paris",
        "default_page_size": 25,
        "dashboard_refresh_seconds": 30,
        "support_email": "invalid-email",
    }
    response = client.put(
        "/api/v1/admin/settings",
        auth=("admin", "secret"),
        json=invalid_payload,
    )
    assert response.status_code == 422

