'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/dialog';
import { Icon, type IconName } from '@/components/ui/icon';
import { Kbd } from '@/components/ui/kbd';
import { hrefForNav, NAV_GROUPS } from '@/features/navigation/catalog';
import type { SearchResponse, SearchResult } from '@/lib/api/contracts';
import { apiFetch } from '@/lib/client/api';
import { queryKeys } from '@/lib/client/query-client';
import { useUiStore } from '@/lib/client/ui-store';
import { useUpdatePreferences, useViewer } from '@/lib/client/viewer';
import { useWidget } from '@/lib/client/use-widget';
import { useWorkspaceActions } from '@/lib/client/workspace-actions';
import { cn } from '@/lib/utils/cn';

type PaletteItem = { id: string; label: string; sub: string; icon: IconName; hint: string; ai?: boolean; run: () => void };
type PaletteGroup = { label: string; items: PaletteItem[] };

const GROUP_LABELS: Record<SearchResult['kind'], string> = { person: 'People', company: 'Companies', deal: 'Deals', project: 'Projects', meeting: 'Meetings', document: 'Documents', task: 'My Tasks' };
const GROUP_ORDER: ReadonlyArray<SearchResult['kind']> = ['person', 'company', 'deal', 'project', 'meeting', 'document', 'task'];
const HINT: Record<SearchResult['kind'], string> = { person: 'Person', company: 'Company', deal: 'Deal', project: 'Project', meeting: 'Meeting', document: 'Document', task: 'Task' };

export function CommandPalette() {
  const open = useUiStore((state) => state.paletteOpen);
  const close = useUiStore((state) => state.closePalette);
  return (
    <Modal open={open} onOpenChange={(next) => !next && close()} label="Search and commands" zIndex={70}>
      {open ? <PaletteBody onClose={close} /> : null}
    </Modal>
  );
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const viewer = useViewer();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const deferredQuery = useDeferredValue(query.trim());
  const { askAi, setAiOpen, openPrep, openCreate, setCustomizing } = useUiStore.getState();
  const { openRecord } = useWorkspaceActions();
  const updatePreferences = useUpdatePreferences();
  const meetings = useWidget('meetings');
  const search = useQuery({
    queryKey: queryKeys.search(deferredQuery),
    queryFn: ({ signal }) => apiFetch<SearchResponse>(`/api/search?q=${encodeURIComponent(deferredQuery)}`, { signal }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  const groups = useMemo<PaletteGroup[]>(() => {
    const dark = viewer.preferences.theme === 'dark';
    const nextMeeting = meetings.data?.status === 'ok' ? meetings.data.data.meetings[0] : undefined;
    const actions: PaletteItem[] = [
      { id: 'ask', label: 'Ask RedSky AI', sub: 'Open the assistant', icon: 'ai', hint: '⌘J', ai: true, run: run(() => setAiOpen(true)) },
      ...(nextMeeting ? [{ id: 'prep', label: 'Prepare for my next meeting', sub: nextMeeting.title, icon: 'calendar' as const, hint: 'AI', ai: true, run: run(() => openPrep(nextMeeting.id)) }] : []),
      { id: 'task', label: 'Create task', sub: '', icon: 'tasks', hint: 'Action', run: run(() => openCreate('task')) },
      { id: 'meeting', label: 'Log meeting', sub: '', icon: 'calendar', hint: 'Action', run: run(() => openCreate('meeting')) },
      { id: 'contact', label: 'Add contact', sub: '', icon: 'user', hint: 'Action', run: run(() => openCreate('contact')) },
      { id: 'opportunity', label: 'Add opportunity', sub: '', icon: 'pipeline', hint: 'Action', run: run(() => openCreate('opportunity')) },
      { id: 'document', label: 'Upload document', sub: '', icon: 'upload', hint: 'Action', run: run(() => openCreate('document')) },
      { id: 'customize', label: 'Customize home page', sub: '', icon: 'layout', hint: 'Action', run: run(() => { router.push('/home'); setCustomizing(true); }) },
      { id: 'theme', label: dark ? 'Switch to light mode' : 'Switch to dark mode', sub: '', icon: dark ? 'sun' : 'moon', hint: 'Appearance', run: run(() => updatePreferences.mutate({ theme: dark ? 'light' : 'dark' })) },
      { id: 'settings', label: 'Open settings', sub: '', icon: 'sliders', hint: 'Settings', run: run(() => useUiStore.getState().openSettings('appearance')) },
    ];
    const resultItem = (result: SearchResult): PaletteItem => ({
      id: `${result.kind}:${result.id}`,
      label: result.label,
      sub: result.sub,
      icon: result.icon,
      hint: HINT[result.kind],
      run: run(() => openRecord(result.record.kind, result.record.id)),
    });
    if (!deferredQuery) {
      const suggested = actions.filter((action) => ['ask', 'prep', 'task', 'customize', 'theme'].includes(action.id));
      const recent = (search.data?.recent ?? []).map(resultItem);
      return [{ label: 'Suggested', items: suggested }, ...(recent.length ? [{ label: 'Recent', items: recent }] : [])];
    }
    const needle = deferredQuery.toLowerCase();
    const matches = (item: PaletteItem) => `${item.label} ${item.sub}`.toLowerCase().includes(needle);
    const results = search.data?.results ?? [];
    const pages: PaletteItem[] = NAV_GROUPS.flatMap((group) =>
      group.items.map((item) => ({
        id: `go:${item.id}`,
        label: item.label,
        sub: group.label,
        icon: item.icon,
        hint: 'Go to',
        run: run(() => {
          const href = hrefForNav(item.id);
          if (href) router.push(href);
          else if (item.id === 'ai') setAiOpen(true);
        }),
      })),
    );
    return [
      { label: 'Ask RedSky', items: [{ id: 'ask-query', label: `Ask RedSky: “${deferredQuery}”`, sub: '', icon: 'ai' as const, hint: '↵', ai: true, run: run(() => void askAi(deferredQuery)) }] },
      ...GROUP_ORDER.map((kind) => ({ label: GROUP_LABELS[kind], items: results.filter((result) => result.kind === kind).map(resultItem) })),
      { label: 'Actions', items: actions.filter(matches).slice(0, 5) },
      { label: 'Go to', items: pages.filter(matches).slice(0, 4) },
    ].filter((group) => group.items.length > 0);
    // `run` closes over stable store actions; recomputing on its identity would only add churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredQuery, search.data, meetings.data, viewer.preferences.theme]);

  const flat = groups.flatMap((group) => group.items);
  const empty = Boolean(deferredQuery) && flat.length <= 1 && !search.isFetching;
  const clampedIndex = Math.min(activeIndex, Math.max(flat.length - 1, 0));

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (flat.length ? (index + 1) % flat.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (flat.length ? (index - 1 + flat.length) % flat.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      flat[clampedIndex]?.run();
    }
  }

  let flatIndex = -1;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px 0 16px', borderBottom: '1px solid var(--bd)' }}>
        <Icon name="search" size="l" className="faint" />
        <input
          className="pal-in"
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search people, companies, deals, projects — or type a command"
          aria-label="Search RedSky"
          autoComplete="off"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-results"
          aria-activedescendant={flat[clampedIndex] ? `pal-${flat[clampedIndex]?.id}` : undefined}
        />
        <Kbd>esc</Kbd>
      </div>
      <div className="scroll" id="palette-results" role="listbox" aria-label="Results" style={{ maxHeight: 'min(460px,58vh)', padding: '4px 6px 8px' }}>
        {groups.map((group) => (
          <div key={group.label} role="group" aria-label={group.label}>
            <div className="lbl" style={{ padding: '12px 10px 4px' }}>
              {group.label}
            </div>
            {group.items.map((item) => {
              flatIndex += 1;
              const index = flatIndex;
              return (
                <button
                  key={item.id}
                  id={`pal-${item.id}`}
                  type="button"
                  role="option"
                  aria-selected={index === clampedIndex}
                  className="mi"
                  data-active={index === clampedIndex}
                  onClick={item.run}
                  onMouseMove={() => index !== clampedIndex && setActiveIndex(index)}
                >
                  <span className={cn('tile tile-s', item.ai && 'tile-ai')}>
                    <Icon name={item.icon} size="s" />
                  </span>
                  <span className="grow" style={{ display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0 }}>
                    <span className="ell" style={{ flex: 'none', maxWidth: '70%' }}>
                      {item.label}
                    </span>
                    <span className="faint ell" style={{ fontSize: 12 }}>
                      {item.sub}
                    </span>
                  </span>
                  <span className="faint" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                    {item.hint}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
        {empty ? (
          <div className="empty" style={{ fontSize: 13 }}>
            No matching records you can access.
          </div>
        ) : null}
      </div>
      <div className="faint" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 14px', borderTop: '1px solid var(--bd)', fontSize: 11.5, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>Navigate
        </span>
        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          <Kbd>↵</Kbd>Open
        </span>
        <span className="hide-sm" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          <Kbd>⌘</Kbd>
          <Kbd>J</Kbd>Ask RedSky
        </span>
        <div className="grow" />
        <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
          <Icon name="lock" size="xs" />
          Only records you’re authorized to access
        </span>
      </div>
    </>
  );
}
