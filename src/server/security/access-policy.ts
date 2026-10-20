import 'server-only';

// Access control for RedSky-owned data, aligned with rsm-crm/RSM_ARCHITECTURE.md §12:
// - Access roles (member/admin) are security roles; onboarding "focus areas" are personalization only.
// - Data classification tiers drive defaults; restricted/walled records need explicit membership.
// - Administrators manage the platform but get no business or personal data by default (§12.3 "Platform admin").
// Every service call passes an Actor; repositories never run unscoped queries on behalf of a request.

export type AccessRole = 'member' | 'admin';
export type Classification = 'public' | 'internal' | 'confidential' | 'restricted';

export type Actor = {
  userId: string;
  accessRole: AccessRole;
  // Reserved for team/department/deal-team membership once those sources exist (RSM deal walls, §12.4).
  teamIds: ReadonlyArray<string>;
};

export type Resource =
  | { type: 'own'; ownerId: string } // profile, preferences, layout, onboarding, tasks, AI conversations
  | { type: 'workstyle'; ownerId: string } // assessment data: owner only, never admins
  | { type: 'record'; classification: Classification; ownerId?: string | null; teamIds?: ReadonlyArray<string> }
  | { type: 'audit_log' };

export type Action = 'read' | 'write' | 'delete' | 'share';

export type Decision = { allowed: true } | { allowed: false; reason: string };

const ALLOW: Decision = { allowed: true };
const deny = (reason: string): Decision => ({ allowed: false, reason });

export function authorize(actor: Actor, action: Action, resource: Resource): Decision {
  switch (resource.type) {
    case 'own':
      return actor.userId === resource.ownerId ? ALLOW : deny('Not the owner');
    case 'workstyle':
      // SPEC §7.1: private by default; no manager, colleague or administrator read path.
      return actor.userId === resource.ownerId ? ALLOW : deny('Workstyle data is private to its owner');
    case 'audit_log':
      return action === 'read' && actor.accessRole === 'admin' ? ALLOW : deny('Audit log is readable by administrators only');
    case 'record':
      return authorizeRecord(actor, action, resource);
  }
}

function authorizeRecord(actor: Actor, action: Action, resource: Extract<Resource, { type: 'record' }>): Decision {
  const isOwner = resource.ownerId === actor.userId;
  const onTeam = (resource.teamIds ?? []).some((team) => actor.teamIds.includes(team));
  switch (resource.classification) {
    case 'public':
    case 'internal':
      return action === 'read' || isOwner || onTeam ? ALLOW : deny('Only the owner or team can change this record');
    case 'confidential':
      return isOwner || onTeam ? ALLOW : deny('Confidential records are limited to their owner and team');
    case 'restricted':
      // Fails closed: restricted records require explicit team membership (deal walls).
      return onTeam ? ALLOW : deny('Restricted record');
  }
}

export class AccessDeniedError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}

export function assertAuthorized(actor: Actor, action: Action, resource: Resource): void {
  const decision = authorize(actor, action, resource);
  if (!decision.allowed) throw new AccessDeniedError(decision.reason);
}
