import * as SQLite from 'expo-sqlite';

import { ENTITIES, MIGRATIONS } from './schema';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
    });
    version += 1;
    await db.execAsync(`PRAGMA user_version = ${version};`);
  }
}

/** Lazily opens and migrates the local database (singleton). */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('orbit.db');
      await migrate(db);
      return db;
    })();
  }
  return dbPromise;
}

// ---- key/value metadata (sync cursor, device id, ...) ----------------------

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM sync_meta WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string | null): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

/** Wipes all local data, e.g. when a different user logs in. */
export async function resetLocalData(): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const entity of ENTITIES) {
      await db.runAsync(`DELETE FROM ${entity}`);
    }
    await db.runAsync("DELETE FROM sync_meta WHERE key != 'device_id'");
  });
}
