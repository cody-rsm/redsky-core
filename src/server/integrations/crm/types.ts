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

export interface CrmAdapter {
  readonly provider: string;
  health(): Promise<CrmHealth>;
  listContacts(options?: CrmListOptions): Promise<CrmPage<CrmContact>>;
  getContact(id: string): Promise<CrmContact | null>;
  listCompanies(options?: CrmListOptions): Promise<CrmPage<CrmCompany>>;
  getCompany(id: string): Promise<CrmCompany | null>;
  listOpportunities(options?: CrmListOptions): Promise<CrmPage<CrmOpportunity>>;
}

export class CrmError extends Error {
  constructor(
    public readonly kind: 'unauthorized' | 'unreachable' | 'rate_limited' | 'bad_response',
    message: string,
  ) {
    super(message);
  }
}
