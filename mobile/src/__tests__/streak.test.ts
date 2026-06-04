import { currentStreak, periodProgress } from '../utils/streak';

const TODAY = new Date(2026, 9, 8); // Thursday

describe('habit streaks', () => {
  it('counts consecutive daily completions', () => {
    const logs = [
      { day: '2026-10-06', count: 1 },
      { day: '2026-10-07', count: 1 },
      { day: '2026-10-08', count: 1 },
    ];
    expect(currentStreak(logs, 'daily', 1, TODAY)).toBe(3);
  });

  it('does not break the streak for an unfinished today', () => {
    const logs = [
      { day: '2026-10-06', count: 1 },
      { day: '2026-10-07', count: 1 },
    ];
    expect(currentStreak(logs, 'daily', 1, TODAY)).toBe(2);
  });

  it('respects targets and weekly periods', () => {
    const logs = [
      { day: '2026-09-29', count: 2 },
      { day: '2026-10-01', count: 1 },
      { day: '2026-10-06', count: 3 },
    ];
    expect(currentStreak(logs, 'weekly', 3, TODAY)).toBe(2);
    expect(periodProgress(logs, 'weekly', TODAY)).toBe(3);
  });
});
