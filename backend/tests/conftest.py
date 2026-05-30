import os
import tempfile

# Point the app at a throwaway SQLite file *before* app modules are imported.
_DB_FILE = os.path.join(tempfile.mkdtemp(prefix="orbit-test-"), "orbit.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB_FILE}"
os.environ["JWT_SECRET"] = "test-secret"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import models  # noqa: E402,F401
from app.db import Base, engine  # noqa: E402
from app.main import create_app  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_schema():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())


def _register(client: TestClient, email: str) -> dict:
    resp = client.post("/auth/register", json={"email": email, "password": "password123"})
    assert resp.status_code == 201, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
def auth(client) -> dict:
    return _register(client, "alice@example.com")


@pytest.fixture
def other_auth(client) -> dict:
    return _register(client, "bob@example.com")
