import { Habit, HabitLog } from '../../types';
import { habitLogId } from '../../utils/id';
import { addDays, dayKey } from '../../utils/time';
import { findById, insert, query, remove, update } from '../repository';

export const HabitsRepo = {
  list(): Promise<Habit[]> {
    return query('habits', 'archived = 0', [], 'created_at ASC');
  },

  create(input: { name: string; frequency?: 'daily' | 'weekly'; target_per_period?: number; color?: string }) {
    return insert('habits', {
      name: input.name.trim(),
      frequency: input.frequency ?? 'daily',
      target_per_period: input.target_per_period ?? 1,
      color: input.color ?? '#6C5CE7',
      archived: false,
    });
  },

  archive(id: string) {
    return update('habits', id, { archived: true });
  },

  remove(id: string) {
    return remove('habits', id);
  },

  /** Logs for the last `days` days, used for streaks and the history strip. */
  recentLogs(habitId: string, days = 120): Promise<HabitLog[]> {
    const since = dayKey(addDays(new Date(), -days));
    return query('habit_logs', 'habit_id = ? AND day >= ?', [habitId, since], 'day ASC');
  },

  /** Increment (or decrement with delta < 0) today's count for a habit. */
  async checkIn(habitId: string, delta = 1, day: string = dayKey()): Promise<void> {
    const id = habitLogId(habitId, day);
    const existing = await findById('habit_logs', id);
    if (!existing) {
      if (delta > 0) await insert('habit_logs', { habit_id: habitId, day, count: delta }, id);
      return;
    }
    const base = existing.deleted ? 0 : existing.count;
    // Un-checking to zero keeps the row (count 0) rather than tombstoning it, and a
    // previously tombstoned log is revived, so the deterministic id stays stable.
    await update('habit_logs', id, { count: Math.max(0, base + delta), deleted: false });
  },
};
