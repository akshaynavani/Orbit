"""Conventional REST endpoints for tasks.

The mobile app talks to /sync; these endpoints serve server-side clients (the MCP
server, scripts, a future web UI). Every write goes through
``write_server_record`` so it receives a ``server_seq`` and reaches devices on their
next pull.
"""

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Task, User
from app.schemas import TaskRecord
from app.security import get_current_user
from app.sync.registry import get_spec, to_record
from app.sync.service import write_server_record
from app.timeutil import now_ms

router = APIRouter(prefix="/tasks", tags=["tasks"])


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    notes: str | None = None
    due_at: int | None = None
    priority: int = Field(default=0, ge=0, le=3)
    tags: list[str] = Field(default_factory=list)


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    notes: str | None = None
    due_at: int | None = None
    priority: int | None = Field(default=None, ge=0, le=3)
    tags: list[str] | None = None
    completed: bool | None = None


def _get_owned(db: Session, user: User, task_id: str) -> Task:
    task = db.get(Task, task_id)
    if task is None or task.user_id != user.id or task.deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    return task


def create_task_for_user(db: Session, user: User, body: TaskCreate, device_id: str = "server") -> dict:
    now = now_ms()
    record = {
        "id": str(uuid.uuid4()),
        "created_at": now,
        "updated_at": now,
        "title": body.title.strip(),
        "notes": body.notes,
        "due_at": body.due_at,
        "priority": body.priority,
        "tags": ",".join(t.strip().lstrip("#") for t in body.tags if t.strip()),
        "completed": False,
    }
    return write_server_record(db, user, "tasks", record, device_id)


@router.get("", response_model=list[TaskRecord])
def list_tasks(
    state: Literal["open", "completed", "all"] = "open",
    due_before: int | None = Query(None, description="ms epoch; only tasks due before this"),
    tag: str | None = None,
    search: str | None = None,
    limit: int = Query(100, ge=1, le=1000),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    stmt = select(Task).where(Task.user_id == user.id, Task.deleted.is_(False))
    if state == "open":
        stmt = stmt.where(Task.completed.is_(False))
    elif state == "completed":
        stmt = stmt.where(Task.completed.is_(True))
    if due_before is not None:
        stmt = stmt.where(Task.due_at.is_not(None), Task.due_at < due_before)
    if search:
        stmt = stmt.where(Task.title.ilike(f"%{search}%"))
    stmt = stmt.order_by(Task.due_at.is_(None), Task.due_at, Task.priority.desc(), Task.created_at)
    tasks = list(db.scalars(stmt.limit(limit * 3 if tag else limit)))
    if tag:
        needle = tag.lstrip("#").lower()
        tasks = [t for t in tasks if needle in {x.lower() for x in t.tags.split(",") if x}][:limit]
    spec = get_spec("tasks")
    return [to_record(spec, t) for t in tasks]


@router.post("", response_model=TaskRecord, status_code=status.HTTP_201_CREATED)
def create_task(body: TaskCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    return create_task_for_user(db, user, body)


@router.get("/{task_id}", response_model=TaskRecord)
def get_task(task_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    return to_record(get_spec("tasks"), _get_owned(db, user, task_id))


@router.patch("/{task_id}", response_model=TaskRecord)
def update_task(
    task_id: str,
    body: TaskUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    record = to_record(get_spec("tasks"), _get_owned(db, user, task_id))
    patch = body.model_dump(exclude_unset=True)
    if "tags" in patch:
        patch["tags"] = ",".join(t.strip().lstrip("#") for t in (patch["tags"] or []) if t.strip())
    if "completed" in patch:
        patch["completed_at"] = now_ms() if patch["completed"] else None
    record.update(patch)
    return write_server_record(db, user, "tasks", record)


@router.post("/{task_id}/complete", response_model=TaskRecord)
def complete_task(task_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    record = to_record(get_spec("tasks"), _get_owned(db, user, task_id))
    record.update(completed=True, completed_at=now_ms())
    return write_server_record(db, user, "tasks", record)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
    record = to_record(get_spec("tasks"), _get_owned(db, user, task_id))
    record["deleted"] = True
    write_server_record(db, user, "tasks", record)
