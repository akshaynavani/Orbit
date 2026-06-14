from datetime import datetime, timedelta, timezone

from app.nlp import parse_task

# Thursday 8 Oct 2026, 10:00 at UTC+05:30
TZ_MIN = 330
TZ = timezone(timedelta(minutes=TZ_MIN))
NOW = datetime(2026, 10, 8, 10, 0, tzinfo=TZ)
NOW_MS = int(NOW.timestamp() * 1000)


def _local(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, TZ)


def test_tags_and_priority_are_extracted():
    p = parse_task("Ship the release #work #Launch !high", NOW_MS, TZ_MIN)
    assert p.title == "Ship the release"
    assert p.tags == ["work", "launch"]
    assert p.priority == 3
    assert p.due_at is None


def test_unknown_bang_word_is_kept_in_title():
    p = parse_task("Say hi !there", NOW_MS, TZ_MIN)
    assert p.priority == 0
    assert "!there" in p.title


def test_tomorrow_with_time():
    p = parse_task("Call mom tomorrow at 5pm #family", NOW_MS, TZ_MIN)
    assert p.title == "Call mom"
    due = _local(p.due_at)
    assert (due.year, due.month, due.day, due.hour, due.minute) == (2026, 10, 9, 17, 0)


def test_date_without_time_is_all_day():
    p = parse_task("Pay rent tomorrow", NOW_MS, TZ_MIN)
    due = _local(p.due_at)
    assert (due.day, due.hour, due.minute) == (9, 0, 0)


def test_plain_text_has_no_due_date():
    p = parse_task("Buy a new phone case", NOW_MS, TZ_MIN)
    assert p.due_at is None
    assert p.title == "Buy a new phone case"


def test_tonight_means_8pm_today():
    p = parse_task("Watch the match tonight", NOW_MS, TZ_MIN)
    due = _local(p.due_at)
    assert (due.day, due.hour) == (8, 20)
    assert p.title == "Watch the match"


def test_nl_endpoints(client, auth):
    parsed = client.post("/nl/parse", headers=auth, json={"text": "Gym !med #health", "now": NOW_MS}).json()
    assert parsed["priority"] == 2 and parsed["tags"] == ["health"]

    created = client.post("/nl/tasks", headers=auth, json={"text": "Email Sam #work", "now": NOW_MS})
    assert created.status_code == 201
    assert created.json()["title"] == "Email Sam"
    assert created.json()["device_id"] == "nl"
