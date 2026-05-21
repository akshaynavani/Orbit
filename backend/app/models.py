"""ORM models.

Every user-owned, syncable entity inherits ``SyncMixin`` which provides the columns
the delta-sync protocol relies on:

* ``id``          – client-generated string id (UUIDv4, or a deterministic key for habit logs)
* ``updated_at``  – client wall-clock of the last edit in ms since epoch; the LWW timestamp
* ``device_id``   – device that produced the last accepted write; LWW tie-breaker
* ``deleted``     – tombstone flag so deletes flow through the change feed
* ``server_seq``  – monotonically increasing value assigned by the server on every
                    accepted write; clients pull "everything with server_seq > cursor"

Relationships between synced entities (e.g. list item -> list) are intentionally *not*
enforced with foreign keys: offline clients may push a child before its parent, and
tombstoned parents must not cascade-delete children that another device still edits.
"""

from sqlalchemy import (
    BigInteger,
    Boolean,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, declared_attr, mapped_column

from app.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    display_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[int] = mapped_column(BigInteger)


class SyncMixin:
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    created_at: Mapped[int] = mapped_column(BigInteger)
    updated_at: Mapped[int] = mapped_column(BigInteger)
    device_id: Mapped[str] = mapped_column(String(64), default="server")
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    server_seq: Mapped[int] = mapped_column(BigInteger, index=True)

    @declared_attr
    def user_id(cls) -> Mapped[int]:  # noqa: N805
        return mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)

    @declared_attr.directive
    def __table_args__(cls):  # noqa: N805
        return (Index(f"ix_{cls.__tablename__}_user_seq", "user_id", "server_seq"),)


class Task(SyncMixin, Base):
    __tablename__ = "tasks"

    title: Mapped[str] = mapped_column(String(500))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    due_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    priority: Mapped[int] = mapped_column(Integer, default=0)  # 0 none .. 3 high
    tags: Mapped[str] = mapped_column(String(500), default="")  # comma separated
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[int | None] = mapped_column(BigInteger, nullable=True)


class Habit(SyncMixin, Base):
    __tablename__ = "habits"

    name: Mapped[str] = mapped_column(String(200))
    frequency: Mapped[str] = mapped_column(String(16), default="daily")  # daily | weekly
    target_per_period: Mapped[int] = mapped_column(Integer, default=1)
    color: Mapped[str] = mapped_column(String(16), default="#6C5CE7")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)


class HabitLog(SyncMixin, Base):
    """One row per habit per day. The id is deterministic (``<habit_id>:<YYYY-MM-DD>``)
    so two offline devices checking in on the same day converge on the same record
    and LWW decides the final count instead of producing duplicates."""

    __tablename__ = "habit_logs"

    habit_id: Mapped[str] = mapped_column(String(80), index=True)
    day: Mapped[str] = mapped_column(String(10))  # YYYY-MM-DD in the user's local tz
    count: Mapped[int] = mapped_column(Integer, default=1)


class Note(SyncMixin, Base):
    __tablename__ = "notes"

    title: Mapped[str] = mapped_column(String(300), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)


class OrbitList(SyncMixin, Base):
    __tablename__ = "lists"

    name: Mapped[str] = mapped_column(String(200))
    color: Mapped[str] = mapped_column(String(16), default="#00B894")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class ListItem(SyncMixin, Base):
    __tablename__ = "list_items"

    list_id: Mapped[str] = mapped_column(String(80), index=True)
    text: Mapped[str] = mapped_column(String(500))
    checked: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class SeqCounter(Base):
    """Fallback monotonic counter for databases without sequences (SQLite in tests).
    On PostgreSQL the ``orbit_change_seq`` sequence is used instead."""

    __tablename__ = "seq_counter"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    value: Mapped[int] = mapped_column(BigInteger, default=0)
