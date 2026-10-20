// Date-only helpers for task due dates (ISO "YYYY-MM-DD"). Pure functions so client and server agree.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;

export function todayIn(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function toUtcMs(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromUtcMs(toUtcMs(iso) + days * DAY_MS);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toUtcMs(toIso) - toUtcMs(fromIso)) / DAY_MS);
}

// Friday of the current week (or next Friday once the week's Friday has passed).
function endOfWeek(today: string, weeksAhead: number): string {
  const weekday = new Date(toUtcMs(today)).getUTCDay();
  const untilFriday = (5 - weekday + 7) % 7;
  return addDays(today, untilFriday + weeksAhead * 7);
}

// Resolves the due phrases RedSky uses ("Today", "Tomorrow", "This week", "Next week", "Oct 21",
// "3 days overdue") to a date. Unknown phrases resolve to null (no due date) rather than a guess.
export function resolveDueLabel(label: string | undefined, today: string): string | null {
  if (!label) return null;
  const text = label.trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (text.startsWith('today') || text.includes('overdue')) return today;
  if (text.startsWith('tomorrow')) return addDays(today, 1);
  if (text === 'this week') return endOfWeek(today, 0);
  if (text === 'next week') return endOfWeek(today, 1);
  const match = text.match(/^([a-z]{3})[a-z]*\s+(\d{1,2})$/);
  if (match) {
    const month = MONTHS.findIndex((name) => name.toLowerCase() === match[1]);
    if (month < 0) return null;
    const year = Number(today.slice(0, 4));
    let candidate = `${year}-${String(month + 1).padStart(2, '0')}-${String(Number(match[2])).padStart(2, '0')}`;
    if (daysBetween(today, candidate) < -60) candidate = `${year + 1}${candidate.slice(4)}`;
    return candidate;
  }
  return null;
}

export type DueDisplay = { label: string; tone: 'ac' | 'wn' | 'tx'; rank: number };

// Prototype conventions: overdue/today in accent, tomorrow in warning, later dates neutral.
export function describeDue(dueOn: string | null, today: string): DueDisplay {
  if (!dueOn) return { label: 'No due date', tone: 'tx', rank: 4 };
  const diff = daysBetween(today, dueOn);
  if (diff < 0) return { label: `${-diff} ${diff === -1 ? 'day' : 'days'} overdue`, tone: 'ac', rank: 0 };
  if (diff === 0) return { label: 'Today', tone: 'ac', rank: 1 };
  if (diff === 1) return { label: 'Tomorrow', tone: 'wn', rank: 2 };
  const date = new Date(toUtcMs(dueOn));
  return { label: `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`, tone: 'tx', rank: 3 };
}

export function formatDayLabel(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'long', day: 'numeric' }).format(now);
}

export function greetingFor(timeZone: string, now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(now));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
