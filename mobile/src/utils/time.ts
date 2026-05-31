export const now = (): number => Date.now();

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** Monday-based start of week, as a day key. */
export function weekKey(date: Date): string {
  const offset = (date.getDay() + 6) % 7;
  return dayKey(addDays(date, -offset));
}

export function formatDue(ms: number | null, ref: Date = new Date()): string {
  if (ms == null) return '';
  const due = new Date(ms);
  const diffDays = Math.round(
    (parseDayKey(dayKey(due)).getTime() - parseDayKey(dayKey(ref)).getTime()) / 86_400_000,
  );
  const hasTime = due.getHours() !== 0 || due.getMinutes() !== 0;
  const time = hasTime ? ` ${pad(due.getHours())}:${pad(due.getMinutes())}` : '';
  if (diffDays === 0) return `Today${time}`;
  if (diffDays === 1) return `Tomorrow${time}`;
  if (diffDays === -1) return `Yesterday${time}`;
  return `${due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}${time}`;
}
