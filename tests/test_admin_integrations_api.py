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
    assert providers["slack"]["config"]["webhook"] == "********"

    get_response = client.get("/api/v1/admin/integrations", auth=("admin", "secret"))
    assert get_response.status_code == 200
    assert "slack" in get_response.json()["providers"]
    assert get_response.json()["providers"]["slack"]["config"]["webhook"] == "********"


def test_integrations_include_research_providers_with_free_tier_metadata(client):
    response = client.get("/api/v1/admin/integrations", auth=("admin", "secret"))
    assert response.status_code == 200
    providers = response.json()["providers"]
    assert "duckduckgo" in providers
    assert "perplexity" in providers
    assert "firecrawl" in providers
    assert "ollama" in providers
    assert providers["duckduckgo"]["enabled"] is True
    assert "free_tier" in providers["perplexity"]["meta"]
    assert providers["ollama"]["enabled"] is False
    assert providers["ollama"]["config"]["model_research"] == "llama3.1:8b-instruct"
    assert providers["ollama"]["meta"]["category"] == "ai"


def test_integrations_can_persist_perplexity_firecrawl_and_ollama_config(client):
    payload = {
        "providers": {
            "perplexity": {"enabled": True, "config": {"model": "sonar", "max_tokens": 500}},
            "firecrawl": {"enabled": True, "config": {"country": "us", "lang": "en"}},
            "ollama": {
                "enabled": True,
                "config": {
                    "api_base_url": "https://ollama.example.internal",
                    "api_key": "ollama-test-secret",
                    "api_key_env": "OLLAMA_API_KEY",
                    "model_research": "llama3.1:8b-instruct",
                    "model_content": "mistral:7b-instruct",
                    "model_assistant": "qwen2.5:7b-instruct",
                    "temperature": 0.3,
                    "max_tokens": 900,
                    "timeout_seconds": 35,
                },
            },
        }
    }
    put_response = client.put(
        "/api/v1/admin/integrations",
        auth=("admin", "secret"),
        json=payload,
    )
    assert put_response.status_code == 200
    providers = put_response.json()["providers"]
    assert providers["perplexity"]["enabled"] is True
    assert providers["perplexity"]["config"]["model"] == "sonar"
    assert providers["firecrawl"]["enabled"] is True
    assert providers["firecrawl"]["config"]["country"] == "us"
    assert providers["ollama"]["enabled"] is True
    assert providers["ollama"]["config"]["api_base_url"] == "https://ollama.example.internal"
    assert providers["ollama"]["config"]["api_key"] == "********"
    assert providers["ollama"]["config"]["model_content"] == "mistral:7b-instruct"

    secrets_response = client.get("/api/v1/admin/secrets", auth=("admin", "secret"))
    assert secrets_response.status_code == 200
    secret_items = {item["key"]: item for item in secrets_response.json()["items"]}
    assert secret_items["OLLAMA_API_KEY"]["configured"] is True
    assert secret_items["OLLAMA_API_KEY"]["source"] == "db"


def test_web_research_receives_runtime_secret_values(client, monkeypatch):
    from src.admin import app as app_module

    captured: dict[str, object] = {}

    def fake_run_web_research(*, query, limit, provider_selector, provider_configs):
        captured["query"] = query
        captured["limit"] = limit
        captured["provider_selector"] = provider_selector
        captured["provider_configs"] = provider_configs
        return {
            "query": query,
            "provider_selector": provider_selector,
            "providers_requested": [provider_selector],
            "providers_used": [provider_selector],
            "total": 0,
            "items": [],
            "warnings": [],
        }

    monkeypatch.setattr(app_module, "run_web_research", fake_run_web_research)

    put_secret = client.put(
        "/api/v1/admin/secrets",
        auth=("admin", "secret"),
        json={"key": "PERPLEXITY_API_KEY", "value": "pplx-runtime-secret"},
    )
    assert put_secret.status_code == 200

    response = client.get(
        "/api/v1/admin/research/web?q=test&provider=perplexity&limit=3",
        auth=("admin", "secret"),
    )
    assert response.status_code == 200

    provider_configs = captured["provider_configs"]
    assert isinstance(provider_configs, dict)
    perplexity_config = provider_configs["perplexity"]["config"]
    assert perplexity_config["api_key"] == "pplx-runtime-secret"

    integrations_response = client.get("/api/v1/admin/integrations", auth=("admin", "secret"))
    assert integrations_response.status_code == 200
    masked_config = integrations_response.json()["providers"]["perplexity"]["config"]
    assert masked_config["api_key"] == "********"


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
