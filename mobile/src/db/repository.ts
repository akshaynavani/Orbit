import { decideMerge } from '../sync/lww';
import { Editable, EntityName, EntityTypes } from '../types';
import { dataEvents } from '../utils/events';
import { newId } from '../utils/id';
import { now } from '../utils/time';
import { getDb, getMeta, setMeta } from './database';
import { ENTITY_COLUMNS } from './schema';

type Row = Record<string, unknown>;

// ---- row <-> record conversion -------------------------------------------

export function rowToRecord<E extends EntityName>(entity: E, row: Row): EntityTypes[E] {
  const out: Row = {};
  for (const [col, type] of Object.entries(ENTITY_COLUMNS[entity])) {
    const v = row[col];
    out[col] = type === 'bool' ? v === 1 || v === true : v ?? null;
  }
  return out as unknown as EntityTypes[E];
}

function recordToParams(entity: EntityName, record: Row): (string | number | null)[] {
  return Object.entries(ENTITY_COLUMNS[entity]).map(([col, type]) => {
    const v = record[col];
    if (v === undefined || v === null) return type === 'bool' ? 0 : null;
    if (type === 'bool') return v ? 1 : 0;
    return v as string | number;
  });
}

function upsertSql(entity: EntityName): string {
  const cols = [...Object.keys(ENTITY_COLUMNS[entity]), 'dirty'];
  const placeholders = cols.map(() => '?').join(', ');
  return `INSERT OR REPLACE INTO ${entity} (${cols.join(', ')}) VALUES (${placeholders})`;
}

// ---- device id ------------------------------------------------------------

let cachedDeviceId: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  let id = await getMeta('device_id');
  if (!id) {
    id = `dev-${newId()}`;
    await setMeta('device_id', id);
  }
  cachedDeviceId = id;
  return id;
}

// ---- reads ----------------------------------------------------------------

export async function findById<E extends EntityName>(
  entity: E,
  id: string,
): Promise<(EntityTypes[E] & { dirty: boolean }) | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Row>(`SELECT * FROM ${entity} WHERE id = ?`, id);
  if (!row) return null;
  return { ...rowToRecord(entity, row), dirty: row.dirty === 1 };
}

/** Query live (non-deleted) rows. `where` is appended with AND. */
export async function query<E extends EntityName>(
  entity: E,
  where = '1=1',
  params: (string | number | null)[] = [],
  orderBy = 'created_at ASC',
): Promise<EntityTypes[E][]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(
    `SELECT * FROM ${entity} WHERE deleted = 0 AND (${where}) ORDER BY ${orderBy}`,
    ...params,
  );
  return rows.map((r) => rowToRecord(entity, r));
}

// ---- local writes (mark dirty) --------------------------------------------

/**
 * Persist a locally edited record. Stamps `updated_at` / `device_id` and sets
 * `dirty = 1` so the sync engine pushes it. `updated_at` is forced to be strictly
 * greater than the stored version so rapid successive edits always order correctly.
 */
async function saveLocal<E extends EntityName>(entity: E, record: EntityTypes[E]): Promise<EntityTypes[E]> {
  const db = await getDb();
  const deviceId = await getDeviceId();
  const existing = await findById(entity, record.id);
  const stamped = {
    ...record,
    updated_at: Math.max(now(), (existing?.updated_at ?? 0) + 1),
    device_id: deviceId,
    server_seq: existing?.server_seq ?? null,
  } as EntityTypes[E];
  await db.runAsync(upsertSql(entity), ...recordToParams(entity, stamped as unknown as Row), 1);
  dataEvents.emit([entity]);
  return stamped;
}

export async function insert<E extends EntityName>(
  entity: E,
  fields: Editable<EntityTypes[E]>,
  id: string = newId(),
): Promise<EntityTypes[E]> {
  const ts = now();
  const record = {
    ...fields,
    id,
    created_at: ts,
    updated_at: ts,
    deleted: false,
    device_id: null,
    server_seq: null,
  } as unknown as EntityTypes[E];
  return saveLocal(entity, record);
}

export async function update<E extends EntityName>(
  entity: E,
  id: string,
  patch: Partial<Editable<EntityTypes[E]>>,
): Promise<EntityTypes[E] | null> {
  const existing = await findById(entity, id);
  if (!existing) return null;
  const { dirty: _dirty, ...current } = existing;
  return saveLocal(entity, { ...current, ...patch } as EntityTypes[E]);
}

/** Soft delete: writes a tombstone that syncs like any other change. */
export async function remove<E extends EntityName>(entity: E, id: string): Promise<void> {
  const existing = await findById(entity, id);
  if (!existing || existing.deleted) return;
  const { dirty: _dirty, ...current } = existing;
  await saveLocal(entity, { ...current, deleted: true } as EntityTypes[E]);
}

// ---- sync support -----------------------------------------------------------

export async function getDirty<E extends EntityName>(entity: E): Promise<EntityTypes[E][]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(`SELECT * FROM ${entity} WHERE dirty = 1 LIMIT 500`);
  return rows.map((r) => rowToRecord(entity, r));
}

export async function countDirty(): Promise<number> {
  const db = await getDb();
  let total = 0;
  for (const entity of Object.keys(ENTITY_COLUMNS) as EntityName[]) {
    const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${entity} WHERE dirty = 1`);
    total += row?.n ?? 0;
  }
  return total;
}

/**
 * Clear the dirty flag after the server accepted a push — but only if the row
 * wasn't edited again while the request was in flight (same updated_at).
 */
export async function markSynced(
  entity: EntityName,
  id: string,
  pushedUpdatedAt: number,
  serverSeq: number | null,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE ${entity} SET dirty = 0, server_seq = ? WHERE id = ? AND updated_at = ?`,
    serverSeq,
    id,
    pushedUpdatedAt,
  );
}

/**
 * Merge a batch of server records using LWW. Returns the entities that changed so
 * the UI can refresh. Runs in one transaction for speed and atomicity.
 */
export async function applyRemote(
  changes: { entity: EntityName; record: Row }[],
): Promise<Set<EntityName>> {
  const db = await getDb();
  const touched = new Set<EntityName>();
  await db.withTransactionAsync(async () => {
    for (const { entity, record } of changes) {
      if (!ENTITY_COLUMNS[entity]) continue;
      const remote = rowToRecord(entity, record);
      const local = await findById(entity, remote.id);
      const decision = decideMerge(local, remote);
      if (decision === 'insert' || decision === 'overwrite') {
        await db.runAsync(upsertSql(entity), ...recordToParams(entity, remote as unknown as Row), 0);
        touched.add(entity);
      } else if (decision === 'ack') {
        await db.runAsync(
          `UPDATE ${entity} SET dirty = 0, server_seq = ? WHERE id = ?`,
          remote.server_seq,
          remote.id,
        );
      }
      // 'keep-local': our newer edit stays dirty and will be pushed next round.
    }
  });
  dataEvents.emit(touched);
  return touched;
}
