def test_register_and_me(client, auth):
    resp = client.get("/auth/me", headers=auth)
    assert resp.status_code == 200
    assert resp.json()["email"] == "alice@example.com"


def test_duplicate_registration_rejected(client, auth):
    resp = client.post("/auth/register", json={"email": "ALICE@example.com", "password": "password123"})
    assert resp.status_code == 409


def test_login_with_wrong_password(client, auth):
    resp = client.post("/auth/login", json={"email": "alice@example.com", "password": "nope-nope"})
    assert resp.status_code == 401


def test_protected_route_requires_token(client):
    assert client.get("/sync/pull").status_code == 401
