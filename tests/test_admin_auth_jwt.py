from __future__ import annotations

from src.core.db_models import DBAdminUser


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


def test_admin_login_rejects_hardcoded_master_credentials(client):
    first_response = client.post(
        "/api/v1/admin/auth/login",
        json={"username": "Endsi3g", "password": "Endsieg25$"},
    )
    assert first_response.status_code == 401

    second_response = client.post(
        "/api/v1/admin/auth/login",
        json={"username": "admin", "password": "Endsieg25$"},
    )
    assert second_response.status_code == 401


def test_admin_signup_sets_cookies_and_authenticates_me(client):
    signup_response = client.post(
        "/api/v1/admin/auth/signup",
        json={
            "email": "seller@example.com",
            "password": "StrongPass123!",
            "display_name": "Seller One",
        },
    )
    assert signup_response.status_code == 200
    payload = signup_response.json()
    assert payload["ok"] is True
    assert payload["username"] == "seller@example.com"

    access_cookie = client.cookies.get("admin_access_token")
    refresh_cookie = client.cookies.get("admin_refresh_token")
    assert access_cookie
    assert refresh_cookie

    me_response = client.get("/api/v1/admin/auth/me")
    assert me_response.status_code == 200
    assert me_response.json()["username"] == "seller@example.com"


def test_admin_signup_rejects_duplicate_email(client):
    first_response = client.post(
        "/api/v1/admin/auth/signup",
        json={"email": "dup@example.com", "password": "StrongPass123!"},
    )
    assert first_response.status_code == 200

    second_response = client.post(
        "/api/v1/admin/auth/signup",
        json={"email": "dup@example.com", "password": "StrongPass123!"},
    )
    assert second_response.status_code == 409


def test_admin_login_accepts_db_user_credentials(client):
    signup_response = client.post(
        "/api/v1/admin/auth/signup",
        json={"email": "rep@example.com", "password": "StrongPass123!"},
    )
    assert signup_response.status_code == 200

    logout_response = client.post("/api/v1/admin/auth/logout")
    assert logout_response.status_code == 200

    login_response = client.post(
        "/api/v1/admin/auth/login",
        json={"username": "rep@example.com", "password": "StrongPass123!"},
    )
    assert login_response.status_code == 200
    assert login_response.json()["username"] == "rep@example.com"


def test_admin_login_rejects_wrong_db_password(client):
    signup_response = client.post(
        "/api/v1/admin/auth/signup",
        json={"email": "wrongpass@example.com", "password": "StrongPass123!"},
    )
    assert signup_response.status_code == 200

    logout_response = client.post("/api/v1/admin/auth/logout")
    assert logout_response.status_code == 200

    login_response = client.post(
        "/api/v1/admin/auth/login",
        json={"username": "wrongpass@example.com", "password": "bad-password"},
    )
    assert login_response.status_code == 401


def test_admin_login_rejects_disabled_db_user(client, db_session):
    signup_response = client.post(
        "/api/v1/admin/auth/signup",
        json={"email": "disabled@example.com", "password": "StrongPass123!"},
    )
    assert signup_response.status_code == 200

    user = db_session.query(DBAdminUser).filter(DBAdminUser.email == "disabled@example.com").first()
    assert user is not None
    user.status = "disabled"
    db_session.commit()

    logout_response = client.post("/api/v1/admin/auth/logout")
    assert logout_response.status_code == 200

    login_response = client.post(
        "/api/v1/admin/auth/login",
        json={"username": "disabled@example.com", "password": "StrongPass123!"},
    )
    assert login_response.status_code == 401
