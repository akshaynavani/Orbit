export type EntityName = 'tasks' | 'habits' | 'habit_logs' | 'notes' | 'lists' | 'list_items';

/** Columns every synced record carries (mirrors backend SyncMixin). */
export interface SyncFields {
  id: string;
  created_at: number;
  updated_at: number;
  deleted: boolean;
  device_id: string | null;
  server_seq: number | null;
}

export interface Task extends SyncFields {
  title: string;
  notes: string | null;
  due_at: number | null;
  priority: number; // 0 none, 1 low, 2 medium, 3 high
  tags: string; // comma separated
  completed: boolean;
  completed_at: number | null;
}

export interface Habit extends SyncFields {
  name: string;
  frequency: 'daily' | 'weekly';
  target_per_period: number;
  color: string;
  archived: boolean;
}

export interface HabitLog extends SyncFields {
  habit_id: string;
  day: string; // YYYY-MM-DD
  count: number;
}

export interface Note extends SyncFields {
  title: string;
  body: string;
  pinned: boolean;
}

export interface OrbitList extends SyncFields {
  name: string;
  color: string;
  sort_order: number;
}

export interface ListItem extends SyncFields {
  list_id: string;
  text: string;
  checked: boolean;
  sort_order: number;
}

export interface EntityTypes {
  tasks: Task;
  habits: Habit;
  habit_logs: HabitLog;
  notes: Note;
  lists: OrbitList;
  list_items: ListItem;
}

export type AnyRecord = EntityTypes[EntityName];

/** Fields the caller provides when creating/updating; sync columns are managed by the repo. */
export type Editable<T extends SyncFields> = Omit<T, keyof SyncFields>;
