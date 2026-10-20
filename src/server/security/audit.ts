import 'server-only';
import { getDb } from '@/server/db/client';
import { auditEvents } from '@/server/db/schema';
import { logger } from '@/server/logging/logger';

export type AuditAction =
  | 'auth.login'
  | 'auth.logout'
  | 'auth.login_denied'
  | 'onboarding.completed'
  | 'onboarding.restarted'
  | 'workstyle.consent_granted'
  | 'workstyle.consent_revoked'
  | 'workstyle.uploaded'
  | 'workstyle.reviewed'
  | 'workstyle.read'
  | 'workstyle.recommendations_changed'
  | 'workstyle.sharing_changed'
  | 'workstyle.deleted'
  | 'workstyle.read_denied'
  | 'ai.action_confirmed'
  | 'ai.action_denied'
  | 'task.created'
  | 'approval.approved'
  | 'integration.notify_requested'
  | 'integration.twenty_connected'
  | 'integration.twenty_connect_refused'
  | 'integration.twenty_disconnected'
  | 'document.uploaded'
  | 'document.read'
  | 'document.downloaded'
  | 'document.reprocessed'
  | 'document.deleted'
  | 'access.denied';

export type AuditEvent = {
  actorUserId: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  outcome?: 'success' | 'denied' | 'failure';
  requestId?: string | null;
  // Identifiers and counts only — never assessment values, document content or message text.
  metadata?: Record<string, string | number | boolean | null>;
};

// Audit writes never break the user's request; a failed write is logged loudly for follow-up.
export async function recordAudit(event: AuditEvent): Promise<void> {
  try {
    await getDb().insert(auditEvents).values({
      actorUserId: event.actorUserId,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId ?? null,
      outcome: event.outcome ?? 'success',
      requestId: event.requestId ?? null,
      metadata: event.metadata ?? {},
    });
  } catch (error) {
    logger.error('Audit write failed', { action: event.action, resourceType: event.resourceType, error });
  }
}
