'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Chip } from '@/components/ui/chip';
import { Icon, type IconName } from '@/components/ui/icon';
import { Segmented } from '@/components/ui/segmented';
import { Tile } from '@/components/ui/tile';
import { SUGGESTED_PROMPTS } from '@/features/ai/catalog';
import { actionRequiresConfirmation, type AiAnswer, type ProposedAction } from '@/features/ai/types';
import { AI_STYLES, type AiStyle } from '@/features/personalization/catalog';
import type { AiMessageView } from '@/lib/api/contracts';
import { useUiStore } from '@/lib/client/ui-store';
import { useUpdatePreferences, useViewer } from '@/lib/client/viewer';
import { viewerDisplay } from '@/lib/client/viewer-display';
import { useWorkspaceActions } from '@/lib/client/workspace-actions';

const PRODUCTION_PROMPTS: ReadonlyArray<{ q: string; icon: IconName; key?: string }> = [
  { q: 'Summarize my open tasks.', icon: 'tasks' },
  { q: 'What should I focus on today?', icon: 'target' },
  { q: 'Turn my open tasks into a plan for this week.', icon: 'calendar' },
  { q: 'What can RedSky AI see right now?', icon: 'shield' },
];

const SOURCE_ICON: Record<string, IconName> = { contact: 'user', deal: 'pipeline', project: 'folder', meeting: 'calendar', doc: 'doc', company: 'company', task: 'tasks' };

export function AiPanel() {
  const open = useUiStore((state) => state.aiOpen);
  if (!open) return null;
  return <AiPanelBody />;
}

function AiPanelBody() {
  const viewer = useViewer();
  const display = viewerDisplay(viewer);
  const ai = useUiStore((state) => state.ai);
  const { setAiOpen, askAi, resetAi } = useUiStore.getState();
  const updatePreferences = useUpdatePreferences();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const simulated = viewer.config.aiSimulated;
  const available = viewer.config.aiAvailable;

  // Keep the latest answer in view as messages arrive (DOM synchronization, not state).
  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [ai.messages.length, ai.pendingQuestion]);

  function send() {
    const question = input.trim();
    if (!question || ai.pendingQuestion) return;
    setInput('');
    void askAi(question);
  }

  const empty = ai.messages.length === 0 && !ai.pendingQuestion;
  const contextChips = simulated
    ? [
        { label: 'Calendar · sample data', ok: false },
        { label: 'Email · sample data', ok: false },
        { label: 'SharePoint · sample data', ok: false },
        { label: 'Teams · sample data', ok: false },
        { label: 'RedSky CRM', ok: true },
      ]
    : [
        { label: 'Your RedSky tasks', ok: true },
        { label: 'Calendar · not connected', ok: false },
        { label: 'Email · not connected', ok: false },
        { label: viewer.config.crmConnected ? 'RSM CRM' : 'CRM · not connected', ok: viewer.config.crmConnected },
      ];

  return (
    <aside className="aip a-slide" aria-label="RedSky AI">
      <header style={{ height: 56, display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px 0 16px', borderBottom: '1px solid var(--bd)', flex: 'none' }}>
        <Tile icon="ai" small ai />
        <div className="grow" style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          <span style={{ fontWeight: 600 }}>RedSky AI</span>
          <span className="faint" style={{ fontSize: 11 }}>
            {simulated ? 'Simulated responses · demo mode' : available ? 'Answers from your RedSky data' : 'Not configured'}
          </span>
        </div>
        <button type="button" className="btn btn-g btn-sm btn-i" aria-label="New conversation" title="New conversation" onClick={resetAi}>
          <Icon name="edit" size="s" />
        </button>
        <button type="button" className="btn btn-g btn-sm btn-i" aria-label="Close RedSky AI" onClick={() => setAiOpen(false)}>
          <Icon name="x" size="s" />
        </button>
      </header>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--bd)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 'none' }}>
        <span className="faint" style={{ fontSize: 12 }}>
          Response style
        </span>
        <Segmented<AiStyle> small label="Response style" options={AI_STYLES.map((style) => ({ value: style.id, label: style.label }))} value={viewer.preferences.aiStyle} onChange={(aiStyle) => updatePreferences.mutate({ aiStyle })} />
      </div>
      <div ref={scrollRef} className="scroll" style={{ flex: 1, minHeight: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }} aria-live="polite">
        {!available ? (
          <div className="note" role="status">
            <Icon name="shield" size="s" style={{ marginTop: 1 }} />
            <span>RedSky AI isn’t configured for this environment yet. An administrator needs to connect an approved AI provider. Nothing you type here is sent anywhere until then.</span>
          </div>
        ) : null}
        {available && empty ? (
          <div className="a-in" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div className="serif" style={{ fontSize: 22, lineHeight: 1.2 }}>
                How can I help, {display.greetingName}?
              </div>
              <p className="muted" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
                {simulated
                  ? 'Ask about your meetings, relationships, deals, projects and documents. I’ll cite my sources and ask before changing anything.'
                  : 'Ask about your RedSky tasks and priorities. I can only see RedSky data you own, I cite what I used, and I ask before creating anything.'}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(simulated ? SUGGESTED_PROMPTS : PRODUCTION_PROMPTS).map((prompt: { q: string; icon: IconName; key?: string }) => (
                <button key={prompt.q} type="button" className="opt" style={{ minHeight: 40 }} onClick={() => void askAi(prompt.q, { key: prompt.key })}>
                  <Icon name={prompt.icon} size="s" />
                  <span className="grow">{prompt.q}</span>
                  <Icon name="arrowR" size="xs" className="faint" />
                </button>
              ))}
            </div>
            <div>
              <div className="lbl" style={{ marginBottom: 6 }}>
                Searching across
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {contextChips.map((chip) => (
                  <Chip key={chip.label} tone={chip.ok ? 'ok' : 'outline'} dot>
                    {chip.label}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        {ai.messages.map((message) => (message.role === 'user' ? <UserBubble key={message.id} text={message.text} /> : <AnswerView key={message.id} message={message} simulated={simulated} />))}
        {ai.pendingQuestion ? (
          <>
            <UserBubble text={ai.pendingQuestion} />
            <div className="a-in" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="ai-tag">
                <Icon name="ai" size="xs" />
                RedSky AI
              </span>
              <div className="muted" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                <span className="typing">
                  <i />
                  <i />
                  <i />
                </span>
                {simulated ? 'Searching calendar, CRM and documents you can access…' : 'Reading the RedSky data you can access…'}
              </div>
            </div>
          </>
        ) : null}
        {ai.error ? (
          <div className="note note-wn" role="alert">
            <Icon name="alert" size="s" style={{ marginTop: 1, color: 'var(--wn)' }} />
            <span>{ai.error}</span>
          </div>
        ) : null}
      </div>
      <footer style={{ borderTop: '1px solid var(--bd)', padding: 12, flex: 'none' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', border: '1px solid var(--bd)', borderRadius: 10, padding: '6px 6px 6px 12px', background: 'var(--bg)' }}>
          <textarea
            rows={2}
            autoFocus
            value={input}
            disabled={!available}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            placeholder={simulated ? 'Ask about meetings, people, deals, documents…' : 'Ask about your tasks and priorities…'}
            aria-label="Ask RedSky AI"
            maxLength={2000}
            style={{ flex: 1, border: 'none', background: 'none', resize: 'none', outline: 'none', color: 'var(--tx)', padding: '5px 0', fontSize: 13.5, lineHeight: 1.45, minWidth: 0 }}
          />
          <button type="button" className="btn btn-p btn-sm btn-i" aria-label="Send" onClick={send} disabled={!input.trim() || Boolean(ai.pendingQuestion) || !available}>
            <Icon name="send" size="s" />
          </button>
        </div>
        <div className="faint" style={{ fontSize: 11, marginTop: 8, display: 'flex', gap: 6, alignItems: 'flex-start', lineHeight: 1.4 }}>
          <Icon name="lock" size="xs" style={{ marginTop: 1 }} />
          <span>
            Uses only information you’re authorized to access. {simulated ? 'Responses here are simulated; changes' : 'Changes'} to records always ask for confirmation.
          </span>
        </div>
      </footer>
    </aside>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="a-in" style={{ alignSelf: 'flex-end', maxWidth: '86%', background: 'var(--sf2)', border: '1px solid var(--bd)', padding: '8px 12px', borderRadius: '12px 12px 4px 12px', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
      {text}
    </div>
  );
}

function bulletsFor(answer: AiAnswer, style: string): string[] {
  if (style === 'concise') return answer.bullets.slice(0, 3);
  if (style === 'executive') return answer.bullets.slice(0, 4);
  return answer.bullets;
}

function AnswerView({ message, simulated }: { message: Extract<AiMessageView, { role: 'assistant' }>; simulated: boolean }) {
  const { answer, style } = message;
  const router = useRouter();
  const { openRecord, confirmed, proposeTasks } = useWorkspaceActions();
  const { openPrep, requestConfirm, markAiActionDone, toast, setAiOpen } = useUiStore.getState();
  const styleLabel = AI_STYLES.find((entry) => entry.id === style)?.label ?? 'Concise';
  const bullets = bulletsFor(answer, style);
  const lead = style === 'concise' && answer.short ? answer.short : answer.lead;

  function runAction(action: ProposedAction, index: number) {
    if (action.kind === 'prep') return openPrep(action.meetingId);
    if (action.kind === 'nav') {
      setAiOpen(false);
      return router.push(action.href);
    }
    if (action.kind === 'preview') return openRecord(action.record.kind, action.record.id);
    const origin = { type: 'ai_message' as const, messageId: message.id, actionIndex: index };
    if (action.kind === 'tasks') return proposeTasks(origin, action.tasks.map((task) => `${task.title}${task.due ? ` · ${task.due}` : ''}`), () => markAiActionDone(message.id, index));
    requestConfirm({
      title: action.kind === 'draft' ? 'Save as an Outlook draft?' : 'Create an internal brief?',
      body: action.kind === 'draft' ? 'The draft is saved to your Outlook drafts folder. Nothing is sent until you send it yourself.' : 'Creates a draft document in your OneDrive, visible only to you until you share it.',
      items: [action.desc ?? action.label],
      ok: action.kind === 'draft' ? 'Save draft' : 'Create draft',
      run: async () => {
        const result = await confirmed(origin);
        markAiActionDone(message.id, index);
        toast(result.message);
      },
    });
  }

  return (
    <div className="a-in" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span className="ai-tag">
          <Icon name="ai" size="xs" />
          RedSky AI
        </span>
        <Chip tone="outline" small>
          {simulated ? `Simulated · ${styleLabel}` : `AI generated · ${styleLabel}`}
        </Chip>
      </div>
      {style === 'executive' && answer.bottomLine ? <div style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.45 }}>Bottom line: {answer.bottomLine}</div> : null}
      <p style={{ lineHeight: 1.6, fontSize: 13.5, whiteSpace: 'pre-line' }}>{lead}</p>
      {bullets.length > 0 ? (
        <ul className="aul" style={{ fontSize: 13 }}>
          {bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      ) : null}
      {answer.draft ? <div style={{ border: '1px solid var(--bd)', borderRadius: 9, background: 'var(--bg)', padding: '12px 14px', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{answer.draft}</div> : null}
      {style === 'analytical' && answer.reasoning ? (
        <div className="note" style={{ flexDirection: 'column', gap: 4 }}>
          <span className="lbl">Reasoning</span>
          <span>{answer.reasoning}</span>
        </div>
      ) : null}
      {answer.sources.length > 0 ? (
        <div>
          <div className="lbl" style={{ marginBottom: 6 }}>
            Sources · {answer.sources.length}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {answer.sources.map((source) => (
              <button key={`${source.kind}:${source.id}`} type="button" className="src" onClick={() => openRecord(source.kind, source.id)}>
                <Icon name={SOURCE_ICON[source.kind] ?? 'doc'} size="xs" />
                <span className="ell">{source.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {answer.actions.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="lbl">Proposed actions</div>
          {answer.actions.map((action, index) => {
            const done = message.completedActions.includes(index);
            const confirmable = actionRequiresConfirmation(action);
            return (
              <div key={`${action.kind}-${action.label}`} className="act">
                <div className="grow">
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{action.label}</div>
                  {action.desc ? (
                    <div className="faint" style={{ fontSize: 12, marginTop: 1 }}>
                      {action.desc}
                    </div>
                  ) : null}
                </div>
                {done ? (
                  <Chip tone="ok" icon="check">
                    Done
                  </Chip>
                ) : (
                  <button type="button" className={confirmable ? 'btn btn-sm btn-ai' : 'btn btn-sm'} onClick={() => runAction(action, index)}>
                    {confirmable ? 'Review & confirm' : 'Open'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
