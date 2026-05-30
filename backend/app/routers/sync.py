from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import User
from app.schemas import PullResponse, PushRequest, PushResponse
from app.security import get_current_user
from app.sync.service import apply_changes, changes_since

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("/push", response_model=PushResponse)
def push(
    body: PushRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PushResponse:
    """Upload locally changed records. Each change is merged with last-write-wins;
    the response reports per-record status so the client can clear its outbox and
    overwrite rows that lost a conflict."""
    try:
        return apply_changes(db, user, body.device_id, body.changes)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/pull", response_model=PullResponse)
def pull(
    cursor: int = Query(0, ge=0),
    limit: int | None = Query(None, ge=1, le=5000),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PullResponse:
    """Download every change with ``server_seq > cursor``. Call repeatedly with
    ``next_cursor`` while ``has_more`` is true."""
    return changes_since(db, user, cursor, limit or get_settings().sync_page_size)
