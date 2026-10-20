import { describe, expect, it } from 'vitest';
import { parseConfig } from '@/server/config/env';

const ENTRA = {
  AUTH_ENTRA_TENANT_ID: '11111111-2222-3333-4444-555555555555',
  AUTH_ENTRA_CLIENT_ID: 'client-id',
  AUTH_ENTRA_CLIENT_SECRET: 'client-secret',
  REDSKY_SESSION_SECRET: 'x'.repeat(48),
  REDSKY_APP_URL: 'https://redsky.example.com',
};

const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;

describe('parseConfig', () => {
  it('never enables development sign-in in a production build', () => {
    const config = parseConfig(env({ NODE_ENV: 'production', AUTH_DEV_ENABLED: 'true' }));
    expect(config.auth.mode).toBe('none');
  });

  it('enables development sign-in only when asked, outside production', () => {
    expect(parseConfig(env({ NODE_ENV: 'development', AUTH_DEV_ENABLED: 'true' })).auth.mode).toBe('dev');
    expect(parseConfig(env({ NODE_ENV: 'development' })).auth.mode).toBe('none');
  });

  it('prefers Entra ID when it is fully configured', () => {
    expect(parseConfig(env({ NODE_ENV: 'production', ...ENTRA })).auth.mode).toBe('entra');
    expect(parseConfig(env({ NODE_ENV: 'development', AUTH_DEV_ENABLED: 'true', ...ENTRA })).auth.mode).toBe('entra');
  });

  it('rejects a multi-tenant authority and a short session secret', () => {
    expect(parseConfig(env({ NODE_ENV: 'production', ...ENTRA, AUTH_ENTRA_TENANT_ID: 'common' })).auth.mode).toBe('none');
    expect(parseConfig(env({ NODE_ENV: 'production', ...ENTRA, REDSKY_SESSION_SECRET: 'short' })).auth.mode).toBe('none');
  });

  it('defaults to production data in production and demo data elsewhere', () => {
    expect(parseConfig(env({ NODE_ENV: 'production' })).dataMode).toBe('production');
    expect(parseConfig(env({ NODE_ENV: 'development' })).dataMode).toBe('demo');
    expect(parseConfig(env({ NODE_ENV: 'production', REDSKY_DATA_MODE: 'demo' })).dataMode).toBe('demo');
  });

  it('requires an explicit encryption key in production', () => {
    expect(parseConfig(env({ NODE_ENV: 'production' })).encryptionKey).toBeNull();
    expect(parseConfig(env({ NODE_ENV: 'development' })).encryptionKey).toHaveLength(32);
    const key = Buffer.alloc(32, 7).toString('base64');
    expect(parseConfig(env({ NODE_ENV: 'production', REDSKY_ENCRYPTION_KEY: key })).encryptionKey).toHaveLength(32);
  });

  it('only enables the AI provider with credentials', () => {
    expect(parseConfig(env({ NODE_ENV: 'production', AI_PROVIDER: 'anthropic' })).ai.provider).toBe('none');
    expect(parseConfig(env({ NODE_ENV: 'production', AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' })).ai.provider).toBe('anthropic');
  });

  it('enables the CRM only through per-person OAuth, never a shared key', () => {
    const base = { NODE_ENV: 'production', REDSKY_APP_URL: 'https://redsky.example.com', REDSKY_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), TWENTY_API_URL: 'http://twenty-server.railway.internal:3000' };
    const oauth = { TWENTY_PUBLIC_URL: 'https://crm.example.com', TWENTY_OAUTH_CLIENT_ID: 'client', TWENTY_OAUTH_CLIENT_SECRET: 'secret' };
    const sharedKeyOnly = parseConfig(env({ ...base, TWENTY_API_KEY: 'all-access' }));
    expect(sharedKeyOnly.crm.provider).toBe('none');
    expect(sharedKeyOnly.crm.issues.join(' ')).toMatch(/TWENTY_API_KEY is no longer used/);
    const configured = parseConfig(env({ ...base, ...oauth }));
    expect(configured.crm).toMatchObject({ provider: 'twenty', oauth: { clientId: 'client' }, issues: [] });
    expect(configured.crm.publicUrl?.origin).toBe('https://crm.example.com');
    expect(parseConfig(env({ ...base, ...oauth, TWENTY_PUBLIC_URL: 'http://crm.example.com' })).crm.provider).toBe('none');
    expect(parseConfig(env({ ...base, ...oauth, TWENTY_PUBLIC_URL: '' })).crm.issues).toEqual(['Set TWENTY_PUBLIC_URL to Twenty’s public https address']);
    expect(parseConfig(env({ ...base, ...oauth, REDSKY_ENCRYPTION_KEY: '' })).crm.provider).toBe('none');
  });

  it('falls back to the firm time zone when the configured one is invalid', () => {
    expect(parseConfig(env({ NODE_ENV: 'development', REDSKY_TIMEZONE: 'Mars/Olympus' })).timeZone).toBe('America/New_York');
  });
});
