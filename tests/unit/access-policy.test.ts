import { describe, expect, it } from 'vitest';
import { AccessDeniedError, assertAuthorized, authorize, type Actor } from '@/server/security/access-policy';

const member: Actor = { userId: 'u1', accessRole: 'member', teamIds: ['deal-team'] };
const otherMember: Actor = { userId: 'u2', accessRole: 'member', teamIds: [] };
const admin: Actor = { userId: 'admin', accessRole: 'admin', teamIds: [] };

describe('authorize', () => {
  it('limits own data to its owner', () => {
    expect(authorize(member, 'write', { type: 'own', ownerId: 'u1' }).allowed).toBe(true);
    expect(authorize(otherMember, 'read', { type: 'own', ownerId: 'u1' }).allowed).toBe(false);
  });

  it('never lets anyone but the owner read workstyle data — administrators included', () => {
    for (const action of ['read', 'write', 'delete', 'share'] as const) {
      expect(authorize(member, action, { type: 'workstyle', ownerId: 'u1' }).allowed).toBe(true);
      expect(authorize(admin, action, { type: 'workstyle', ownerId: 'u1' }).allowed).toBe(false);
      expect(authorize(otherMember, action, { type: 'workstyle', ownerId: 'u1' }).allowed).toBe(false);
    }
  });

  it('lets only administrators read the audit log', () => {
    expect(authorize(admin, 'read', { type: 'audit_log' }).allowed).toBe(true);
    expect(authorize(admin, 'write', { type: 'audit_log' }).allowed).toBe(false);
    expect(authorize(member, 'read', { type: 'audit_log' }).allowed).toBe(false);
  });

  it('applies classification tiers to records', () => {
    expect(authorize(otherMember, 'read', { type: 'record', classification: 'internal' }).allowed).toBe(true);
    expect(authorize(otherMember, 'write', { type: 'record', classification: 'internal', ownerId: 'u1' }).allowed).toBe(false);
    expect(authorize(otherMember, 'read', { type: 'record', classification: 'confidential', ownerId: 'u1' }).allowed).toBe(false);
    expect(authorize(member, 'read', { type: 'record', classification: 'confidential', ownerId: 'u1' }).allowed).toBe(true);
  });

  it('fails closed on restricted records unless the actor is on the team', () => {
    expect(authorize(member, 'read', { type: 'record', classification: 'restricted', ownerId: 'u1' }).allowed).toBe(false);
    expect(authorize(member, 'read', { type: 'record', classification: 'restricted', teamIds: ['deal-team'] }).allowed).toBe(true);
    expect(authorize(admin, 'read', { type: 'record', classification: 'restricted' }).allowed).toBe(false);
  });

  it('throws AccessDeniedError from assertAuthorized', () => {
    expect(() => assertAuthorized(admin, 'read', { type: 'workstyle', ownerId: 'u1' })).toThrow(AccessDeniedError);
  });
});
