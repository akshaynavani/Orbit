"""Pydantic schemas for synced records and the sync envelopes."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

EntityName = Literal["tasks", "habits", "habit_logs", "notes", "lists", "list_items"]


class SyncRecord(BaseModel):
    """Columns shared by every synced entity (see ``app.models.SyncMixin``)."""

    model_config = ConfigDict(from_attributes=True, extra="ignore")

    id: str = Field(min_length=1, max_length=80)
    created_at: int
    updated_at: int
    deleted: bool = False
    device_id: str | None = None
    server_seq: int | None = None  # output only; ignored on push


class TaskRecord(SyncRecord):
    title: str = Field(max_length=500)
    notes: str | None = None
    due_at: int | None = None
    priority: int = Field(default=0, ge=0, le=3)
    tags: str = ""
    completed: bool = False
    completed_at: int | None = None


class HabitRecord(SyncRecord):
    name: str = Field(max_length=200)
    frequency: Literal["daily", "weekly"] = "daily"
    target_per_period: int = Field(default=1, ge=1, le=100)
    color: str = "#6C5CE7"
    archived: bool = False


class HabitLogRecord(SyncRecord):
    habit_id: str
    day: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    count: int = Field(default=1, ge=0)


class NoteRecord(SyncRecord):
    title: str = ""
    body: str = ""
    pinned: bool = False


class ListRecord(SyncRecord):
    name: str = Field(max_length=200)
    color: str = "#00B894"
    sort_order: int = 0


class ListItemRecord(SyncRecord):
    list_id: str
    text: str = Field(max_length=500)
    checked: bool = False
    sort_order: int = 0


# ---- sync envelopes -------------------------------------------------------


class Change(BaseModel):
    entity: EntityName
    record: dict


class PushRequest(BaseModel):
    device_id: str = Field(min_length=1, max_length=64)
    changes: list[Change] = Field(default_factory=list, max_length=2000)


ResultStatus = Literal["applied", "stale", "rejected"]


class ChangeResult(BaseModel):
    entity: EntityName
    id: str
    status: ResultStatus
    server_seq: int | None = None
    reason: str | None = None
    # For "stale" results (and clamped "applied" ones) the authoritative server copy,
    # so the client can overwrite its local row immediately without waiting for a pull.
    record: dict | None = None


class PushResponse(BaseModel):
    results: list[ChangeResult]
    applied: int
    stale: int
    rejected: int


class PullResponse(BaseModel):
    changes: list[Change]
    next_cursor: int
    has_more: bool
