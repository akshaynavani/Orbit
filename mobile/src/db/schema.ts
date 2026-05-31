import { EntityName } from '../types';

export type ColumnType = 'text' | 'int' | 'bool';

/**
 * Local column definitions per entity. The same table shape as the server plus a
 * `dirty` flag (1 = changed locally and not yet acknowledged by the server).
 * Generic repository code uses this map to build SQL and to convert SQLite's
 * 0/1 integers back into booleans.
 */
const SYNC_COLUMNS: Record<string, ColumnType> = {
  id: 'text',
  created_at: 'int',
  updated_at: 'int',
  deleted: 'bool',
  device_id: 'text',
  server_seq: 'int',
};

export const ENTITY_COLUMNS: Record<EntityName, Record<string, ColumnType>> = {
  tasks: {
    ...SYNC_COLUMNS,
    title: 'text',
    notes: 'text',
    due_at: 'int',
    priority: 'int',
    tags: 'text',
    completed: 'bool',
    completed_at: 'int',
  },
  habits: {
    ...SYNC_COLUMNS,
    name: 'text',
    frequency: 'text',
    target_per_period: 'int',
    color: 'text',
    archived: 'bool',
  },
  habit_logs: {
    ...SYNC_COLUMNS,
    habit_id: 'text',
    day: 'text',
    count: 'int',
  },
  notes: {
    ...SYNC_COLUMNS,
    title: 'text',
    body: 'text',
    pinned: 'bool',
  },
  lists: {
    ...SYNC_COLUMNS,
    name: 'text',
    color: 'text',
    sort_order: 'int',
  },
  list_items: {
    ...SYNC_COLUMNS,
    list_id: 'text',
    text: 'text',
    checked: 'bool',
    sort_order: 'int',
  },
};

export const ENTITIES = Object.keys(ENTITY_COLUMNS) as EntityName[];

/** Push order: parents before children so the server sees lists before their items. */
export const PUSH_ORDER: EntityName[] = ['lists', 'list_items', 'habits', 'habit_logs', 'tasks', 'notes'];

function createTableSql(entity: EntityName): string {
  const cols = Object.entries(ENTITY_COLUMNS[entity]).map(([name, type]) => {
    if (name === 'id') return 'id TEXT PRIMARY KEY NOT NULL';
    const sqlType = type === 'text' ? 'TEXT' : 'INTEGER';
    return `${name} ${sqlType}`;
  });
  cols.push('dirty INTEGER NOT NULL DEFAULT 0');
  return `CREATE TABLE IF NOT EXISTS ${entity} (${cols.join(', ')});`;
}

/** Ordered migrations; index + 1 is the schema version stored in PRAGMA user_version. */
export const MIGRATIONS: string[] = [
  [
    ...ENTITIES.map(createTableSql),
    'CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT);',
    'CREATE INDEX IF NOT EXISTS idx_tasks_dirty ON tasks (dirty);',
    'CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks (completed, due_at);',
    'CREATE INDEX IF NOT EXISTS idx_habit_logs_habit ON habit_logs (habit_id, day);',
    'CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items (list_id, sort_order);',
  ].join('\n'),
];
