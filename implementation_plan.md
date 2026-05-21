# Orbit — Implementation Plan

Orbit is a cross-platform (iOS/Android) productivity app covering **tasks, habits, notes and
lists**. It is offline-first: every write lands in an on-device SQLite database and is later
synchronised with a FastAPI + PostgreSQL backend using **cursor-based delta sync** with
**last-write-wins (LWW)** conflict resolution. An **MCP server** exposes Orbit to LLM clients
(Claude Desktop, etc.) so tasks can be created and queried in natural language.

## Key design decisions

| Concern | Decision |
|---|---|
| Mobile | React Native via Expo (TypeScript), `expo-sqlite` for local storage, React Navigation bottom tabs |
| IDs | Client-generated UUIDv4 so records can be created offline without server round-trips |
| Change tracking (client) | Every row has `updated_at` (ms epoch, client clock), `deleted` tombstone flag and `dirty` flag; dirty rows form the outbox |
| Change tracking (server) | Every row has a `server_seq` (BIGINT) drawn from a single Postgres sequence on every accepted write. The sync cursor is the highest `server_seq` the client has seen |
| Conflict resolution | LWW on `(updated_at, device_id)` — the incoming change wins if its timestamp is newer; ties are broken by lexicographic device id for determinism. Losing writes are reported back so the client can overwrite its local copy |
| Deletes | Soft deletes (tombstones) so deletions propagate through the delta feed |
| Auth | Email/password, bcrypt hashing, JWT bearer tokens; all data scoped per user |
| Natural language | A rule-based parser on the backend (`dateparser` + regex) turns "Call mom tomorrow at 5pm !high #family" into structured task fields. Used by the mobile quick-add box and by the MCP server |
| MCP | Python `mcp` SDK (FastMCP), stdio transport, calls the backend REST API with a user token |

## Repository layout

```
Orbit/
  backend/        FastAPI service (Python 3.11, SQLAlchemy 2, Alembic, PostgreSQL)
  mobile/         Expo React Native app (TypeScript, expo-sqlite)
  mcp_server/     MCP server exposing Orbit tools to LLM clients
  docker-compose.yml
```

## Phase 1 — Backend foundation

Deliverables: project skeleton, settings, DB session, ORM models for all entities, auth.

- `backend/pyproject.toml`, `backend/requirements.txt`, `backend/.env.example`
- `backend/app/config.py` — pydantic-settings configuration
- `backend/app/db.py` — engine, session factory, declarative base
- `backend/app/models.py` — `User`, `Task`, `Habit`, `HabitLog`, `Note`, `List`, `ListItem`
  with the shared sync columns (`id`, `user_id`, `updated_at`, `deleted`, `server_seq`, `device_id`)
- `backend/app/security.py`, `backend/app/routers/auth.py` — register/login, JWT dependency
- `backend/app/main.py` — app factory, health check
- `backend/alembic.ini`, `backend/alembic/env.py`, `backend/alembic/versions/0001_initial.py`

## Phase 2 — Sync protocol and REST API

Deliverables: delta sync endpoints with LWW, plain CRUD-ish REST for non-mobile clients, tests.

- `backend/app/schemas.py` — Pydantic models for every entity + sync envelopes
- `backend/app/sync/registry.py` — maps entity names to models/schemas and allowed fields
- `backend/app/sync/service.py` — `apply_changes()` (LWW merge), `changes_since()` (cursor pull)
- `backend/app/routers/sync.py` — `POST /sync/push`, `GET /sync/pull?cursor=&limit=`
- `backend/app/routers/tasks.py` — list/create/update/complete tasks (server-side writes also bump `server_seq`)
- `backend/tests/` — conftest with SQLite-in-memory fallback, tests for LWW, cursor paging, auth

## Phase 3 — Mobile app core (offline)

Deliverables: Expo app with local SQLite schema and four feature screens working fully offline.

- `mobile/package.json`, `app.json`, `tsconfig.json`, `babel.config.js`, `App.tsx`
- `mobile/src/db/schema.ts`, `mobile/src/db/database.ts` — migrations, helpers
- `mobile/src/db/repositories/*.ts` — tasks, habits, notes, lists repositories (mark rows dirty)
- `mobile/src/types.ts`, `mobile/src/utils/*.ts` — uuid, time, habit streak calc
- `mobile/src/screens/*.tsx` — Tasks, Habits, Notes (+ editor), Lists (+ detail)
- `mobile/src/components/*.tsx` — shared UI pieces
- `mobile/src/navigation/RootNavigator.tsx`

## Phase 4 — Mobile sync engine and account

Deliverables: API client, auth storage, push/pull sync loop, background/foreground triggers.

- `mobile/src/api/client.ts` — fetch wrapper with JWT
- `mobile/src/auth/AuthContext.tsx`, `mobile/src/screens/SettingsScreen.tsx` — login/register/logout
- `mobile/src/sync/SyncEngine.ts` — collect outbox → push → apply server rejections → paginated pull → apply LWW locally → persist cursor
- `mobile/src/sync/useSync.ts` — triggers on app foreground, connectivity regained, interval, manual pull-to-refresh
- Quick-add box on Tasks screen calling `/nl/parse` when online, local fallback when offline

## Phase 5 — Natural language + MCP server + packaging

Deliverables: NL parsing endpoint, MCP server, docker-compose.

- `backend/app/nlp.py`, `backend/app/routers/nl.py` — parse + quick-create endpoint, tests
- `mcp_server/pyproject.toml`, `mcp_server/orbit_mcp/server.py`, `mcp_server/orbit_mcp/client.py`
  — tools: `create_task`, `list_tasks`, `complete_task`, `create_note`, `log_habit`, `add_list_item`
- `backend/Dockerfile`, `docker-compose.yml` (Postgres + API)
- Final: `.gitignore`, `README.md` with architecture diagram, run and test instructions
