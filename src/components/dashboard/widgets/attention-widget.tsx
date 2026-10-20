'use client';

import { useRouter } from 'next/navigation';
import { Icon, type IconName } from '@/components/ui/icon';
import type { TaskGroup } from '@/features/preferences/schema';
import { TASK_GROUP_LABELS } from '@/features/preferences/schema';
import type { AttentionItemView } from '@/lib/api/contracts';
import { describeDue, type DueDisplay } from '@/lib/dates/due';
import { useUiStore } from '@/lib/client/ui-store';
import { useViewer } from '@/lib/client/viewer';
import { dayContext } from '@/lib/client/viewer-display';
import { useWidget } from '@/lib/client/use-widget';
import { useWorkspaceActions } from '@/lib/client/workspace-actions';
import { WidgetFrame, type WidgetSlot } from '../widget-frame';
import { WidgetBody } from '../widget-states';

const PRIORITY_RANK: Record<AttentionItemView['priority'], number> = { high: 0, med: 1, low: 2 };
const PRIORITY_LABEL: Record<AttentionItemView['priority'], string> = { high: 'High priority', med: 'Medium priority', low: 'Low priority' };
const AI_ACTIONS = new Set<AttentionItemView['action']>(['draft', 'summarize', 'prep']);

type AttentionRow = AttentionItemView & { dueView: DueDisplay; focus: boolean };

// Ported from the prototype's attention sort: open before done, then by the employee's task grouping.
export function sortAttention(items: ReadonlyArray<AttentionItemView>, group: TaskGroup, todayIso: string): AttentionRow[] {
  const rows = items.map((item) => ({ ...item, dueView: item.due.kind === 'date' ? describeDue(item.due.on, todayIso) : { label: item.due.label, tone: item.due.tone, rank: item.due.rank }, focus: false }));
  rows.sort((a, b) => {
    const done = Number(a.done) - Number(b.done);
    if (done) return done;
    const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    const due = a.dueView.rank - b.dueView.rank;
    if (group === 'due') return due || priority;
    if (group === 'relationship') return a.related.label.localeCompare(b.related.label) || priority;
    return priority || due;
  });
  let focusLeft = group === 'top3' ? 3 : 0;
  for (const row of rows) {
    row.focus = !row.done && focusLeft > 0;
    if (row.focus) focusLeft -= 1;
  }
  return rows;
}

export function AttentionWidget({ slot }: { slot: WidgetSlot }) {
  const viewer = useViewer();
  const router = useRouter();
  const query = useWidget('attention');
  const group = viewer.preferences.taskGroup;
  const rows = query.data?.status === 'ok' ? sortAttention(query.data.data.items, group, dayContext(viewer).todayIso) : [];
  const openCount = rows.filter((row) => !row.done).length;
  const sub = query.data?.status === 'ok' ? `${openCount} open${group !== 'priority' ? ` · ${TASK_GROUP_LABELS[group].replace('By ', 'by ')}` : ''}` : undefined;

  return (
    <WidgetFrame slot={slot} sub={sub} more={{ label: 'View all', onClick: () => router.push('/home?tab=tasks') }}>
      <WidgetBody query={query} rows={4}>
        {() => <AttentionList rows={rows} slot={slot} />}
      </WidgetBody>
    </WidgetFrame>
  );
}

function AttentionList({ rows, slot }: { rows: AttentionRow[]; slot: WidgetSlot }) {
  const viewer = useViewer();
  const router = useRouter();
  const shown = rows.slice(0, slot.itemLimit);
  const openCount = rows.filter((row) => !row.done).length;
  const doneCount = rows.length - openCount;
  const overdue = rows.filter((row) => !row.done && /overdue/.test(row.dueView.label)).length;
  const completedLabel = viewer.demo ? 'completed today' : 'completed';
  return (
    <>
      <div className="wb">
        {shown.map((row) => (
          <AttentionRowView key={row.key} row={row} />
        ))}
        {shown.length === 0 ? (
          <div className="empty">
            <span className="tile" style={{ color: 'var(--ok)' }}>
              <Icon name="check" />
            </span>
            <div style={{ fontWeight: 600, color: 'var(--tx)' }}>You’re all caught up</div>
            <div style={{ fontSize: 12.5 }}>New follow-ups and requests will appear here.</div>
          </div>
        ) : null}
      </div>
      {rows.length > 0 ? (
        <div className="wfoot">
          <span className="num">
            {openCount} open{doneCount ? ` · ${doneCount} ${completedLabel}` : ''} · {overdue} overdue
          </span>
          <div className="grow" />
          {rows.length > slot.itemLimit ? (
            <button type="button" className="link" style={{ fontSize: 12 }} onClick={() => router.push('/home?tab=tasks')}>
              View all {rows.length}
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function AttentionRowView({ row }: { row: AttentionRow }) {
  const { toggleDone, dismiss, approve, openRecord } = useWorkspaceActions();
  const { askAi, openPrep, toast } = useUiStore.getState();
  const record = row.related.record;
  const open = () => (record ? openRecord(record.kind, record.id) : toast(row.title));
  const isAi = AI_ACTIONS.has(row.action);
  const actionIcon: IconName = isAi ? 'ai' : row.action === 'approve' ? 'check' : 'arrowR';
  const actionClass = isAi ? 'btn btn-sm btn-ai' : row.action === 'approve' ? 'btn btn-sm btn-p' : 'btn btn-sm';
  const sourceIsAi = /AI|Surfaced|detected|Suggested/.test(row.sourceNote);

  const act = () => {
    if (row.ask) return void askAi(row.ask.question, { key: row.ask.key, ref: row.ask.ref });
    if (row.action === 'prep' && row.meetingId) return openPrep(row.meetingId);
    if (row.action === 'approve' && row.approval) return approve(row.approval);
    open();
  };

  return (
    <div className={row.done ? 'row done' : 'row'} style={{ flexWrap: 'wrap' }}>
      <button type="button" className="chk" role="checkbox" aria-checked={row.done} aria-label={`Mark complete: ${row.title}`} onClick={() => toggleDone(row)}>
        <Icon name="check" size="xs" strokeWidth={2.6} />
      </button>
      <div style={{ flex: '1 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="pri" data-p={row.priority} title={PRIORITY_LABEL[row.priority]} aria-label={PRIORITY_LABEL[row.priority]} role="img">
            <i />
            <i />
            <i />
          </span>
          <span className="ttl" style={{ fontWeight: 500, lineHeight: 1.35 }}>
            {row.title}
          </span>
          {row.focus ? (
            <span className="chip chip-ac" style={{ height: 18, fontSize: 10.5, flex: 'none' }}>
              Top 3
            </span>
          ) : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--tx3)', paddingLeft: 21 }}>
          <span className="chip">
            <Icon name={row.typeIcon} size="xs" />
            {row.type}
          </span>
          <button type="button" className="rel" onClick={open}>
            {row.related.label}
          </button>
          {row.sourceNote ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--ai)' }}>
              <Icon name={sourceIsAi ? 'ai' : 'doc'} size="xs" />
              {row.sourceNote}
            </span>
          ) : null}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, marginLeft: 'auto' }}>
        <span className={`due due-${row.done ? 'tx' : row.dueView.tone}`}>{row.dueView.label}</span>
        {!row.done ? (
          <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <button type="button" className="btn btn-g btn-sm btn-i hov" aria-label={`Dismiss: ${row.title}`} title="Dismiss" onClick={() => dismiss(row)}>
              <Icon name="x" size="s" />
            </button>
            <button type="button" className="btn btn-g btn-sm btn-i hov" aria-label={`Open ${row.related.label}`} title="Open" onClick={open}>
              <Icon name="arrowUR" size="s" />
            </button>
            <button type="button" className={actionClass} onClick={act}>
              <Icon name={actionIcon} size="s" />
              {row.actionLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
