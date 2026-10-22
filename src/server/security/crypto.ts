import 'server-only';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = 'v1';
export const ENCRYPTION_KEY_BYTES = 32;

// REDSKY_ENCRYPTION_KEY as set in the environment (`openssl rand -base64 32`), or null when it is not one.
export function decodeEncryptionKey(value: string): Buffer | null {
  const key = Buffer.from(value, 'base64');
  return key.length === ENCRYPTION_KEY_BYTES ? key : null;
}

// AES-256-GCM envelope: "v1.<iv>.<tag>.<ciphertext>" (base64url). `context` is bound as additional authenticated
// data, so a ciphertext copied to another user's row fails to decrypt.
export function encryptString(plaintext: string, key: Buffer, context: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptString(envelope: string, key: Buffer, context: string): string {
  const [version, iv, tag, data] = envelope.split('.');
  if (version !== VERSION || !iv || !tag || !data) throw new Error('Unsupported ciphertext');
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

// Raw envelope for bytes: iv | tag | ciphertext.
export function encryptBytes(plaintext: Buffer, key: Buffer, context: string): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptBytes(envelope: Buffer, key: Buffer, context: string): Buffer {
  if (envelope.length < IV_BYTES + TAG_BYTES) throw new Error('Unsupported ciphertext');
  const decipher = createDecipheriv(ALGORITHM, key, envelope.subarray(0, IV_BYTES));
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(envelope.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([decipher.update(envelope.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
}

// Reads during key rotation: the keys are tried in order (primary first, then the fallback) and the first one that
// authenticates the ciphertext wins. Writes always use the primary key.
export function decryptStringWithKeys(envelope: string, keys: readonly (Buffer | null)[], context: string): string {
  return withFirstMatchingKey(keys, (key) => decryptString(envelope, key, context));
}

export function decryptBytesWithKeys(envelope: Buffer, keys: readonly (Buffer | null)[], context: string): Buffer {
  return withFirstMatchingKey(keys, (key) => decryptBytes(envelope, key, context));
}

function withFirstMatchingKey<TValue>(keys: readonly (Buffer | null)[], attempt: (key: Buffer) => TValue): TValue {
  let lastError: unknown = new Error('No decryption key');
  for (const key of keys) {
    if (!key) continue;
    try {
      return attempt(key);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmac(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Key for short-lived encrypted cookies (OIDC transaction state), derived from the session secret.
export function deriveKey(secret: string, purpose: string): Buffer {
  return createHash('sha256').update(`${purpose}:${secret}`).digest();
}
