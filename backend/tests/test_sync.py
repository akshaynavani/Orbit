import time

from app.sync.service import MAX_CLOCK_SKEW_MS, incoming_wins


def _task(id_: str, title: str, updated_at: int, **extra) -> dict:
    return {"id": id_, "created_at": 1, "updated_at": updated_at, "title": title, **extra}


def _push(client, auth, device, *changes):
    resp = client.post(
        "/sync/push",
        headers=auth,
        json={"device_id": device, "changes": [{"entity": e, "record": r} for e, r in changes]},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _pull_all(client, auth, cursor=0, limit=500):
    changes = []
    while True:
        body = client.get("/sync/pull", headers=auth, params={"cursor": cursor, "limit": limit}).json()
        changes.extend(body["changes"])
        cursor = body["next_cursor"]
        if not body["has_more"]:
            return changes, cursor


def test_incoming_wins_tiebreak():
    assert incoming_wins(2, "a", 1, "z")
    assert not incoming_wins(1, "z", 2, "a")
    assert incoming_wins(5, "b", 5, "a")
    assert not incoming_wins(5, "a", 5, "b")
    assert not incoming_wins(5, "a", 5, "a")


def test_push_then_pull_roundtrip(client, auth):
    res = _push(client, auth, "phone", ("tasks", _task("t1", "Buy milk", 1000)))
    assert res["applied"] == 1
    changes, cursor = _pull_all(client, auth)
    assert [c["record"]["title"] for c in changes] == ["Buy milk"]
    assert cursor == res["results"][0]["server_seq"]


def test_last_write_wins_newer_overrides(client, auth):
    _push(client, auth, "phone", ("tasks", _task("t1", "old", 1000)))
    res = _push(client, auth, "tablet", ("tasks", _task("t1", "new", 2000)))
    assert res["results"][0]["status"] == "applied"
    changes, _ = _pull_all(client, auth)
    assert changes[-1]["record"]["title"] == "new"
    assert changes[-1]["record"]["device_id"] == "tablet"


def test_stale_write_is_rejected_with_server_copy(client, auth):
    _push(client, auth, "phone", ("tasks", _task("t1", "newer", 2000)))
    res = _push(client, auth, "tablet", ("tasks", _task("t1", "older", 1000)))
    result = res["results"][0]
    assert result["status"] == "stale"
    assert result["record"]["title"] == "newer"


def test_equal_timestamps_break_ties_on_device_id(client, auth):
    _push(client, auth, "device-b", ("tasks", _task("t1", "from b", 1000)))
    res = _push(client, auth, "device-a", ("tasks", _task("t1", "from a", 1000)))
    assert res["results"][0]["status"] == "stale"


def test_replayed_push_is_idempotent(client, auth):
    first = _push(client, auth, "phone", ("tasks", _task("t1", "x", 1000)))
    again = _push(client, auth, "phone", ("tasks", _task("t1", "x", 1000)))
    assert again["results"][0]["status"] == "applied"
    assert again["results"][0]["server_seq"] == first["results"][0]["server_seq"]


def test_tombstones_propagate(client, auth):
    _push(client, auth, "phone", ("notes", {"id": "n1", "created_at": 1, "updated_at": 1, "title": "hi"}))
    _, cursor = _pull_all(client, auth)
    _push(client, auth, "tablet", ("notes", {"id": "n1", "created_at": 1, "updated_at": 2, "deleted": True}))
    changes, _ = _pull_all(client, auth, cursor=cursor)
    assert len(changes) == 1
    assert changes[0]["record"]["deleted"] is True


def test_pull_pages_across_entities_in_seq_order(client, auth):
    records = []
    for i in range(7):
        records.append(("tasks", _task(f"t{i}", f"task {i}", 10 + i)))
        records.append(("notes", {"id": f"n{i}", "created_at": 1, "updated_at": 10 + i, "title": f"note {i}"}))
    _push(client, auth, "phone", *records)

    changes, _ = _pull_all(client, auth, limit=3)
    assert len(changes) == 14
    seqs = [c["record"]["server_seq"] for c in changes]
    assert seqs == sorted(seqs)
    assert len(set(seqs)) == 14


def test_cursor_only_returns_newer_changes(client, auth):
    _push(client, auth, "phone", ("tasks", _task("t1", "a", 1)))
    _, cursor = _pull_all(client, auth)
    _push(client, auth, "phone", ("tasks", _task("t2", "b", 2)))
    changes, _ = _pull_all(client, auth, cursor=cursor)
    assert [c["record"]["id"] for c in changes] == ["t2"]


def test_users_are_isolated(client, auth, other_auth):
    _push(client, auth, "phone", ("tasks", _task("t1", "alice's", 1)))
    changes, _ = _pull_all(client, other_auth)
    assert changes == []
    res = _push(client, other_auth, "evil", ("tasks", _task("t1", "hijack", 99)))
    assert res["results"][0]["status"] == "rejected"


def test_future_timestamps_are_clamped(client, auth):
    far_future = int(time.time() * 1000) + MAX_CLOCK_SKEW_MS * 10
    res = _push(client, auth, "broken-clock", ("tasks", _task("t1", "x", far_future)))
    result = res["results"][0]
    assert result["status"] == "applied"
    assert result["record"]["updated_at"] < far_future


def test_invalid_record_rejected_but_batch_continues(client, auth):
    res = _push(
        client,
        auth,
        "phone",
        ("tasks", {"id": "bad", "created_at": 1, "updated_at": 1}),  # missing title
        ("tasks", _task("good", "ok", 1)),
    )
    assert [r["status"] for r in res["results"]] == ["rejected", "applied"]


def test_habit_logs_converge_on_deterministic_id(client, auth):
    log = {"id": "h1:2026-10-08", "created_at": 1, "habit_id": "h1", "day": "2026-10-08"}
    _push(client, auth, "phone", ("habit_logs", {**log, "updated_at": 5, "count": 1}))
    _push(client, auth, "tablet", ("habit_logs", {**log, "updated_at": 6, "count": 2}))
    changes, _ = _pull_all(client, auth)
    assert len(changes) == 1
    assert changes[0]["record"]["count"] == 2
