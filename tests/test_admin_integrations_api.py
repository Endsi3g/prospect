from __future__ import annotations


def test_integrations_put_and_get(client):
    put_payload = {
        "providers": {
            "slack": {"enabled": True, "config": {"webhook": "https://hooks.slack.test/abc"}},
            "zapier": {"enabled": False, "config": {"zap_id": "zap-1"}},
        }
    }
    put_response = client.put(
        "/api/v1/admin/integrations",
        auth=("admin", "secret"),
        json=put_payload,
    )
    assert put_response.status_code == 200
    providers = put_response.json()["providers"]
    assert providers["slack"]["enabled"] is True
    assert providers["zapier"]["enabled"] is False

    get_response = client.get("/api/v1/admin/integrations", auth=("admin", "secret"))
    assert get_response.status_code == 200
    assert "slack" in get_response.json()["providers"]


def test_webhooks_crud(client):
    create_response = client.post(
        "/api/v1/admin/webhooks",
        auth=("admin", "secret"),
        json={
            "name": "Lead created hook",
            "url": "https://example.com/webhook",
            "events": ["lead.created", "lead.updated"],
            "enabled": True,
        },
    )
    assert create_response.status_code == 200
    created = create_response.json()
    assert created["name"] == "Lead created hook"

    list_response = client.get("/api/v1/admin/webhooks", auth=("admin", "secret"))
    assert list_response.status_code == 200
    assert any(item["id"] == created["id"] for item in list_response.json()["items"])

    delete_response = client.delete(
        f"/api/v1/admin/webhooks/{created['id']}",
        auth=("admin", "secret"),
    )
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted"] is True


def test_webhook_rejects_invalid_url(client):
    response = client.post(
        "/api/v1/admin/webhooks",
        auth=("admin", "secret"),
        json={
            "name": "Invalid hook",
            "url": "ftp://example.com/hook",
            "events": ["lead.created"],
            "enabled": True,
        },
    )
    assert response.status_code == 422
