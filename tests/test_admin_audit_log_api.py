from __future__ import annotations


def test_audit_log_tracks_mutations(client):
    create_response = client.post(
        "/api/v1/admin/tasks",
        auth=("admin", "secret"),
        json={"title": "Audit task", "status": "To Do", "priority": "Low"},
    )
    assert create_response.status_code == 200

    log_response = client.get(
        "/api/v1/admin/audit-log?limit=20",
        auth=("admin", "secret"),
    )
    assert log_response.status_code == 200
    payload = log_response.json()
    assert "items" in payload
    assert isinstance(payload["items"], list)
    assert any(item["action"] == "task_created" for item in payload["items"])


def test_audit_log_cursor_parameter(client):
    first_response = client.get(
        "/api/v1/admin/audit-log?limit=1",
        auth=("admin", "secret"),
    )
    assert first_response.status_code == 200
    first_payload = first_response.json()
    assert "next_cursor" in first_payload

    if first_payload["next_cursor"]:
        second_response = client.get(
            f"/api/v1/admin/audit-log?limit=1&cursor={first_payload['next_cursor']}",
            auth=("admin", "secret"),
        )
        assert second_response.status_code == 200
