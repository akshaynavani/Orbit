/**
 * Small offline parser for the quick-add box. The backend has a richer parser
 * (/nl/parse) that is used when online; this keeps quick-add useful offline.
 *
 * Understands: #tags, !high/!med/!low (or !1..!3), "today", "tonight",
 * "tomorrow", weekday names ("fri", "next monday"), "in N days", and
 * times like "at 5pm", "at 17:30".
 */
export interface ParsedTask {
  title: string;
  tags: string[];
  priority: number;
  due_at: number | null;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const PRIORITY: Record<string, number> = { low: 1, l: 1, '1': 1, med: 2, medium: 2, m: 2, '2': 2, high: 3, h: 3, '3': 3 };

export function parseQuickAdd(input: string, ref: Date = new Date()): ParsedTask {
  let text = ` ${input.trim()} `;
  const tags: string[] = [];
  let priority = 0;
  let day: Date | null = null;
  let hours: number | null = null;
  let minutes = 0;

  text = text.replace(/\s#([\w-]+)/g, (_, tag: string) => {
    tags.push(tag.toLowerCase());
    return ' ';
  });
  text = text.replace(/\s!(\w+)/g, (m, p: string) => {
    const v = PRIORITY[p.toLowerCase()];
    if (v === undefined) return m;
    priority = v;
    return ' ';
  });
  text = text.replace(/\s(?:at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?=\s)/i, (_, h: string, mm: string, ap: string) => {
    let hh = Number(h);
    if (ap?.toLowerCase() === 'pm' && hh < 12) hh += 12;
    if (ap?.toLowerCase() === 'am' && hh === 12) hh = 0;
    hours = hh;
    minutes = mm ? Number(mm) : 0;
    return ' ';
  });

  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  text = text.replace(/\s(today|tonight|tomorrow|tmrw)(?=\s)/i, (_, w: string) => {
    const lw = w.toLowerCase();
    day = startOf(ref);
    if (lw === 'tomorrow' || lw === 'tmrw') day.setDate(day.getDate() + 1);
    if (lw === 'tonight' && hours === null) hours = 20;
    return ' ';
  });
  text = text.replace(/\sin\s+(\d+)\s+(day|days|week|weeks)(?=\s)/i, (_, n: string, unit: string) => {
    day = startOf(ref);
    day.setDate(day.getDate() + Number(n) * (unit.toLowerCase().startsWith('week') ? 7 : 1));
    return ' ';
  });
  text = text.replace(/\s(?:on\s+)?(next\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*(?=\s)/i, (m, next: string, w: string) => {
    const idx = WEEKDAYS.findIndex((d) => d.startsWith(w.toLowerCase().slice(0, 3)));
    if (idx < 0) return m;
    day = startOf(ref);
    // "fri" = the coming Friday (a week out if today is Friday);
    // "next fri" = one week after that.
    let delta = (idx - ref.getDay() + 7) % 7 || 7;
    if (next) delta += 7;
    day.setDate(day.getDate() + delta);
    return ' ';
  });

  if (hours !== null && day === null) {
    day = startOf(ref);
    if (hours < ref.getHours() || (hours === ref.getHours() && minutes <= ref.getMinutes())) {
      day.setDate(day.getDate() + 1);
    }
  }
  let due_at: number | null = null;
  if (day !== null) {
    const d = day as Date;
    d.setHours(hours ?? 0, hours !== null ? minutes : 0, 0, 0);
    due_at = d.getTime();
  }

  const title = text.replace(/\s+/g, ' ').trim() || input.trim();
  return { title, tags, priority, due_at };
}
