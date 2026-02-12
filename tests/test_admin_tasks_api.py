from __future__ import annotations


def test_tasks_crud_flow(client):
    create_payload = {
        "title": "Relancer lead inbound",
        "status": "To Do",
        "priority": "Medium",
        "assigned_to": "Vous",
    }
    create_response = client.post(
        "/api/v1/admin/tasks",
        auth=("admin", "secret"),
        json=create_payload,
    )
    assert create_response.status_code == 200
    created = create_response.json()
    assert created["title"] == create_payload["title"]
    assert created["id"]

    update_response = client.patch(
        f"/api/v1/admin/tasks/{created['id']}",
        auth=("admin", "secret"),
        json={"status": "Done", "priority": "High"},
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["status"] == "Done"
    assert updated["priority"] == "High"

    delete_response = client.delete(
        f"/api/v1/admin/tasks/{created['id']}",
        auth=("admin", "secret"),
    )
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted"] is True


def test_tasks_list_supports_filters_pagination_and_sort(client):
    payloads = [
        {"title": "Appel prospect alpha", "status": "To Do", "priority": "Low", "assigned_to": "Alice"},
        {"title": "Relance prospect beta", "status": "Done", "priority": "High", "assigned_to": "Bob"},
        {"title": "Email prospect gamma", "status": "In Progress", "priority": "Medium", "assigned_to": "Alice"},
    ]
    for payload in payloads:
        response = client.post("/api/v1/admin/tasks", auth=("admin", "secret"), json=payload)
        assert response.status_code == 200

    filtered = client.get(
        "/api/v1/admin/tasks?page=1&page_size=10&q=prospect&status=To%20Do&sort=title&order=asc",
        auth=("admin", "secret"),
    )
    assert filtered.status_code == 200
    data = filtered.json()
    assert data["page"] == 1
    assert data["page_size"] == 10
    assert data["total"] >= 1
    assert len(data["items"]) >= 1
    assert all(item["status"] == "To Do" for item in data["items"])

    paged = client.get(
        "/api/v1/admin/tasks?page=1&page_size=2&sort=created_at&order=desc",
        auth=("admin", "secret"),
    )
    assert paged.status_code == 200
    payload = paged.json()
    assert payload["page"] == 1
    assert payload["page_size"] == 2
    assert payload["total"] >= 3
    assert len(payload["items"]) <= 2
