def test_task_crud_shows_up_in_sync_feed(client, auth):
    created = client.post("/tasks", headers=auth, json={"title": "Write report", "tags": ["#work"]}).json()
    assert created["tags"] == "work"
    assert created["server_seq"] > 0

    done = client.post(f"/tasks/{created['id']}/complete", headers=auth).json()
    assert done["completed"] is True
    assert done["server_seq"] > created["server_seq"]

    feed = client.get("/sync/pull", headers=auth, params={"cursor": created["server_seq"]}).json()
    assert feed["changes"][0]["record"]["completed"] is True


def test_list_tasks_filters(client, auth):
    client.post("/tasks", headers=auth, json={"title": "a", "tags": ["home"]})
    client.post("/tasks", headers=auth, json={"title": "b", "tags": ["work"]})
    work = client.get("/tasks", headers=auth, params={"tag": "work"}).json()
    assert [t["title"] for t in work] == ["b"]


def test_delete_task_creates_tombstone(client, auth):
    t = client.post("/tasks", headers=auth, json={"title": "temp"}).json()
    assert client.delete(f"/tasks/{t['id']}", headers=auth).status_code == 204
    assert client.get(f"/tasks/{t['id']}", headers=auth).status_code == 404
    feed = client.get("/sync/pull", headers=auth).json()
    assert feed["changes"][-1]["record"]["deleted"] is True


def test_habit_check_in_by_name_accumulates(client, auth):
    client.post("/habits", headers=auth, json={"name": "Meditate"})
    client.post("/habits/check-in", headers=auth, json={"habit": "meditate", "day": "2026-10-08"})
    log = client.post("/habits/check-in", headers=auth, json={"habit": "Meditate", "day": "2026-10-08"}).json()
    assert log["count"] == 2
    assert log["id"].endswith(":2026-10-08")


def test_add_list_item_creates_list_on_demand(client, auth):
    item = client.post("/lists/items", headers=auth, json={"list": "Groceries", "text": "Eggs"}).json()
    lists = client.get("/lists", headers=auth).json()
    assert [lst["name"] for lst in lists] == ["Groceries"]
    assert item["list_id"] == lists[0]["id"]
