from __future__ import annotations


def test_projects_crud_flow(client):
    create_payload = {
        "name": "Refonte CRM",
        "description": "Migration et clean-up",
        "status": "Planning",
        "due_date": "2026-03-01T10:00:00",
    }
    create_response = client.post(
        "/api/v1/admin/projects",
        auth=("admin", "secret"),
        json=create_payload,
    )
    assert create_response.status_code == 200
    created = create_response.json()
    assert created["name"] == "Refonte CRM"
    assert created["status"] == "Planning"
    assert created["id"]

    list_response = client.get("/api/v1/admin/projects", auth=("admin", "secret"))
    assert list_response.status_code == 200
    data = list_response.json()
    assert "items" in data
    assert "total" in data
    project_ids = [item["id"] for item in data["items"]]
    assert created["id"] in project_ids

    update_response = client.patch(
        f"/api/v1/admin/projects/{created['id']}",
        auth=("admin", "secret"),
        json={"status": "Completed"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["status"] == "Completed"

    delete_response = client.delete(
        f"/api/v1/admin/projects/{created['id']}",
        auth=("admin", "secret"),
    )
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted"] is True

