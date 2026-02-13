from __future__ import annotations


def test_metrics_endpoint_reports_request_stats(client):
    stats_response = client.get("/api/v1/admin/stats", auth=("admin", "secret"))
    assert stats_response.status_code == 200

    metrics_response = client.get("/api/v1/admin/metrics", auth=("admin", "secret"))
    assert metrics_response.status_code == 200
    payload = metrics_response.json()

    assert payload["request_count"] >= 1
    assert "error_rate" in payload
    assert "p95_ms" in payload
    assert isinstance(payload.get("endpoints"), list)
