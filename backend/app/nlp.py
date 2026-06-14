"""Natural-language task parsing.

Turns free text like ``"Call mom tomorrow at 5pm #family !high"`` into structured
task fields. Tags and priority are pulled out with regexes; dates and times are found
with ``dateparser.search``. Because ``search_dates`` is eager (it happily reads "may"
or "a" as dates) we only accept matches that contain a digit or a recognised date
word, and strip the accepted phrase from the title.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from dateparser.search import search_dates

PRIORITY_WORDS = {
    "low": 1, "l": 1, "1": 1,
    "med": 2, "medium": 2, "m": 2, "2": 2,
    "high": 3, "h": 3, "3": 3, "urgent": 3,
}

_TAG_RE = re.compile(r"(?<!\w)#([\w-]+)")
_PRIORITY_RE = re.compile(r"(?<!\w)!(\w+)")
_TIME_RE = re.compile(
    r"\b(\d{1,2}(:\d{2})?\s*(am|pm)|\d{1,2}:\d{2}|noon|midnight|morning|afternoon|evening|tonight)\b",
    re.IGNORECASE,
)
_DATE_WORDS = re.compile(
    r"\b(today|tonight|tomorrow|tmrw|yesterday|next|this|in|on|at|"
    r"mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(rs(day)?)?|fri(day)?|sat(urday)?|sun(day)?|"
    r"jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|jun(e)?|jul(y)?|aug(ust)?|sep(t(ember)?)?|"
    r"oct(ober)?|nov(ember)?|dec(ember)?|week|weeks|day|days|month|months|noon|midnight|"
    r"morning|afternoon|evening)\b",
    re.IGNORECASE,
)
# Anything that pins the phrase to a specific day (vs. a bare "at 5pm").
_DAY_HINT_RE = re.compile(
    r"\d{1,2}[/-]\d{1,2}|\d{4}|\b(today|tomorrow|tmrw|yesterday|next|week|weeks|day|days|month|months|"
    r"mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(rs(day)?)?|fri(day)?|sat(urday)?|sun(day)?|"
    r"jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t(ember)?)?|"
    r"oct(ober)?|nov(ember)?|dec(ember)?)\b",
    re.IGNORECASE,
)
# Words dateparser tends to misread as dates when they appear alone.
_FALSE_POSITIVES = {"now", "a", "an", "may", "march", "second", "sat", "sun", "mon", "on", "at", "in", "this", "next"}


@dataclass
class ParsedTask:
    title: str
    tags: list[str] = field(default_factory=list)
    priority: int = 0
    due_at: int | None = None  # ms since epoch, UTC
    matched_date_text: str | None = None


def _accept(phrase: str) -> bool:
    p = phrase.strip().lower()
    if not p or p in _FALSE_POSITIVES:
        return False
    return bool(re.search(r"\d", p) or _DATE_WORDS.search(p))


def parse_task(text: str, now_ms: int | None = None, tz_offset_minutes: int = 0) -> ParsedTask:
    """Parse ``text`` relative to ``now_ms`` in a fixed-offset timezone
    (``tz_offset_minutes`` east of UTC, i.e. ``-Date.getTimezoneOffset()`` in JS)."""
    tz = timezone(timedelta(minutes=tz_offset_minutes))
    local_now = (
        datetime.fromtimestamp(now_ms / 1000, tz) if now_ms is not None else datetime.now(tz)
    ).replace(second=0, microsecond=0)

    tags = [t.lower() for t in _TAG_RE.findall(text)]
    work = _TAG_RE.sub(" ", text)

    priority = 0
    def _prio(m: re.Match) -> str:
        nonlocal priority
        value = PRIORITY_WORDS.get(m.group(1).lower())
        if value is None:
            return m.group(0)
        priority = value
        return " "
    work = _PRIORITY_RE.sub(_prio, work)

    # dateparser doesn't know "tonight"
    tonight = re.search(r"\btonight\b", work, re.IGNORECASE)
    if tonight:
        work = work[: tonight.start()] + " today at 8pm " + work[tonight.end():]

    due: datetime | None = None
    matched: str | None = None
    found = search_dates(
        work,
        languages=["en"],
        settings={
            "PREFER_DATES_FROM": "future",
            "RELATIVE_BASE": local_now.replace(tzinfo=None),
            "RETURN_AS_TIMEZONE_AWARE": False,
            "PREFER_DAY_OF_MONTH": "first",
        },
    ) or []
    for phrase, value in found:
        if _accept(phrase):
            matched, due = phrase, value
            break

    if matched is not None and due is not None:
        work = work.replace(matched, " ", 1)
        has_time = bool(_TIME_RE.search(matched))
        has_date = bool(_DAY_HINT_RE.search(matched))
        if not has_time:
            due = due.replace(hour=0, minute=0, second=0, microsecond=0)
        due = due.replace(tzinfo=tz)
        # A bare time that has already passed today means tomorrow.
        if has_time and not has_date and due <= local_now:
            due += timedelta(days=1)

    # Drop dangling connector words left behind ("Call mom at" -> "Call mom").
    title = re.sub(r"\s+", " ", work).strip()
    title = re.sub(r"\s+\b(at|on|by|in|due)\s*$", "", title, flags=re.IGNORECASE).strip()
    if not title:
        title = text.strip()

    return ParsedTask(
        title=title,
        tags=tags,
        priority=priority,
        due_at=int(due.timestamp() * 1000) if due else None,
        matched_date_text=matched,
    )
