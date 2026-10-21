import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { LayoutItem } from '@/features/personalization/catalog';
import type { WorkspacePreferences } from '@/features/preferences/schema';
import type { WorkstyleBaseline, WsRecommendationStates } from '@/features/workstyle/apply';

// Every RedSky table lives in the `redsky` schema of RedSky's own database. RedSky never connects to Twenty's
// database; scripts/migrate.ts refuses to run against one.
export const redsky = pgSchema('redsky');

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

// Marker proving this database belongs to RedSky (checked by the migration guard).
export const meta = redsky.table('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const users = redsky.table(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authProvider: text('auth_provider', { enum: ['entra', 'dev'] }).notNull(),
    // Entra: the `oid` claim (stable per tenant). Dev: the demo persona id.
    authSubject: text('auth_subject').notNull(),
    tenantId: text('tenant_id'),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    accessRole: text('access_role', { enum: ['member', 'admin'] }).notNull().default('member'),
    status: text('status', { enum: ['active', 'disabled'] }).notNull().default('active'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('users_auth_identity_idx').on(table.authProvider, table.authSubject)],
);

export const sessions = redsky.table(
  'sessions',
  {
    // SHA-256 of the opaque token; the token itself only ever lives in the user's cookie.
    tokenHash: text('token_hash').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [index('sessions_user_idx').on(table.userId)],
);

export type DirectorySource = Partial<Record<'firstName' | 'lastName' | 'title' | 'department' | 'email' | 'phone' | 'office', 'entra' | 'missing'>>;

export const employeeProfiles = redsky.table('employee_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  firstName: text('first_name').notNull().default(''),
  lastName: text('last_name').notNull().default(''),
  preferredName: text('preferred_name').notNull().default(''),
  title: text('title').notNull().default(''),
  department: text('department').notNull().default(''),
  email: text('email').notNull().default(''),
  phone: text('phone').notNull().default(''),
  office: text('office').notNull().default(''),
  bio: text('bio').notNull().default(''),
  monogramTone: smallint('monogram_tone').notNull().default(1),
  photo: bytea('photo'),
  photoMime: text('photo_mime'),
  focusAreas: text('focus_areas').array().notNull().default(sql`'{}'::text[]`),
  directorySource: jsonb('directory_source').$type<DirectorySource>().notNull().default({}),
  updatedAt: updatedAt(),
});

export const userPreferences = redsky.table('user_preferences', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  preferences: jsonb('preferences').$type<WorkspacePreferences>().notNull(),
  updatedAt: updatedAt(),
});

export const dashboardLayouts = redsky.table('dashboard_layouts', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  layout: jsonb('layout').$type<LayoutItem[]>().notNull(),
  // True once the employee arranges widgets by hand; until then the layout follows the recommendation.
  layoutTouched: boolean('layout_touched').notNull().default(false),
  updatedAt: updatedAt(),
});

export const onboardingProgress = redsky.table('onboarding_progress', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  currentStep: smallint('current_step').notNull().default(0),
  maxStep: smallint('max_step').notNull().default(0),
  startedAt: createdAt(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  updatedAt: updatedAt(),
});

export const integrationRequests = redsky.table(
  'integration_requests',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    connectorId: text('connector_id').notNull(),
    state: text('state', { enum: ['notify', 'requested'] }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.connectorId] })],
);

// A person's authorization for RedSky to use the CRM as them (Twenty OAuth). Deleting the row disconnects them.
// Tokens are encrypted with REDSKY_ENCRYPTION_KEY and bound to the row's user and provider.
export const crmConnections = redsky.table(
  'crm_connections',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: ['twenty'] }).notNull(),
    refreshTokenCiphertext: text('refresh_token_ciphertext').notNull(),
    accessTokenCiphertext: text('access_token_ciphertext').notNull(),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.provider] })],
);

// CRM writes made through RedSky, one row per request, so a retried or double-clicked save writes once and returns
// the record it created. The records themselves live only in the CRM.
export const crmWrites = redsky.table(
  'crm_writes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    requestKey: uuid('request_key').notNull(),
    kind: text('kind', { enum: ['contact', 'note'] }).notNull(),
    recordId: text('record_id'),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('crm_writes_request_idx').on(table.userId, table.requestKey)],
);

export type WorkstyleSharing = { manager: boolean; colleagues: boolean };
export type WorkstyleExtractionMeta = {
  status: 'extracted' | 'partial' | 'unrecognized' | 'unreadable' | 'manual' | 'sample';
  parserVersion?: string;
  pageCount?: number;
  foundCount?: number;
  expectedCount?: number;
};

// One assessment per employee. The profile, file name and draft are encrypted (AES-256-GCM) and are readable
// only by their owner; administrators have no read path (src/server/security/access-policy.ts).
export const workstyleAssessments = redsky.table('workstyle_assessments', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  consentAt: timestamp('consent_at', { withTimezone: true }).notNull(),
  consentVersion: text('consent_version').notNull(),
  sourceKind: text('source_kind', { enum: ['upload', 'manual', 'sample'] }).notNull(),
  sourceNameCiphertext: text('source_name_ciphertext'),
  extraction: jsonb('extraction').$type<WorkstyleExtractionMeta>().notNull(),
  draftCiphertext: text('draft_ciphertext'),
  profileCiphertext: text('profile_ciphertext'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  baseline: jsonb('baseline').$type<WorkstyleBaseline>(),
  recommendations: jsonb('recommendations').$type<WsRecommendationStates>(),
  sharing: jsonb('sharing').$type<WorkstyleSharing>().notNull().default({ manager: false, colleagues: false }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// Retained only when WORKSTYLE_RETAIN_ORIGINAL=true; encrypted, owner-only, deleted with the assessment.
export const workstyleDocuments = redsky.table('workstyle_documents', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  ciphertext: bytea('ciphertext').notNull(),
  mime: text('mime').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  createdAt: createdAt(),
});

export const workstyleConsentLog = redsky.table(
  'workstyle_consent_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['processing', 'share_manager', 'share_colleagues'] }).notNull(),
    action: text('action', { enum: ['granted', 'revoked'] }).notNull(),
    consentVersion: text('consent_version').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('workstyle_consent_user_idx').on(table.userId)],
);

// RedSky-native tasks (My Tasks). External task systems will sync through integration adapters, not this table.
export const tasks = redsky.table(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    relatedLabel: text('related_label').notNull().default(''),
    relatedKind: text('related_kind'),
    relatedId: text('related_id'),
    dueOn: date('due_on'),
    priority: text('priority', { enum: ['high', 'med', 'low'] }).notNull().default('med'),
    status: text('status', { enum: ['open', 'done'] }).notNull().default('open'),
    source: text('source', { enum: ['user', 'ai_confirmed', 'meeting_prep'] }).notNull().default('user'),
    sourceNote: text('source_note').notNull().default(''),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('tasks_owner_status_idx').on(table.ownerId, table.status)],
);

export type ItemState = {
  done?: boolean;
  dismissed?: boolean;
  saved?: boolean;
  approved?: boolean;
  prepared?: boolean;
  followupsDone?: number[];
  read?: boolean;
};

// Per-user interaction state for records RedSky does not own (demo records, CRM items, notifications,
// AI recommendations): completed, dismissed, saved, approved, prepared.
export const itemStates = redsky.table(
  'item_states',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    itemKey: text('item_key').notNull(),
    state: jsonb('state').$type<ItemState>().notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.source, table.itemKey] })],
);

export const aiConversations = redsky.table(
  'ai_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default(''),
    provider: text('provider', { enum: ['simulated', 'anthropic'] }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('ai_conversations_user_idx').on(table.userId, table.updatedAt)],
);

export const aiMessages = redsky.table(
  'ai_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id').notNull().references(() => aiConversations.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    // User text, or the structured AiAnswer for assistant turns.
    content: jsonb('content').notNull(),
    style: text('style'),
    model: text('model'),
    createdAt: createdAt(),
  },
  (table) => [index('ai_messages_conversation_idx').on(table.conversationId, table.createdAt)],
);

// Confirmed AI-proposed actions. The unique key makes confirmation idempotent (a double click runs once).
export const aiActionExecutions = redsky.table(
  'ai_action_executions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    actionKey: text('action_key').notNull(),
    kind: text('kind').notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('ai_action_executions_key_idx').on(table.userId, table.actionKey)],
);

// Documents uploaded in RedSky (docs/DECISIONS.md 3). The original lives in the documents bucket under
// `storage_key`; redsky-ocr keeps what it extracts in its own database, keyed by `ocr_document_id`.
export const documents = redsky.table(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Restrict, not cascade: deleting a user must not silently orphan their files in the bucket and redsky-ocr.
    ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    storageKey: text('storage_key').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    visibility: text('visibility', { enum: ['private', 'firm'] }).notNull(),
    relatedLabel: text('related_label').notNull().default(''),
    noAi: boolean('no_ai').notNull().default(false),
    ocrDocumentId: uuid('ocr_document_id'),
    status: text('status', { enum: ['registering', 'uploaded', 'queued', 'processing', 'completed', 'needs_review', 'failed'] }).notNull(),
    statusReason: text('status_reason'),
    // When redsky-ocr reported the status held here; older reports (events arrive at least once, in any order)
    // never overwrite newer ones.
    statusAt: timestamp('status_at', { withTimezone: true }).notNull().defaultNow(),
    pageCount: integer('page_count'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('documents_storage_key_idx').on(table.storageKey),
    uniqueIndex('documents_ocr_document_idx').on(table.ocrDocumentId),
    index('documents_owner_idx').on(table.ownerId, table.createdAt),
    index('documents_visibility_idx').on(table.visibility, table.createdAt),
  ],
);

// Ids of redsky-ocr events already applied, so a redelivered event is acknowledged without being applied twice.
export const ocrEventReceipts = redsky.table('ocr_event_receipts', {
  eventId: uuid('event_id').primaryKey(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});

// Append-only audit trail for security-sensitive events. Metadata never contains assessment content.
export const auditEvents = redsky.table(
  'audit_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid('actor_user_id'),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    outcome: text('outcome', { enum: ['success', 'denied', 'failure'] }).notNull(),
    requestId: text('request_id'),
    metadata: jsonb('metadata').$type<Record<string, string | number | boolean | null>>().notNull().default({}),
  },
  (table) => [index('audit_events_actor_idx').on(table.actorUserId, table.occurredAt), index('audit_events_action_idx').on(table.action, table.occurredAt)],
);
