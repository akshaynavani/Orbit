"""REST endpoints for notes, habits and lists used by server-side clients (MCP)."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Habit, HabitLog, ListItem, Note, OrbitList, User
from app.schemas import HabitLogRecord, HabitRecord, ListItemRecord, ListRecord, NoteRecord
from app.security import get_current_user
from app.sync.registry import get_spec, to_record
from app.sync.service import write_server_record
from app.timeutil import now_ms

router = APIRouter(tags=["resources"])


def _new(fields: dict) -> dict:
    now = now_ms()
    return {"id": str(uuid.uuid4()), "created_at": now, "updated_at": now, **fields}


def _find_by_name(db: Session, model, user: User, column, value: str):
    """Exact (case-insensitive) match first, then prefix match."""
    base = select(model).where(model.user_id == user.id, model.deleted.is_(False))
    row = db.scalar(base.where(column.ilike(value)))
    return row or db.scalar(base.where(column.ilike(f"{value}%")))


# ---- notes ----------------------------------------------------------------


class NoteCreate(BaseModel):
    title: str = ""
    body: str = ""
    pinned: bool = False


@router.get("/notes", response_model=list[NoteRecord])
def list_notes(search: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(Note).where(Note.user_id == user.id, Note.deleted.is_(False))
    if search:
        stmt = stmt.where(Note.title.ilike(f"%{search}%") | Note.body.ilike(f"%{search}%"))
    stmt = stmt.order_by(Note.pinned.desc(), Note.updated_at.desc()).limit(200)
    return [to_record(get_spec("notes"), n) for n in db.scalars(stmt)]


@router.post("/notes", response_model=NoteRecord, status_code=status.HTTP_201_CREATED)
def create_note(body: NoteCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return write_server_record(db, user, "notes", _new(body.model_dump()))


# ---- habits ---------------------------------------------------------------


class HabitCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    frequency: str = Field(default="daily", pattern="^(daily|weekly)$")
    target_per_period: int = Field(default=1, ge=1)


class HabitCheckIn(BaseModel):
    habit: str = Field(description="Habit id or name")
    day: date | None = None
    count: int = Field(default=1, ge=0)


@router.get("/habits", response_model=list[HabitRecord])
def list_habits(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(Habit).where(Habit.user_id == user.id, Habit.deleted.is_(False), Habit.archived.is_(False))
    return [to_record(get_spec("habits"), h) for h in db.scalars(stmt.order_by(Habit.created_at))]


@router.post("/habits", response_model=HabitRecord, status_code=status.HTTP_201_CREATED)
def create_habit(body: HabitCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return write_server_record(db, user, "habits", _new(body.model_dump()))


@router.post("/habits/check-in", response_model=HabitLogRecord)
def check_in(body: HabitCheckIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    habit = db.get(Habit, body.habit)
    if habit is None or habit.user_id != user.id or habit.deleted:
        habit = _find_by_name(db, Habit, user, Habit.name, body.habit)
    if habit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No habit matching '{body.habit}'")
    day = (body.day or date.today()).isoformat()
    log_id = f"{habit.id}:{day}"  # deterministic id, same as the mobile client
    existing = db.get(HabitLog, log_id)
    now = now_ms()
    record = (
        to_record(get_spec("habit_logs"), existing)
        if existing
        else {"id": log_id, "created_at": now, "habit_id": habit.id, "day": day, "count": 0}
    )
    record.update(count=(0 if record.get("deleted") else record["count"]) + body.count, deleted=False, updated_at=now)
    return write_server_record(db, user, "habit_logs", record)


# ---- lists ----------------------------------------------------------------


class ListCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class ListItemCreate(BaseModel):
    list: str = Field(description="List id or name; created if it does not exist")
    text: str = Field(min_length=1, max_length=500)


@router.get("/lists", response_model=list[ListRecord])
def list_lists(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(OrbitList).where(OrbitList.user_id == user.id, OrbitList.deleted.is_(False))
    return [to_record(get_spec("lists"), lst) for lst in db.scalars(stmt.order_by(OrbitList.sort_order))]


@router.get("/lists/{list_id}/items", response_model=list[ListItemRecord])
def list_items(list_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(ListItem).where(
        ListItem.user_id == user.id, ListItem.list_id == list_id, ListItem.deleted.is_(False)
    )
    return [to_record(get_spec("list_items"), i) for i in db.scalars(stmt.order_by(ListItem.sort_order))]


@router.post("/lists", response_model=ListRecord, status_code=status.HTTP_201_CREATED)
def create_list(body: ListCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return write_server_record(db, user, "lists", _new({"name": body.name}))


@router.post("/lists/items", response_model=ListItemRecord, status_code=status.HTTP_201_CREATED)
def add_list_item(body: ListItemCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    lst = db.get(OrbitList, body.list)
    if lst is None or lst.user_id != user.id or lst.deleted:
        lst = _find_by_name(db, OrbitList, user, OrbitList.name, body.list)
    if lst is None:
        created = write_server_record(db, user, "lists", _new({"name": body.list}))
        list_id = created["id"]
    else:
        list_id = lst.id
    count = len(db.scalars(select(ListItem.id).where(ListItem.list_id == list_id)).all())
    return write_server_record(
        db, user, "list_items", _new({"list_id": list_id, "text": body.text, "sort_order": count})
    )
