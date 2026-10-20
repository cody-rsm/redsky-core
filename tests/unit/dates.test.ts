import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, describeDue, formatDayLabel, greetingFor, resolveDueLabel, todayIn } from '@/lib/dates/due';

describe('due dates', () => {
  const today = '2026-10-19'; // a Monday

  it('resolves the phrases RedSky uses', () => {
    expect(resolveDueLabel('Today', today)).toBe(today);
    expect(resolveDueLabel('Tomorrow', today)).toBe('2026-10-20');
    expect(resolveDueLabel('This week', today)).toBe('2026-10-23');
    expect(resolveDueLabel('Next week', today)).toBe('2026-10-30');
    expect(resolveDueLabel('Oct 21', today)).toBe('2026-10-21');
    expect(resolveDueLabel('3 days overdue', today)).toBe(today);
  });

  it('rolls month-day labels far in the past into next year', () => {
    expect(resolveDueLabel('Jan 5', today)).toBe('2027-01-05');
  });

  it('returns null rather than guessing', () => {
    expect(resolveDueLabel('whenever', today)).toBeNull();
    expect(resolveDueLabel(undefined, today)).toBeNull();
  });

  it('describes due dates with prototype tones', () => {
    expect(describeDue('2026-10-15', today)).toEqual({ label: '4 days overdue', tone: 'ac', rank: 0 });
    expect(describeDue(today, today)).toMatchObject({ label: 'Today', tone: 'ac' });
    expect(describeDue('2026-10-20', today)).toMatchObject({ label: 'Tomorrow', tone: 'wn' });
    expect(describeDue('2026-10-28', today)).toMatchObject({ label: 'Oct 28', tone: 'tx' });
    expect(describeDue(null, today)).toMatchObject({ label: 'No due date', rank: 4 });
  });

  it('does date arithmetic across month and DST boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
  });

  it('formats the day and greeting in the firm time zone', () => {
    const lateEvening = new Date('2026-10-20T01:30:00Z'); // 9:30 PM in New York on Oct 19
    expect(todayIn('America/New_York', lateEvening)).toBe('2026-10-19');
    expect(formatDayLabel('America/New_York', lateEvening)).toBe('Monday, October 19');
    expect(greetingFor('America/New_York', lateEvening)).toBe('Good evening');
    expect(greetingFor('America/New_York', new Date('2026-10-19T13:00:00Z'))).toBe('Good morning');
  });
});
