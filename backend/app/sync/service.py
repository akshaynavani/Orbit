"""Delta sync core: last-write-wins merge on push, cursor-based change feed on pull.

Ordering guarantee
------------------
Clients pull ``server_seq > cursor``. For that to be safe, a row with a smaller
``server_seq`` must never become visible *after* a row with a larger one, otherwise a
client could advance its cursor past it and miss the change forever. On PostgreSQL we
take a per-user transaction-scoped advisory lock before allocating sequence values, so
all writes for one user are serialised and commit in sequence order. Since a cursor
only ever reads a single user's rows, that is sufficient.
"""

from __future__ import annotations

from pydantic import ValidationError
from sqlalchemy import select, text, update
from sqlalchemy.orm import Session

from app.models import SeqCounter, User
from app.schemas import Change, ChangeResult, PullResponse, PushResponse
from app.sync.registry import REGISTRY, EntitySpec, get_spec, to_record
from app.timeutil import now_ms

# Client timestamps further than this into the future are clamped to server time,
# so a device with a broken clock cannot "win" every future conflict.
MAX_CLOCK_SKEW_MS = 5 * 60 * 1000


# ---- sequence allocation -------------------------------------------------


def _is_postgres(db: Session) -> bool:
    return db.get_bind().dialect.name == "postgresql"


def lock_user(db: Session, user_id: int) -> None:
    if _is_postgres(db):
        db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": 7_000_000_000 + user_id})


def next_seq(db: Session) -> int:
    if _is_postgres(db):
        return int(db.execute(text("SELECT nextval('orbit_change_seq')")).scalar_one())
    counter = db.get(SeqCounter, 1)
    if counter is None:
        counter = SeqCounter(id=1, value=0)
        db.add(counter)
        db.flush()
    db.execute(update(SeqCounter).where(SeqCounter.id == 1).values(value=SeqCounter.value + 1))
    db.refresh(counter)
    return int(counter.value)


# ---- LWW ------------------------------------------------------------------


def incoming_wins(in_ts: int, in_device: str, cur_ts: int, cur_device: str) -> bool:
    """Last-write-wins with a deterministic device-id tie-breaker.

    Equal (timestamp, device) pairs are treated as an idempotent replay of the same
    write and are *not* re-applied, so retried pushes don't bump ``server_seq``.
    """
    return (in_ts, in_device or "") > (cur_ts, cur_device or "")


def _apply_one(db: Session, user: User, spec: EntitySpec, raw: dict, device_id: str, now: int) -> ChangeResult:
    try:
        rec = spec.schema.model_validate(raw)
    except ValidationError as exc:
        rid = str(raw.get("id", "?"))
        return ChangeResult(entity=spec.name, id=rid, status="rejected", reason=exc.errors()[0]["msg"])

    clamped = False
    updated_at = rec.updated_at
    if updated_at > now + MAX_CLOCK_SKEW_MS:
        updated_at = now
        clamped = True
    device = rec.device_id or device_id

    row = db.get(spec.model, rec.id)
    if row is not None and row.user_id != user.id:
        return ChangeResult(entity=spec.name, id=rec.id, status="rejected", reason="id belongs to another user")

    if row is not None and not incoming_wins(updated_at, device, row.updated_at, row.device_id):
        if (updated_at, device) == (row.updated_at, row.device_id):
            # Replay of a write we already accepted.
            return ChangeResult(entity=spec.name, id=rec.id, status="applied", server_seq=row.server_seq)
        return ChangeResult(
            entity=spec.name,
            id=rec.id,
            status="stale",
            server_seq=row.server_seq,
            reason="newer version on server",
            record=to_record(spec, row),
        )

    if row is None:
        row = spec.model(id=rec.id, user_id=user.id, created_at=rec.created_at)
        db.add(row)
    for field in spec.data_fields:
        setattr(row, field, getattr(rec, field))
    row.updated_at = updated_at
    row.device_id = device
    row.deleted = rec.deleted
    row.server_seq = next_seq(db)
    db.flush()

    return ChangeResult(
        entity=spec.name,
        id=rec.id,
        status="applied",
        server_seq=row.server_seq,
        record=to_record(spec, row) if clamped else None,
    )


def apply_changes(db: Session, user: User, device_id: str, changes: list[Change]) -> PushResponse:
    """Merge a batch of client changes. Runs in a single transaction."""
    lock_user(db, user.id)
    now = now_ms()
    results: list[ChangeResult] = []
    for change in changes:
        spec = get_spec(change.entity)
        results.append(_apply_one(db, user, spec, change.record, device_id, now))
    db.commit()
    return PushResponse(
        results=results,
        applied=sum(r.status == "applied" for r in results),
        stale=sum(r.status == "stale" for r in results),
        rejected=sum(r.status == "rejected" for r in results),
    )


def write_server_record(db: Session, user: User, entity: str, record: dict, device_id: str = "server") -> dict:
    """Apply a single server-originated write (REST API, MCP) through the same LWW path
    so it gets a ``server_seq`` and shows up in every device's pull feed."""
    lock_user(db, user.id)
    spec = get_spec(entity)
    existing = db.get(spec.model, record["id"])
    # Server writes are authoritative "now"; make sure they strictly beat the stored
    # version even when two edits land within the same millisecond.
    floor = existing.updated_at + 1 if existing is not None else 0
    updated_at = max(record.get("updated_at", 0), now_ms(), floor)
    record = {**record, "updated_at": updated_at, "device_id": device_id}
    result = _apply_one(db, user, spec, record, device_id, updated_at)
    if result.status != "applied":
        db.rollback()
        raise ValueError(result.reason or result.status)
    db.commit()
    return to_record(spec, db.get(spec.model, record["id"]))


# ---- pull -----------------------------------------------------------------


def changes_since(db: Session, user: User, cursor: int, limit: int) -> PullResponse:
    """Return up to ``limit`` changes with ``server_seq > cursor`` across all entities,
    in global sequence order. Each table contributes at most ``limit + 1`` rows, so the
    merged top-``limit`` is exact and ``has_more`` is accurate."""
    rows: list[tuple[int, str, dict]] = []
    for spec in REGISTRY.values():
        stmt = (
            select(spec.model)
            .where(spec.model.user_id == user.id, spec.model.server_seq > cursor)
            .order_by(spec.model.server_seq)
            .limit(limit + 1)
        )
        for row in db.scalars(stmt):
            rows.append((row.server_seq, spec.name, to_record(spec, row)))

    rows.sort(key=lambda r: r[0])
    has_more = len(rows) > limit
    page = rows[:limit]
    next_cursor = page[-1][0] if page else cursor
    return PullResponse(
        changes=[Change(entity=name, record=rec) for _, name, rec in page],
        next_cursor=next_cursor,
        has_more=has_more,
    )
