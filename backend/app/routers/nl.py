from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.nlp import parse_task
from app.routers.tasks import TaskCreate, create_task_for_user
from app.schemas import TaskRecord
from app.security import get_current_user

router = APIRouter(prefix="/nl", tags=["natural language"])


class ParseIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    now: int | None = Field(default=None, description="Client time in ms since epoch")
    tz_offset_minutes: int = Field(default=0, ge=-14 * 60, le=14 * 60, description="Minutes east of UTC")


class ParseOut(BaseModel):
    title: str
    tags: list[str]
    priority: int
    due_at: int | None
    matched_date_text: str | None = None


@router.post("/parse", response_model=ParseOut)
def parse(body: ParseIn, _user: User = Depends(get_current_user)) -> ParseOut:
    """Parse free text into task fields without creating anything. The mobile app
    uses this for quick add and then writes the task to its local store."""
    p = parse_task(body.text, body.now, body.tz_offset_minutes)
    return ParseOut(**p.__dict__)


@router.post("/tasks", response_model=TaskRecord, status_code=201)
def create_from_text(
    body: ParseIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Parse and create in one step (used by the MCP server). The task gets a
    ``server_seq`` and reaches every device on its next pull."""
    p = parse_task(body.text, body.now, body.tz_offset_minutes)
    return create_task_for_user(
        db, user, TaskCreate(title=p.title, due_at=p.due_at, priority=p.priority, tags=p.tags), device_id="nl"
    )
