import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decodeEncryptionKey, decryptBytes, decryptBytesWithKeys, decryptString, decryptStringWithKeys, deriveKey, encryptBytes, encryptString, hmac, randomToken, safeEqual, sha256 } from '@/server/security/crypto';

const key = randomBytes(32);

describe('encryptString / decryptString', () => {
  it('round-trips with the same key and context', () => {
    const envelope = encryptString('DISC D 72', key, 'workstyle:u1:profile');
    expect(envelope).not.toContain('DISC');
    expect(decryptString(envelope, key, 'workstyle:u1:profile')).toBe('DISC D 72');
  });

  it('uses a fresh IV for every encryption', () => {
    expect(encryptString('same', key, 'ctx')).not.toBe(encryptString('same', key, 'ctx'));
  });

  it('refuses ciphertext moved to another owner or field (AAD binding)', () => {
    const envelope = encryptString('secret', key, 'workstyle:u1:profile');
    expect(() => decryptString(envelope, key, 'workstyle:u2:profile')).toThrow();
    expect(() => decryptString(envelope, key, 'workstyle:u1:draft')).toThrow();
  });

  it('refuses the wrong key and tampered ciphertext', () => {
    const envelope = encryptString('secret', key, 'ctx');
    expect(() => decryptString(envelope, randomBytes(32), 'ctx')).toThrow();
    const tampered = envelope.slice(0, -4) + (envelope.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect(() => decryptString(tampered, key, 'ctx')).toThrow();
  });

  it('encrypts bytes without leaving plaintext in the output', () => {
    const plaintext = Buffer.from('%PDF-1.7 confidential report');
    expect(encryptBytes(plaintext, key, 'doc').includes(plaintext)).toBe(false);
  });

  it('round-trips bytes and binds them to their context', () => {
    const plaintext = Buffer.from('%PDF-1.7 confidential report');
    const envelope = encryptBytes(plaintext, key, 'workstyle:u1:document');
    expect(decryptBytes(envelope, key, 'workstyle:u1:document').equals(plaintext)).toBe(true);
    expect(() => decryptBytes(envelope, key, 'workstyle:u2:document')).toThrow();
    expect(() => decryptBytes(envelope, randomBytes(32), 'workstyle:u1:document')).toThrow();
    expect(() => decryptBytes(envelope.subarray(0, 20), key, 'workstyle:u1:document')).toThrow('Unsupported ciphertext');
  });
});

describe('decryption with an ordered key list (key rotation)', () => {
  const previousKey = randomBytes(32);

  it('reads values written under the primary key and under the fallback key', () => {
    const current = encryptString('under new key', key, 'ctx');
    const previous = encryptString('under old key', previousKey, 'ctx');
    expect(decryptStringWithKeys(current, [key, previousKey], 'ctx')).toBe('under new key');
    expect(decryptStringWithKeys(previous, [key, previousKey], 'ctx')).toBe('under old key');
    const bytes = encryptBytes(Buffer.from('pdf'), previousKey, 'doc');
    expect(decryptBytesWithKeys(bytes, [key, null, previousKey], 'doc').toString()).toBe('pdf');
  });

  it('ignores missing keys and refuses a value no listed key can read', () => {
    const envelope = encryptString('secret', randomBytes(32), 'ctx');
    expect(() => decryptStringWithKeys(envelope, [key, previousKey], 'ctx')).toThrow();
    expect(() => decryptStringWithKeys(envelope, [null], 'ctx')).toThrow('No decryption key');
    expect(() => decryptStringWithKeys(envelope, [], 'ctx')).toThrow('No decryption key');
  });

  it('decodes keys only in the configured 32-byte base64 form', () => {
    expect(decodeEncryptionKey(key.toString('base64'))?.equals(key)).toBe(true);
    expect(decodeEncryptionKey(Buffer.alloc(16).toString('base64'))).toBeNull();
    expect(decodeEncryptionKey('not a key')).toBeNull();
  });
});

describe('token helpers', () => {
  it('produces unpredictable tokens and stable hashes', () => {
    expect(randomToken()).not.toBe(randomToken());
    expect(sha256('a')).toBe(sha256('a'));
    expect(sha256('a')).not.toBe(sha256('b'));
    expect(hmac('value', 'secret')).not.toBe(hmac('value', 'other'));
  });

  it('compares in constant time without false positives', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('derives distinct keys per purpose', () => {
    expect(deriveKey('s'.repeat(40), 'a').equals(deriveKey('s'.repeat(40), 'b'))).toBe(false);
    expect(deriveKey('s'.repeat(40), 'a')).toHaveLength(32);
  });
});
