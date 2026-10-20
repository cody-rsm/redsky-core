import { initialsFromName } from '@/components/ui/avatar';
import { DEMO_PEOPLE } from '@/demo/sample-records';
import { getConfig } from '@/server/config/env';
import { ownerName } from '@/server/data/demo/helpers';
import { authedRoute } from '@/server/http/api';
import { getCrmAdapter } from '@/server/integrations/crm';
import { CrmError } from '@/server/integrations/crm/types';
import { buildProviderContext } from '@/server/services/workspace-service';

export type PeopleRow = { id: string; name: string; initials: string; tone: number; title: string; org: string; owner: string; last: string; strength: string | null };
export type PeopleResponse = { status: 'ok'; sample: boolean; rows: PeopleRow[]; nextCursor: string | null } | { status: 'not_connected' } | { status: 'error'; message: string };

export const GET = authedRoute(async ({ request, user, actor }): Promise<PeopleResponse> => {
  if (getConfig().dataMode === 'demo') {
    const context = await buildProviderContext(user, actor);
    const rows = Object.entries(DEMO_PEOPLE)
      .filter(([, person]) => !person.internal)
      .map(([id, person]) => ({ id, name: person.name, initials: initialsFromName(person.name), tone: person.tone, title: person.title, org: person.org, owner: ownerName(person.owner, context), last: person.last ?? '—', strength: person.strength ?? null }));
    return { status: 'ok', sample: true, rows, nextCursor: null };
  }
  const crm = getCrmAdapter();
  if (!crm) return { status: 'not_connected' };
  try {
    const page = await crm.listContacts({ limit: 50, cursor: request.nextUrl.searchParams.get('cursor') });
    return {
      status: 'ok',
      sample: false,
      nextCursor: page.nextCursor,
      rows: page.items.map((contact) => ({ id: contact.id, name: contact.fullName, initials: initialsFromName(contact.fullName), tone: 0, title: contact.jobTitle ?? '', org: contact.companyName ?? '—', owner: '—', last: contact.lastInteractionAt ? contact.lastInteractionAt.slice(0, 10) : '—', strength: null })),
    };
  } catch (error) {
    return { status: 'error', message: error instanceof CrmError && error.kind === 'unauthorized' ? 'The CRM rejected RedSky’s credentials.' : 'The CRM could not be reached.' };
  }
});
