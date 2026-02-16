from __future__ import annotations


def _items_by_key(payload: dict) -> dict[str, dict]:
    return {str(item.get("key")): item for item in payload.get("items", [])}


def test_secrets_schema_and_crud(client):
    schema_response = client.get("/api/v1/admin/secrets/schema", auth=("admin", "secret"))
    assert schema_response.status_code == 200
    schema = schema_response.json()
    assert schema.get("version") == "v1"

    keys = {
        key_entry["key"]
        for category in schema.get("categories", [])
        for key_entry in category.get("keys", [])
    }
    assert "OPENAI_API_KEY" in keys
    assert "OLLAMA_API_KEY" in keys

    list_before = client.get("/api/v1/admin/secrets", auth=("admin", "secret"))
    assert list_before.status_code == 200
    before_items = _items_by_key(list_before.json())
    assert "OPENAI_API_KEY" in before_items

    put_response = client.put(
        "/api/v1/admin/secrets",
        auth=("admin", "secret"),
        json={"key": "OPENAI_API_KEY", "value": "sk-test-123"},
    )
    assert put_response.status_code == 200
    assert put_response.json()["masked_value"] == "********"

    list_after_put = client.get("/api/v1/admin/secrets", auth=("admin", "secret"))
    assert list_after_put.status_code == 200
    after_put_items = _items_by_key(list_after_put.json())
    assert after_put_items["OPENAI_API_KEY"]["configured"] is True
    assert after_put_items["OPENAI_API_KEY"]["source"] == "db"

    delete_response = client.delete(
        "/api/v1/admin/secrets/OPENAI_API_KEY",
        auth=("admin", "secret"),
    )
    assert delete_response.status_code == 200
    assert delete_response.json()["key"] == "OPENAI_API_KEY"

    list_after_delete = client.get("/api/v1/admin/secrets", auth=("admin", "secret"))
    assert list_after_delete.status_code == 200
    after_delete_items = _items_by_key(list_after_delete.json())
    assert after_delete_items["OPENAI_API_KEY"]["source"] in {"none", "env"}


def test_secrets_reject_unknown_key(client):
    response = client.put(
        "/api/v1/admin/secrets",
        auth=("admin", "secret"),
        json={"key": "UNKNOWN_SECRET_KEY", "value": "foo"},
    )
    assert response.status_code == 400


def test_secrets_require_app_encryption_key(client, monkeypatch):
    monkeypatch.delenv("APP_ENCRYPTION_KEY", raising=False)
    response = client.put(
        "/api/v1/admin/secrets",
        auth=("admin", "secret"),
        json={"key": "OPENAI_API_KEY", "value": "sk-no-key"},
    )
    assert response.status_code == 500
    assert "APP_ENCRYPTION_KEY" in response.json()["detail"]
