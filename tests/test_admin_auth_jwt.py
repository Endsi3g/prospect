from __future__ import annotations


def test_admin_login_sets_cookies_and_me_endpoint(client):
    login_response = client.post(
        "/api/v1/admin/auth/login",
        json={"username": "admin", "password": "secret"},
    )
    assert login_response.status_code == 200
    payload = login_response.json()
    assert payload["ok"] is True
    assert payload["username"] == "admin"

    access_cookie = client.cookies.get("admin_access_token")
    refresh_cookie = client.cookies.get("admin_refresh_token")
    assert access_cookie
    assert refresh_cookie

    me_response = client.get("/api/v1/admin/auth/me")
    assert me_response.status_code == 200
    me_payload = me_response.json()
    assert me_payload["username"] == "admin"
    assert me_payload["authenticated"] is True


def test_admin_refresh_rotates_refresh_cookie(client):
    login_response = client.post(
        "/api/v1/admin/auth/login",
        json={"username": "admin", "password": "secret"},
    )
    assert login_response.status_code == 200
    previous_refresh = client.cookies.get("admin_refresh_token")
    assert previous_refresh

    refresh_response = client.post("/api/v1/admin/auth/refresh")
    assert refresh_response.status_code == 200
    next_refresh = client.cookies.get("admin_refresh_token")
    assert next_refresh
    assert next_refresh != previous_refresh


def test_admin_logout_clears_auth_session(client):
    login_response = client.post(
        "/api/v1/admin/auth/login",
        json={"username": "admin", "password": "secret"},
    )
    assert login_response.status_code == 200

    logout_response = client.post("/api/v1/admin/auth/logout")
    assert logout_response.status_code == 200
    assert logout_response.json()["ok"] is True

    me_response = client.get("/api/v1/admin/auth/me")
    assert me_response.status_code == 401


def test_admin_login_rejects_invalid_credentials(client):
    response = client.post(
        "/api/v1/admin/auth/login",
        json={"username": "admin", "password": "wrong"},
    )
    assert response.status_code == 401
