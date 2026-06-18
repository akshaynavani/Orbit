"""Thin synchronous client for the Orbit REST API."""

from __future__ import annotations

import os
import time
from datetime import datetime
from typing import Any

import httpx


class OrbitError(RuntimeError):
    pass


def _local_offset_minutes() -> int:
    override = os.environ.get("ORBIT_TZ_OFFSET_MINUTES")
    if override:
        return int(override)
    offset = datetime.now().astimezone().utcoffset()
    return int(offset.total_seconds() // 60) if offset else 0


class OrbitClient:
    def __init__(self, base_url: str, token: str | None = None, email: str | None = None, password: str | None = None):
        self._http = httpx.Client(base_url=base_url.rstrip("/"), timeout=15.0)
        self._token = token
        self._email = email
        self._password = password
        self.tz_offset_minutes = _local_offset_minutes()

    @classmethod
    def from_env(cls) -> "OrbitClient":
        return cls(
            base_url=os.environ.get("ORBIT_API_URL", "http://localhost:8000"),
            token=os.environ.get("ORBIT_TOKEN") or None,
            email=os.environ.get("ORBIT_EMAIL") or None,
            password=os.environ.get("ORBIT_PASSWORD") or None,
        )

    def _login(self) -> None:
        if not (self._email and self._password):
            raise OrbitError("Set ORBIT_TOKEN, or ORBIT_EMAIL and ORBIT_PASSWORD, for the Orbit MCP server.")
        resp = self._http.post("/auth/login", json={"email": self._email, "password": self._password})
        if resp.status_code != 200:
            raise OrbitError(f"Orbit login failed: {resp.text}")
        self._token = resp.json()["access_token"]

    def request(self, method: str, path: str, **kwargs: Any) -> Any:
        if self._token is None:
            self._login()
        for attempt in range(2):
            resp = self._http.request(method, path, headers={"Authorization": f"Bearer {self._token}"}, **kwargs)
            if resp.status_code == 401 and attempt == 0 and self._email:
                self._login()  # token expired; refresh once
                continue
            break
        if resp.status_code >= 400:
            try:
                detail = resp.json().get("detail", resp.text)
            except ValueError:
                detail = resp.text
            raise OrbitError(f"{method} {path} failed ({resp.status_code}): {detail}")
        return None if resp.status_code == 204 else resp.json()

    # ---- convenience wrappers -------------------------------------------

    def now_payload(self, text: str) -> dict:
        return {"text": text, "now": int(time.time() * 1000), "tz_offset_minutes": self.tz_offset_minutes}

    def create_task_from_text(self, text: str) -> dict:
        return self.request("POST", "/nl/tasks", json=self.now_payload(text))

    def list_tasks(self, **params: Any) -> list[dict]:
        return self.request("GET", "/tasks", params={k: v for k, v in params.items() if v is not None})

    def complete_task(self, task_id: str) -> dict:
        return self.request("POST", f"/tasks/{task_id}/complete")

    def create_note(self, title: str, body: str) -> dict:
        return self.request("POST", "/notes", json={"title": title, "body": body})

    def search_notes(self, search: str | None) -> list[dict]:
        return self.request("GET", "/notes", params={"search": search} if search else None)

    def list_habits(self) -> list[dict]:
        return self.request("GET", "/habits")

    def check_in(self, habit: str, count: int, day: str | None) -> dict:
        return self.request("POST", "/habits/check-in", json={"habit": habit, "count": count, "day": day})

    def add_list_item(self, list_name: str, text: str) -> dict:
        return self.request("POST", "/lists/items", json={"list": list_name, "text": text})

    def list_lists(self) -> list[dict]:
        return self.request("GET", "/lists")

    def list_items(self, list_id: str) -> list[dict]:
        return self.request("GET", f"/lists/{list_id}/items")
