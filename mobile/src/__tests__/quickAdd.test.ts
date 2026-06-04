import { parseQuickAdd } from '../utils/quickAdd';

// Thursday 8 Oct 2026, 10:00 local time
const REF = new Date(2026, 9, 8, 10, 0, 0);

describe('parseQuickAdd', () => {
  it('extracts tags and priority', () => {
    const r = parseQuickAdd('Ship release #work #urgent !high', REF);
    expect(r.title).toBe('Ship release');
    expect(r.tags).toEqual(['work', 'urgent']);
    expect(r.priority).toBe(3);
    expect(r.due_at).toBeNull();
  });

  it('understands tomorrow at 5pm', () => {
    const r = parseQuickAdd('Call mom tomorrow at 5pm', REF);
    expect(r.title).toBe('Call mom');
    expect(new Date(r.due_at!)).toEqual(new Date(2026, 9, 9, 17, 0));
  });

  it('rolls a past time over to the next day', () => {
    const r = parseQuickAdd('Standup at 9am', REF);
    expect(new Date(r.due_at!)).toEqual(new Date(2026, 9, 9, 9, 0));
  });

  it('resolves weekday names', () => {
    expect(new Date(parseQuickAdd('Groceries fri', REF).due_at!)).toEqual(new Date(2026, 9, 9));
    expect(new Date(parseQuickAdd('Groceries next friday', REF).due_at!)).toEqual(new Date(2026, 9, 16));
    expect(new Date(parseQuickAdd('Retro thursday', REF).due_at!)).toEqual(new Date(2026, 9, 15));
  });

  it('does not treat words that start like weekdays as dates', () => {
    const r = parseQuickAdd('Call friend about monitor', REF);
    expect(r.title).toBe('Call friend about monitor');
    expect(r.due_at).toBeNull();
  });

  it('handles relative day offsets', () => {
    expect(new Date(parseQuickAdd('Renew passport in 3 days', REF).due_at!)).toEqual(new Date(2026, 9, 11));
  });
});
