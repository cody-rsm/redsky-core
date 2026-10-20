import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptString, deriveKey, encryptBytes, encryptString, hmac, randomToken, safeEqual, sha256 } from '@/server/security/crypto';

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
