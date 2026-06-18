# Orbit

A cross-platform productivity app for **tasks, habits, notes and lists**. It works
entirely offline on top of an on-device SQLite database and syncs to a FastAPI +
PostgreSQL backend using **cursor-based delta sync** with **last-write-wins** conflict
resolution. An **MCP server** lets LLM clients such as Claude Desktop create and query
tasks in plain language ("remind me to call mom tomorrow at 5pm #family").

## Features

- **Tasks**: inbox, today, upcoming and done views; due dates, priorities and tags.
  Quick add understands phrases like `Submit report fri 10am #work !high`.
- **Habits**: daily or weekly habits with targets (`Gym x3`), tap to check in, streaks
  and a 7-day history strip.
- **Notes**: search, pinning, debounced autosave.
- **Lists**: checklists such as groceries or packing, with "clear checked".
- **Offline-first**: every write goes to SQLite first. Sync runs in the background when
  the app comes to the foreground, when connectivity returns, a couple of seconds after
  an edit, and every minute.
- **MCP integration**: `create_task`, `list_tasks`, `complete_task`, `create_note`,
  `search_notes`, `log_habit`, `list_habits`, `add_list_item`, `show_list`, plus a
  `daily_review` prompt.

## Architecture

```mermaid
flowchart LR
    subgraph Device["React Native app (Expo)"]
        UI[Screens<br/>Tasks / Habits / Notes / Lists] --> Repo[Repositories<br/>mark rows dirty]
        Repo --> SQLite[(SQLite<br/>tables + dirty flag<br/>+ sync_meta cursor)]
        Sync[SyncEngine] -->|read outbox| SQLite
        Sync -->|LWW merge| SQLite
        QA[Quick add] -->|offline fallback| Parser1[On-device parser]
    end

    subgraph Backend["FastAPI backend"]
        SyncAPI["/sync/push<br/>/sync/pull"] --> Svc[Sync service<br/>LWW + server_seq]
        REST["/tasks /notes /habits /lists"] --> Svc
        NL["/nl/parse  /nl/tasks"] --> Parser2[dateparser NL parser]
        NL --> Svc
        Svc --> PG[(PostgreSQL<br/>orbit_change_seq)]
    end

    subgraph LLM["LLM client (e.g. Claude Desktop)"]
        Agent[Assistant]
    end

    Sync -- "push dirty rows" --> SyncAPI
    Sync -- "pull server_seq > cursor" --> SyncAPI
    QA -- "online" --> NL
    Agent -- stdio --> MCP[Orbit MCP server]
    MCP -- HTTP + JWT --> REST
    MCP --> NL
```

### Sync protocol

Every syncable row (task, habit, habit log, note, list, list item) has the same columns
on the device and on the server:

| Column | Purpose |
|---|---|
| `id` | Client-generated UUID, so records can be created offline. Habit logs use the deterministic id `<habit_id>:<YYYY-MM-DD>`, so check-ins from two devices merge into one row. |
| `updated_at` | Client clock (ms) of the last edit. This is the LWW timestamp. |
| `device_id` | Device that made the last accepted write. It breaks ties when timestamps are equal. |
| `deleted` | Tombstone, so deletes travel through the change feed. |
| `server_seq` | Server-assigned value from one Postgres sequence, set on every accepted write. |
| `dirty` (device only) | The row changed locally and the server has not acknowledged it yet. |

**Push** (`POST /sync/push`): the device sends its dirty rows, parents before children.
For each record the server compares `(updated_at, device_id)` with its stored copy:

- **incoming newer**: the server applies the record and gives it a new `server_seq`.
- **identical version**: the push is a replay. It is acknowledged without a new seq, so retries are idempotent.
- **incoming older**: the result is `stale`, and the response includes the server copy so the device can overwrite its row right away.
- **invalid, or an id owned by another user**: the result is `rejected` and the record leaves the outbox.

Timestamps more than 5 minutes in the future are clamped to server time, so a device
with a wrong clock cannot win every later conflict. A device clears a row's dirty flag
only if the row was not edited again while the request was in flight.

**Pull** (`GET /sync/pull?cursor=N`): returns every change for the user with
`server_seq > N`, in sequence order and in pages (`has_more`, `next_cursor`). The device
merges each page with the same LWW rule in one SQLite transaction and only then saves
the new cursor, so a crash halfway through a sync just repeats that page.

**Ordering guarantee**: on PostgreSQL every write for a user takes a per-user
transaction advisory lock before it draws from `orbit_change_seq`. A user's writes
therefore commit in sequence order, and a pull can never move its cursor past a row
that has not committed yet.

## Repository layout

```
backend/      FastAPI app, SQLAlchemy models, Alembic migrations, pytest suite
  app/sync/   registry + LWW/cursor sync service
  app/nlp.py  natural-language task parser
mobile/       Expo React Native app (TypeScript)
  src/db/     SQLite schema, generic repository, per-entity repositories
  src/sync/   SyncEngine, LWW merge rules, sync triggers, quick-add service
mcp_server/   MCP server (FastMCP, stdio) that talks to the backend
docker-compose.yml
```

## How to run

### 1. Backend (Docker)

```bash
cp .env.example .env            # then set JWT_SECRET to a long random string
docker compose up --build       # Postgres + API on http://localhost:8000
```

The container runs `alembic upgrade head` on startup. API docs are at
http://localhost:8000/docs.

### 1b. Backend (local Python)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env            # point DATABASE_URL at a running Postgres
alembic upgrade head
uvicorn app.main:app --reload
```

### 2. Mobile app

Requires Node 18+ and the Expo tooling. Use an iOS simulator, an Android emulator, or
the Expo Go app on a phone.

```bash
cd mobile
npm install
cp .env.example .env            # EXPO_PUBLIC_API_URL; use http://10.0.2.2:8000 on the Android emulator
npx expo start
```

The app works without an account. To sync, open **Settings** and create an account or
sign in. If the device was last used by a different account, local data is cleared
before the new account's data is pulled.

### 3. MCP server

```bash
cd mcp_server
pip install -e .
export ORBIT_API_URL=http://localhost:8000
export ORBIT_EMAIL=you@example.com ORBIT_PASSWORD=your-password   # or ORBIT_TOKEN=<jwt>
orbit-mcp                       # speaks MCP over stdio
```

For Claude Desktop, add the server to `claude_desktop_config.json` (see
`mcp_server/claude_desktop_config.example.json`). Then you can ask things like
*"Add 'renew passport in 3 days !high' to Orbit"* or *"What's due today?"*.

## How to test

Backend (uses a temporary SQLite database, so Postgres is not needed):

```bash
cd backend
pip install -r requirements-dev.txt
pytest
```

The tests cover auth, LWW (newer wins, stale rejection, device-id tie-break,
idempotent replays, clock-skew clamping), cursor paging across entities, tombstones,
user isolation, habit-log convergence, the REST endpoints and the NL parser.

Mobile unit tests (pure logic: quick-add parser, LWW merge decisions, habit streaks):

```bash
cd mobile
npm test
npm run typecheck
```

To check sync by hand, run the app on two simulators signed in to the same account.
Put one in airplane mode and edit the same task on both, then reconnect. The edit with
the later timestamp wins on both devices.

## Configuration

| Variable | Where | Default |
|---|---|---|
| `DATABASE_URL` | backend | `postgresql+psycopg://orbit:orbit@localhost:5432/orbit` |
| `JWT_SECRET` | backend | must be set |
| `JWT_EXPIRE_MINUTES` | backend | 43200 (30 days) |
| `SYNC_PAGE_SIZE` | backend | 500 |
| `EXPO_PUBLIC_API_URL` | mobile | `http://localhost:8000` |
| `ORBIT_API_URL`, `ORBIT_TOKEN` / `ORBIT_EMAIL` + `ORBIT_PASSWORD` | MCP server | none |
| `ORBIT_TZ_OFFSET_MINUTES` | MCP server | host timezone |
