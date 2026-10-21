// Normalized CRM domain models. RedSky code depends on these, never on a provider's response shape, so Twenty
// (today) can be replaced or joined by other sources later. Fields a source cannot provide are null.

export type CrmContact = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  companyId: string | null;
  companyName: string | null;
  location: string | null;
  // Present only when the RSM schema extension (rsm-core) is installed in the CRM.
  relationshipStrength: number | null;
  lastInteractionAt: string | null;
  sensitivity: string | null;
  doNotContact: boolean | null;
  updatedAt: string | null;
};

export type CrmCompany = {
  id: string;
  name: string;
  domain: string | null;
  city: string | null;
  description: string | null;
  updatedAt: string | null;
};

export type CrmOpportunity = {
  id: string;
  name: string;
  amount: { value: number; currency: string } | null;
  stage: string;
  closeDate: string | null;
  companyId: string | null;
  pointOfContactId: string | null;
};

export type CrmActivity = { id: string; kind: 'note' | 'task'; title: string; status: string | null; dueAt: string | null; createdAt: string | null };

export type CrmPage<TItem> = { items: TItem[]; nextCursor: string | null; totalCount: number | null };

export type CrmListOptions = { limit?: number; cursor?: string | null; search?: string };

export type CrmHealth = 'ok' | 'unauthorized' | 'unreachable';

export type NewCrmContact = { firstName: string; lastName: string; email?: string; jobTitle?: string; companyId: string | null };
export type CrmNoteTarget = { kind: 'contact' | 'company'; id: string };

export interface CrmAdapter {
  readonly provider: string;
  health(): Promise<CrmHealth>;
  listContacts(options?: CrmListOptions): Promise<CrmPage<CrmContact>>;
  getContact(id: string): Promise<CrmContact | null>;
  listCompanies(options?: CrmListOptions): Promise<CrmPage<CrmCompany>>;
  getCompany(id: string): Promise<CrmCompany | null>;
  listOpportunities(options?: CrmListOptions): Promise<CrmPage<CrmOpportunity>>;
  // Writes. Callers make them only with a person's own credential, never a shared key (DECISIONS.md 16).
  findDuplicateContacts(input: { firstName: string; lastName: string; email?: string }): Promise<CrmContact[]>;
  findCompaniesByName(name: string, limit: number): Promise<CrmCompany[]>;
  createCompany(input: { name: string }): Promise<CrmCompany>;
  createContact(input: NewCrmContact): Promise<CrmContact>;
  addNote(input: { title?: string; body: string; target: CrmNoteTarget }): Promise<{ id: string }>;
}

export class CrmError extends Error {
  constructor(
    // unauthorized: the credential was refused (401); forbidden: the person's role doesn't allow it (403); invalid: the
    // CRM rejected the input (400), with its message.
    public readonly kind: 'unauthorized' | 'forbidden' | 'invalid' | 'unreachable' | 'rate_limited' | 'bad_response',
    message: string,
  ) {
    super(message);
  }
}
