"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-10-08
"""
import sqlalchemy as sa
from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def _sync_columns() -> list[sa.Column]:
    return [
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.BigInteger, nullable=False),
        sa.Column("updated_at", sa.BigInteger, nullable=False),
        sa.Column("device_id", sa.String(64), nullable=False, server_default="server"),
        sa.Column("deleted", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("server_seq", sa.BigInteger, nullable=False),
    ]


def _sync_indexes(table: str) -> None:
    op.create_index(f"ix_{table}_user_id", table, ["user_id"])
    op.create_index(f"ix_{table}_server_seq", table, ["server_seq"])
    op.create_index(f"ix_{table}_user_seq", table, ["user_id", "server_seq"])


def upgrade() -> None:
    op.execute("CREATE SEQUENCE IF NOT EXISTS orbit_change_seq START 1")

    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(128), nullable=False),
        sa.Column("display_name", sa.String(120), nullable=True),
        sa.Column("created_at", sa.BigInteger, nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "tasks",
        *_sync_columns(),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("due_at", sa.BigInteger, nullable=True),
        sa.Column("priority", sa.Integer, nullable=False, server_default="0"),
        sa.Column("tags", sa.String(500), nullable=False, server_default=""),
        sa.Column("completed", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("completed_at", sa.BigInteger, nullable=True),
    )
    _sync_indexes("tasks")

    op.create_table(
        "habits",
        *_sync_columns(),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("frequency", sa.String(16), nullable=False, server_default="daily"),
        sa.Column("target_per_period", sa.Integer, nullable=False, server_default="1"),
        sa.Column("color", sa.String(16), nullable=False, server_default="#6C5CE7"),
        sa.Column("archived", sa.Boolean, nullable=False, server_default=sa.false()),
    )
    _sync_indexes("habits")

    op.create_table(
        "habit_logs",
        *_sync_columns(),
        sa.Column("habit_id", sa.String(80), nullable=False),
        sa.Column("day", sa.String(10), nullable=False),
        sa.Column("count", sa.Integer, nullable=False, server_default="1"),
    )
    _sync_indexes("habit_logs")
    op.create_index("ix_habit_logs_habit_id", "habit_logs", ["habit_id"])

    op.create_table(
        "notes",
        *_sync_columns(),
        sa.Column("title", sa.String(300), nullable=False, server_default=""),
        sa.Column("body", sa.Text, nullable=False, server_default=""),
        sa.Column("pinned", sa.Boolean, nullable=False, server_default=sa.false()),
    )
    _sync_indexes("notes")

    op.create_table(
        "lists",
        *_sync_columns(),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("color", sa.String(16), nullable=False, server_default="#00B894"),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
    )
    _sync_indexes("lists")

    op.create_table(
        "list_items",
        *_sync_columns(),
        sa.Column("list_id", sa.String(80), nullable=False),
        sa.Column("text", sa.String(500), nullable=False),
        sa.Column("checked", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
    )
    _sync_indexes("list_items")
    op.create_index("ix_list_items_list_id", "list_items", ["list_id"])

    op.create_table(
        "seq_counter",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("value", sa.BigInteger, nullable=False, server_default="0"),
    )


def downgrade() -> None:
    for table in ("seq_counter", "list_items", "lists", "notes", "habit_logs", "habits", "tasks", "users"):
        op.drop_table(table)
    op.execute("DROP SEQUENCE IF EXISTS orbit_change_seq")
