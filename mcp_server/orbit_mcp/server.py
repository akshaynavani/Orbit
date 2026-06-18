"""Orbit MCP server.

Exposes Orbit to MCP clients (Claude Desktop, IDE agents, ...) over stdio so a user
can say "remind me to call mom tomorrow at 5pm" and have it land in the app. Writes
go through the backend, get a sync sequence number, and appear on every device at
its next pull.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta
from typing import Literal

from mcp.server.fastmcp import FastMCP

from orbit_mcp.client import OrbitClient, OrbitError

mcp = FastMCP("orbit")
_client: OrbitClient | None = None

PRIORITY_LABEL = {0: "", 1: "low", 2: "medium", 3: "high"}


def client() -> OrbitClient:
    global _client
    if _client is None:
        _client = OrbitClient.from_env()
    return _client


def _fmt_due(ms: int | None) -> str:
    if ms is None:
        return ""
    dt = datetime.fromtimestamp(ms / 1000).astimezone()
    return dt.strftime("%a %d %b %H:%M") if (dt.hour, dt.minute) != (0, 0) else dt.strftime("%a %d %b")


def _fmt_task(t: dict) -> str:
    parts = [f"[{'x' if t['completed'] else ' '}] {t['title']}"]
    if t.get("due_at"):
        parts.append(f"due {_fmt_due(t['due_at'])}")
    if t.get("priority"):
        parts.append(f"!{PRIORITY_LABEL[t['priority']]}")
    if t.get("tags"):
        parts.append(" ".join(f"#{x}" for x in t["tags"].split(",") if x))
    parts.append(f"(id: {t['id']})")
    return "  ".join(parts)


def _err(e: Exception) -> str:
    return f"Error: {e}"


@mcp.tool()
def create_task(text: str) -> str:
    """Create a task from natural language.

    The text may include a due date/time ("tomorrow at 5pm", "next friday", "in 3 days"),
    tags ("#work") and a priority ("!high", "!med", "!low"). Example:
    "Submit expense report friday 10am #work !high".
    """
    try:
        task = client().create_task_from_text(text)
    except OrbitError as e:
        return _err(e)
    return f"Created task: {_fmt_task(task)}"


@mcp.tool()
def list_tasks(
    state: Literal["open", "completed", "all"] = "open",
    tag: str | None = None,
    search: str | None = None,
    due_within_days: int | None = None,
    limit: int = 25,
) -> str:
    """List tasks. Filter by state, tag, title search, or tasks due within N days
    (use 0 for "due today or overdue")."""
    due_before = None
    if due_within_days is not None:
        end = datetime.now().replace(hour=23, minute=59, second=59) + timedelta(days=due_within_days)
        due_before = int(end.timestamp() * 1000)
    try:
        tasks = client().list_tasks(state=state, tag=tag, search=search, due_before=due_before, limit=limit)
    except OrbitError as e:
        return _err(e)
    if not tasks:
        return "No matching tasks."
    return "\n".join(_fmt_task(t) for t in tasks)


@mcp.tool()
def complete_task(task: str) -> str:
    """Mark a task as done. `task` can be the task id or (part of) its title; if the
    title matches several open tasks, the candidates are returned instead."""
    try:
        c = client()
        try:
            done = c.complete_task(task)
            return f"Completed: {done['title']}"
        except OrbitError:
            pass
        matches = c.list_tasks(state="open", search=task, limit=10)
        if not matches:
            return f"No open task matches '{task}'."
        exact = [t for t in matches if t["title"].lower() == task.lower()]
        if len(exact) == 1 or len(matches) == 1:
            target = (exact or matches)[0]
            done = c.complete_task(target["id"])
            return f"Completed: {done['title']}"
        return "Several tasks match; call again with an id:\n" + "\n".join(_fmt_task(t) for t in matches)
    except OrbitError as e:
        return _err(e)


@mcp.tool()
def create_note(title: str, body: str = "") -> str:
    """Create a note."""
    try:
        note = client().create_note(title, body)
    except OrbitError as e:
        return _err(e)
    return f"Created note '{note['title']}' (id: {note['id']})"


@mcp.tool()
def search_notes(query: str | None = None) -> str:
    """Search notes by title/body text (or list recent notes when no query is given)."""
    try:
        notes = client().search_notes(query)
    except OrbitError as e:
        return _err(e)
    if not notes:
        return "No notes found."
    return "\n\n".join(f"## {n['title'] or 'Untitled'}\n{n['body'][:500]}" for n in notes[:10])


@mcp.tool()
def log_habit(habit: str, count: int = 1, day: str | None = None) -> str:
    """Check in on a habit by name or id. `day` is YYYY-MM-DD (defaults to today)."""
    try:
        log = client().check_in(habit, count, day)
    except OrbitError as e:
        return _err(e)
    return f"Logged {habit} on {log['day']} (count today: {log['count']})"


@mcp.tool()
def list_habits() -> str:
    """List active habits with their targets."""
    try:
        habits = client().list_habits()
    except OrbitError as e:
        return _err(e)
    if not habits:
        return "No habits yet."
    return "\n".join(f"- {h['name']} ({h['target_per_period']}x {h['frequency']}, id: {h['id']})" for h in habits)


@mcp.tool()
def add_list_item(list_name: str, item: str) -> str:
    """Add an item to a list (e.g. "Groceries"). The list is created if it doesn't exist."""
    try:
        created = client().add_list_item(list_name, item)
    except OrbitError as e:
        return _err(e)
    return f"Added '{created['text']}' to {list_name}"


@mcp.tool()
def show_list(list_name: str) -> str:
    """Show the items in a list."""
    try:
        c = client()
        lists = c.list_lists()
        target = next((l for l in lists if l["name"].lower() == list_name.lower()), None) or next(
            (l for l in lists if l["name"].lower().startswith(list_name.lower())), None
        )
        if target is None:
            names = ", ".join(l["name"] for l in lists) or "none"
            return f"No list named '{list_name}'. Lists: {names}"
        items = c.list_items(target["id"])
    except OrbitError as e:
        return _err(e)
    if not items:
        return f"{target['name']} is empty."
    return f"{target['name']}:\n" + "\n".join(f"[{'x' if i['checked'] else ' '}] {i['text']}" for i in items)


@mcp.prompt()
def daily_review() -> str:
    """Review today's tasks and habits."""
    today = time.strftime("%A %d %B %Y")
    return (
        f"Today is {today}. Use list_tasks with due_within_days=0 to see what's due or overdue, "
        "and list_habits to see habits. Summarise what I should focus on and suggest which "
        "overdue tasks to reschedule."
    )


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
