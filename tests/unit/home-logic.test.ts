import { describe, expect, it } from 'vitest';
import { sortAttention } from '@/components/dashboard/widgets/attention-widget';
import type { AttentionItemView } from '@/lib/api/contracts';
import { dropWidgetIn, moveWidgetIn, resizeWidgetIn, toggleWidgetIn } from '@/lib/client/layout-actions';

const item = (key: string, priority: AttentionItemView['priority'], due: AttentionItemView['due'], extra: Partial<AttentionItemView> = {}): AttentionItemView => ({
  key,
  title: key,
  priority,
  type: 'Task',
  typeIcon: 'tasks',
  related: { label: extra.related?.label ?? 'General', record: null },
  due,
  action: 'open',
  actionLabel: 'Open',
  sourceNote: '',
  meetingId: null,
  approval: null,
  ask: null,
  done: false,
  ...extra,
});

describe('sortAttention', () => {
  const today = '2026-10-19';
  const items = [
    item('low-today', 'low', { kind: 'date', on: today }),
    item('high-later', 'high', { kind: 'date', on: '2026-10-28' }),
    item('done-high', 'high', { kind: 'date', on: today }, { done: true }),
    item('med-overdue', 'med', { kind: 'date', on: '2026-10-10' }),
    item('high-today', 'high', { kind: 'label', label: 'Today', tone: 'ac', rank: 1 }),
  ];

  it('orders by priority, then due date, with completed items last', () => {
    expect(sortAttention(items, 'priority', today).map((row) => row.key)).toEqual(['high-today', 'high-later', 'med-overdue', 'low-today', 'done-high']);
  });

  it('orders by due date when grouped that way', () => {
    expect(sortAttention(items, 'due', today).map((row) => row.key)).toEqual(['med-overdue', 'high-today', 'low-today', 'high-later', 'done-high']);
  });

  it('flags the first three open items as Top 3', () => {
    const rows = sortAttention(items, 'top3', today);
    expect(rows.filter((row) => row.focus).map((row) => row.key)).toEqual(['high-today', 'high-later', 'med-overdue']);
    expect(sortAttention(items, 'priority', today).some((row) => row.focus)).toBe(false);
  });

  it('computes due labels from dates in the firm time zone', () => {
    const rows = sortAttention(items, 'priority', today);
    expect(rows.find((row) => row.key === 'med-overdue')?.dueView.label).toBe('9 days overdue');
  });
});

describe('layout editing', () => {
  const layout = [
    { id: 'brief', size: 12 },
    { id: 'attention', size: 8 },
    { id: 'meetings', size: 4 },
  ] as const;
  const editable = () => layout.map((entry) => ({ ...entry }));

  it('toggles widgets on and off, keeping the brief first', () => {
    expect(toggleWidgetIn(editable(), 'meetings').map((entry) => entry.id)).toEqual(['brief', 'attention']);
    expect(toggleWidgetIn(editable(), 'team').at(-1)).toEqual({ id: 'team', size: 4 });
    expect(toggleWidgetIn(toggleWidgetIn(editable(), 'brief'), 'brief')[0]).toEqual({ id: 'brief', size: 12 });
  });

  it('moves, resizes and drops widgets', () => {
    expect(moveWidgetIn(editable(), 'meetings', -1).map((entry) => entry.id)).toEqual(['brief', 'meetings', 'attention']);
    expect(moveWidgetIn(editable(), 'brief', -1)).toEqual(editable());
    expect(resizeWidgetIn(editable(), 'attention', 12)[1]).toEqual({ id: 'attention', size: 12 });
    expect(dropWidgetIn(editable(), 'meetings', 'brief').map((entry) => entry.id)).toEqual(['meetings', 'brief', 'attention']);
  });
});
