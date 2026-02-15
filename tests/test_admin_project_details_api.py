from __future__ import annotations


def test_project_detail_workspace_and_activity(client):
    create_project_response = client.post(
        "/api/v1/admin/projects",
        auth=("admin", "secret"),
        json={
            "name": "Projet Detail Test",
            "description": "Validation page detail projet",
            "status": "Planning",
            "progress_percent": 18,
            "budget_total": 12000,
            "budget_spent": 2400,
            "team": [
                {"id": "member-1", "name": "Alice", "role": "Owner", "contribution": 60},
            ],
            "timeline": [
                {
                    "id": "milestone-1",
                    "title": "Kickoff",
                    "start_date": "2026-02-01T09:00:00Z",
                    "end_date": "2026-02-02T09:00:00Z",
                    "depends_on": [],
                    "milestone": True,
                }
            ],
            "deliverables": [
                {
                    "id": "deliverable-1",
                    "title": "Deck v1",
                    "owner": "Alice",
                    "due_date": "2026-02-20T09:00:00Z",
                    "completed": False,
                }
            ],
        },
    )
    assert create_project_response.status_code == 200, create_project_response.text
    project = create_project_response.json()
    project_id = project["id"]

    get_project_response = client.get(
        f"/api/v1/admin/projects/{project_id}",
        auth=("admin", "secret"),
    )
    assert get_project_response.status_code == 200, get_project_response.text
    detail = get_project_response.json()
    assert detail["id"] == project_id
    assert detail["budget_total"] == 12000
    assert len(detail["team"]) == 1
    assert len(detail["timeline"]) == 1
    assert len(detail["deliverables"]) == 1

    create_task_response = client.post(
        "/api/v1/admin/tasks",
        auth=("admin", "secret"),
        json={
            "title": "Task liee projet",
            "status": "To Do",
            "priority": "High",
            "project_id": project_id,
            "source": "manual",
        },
    )
    assert create_task_response.status_code == 200, create_task_response.text
    task = create_task_response.json()
    assert task["project_id"] == project_id

    list_tasks_response = client.get(
        f"/api/v1/admin/tasks?page=1&page_size=20&project_id={project_id}",
        auth=("admin", "secret"),
    )
    assert list_tasks_response.status_code == 200, list_tasks_response.text
    tasks_payload = list_tasks_response.json()
    assert tasks_payload["total"] >= 1
    assert any(item["id"] == task["id"] for item in tasks_payload["items"])

    patch_project_response = client.patch(
        f"/api/v1/admin/projects/{project_id}",
        auth=("admin", "secret"),
        json={
            "status": "In Progress",
            "progress_percent": 45,
            "budget_spent": 4100,
            "team": [
                {"id": "member-1", "name": "Alice", "role": "Owner", "contribution": 50},
                {"id": "member-2", "name": "Bob", "role": "Ops", "contribution": 30},
            ],
        },
    )
    assert patch_project_response.status_code == 200, patch_project_response.text
    patched = patch_project_response.json()
    assert patched["status"] == "In Progress"
    assert patched["progress_percent"] == 45
    assert patched["budget_spent"] == 4100
    assert len(patched["team"]) == 2

    project_activity_response = client.get(
        f"/api/v1/admin/projects/{project_id}/activity?limit=30",
        auth=("admin", "secret"),
    )
    assert project_activity_response.status_code == 200, project_activity_response.text
    activity_payload = project_activity_response.json()
    assert activity_payload["project_id"] == project_id
    assert activity_payload["total"] >= 1
    assert len(activity_payload["items"]) >= 1
