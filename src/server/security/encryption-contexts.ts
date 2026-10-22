// AAD contexts for the columns encrypted with REDSKY_ENCRYPTION_KEY. The services that write a column and the key
// rotation command must agree on them, so they live here rather than in either.

export type WorkstyleEncryptedField = 'name' | 'draft' | 'profile' | 'document';
export type CrmTokenKind = 'refresh' | 'access';

export const workstyleContext = (userId: string, field: WorkstyleEncryptedField): string => `workstyle:${userId}:${field}`;

export const crmTokenContext = (provider: string, userId: string, kind: CrmTokenKind): string => `crm:${provider}:${userId}:${kind}`;
