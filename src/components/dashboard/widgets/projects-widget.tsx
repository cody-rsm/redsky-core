'use client';

import { useRouter } from 'next/navigation';
import { Avatar, normalizeTone } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { useWidget } from '@/lib/client/use-widget';
import { useWorkspaceActions } from '@/lib/client/workspace-actions';
import { WidgetFrame, type WidgetSlot } from '../widget-frame';
import { WidgetBody } from '../widget-states';

export function ProjectsWidget({ slot }: { slot: WidgetSlot }) {
  const router = useRouter();
  const query = useWidget('projects');
  const { openRecord } = useWorkspaceActions();
  const sub = query.data?.status === 'ok' ? `${Math.min(query.data.data.projects.length, slot.itemLimit)} active` : undefined;
  return (
    <WidgetFrame slot={slot} sub={sub} more={{ label: 'Projects', onClick: () => router.push('/m/projects') }}>
      <WidgetBody query={query} rows={3}>
        {(data) => (
          <div className="wb">
            {data.projects.length === 0 ? <div className="empty">No active projects.</div> : null}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(270px,100%),1fr))', gap: 8, padding: '0 6px' }}>
              {data.projects.slice(0, slot.itemLimit).map((project) => (
                <article key={project.id} className="pc">
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div className="grow">
                      <button type="button" className="rel" style={{ fontSize: 13.5 }} onClick={() => openRecord('project', project.id)}>
                        {project.name}
                      </button>
                      <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span className="chip">{project.kind}</span>
                      </div>
                    </div>
                    <span className={`status st-${project.tone}`}>
                      <span className="dot" />
                      {project.status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="bar grow" style={{ height: 5 }} role="img" aria-label={`${project.pct}% complete`}>
                      <span style={{ width: `${project.pct}%` }} />
                    </span>
                    <span className="faint num" style={{ fontSize: 11.5 }}>
                      {project.pct}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }} className="muted">
                      <Icon name="activity" size="s" style={{ marginTop: 1 }} />
                      <span>{project.activity}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <Icon name="flag" size="s" className="faint" style={{ marginTop: 1 }} />
                      <span>
                        <span style={{ fontWeight: 500 }}>{project.milestone}</span>
                        <span className="faint"> · {project.milestoneDate}</span>
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 4 }}>
                    <Avatar initials={project.owner.initials} tone={normalizeTone(project.owner.tone)} size="sm" />
                    <span className="faint ell grow" style={{ fontSize: 12 }}>
                      {project.owner.name}
                    </span>
                    <span className={project.tone === 'ac' ? 'chip chip-ac' : 'chip'}>
                      {project.openTasks} {project.openTasks === 1 ? 'task needs attention' : 'tasks need attention'}
                    </span>
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
