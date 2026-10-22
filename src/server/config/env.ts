import 'server-only';
import { z } from 'zod';
import { logger } from '@/server/logging/logger';
import { decodeEncryptionKey, ENCRYPTION_KEY_BYTES } from '@/server/security/crypto';

// Server-only configuration. Nothing here is ever sent to the browser; client code receives only the derived,
// non-secret flags exposed through getPublicConfig().

const optionalString = z
  .string()
  .trim()
  .transform((value) => (value === '' ? undefined : value))
  .optional();

const booleanFlag = z
  .string()
  .trim()
  .toLowerCase()
  .optional()
  .transform((value) => value === 'true' || value === '1');

const rawSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  REDSKY_APP_URL: optionalString,
  REDSKY_DATABASE_URL: optionalString,
  REDSKY_DATA_MODE: z.enum(['demo', 'production']).optional(),
  REDSKY_SESSION_SECRET: optionalString,
  REDSKY_ENCRYPTION_KEY: optionalString,
  REDSKY_FALLBACK_ENCRYPTION_KEY: optionalString,
  REDSKY_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  AUTH_ENTRA_TENANT_ID: optionalString,
  AUTH_ENTRA_CLIENT_ID: optionalString,
  AUTH_ENTRA_CLIENT_SECRET: optionalString,
  AUTH_ENTRA_ADMIN_ROLE: z.string().trim().default('RedSky.Admin'),
  AUTH_DEV_ENABLED: booleanFlag,
  AI_PROVIDER: z.enum(['anthropic', 'none']).default('none'),
  ANTHROPIC_API_KEY: optionalString,
  AI_MODEL: z.string().trim().default('claude-opus-5-5'),
  AI_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('medium'),
  TWENTY_API_URL: optionalString,
  TWENTY_API_KEY: optionalString,
  TWENTY_PUBLIC_URL: optionalString,
  TWENTY_OAUTH_CLIENT_ID: optionalString,
  TWENTY_OAUTH_CLIENT_SECRET: optionalString,
  REDSKY_TENANT_ID: z.string().trim().regex(/^[A-Za-z0-9._:@-]{1,128}$/).default('rsm'),
  DOCUMENTS_BUCKET: optionalString,
  DOCUMENTS_S3_ENDPOINT: optionalString,
  DOCUMENTS_S3_REGION: z.string().trim().default('auto'),
  DOCUMENTS_S3_ACCESS_KEY_ID: optionalString,
  DOCUMENTS_S3_SECRET_ACCESS_KEY: optionalString,
  DOCUMENTS_S3_FORCE_PATH_STYLE: booleanFlag,
  OCR_URL: optionalString,
  OCR_SERVICE_TOKEN: optionalString,
  OCR_EVENTS_SECRET: optionalString,
  WORKSTYLE_RETAIN_ORIGINAL: booleanFlag,
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  REDSKY_TIMEZONE: z.string().trim().default('America/New_York'),
});

export type AuthMode = 'entra' | 'dev' | 'none';
export type DataMode = 'demo' | 'production';

export type AppConfig = {
  nodeEnv: 'development' | 'production' | 'test';
  isProduction: boolean;
  appUrl: URL | null;
  databaseUrl: string | null;
  dataMode: DataMode;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  // Business timezone used to resolve due labels such as "Today" or "Oct 21" on the server.
  timeZone: string;
  auth: {
    mode: AuthMode;
    sessionSecret: string | null;
    sessionTtlHours: number;
    entra: { tenantId: string; clientId: string; clientSecret: string; adminRole: string } | null;
    // Names of missing/invalid settings, for server logs only — never rendered to users.
    issues: string[];
  };
  encryptionKey: Buffer | null;
  // The previous key during a rotation (docs/DEPLOYMENT.md §12): reads try it after the primary; writes never use it.
  fallbackEncryptionKey: Buffer | null;
  ai: { provider: 'anthropic' | 'none'; apiKey: string | null; model: string; effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' };
  crm: CrmConfig;
  workstyle: { retainOriginal: boolean };
  documents: DocumentsConfig;
};

export type DocumentStorageConfig = { bucket: string; endpoint: URL | null; region: string; accessKeyId: string; secretAccessKey: string; forcePathStyle: boolean };
export type OcrConfig = { baseUrl: URL; serviceToken: string; eventsSecret: string | null };

export type DocumentsConfig = {
  // Sent to redsky-ocr as X-RedSky-Tenant-Id. Twenty attachments are recorded there under
  // REDSKY_OCR_TWENTY_TENANT_ID, which should hold the same value.
  tenantId: string;
  storage: DocumentStorageConfig | null;
  ocr: OcrConfig | null;
  // Uploads need both the bucket and redsky-ocr; without either, RedSky says so instead of storing files it
  // cannot read.
  available: boolean;
  issues: string[];
};

export type CrmConfig = {
  provider: 'twenty' | 'none';
  // per_user: each person's own Twenty OAuth token, so Twenty's permissions apply to them (decision 2).
  // shared_key: one read-only API key, a stopgap for pre-production data only. When OAuth is configured the key is
  // ignored, so nobody silently falls back to it.
  access: 'per_user' | 'shared_key' | 'none';
  baseUrl: URL | null;
  apiKey: string | null;
  // `issuer` is Twenty's SERVER_URL: Twenty only accepts an issuer it publishes, and returns it on the callback.
  oauth: { issuer: string; clientId: string; clientSecret: string } | null;
  issues: string[];
};

const MIN_SECRET_LENGTH = 32;

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!cached) {
    cached = parseConfig(process.env);
    // Issues name variables only, never their values, so they are safe to log for deploy diagnostics.
    if (cached.auth.issues.length > 0) logger.warn('Configuration incomplete', { authMode: cached.auth.mode, issues: cached.auth.issues });
    if (cached.crm.issues.length > 0) logger.warn('CRM configuration incomplete', { access: cached.crm.access, issues: cached.crm.issues });
  }
  return cached;
}

// Exposed for tests; the app always goes through getConfig().
export function parseConfig(source: NodeJS.ProcessEnv): AppConfig {
  const parsed = rawSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid RedSky configuration: ${fields}`);
  }
  const env = parsed.data;
  const isProduction = env.NODE_ENV === 'production';
  const issues: string[] = [];

  const appUrl = parseUrl(env.REDSKY_APP_URL, 'REDSKY_APP_URL', issues);
  if (appUrl && isProduction && appUrl.protocol !== 'https:' && !isLoopback(appUrl)) issues.push('REDSKY_APP_URL must use https in production');

  const sessionSecret = env.REDSKY_SESSION_SECRET && env.REDSKY_SESSION_SECRET.length >= MIN_SECRET_LENGTH ? env.REDSKY_SESSION_SECRET : null;
  if (env.REDSKY_SESSION_SECRET && !sessionSecret) issues.push(`REDSKY_SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);

  const entra =
    env.AUTH_ENTRA_TENANT_ID && env.AUTH_ENTRA_CLIENT_ID && env.AUTH_ENTRA_CLIENT_SECRET
      ? { tenantId: env.AUTH_ENTRA_TENANT_ID, clientId: env.AUTH_ENTRA_CLIENT_ID, clientSecret: env.AUTH_ENTRA_CLIENT_SECRET, adminRole: env.AUTH_ENTRA_ADMIN_ROLE }
      : null;
  if (entra && !/^[0-9a-f-]{36}$/i.test(entra.tenantId)) issues.push('AUTH_ENTRA_TENANT_ID must be a tenant GUID (multi-tenant authorities are not allowed)');

  // Dev sign-in is impossible in a production build, whatever the environment says.
  const devAllowed = !isProduction && env.AUTH_DEV_ENABLED;
  let mode: AuthMode = 'none';
  if (entra && sessionSecret && appUrl && issues.length === 0) mode = 'entra';
  else if (devAllowed) mode = 'dev';
  if (mode === 'none') {
    if (!entra) issues.push('AUTH_ENTRA_TENANT_ID / AUTH_ENTRA_CLIENT_ID / AUTH_ENTRA_CLIENT_SECRET not set');
    if (!sessionSecret) issues.push('REDSKY_SESSION_SECRET not set');
    if (!appUrl) issues.push('REDSKY_APP_URL not set');
  }

  const encryptionKey = parseEncryptionKey(env.REDSKY_ENCRYPTION_KEY, isProduction, issues);
  const fallbackEncryptionKey = parseFallbackEncryptionKey(env.REDSKY_FALLBACK_ENCRYPTION_KEY, encryptionKey, issues);
  const crm = parseCrm(env, isProduction, encryptionKey !== null);
  const documents = parseDocuments(env, isProduction);

  return {
    nodeEnv: env.NODE_ENV,
    isProduction,
    appUrl,
    databaseUrl: env.REDSKY_DATABASE_URL ?? null,
    dataMode: env.REDSKY_DATA_MODE ?? (isProduction ? 'production' : 'demo'),
    logLevel: env.LOG_LEVEL,
    timeZone: isValidTimeZone(env.REDSKY_TIMEZONE) ? env.REDSKY_TIMEZONE : 'America/New_York',
    auth: { mode, sessionSecret, sessionTtlHours: env.REDSKY_SESSION_TTL_HOURS, entra, issues },
    encryptionKey,
    fallbackEncryptionKey,
    ai: {
      provider: env.AI_PROVIDER === 'anthropic' && env.ANTHROPIC_API_KEY ? 'anthropic' : 'none',
      apiKey: env.ANTHROPIC_API_KEY ?? null,
      model: env.AI_MODEL,
      effort: env.AI_EFFORT,
    },
    crm,
    workstyle: { retainOriginal: env.WORKSTYLE_RETAIN_ORIGINAL },
    documents,
  };
}

function parseCrm(env: z.infer<typeof rawSchema>, isProduction: boolean, canStoreTokens: boolean): CrmConfig {
  const issues: string[] = [];
  const publicUrl = parseUrl(env.TWENTY_PUBLIC_URL, 'TWENTY_PUBLIC_URL', issues);
  const baseUrl = parseUrl(env.TWENTY_API_URL, 'TWENTY_API_URL', issues) ?? publicUrl;

  let oauth: CrmConfig['oauth'] = null;
  const oauthNames = ['TWENTY_PUBLIC_URL', 'TWENTY_OAUTH_CLIENT_ID', 'TWENTY_OAUTH_CLIENT_SECRET'] as const;
  const missing = oauthNames.filter((name) => !env[name]);
  if (missing.length > 0 && missing.length < oauthNames.length) {
    issues.push(`Twenty OAuth needs ${missing.join(' and ')}`);
  } else if (publicUrl && env.TWENTY_OAUTH_CLIENT_ID && env.TWENTY_OAUTH_CLIENT_SECRET) {
    if (isProduction && publicUrl.protocol !== 'https:' && !isLoopback(publicUrl)) issues.push('TWENTY_PUBLIC_URL must use https in production');
    else if (!canStoreTokens) issues.push('Twenty OAuth needs REDSKY_ENCRYPTION_KEY to store tokens');
    else oauth = { issuer: publicUrl.href.replace(/\/$/, ''), clientId: env.TWENTY_OAUTH_CLIENT_ID, clientSecret: env.TWENTY_OAUTH_CLIENT_SECRET };
  }

  let access: CrmConfig['access'] = 'none';
  if (oauth && baseUrl) access = 'per_user';
  else if (baseUrl && env.TWENTY_API_KEY) access = 'shared_key';
  if (access === 'per_user' && env.TWENTY_API_KEY) issues.push('TWENTY_API_KEY is ignored: RedSky uses each person’s Twenty connection');

  return { provider: access === 'none' ? 'none' : 'twenty', access, baseUrl, apiKey: access === 'shared_key' ? (env.TWENTY_API_KEY ?? null) : null, oauth, issues };
}

function parseDocuments(env: z.infer<typeof rawSchema>, isProduction: boolean): DocumentsConfig {
  const issues: string[] = [];
  let storage: DocumentStorageConfig | null = null;
  if (env.DOCUMENTS_BUCKET) {
    const endpoint = parseUrl(env.DOCUMENTS_S3_ENDPOINT, 'DOCUMENTS_S3_ENDPOINT', issues);
    if (!env.DOCUMENTS_S3_ACCESS_KEY_ID || !env.DOCUMENTS_S3_SECRET_ACCESS_KEY) issues.push('DOCUMENTS_BUCKET needs DOCUMENTS_S3_ACCESS_KEY_ID and DOCUMENTS_S3_SECRET_ACCESS_KEY');
    else if (!env.DOCUMENTS_S3_ENDPOINT || endpoint)
      storage = { bucket: env.DOCUMENTS_BUCKET, endpoint, region: env.DOCUMENTS_S3_REGION, accessKeyId: env.DOCUMENTS_S3_ACCESS_KEY_ID, secretAccessKey: env.DOCUMENTS_S3_SECRET_ACCESS_KEY, forcePathStyle: env.DOCUMENTS_S3_FORCE_PATH_STYLE };
  }

  let ocr: OcrConfig | null = null;
  if (env.OCR_URL) {
    const baseUrl = parseUrl(env.OCR_URL, 'OCR_URL', issues);
    // redsky-ocr refuses tokens shorter than this, so a short one would only fail later, per request.
    const serviceToken = env.OCR_SERVICE_TOKEN && env.OCR_SERVICE_TOKEN.length >= MIN_SECRET_LENGTH ? env.OCR_SERVICE_TOKEN : null;
    if (!serviceToken) issues.push(`OCR_URL needs OCR_SERVICE_TOKEN of at least ${MIN_SECRET_LENGTH} characters`);
    const eventsSecret = env.OCR_EVENTS_SECRET && env.OCR_EVENTS_SECRET.length >= MIN_SECRET_LENGTH ? env.OCR_EVENTS_SECRET : null;
    if (env.OCR_EVENTS_SECRET && !eventsSecret) issues.push(`OCR_EVENTS_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
    if (baseUrl && isProduction && baseUrl.protocol !== 'https:' && !baseUrl.hostname.endsWith('.railway.internal') && !isLoopback(baseUrl)) {
      issues.push('OCR_URL must use https unless it is a Railway private address');
    } else if (baseUrl && serviceToken) {
      ocr = { baseUrl, serviceToken, eventsSecret };
    }
  }

  return { tenantId: env.REDSKY_TENANT_ID, storage, ocr, available: storage !== null && ocr !== null, issues };
}

function parseUrl(value: string | undefined, name: string, issues: string[]): URL | null {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    issues.push(`${name} is not a valid URL`);
    return null;
  }
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function isLoopback(url: URL): boolean {
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
}

// AES-256-GCM key for owner-scoped encrypted data (Workstyle). Production requires an explicit key; development
// derives a fixed, clearly non-production key so local setup needs no secrets.
function parseEncryptionKey(value: string | undefined, isProduction: boolean, issues: string[]): Buffer | null {
  if (value) {
    const key = decodeEncryptionKey(value);
    if (!key) issues.push(`REDSKY_ENCRYPTION_KEY must be ${ENCRYPTION_KEY_BYTES} bytes, base64-encoded`);
    return key;
  }
  if (isProduction) return null;
  return Buffer.alloc(ENCRYPTION_KEY_BYTES, 'redsky-development-only-key');
}

function parseFallbackEncryptionKey(value: string | undefined, primary: Buffer | null, issues: string[]): Buffer | null {
  if (!value) return null;
  const key = decodeEncryptionKey(value);
  if (!key) {
    issues.push(`REDSKY_FALLBACK_ENCRYPTION_KEY must be ${ENCRYPTION_KEY_BYTES} bytes, base64-encoded`);
    return null;
  }
  if (primary?.equals(key)) {
    issues.push('REDSKY_FALLBACK_ENCRYPTION_KEY is the same as REDSKY_ENCRYPTION_KEY; the rotation is complete, remove it');
    return null;
  }
  return key;
}

export type PublicConfig = {
  dataMode: DataMode;
  authMode: AuthMode;
  aiAvailable: boolean;
  aiSimulated: boolean;
  crmConnected: boolean;
  crmAccess: CrmConfig['access'];
  workstyleStorageAvailable: boolean;
  documentsAvailable: boolean;
  timeZone: string;
};

export function getPublicConfig(): PublicConfig {
  const config = getConfig();
  return {
    dataMode: config.dataMode,
    authMode: config.auth.mode,
    aiAvailable: config.dataMode === 'demo' || config.ai.provider === 'anthropic',
    aiSimulated: config.dataMode === 'demo',
    crmConnected: config.crm.provider === 'twenty',
    crmAccess: config.crm.access,
    workstyleStorageAvailable: config.encryptionKey !== null,
    documentsAvailable: config.documents.available,
    timeZone: config.timeZone,
  };
}
