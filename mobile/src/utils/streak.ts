import { addDays, dayKey, parseDayKey, weekKey } from './time';

export interface DayCount {
  day: string;
  count: number;
}

/**
 * Current streak in periods (days or weeks) where the target was met. The current
 * period counts if already met, but an unfinished current period doesn't break it.
 */
export function currentStreak(
  logs: DayCount[],
  frequency: 'daily' | 'weekly',
  target: number,
  today: Date = new Date(),
): number {
  const totals = new Map<string, number>();
  for (const { day, count } of logs) {
    const key = frequency === 'daily' ? day : weekKey(parseDayKey(day));
    totals.set(key, (totals.get(key) ?? 0) + count);
  }
  const step = frequency === 'daily' ? 1 : 7;
  const keyOf = (d: Date) => (frequency === 'daily' ? dayKey(d) : weekKey(d));

  let cursor = today;
  let streak = 0;
  if ((totals.get(keyOf(cursor)) ?? 0) >= target) streak += 1;
  cursor = addDays(cursor, -step);
  while ((totals.get(keyOf(cursor)) ?? 0) >= target) {
    streak += 1;
    cursor = addDays(cursor, -step);
  }
  return streak;
}

/** Progress for the period containing `today`. */
export function periodProgress(
  logs: DayCount[],
  frequency: 'daily' | 'weekly',
  today: Date = new Date(),
): number {
  if (frequency === 'daily') {
    const key = dayKey(today);
    return logs.filter((l) => l.day === key).reduce((s, l) => s + l.count, 0);
  }
  const wk = weekKey(today);
  return logs.filter((l) => weekKey(parseDayKey(l.day)) === wk).reduce((s, l) => s + l.count, 0);
}
