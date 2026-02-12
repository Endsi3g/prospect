from __future__ import annotations


def test_roles_seeded(client):
    response = client.get("/api/v1/admin/roles", auth=("admin", "secret"))
    assert response.status_code == 200
    payload = response.json()
    keys = {item["key"] for item in payload["items"]}
    assert {"admin", "manager", "sales"}.issubset(keys)


def test_invite_and_update_user_flow(client):
    invite_payload = {
        "email": "manager@example.com",
        "display_name": "Manager One",
        "roles": ["manager"],
    }
    invite_response = client.post(
        "/api/v1/admin/users/invite",
        auth=("admin", "secret"),
        json=invite_payload,
    )
    assert invite_response.status_code == 200
    invited = invite_response.json()
    assert invited["email"] == "manager@example.com"
    assert invited["status"] == "invited"
    assert invited["roles"] == ["manager"]

    update_response = client.patch(
        f"/api/v1/admin/users/{invited['id']}",
        auth=("admin", "secret"),
        json={"status": "active", "roles": ["admin", "sales"]},
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["status"] == "active"
    assert set(updated["roles"]) == {"admin", "sales"}

    users_response = client.get("/api/v1/admin/users", auth=("admin", "secret"))
    assert users_response.status_code == 200
    users = users_response.json()["items"]
    assert any(item["email"] == "manager@example.com" for item in users)
