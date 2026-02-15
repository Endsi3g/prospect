from __future__ import annotations


def test_error_contract_for_validation_errors(client):
    response = client.post(
        "/api/v1/admin/tasks",
        auth=("admin", "secret"),
        json={"status": "To Do"},
        headers={"x-request-id": "req-validation-001"},
    )
    assert response.status_code == 422
    payload = response.json()
    assert "error" in payload
    assert payload["error"]["code"] == "VALIDATION_ERROR"
    assert payload["error"]["retryable"] is False
    assert payload["error"]["request_id"] == "req-validation-001"
    assert response.headers.get("x-request-id") == "req-validation-001"


def test_error_contract_for_not_found_route(client):
    response = client.get(
        "/api/v1/admin/unknown-endpoint",
        auth=("admin", "secret"),
        headers={"x-request-id": "req-notfound-001"},
    )
    assert response.status_code == 404
    payload = response.json()
    assert payload["error"]["code"] == "NOT_FOUND"
    assert payload["error"]["request_id"] == "req-notfound-001"
    assert isinstance(payload["error"]["message"], str)
    assert response.headers.get("x-request-id") == "req-notfound-001"


def test_error_contract_for_auth_failures(client):
    response = client.get(
        "/api/v1/admin/stats",
        auth=("admin", "wrong-password"),
        headers={"x-request-id": "req-auth-001"},
    )
    assert response.status_code == 401
    payload = response.json()
    assert payload["error"]["code"] == "UNAUTHORIZED"
    assert payload["error"]["request_id"] == "req-auth-001"
