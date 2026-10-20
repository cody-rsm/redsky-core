'use client';

import { useRouter } from 'next/navigation';
import { Avatar, normalizeTone } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { useUiStore } from '@/lib/client/ui-store';
import { useWidget } from '@/lib/client/use-widget';
import { useWorkspaceActions } from '@/lib/client/workspace-actions';
import { strengthTone } from '../strength';
import { WidgetFrame, type WidgetSlot } from '../widget-frame';
import { WidgetBody } from '../widget-states';

export function RelationshipsWidget({ slot }: { slot: WidgetSlot }) {
  const router = useRouter();
  const query = useWidget('relationships');
  const askAi = useUiStore((state) => state.askAi);
  const { openRecord } = useWorkspaceActions();
  const sub = query.data?.status === 'ok' ? `${query.data.data.people.length} suggested` : undefined;
  return (
    <WidgetFrame slot={slot} sub={sub} more={{ label: 'People', onClick: () => router.push('/people') }}>
      <WidgetBody query={query} rows={3}>
        {(data) => (
          <div className="wb">
            {data.people.length === 0 ? <div className="empty">No reconnect suggestions right now.</div> : null}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(270px,100%),1fr))', gap: 8, padding: '0 6px' }}>
              {data.people.slice(0, slot.itemLimit).map((person) => (
                <article key={person.id} className="rc">
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <Avatar initials={person.initials} tone={normalizeTone(person.tone)} size="lg" />
                    <div className="grow">
                      <button type="button" className="rel" style={{ fontSize: 13.5 }} onClick={() => openRecord('contact', person.id)}>
                        {person.name}
                      </button>
                      <div className="faint ell" style={{ fontSize: 12, marginTop: 2 }}>
                        {person.title} · {person.org}
                      </div>
                    </div>
                    {person.strength ? <span className={`chip ${strengthTone(person.strength)}`}>{person.strength}</span> : null}
                  </div>
                  <dl className="kv">
                    <dt>Last interaction</dt>
                    <dd>{person.lastInteraction}</dd>
                    <dt>Owner</dt>
                    <dd>{person.owner}</dd>
                  </dl>
                  {person.recordedFact ? (
                    <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                      <span className="rec-tag" style={{ marginRight: 6 }}>
                        <Icon name="doc" size="xs" />
                        Recorded
                      </span>
                      {person.recordedFact}
                    </div>
                  ) : null}
                  {person.suggestion ? (
                    <div className="ai-box">
                      <span className="ai-tag" style={{ display: 'flex', marginBottom: 3 }}>
                        <Icon name="ai" size="xs" />
                        Suggested next step
                      </span>
                      {person.suggestion}
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                    <button type="button" className="btn btn-sm" onClick={() => openRecord('contact', person.id)}>
                      Open
                    </button>
                    <button type="button" className="btn btn-sm btn-ai" onClick={() => void askAi(`Draft a note to ${person.name}`, { key: 'draft', ref: person.id })}>
                      <Icon name="ai" size="s" />
                      Draft note
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </WidgetBody>
    </WidgetFrame>
  );
}
