from __future__ import annotations

import importlib


def test_web_research_endpoint_returns_normalized_payload(client, monkeypatch):
    def fake_run_web_research(**kwargs):
        assert kwargs["query"] == "best free lead tools"
        assert kwargs["provider_selector"] == "duckduckgo"
        assert kwargs["limit"] == 5
        return {
            "query": kwargs["query"],
            "provider_selector": kwargs["provider_selector"],
            "providers_requested": ["duckduckgo"],
            "providers_used": ["duckduckgo"],
            "total": 1,
            "items": [
                {
                    "provider": "duckduckgo",
                    "source": "duckduckgo",
                    "title": "Free lead generation tools",
                    "url": "https://example.com/free-tools",
                    "snippet": "Collection of free tools",
                    "published_at": None,
                }
            ],
            "warnings": [],
        }

    app_module = importlib.import_module("src.admin.app")
    monkeypatch.setattr(app_module, "run_web_research", fake_run_web_research)
    response = client.get(
        "/api/v1/admin/research/web?q=best%20free%20lead%20tools&provider=duckduckgo&limit=5",
        auth=("admin", "secret"),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["items"][0]["provider"] == "duckduckgo"


def test_web_research_endpoint_passes_integration_provider_config(client, monkeypatch):
    captured = {}

    def fake_run_web_research(**kwargs):
        captured["providers"] = kwargs["provider_configs"]
        return {
            "query": kwargs["query"],
            "provider_selector": kwargs["provider_selector"],
            "providers_requested": ["duckduckgo"],
            "providers_used": [],
            "total": 0,
            "items": [],
            "warnings": ["no results"],
        }

    app_module = importlib.import_module("src.admin.app")
    monkeypatch.setattr(app_module, "run_web_research", fake_run_web_research)
    response = client.get(
        "/api/v1/admin/research/web?q=firecrawl&provider=auto&limit=3",
        auth=("admin", "secret"),
    )
    assert response.status_code == 200
    providers = captured["providers"]
    assert "duckduckgo" in providers
    assert "perplexity" in providers
    assert "firecrawl" in providers
