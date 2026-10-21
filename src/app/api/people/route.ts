import { initialsFromName } from '@/components/ui/avatar';
import { DEMO_PEOPLE } from '@/demo/sample-records';
import type { PeopleResponse } from '@/lib/api/contracts';
import { getConfig } from '@/server/config/env';
import { ownerName } from '@/server/data/demo/helpers';
import { authedRoute } from '@/server/http/api';
import { crmAccessFor } from '@/server/integrations/crm';
import { CrmError } from '@/server/integrations/crm/types';
import { buildProviderContext } from '@/server/services/workspace-service';


export const GET = authedRoute(async ({ request, user, actor }): Promise<PeopleResponse> => {
  if (getConfig().dataMode === 'demo') {
    const context = await buildProviderContext(user, actor);
    const rows = Object.entries(DEMO_PEOPLE)
      .filter(([, person]) => !person.internal)
      .map(([id, person]) => ({ id, name: person.name, initials: initialsFromName(person.name), tone: person.tone, title: person.title, org: person.org, owner: ownerName(person.owner, context), last: person.last ?? '—', strength: person.strength ?? null }));
    return { status: 'ok', sample: true, rows, nextCursor: null };
  }
  try {
    const access = await crmAccessFor(user.id);
    if (access.status === 'not_configured') return { status: 'not_connected' };
    if (access.status === 'connect_required') return { status: 'connect_required' };
    const page = await access.adapter.listContacts({ limit: 50, cursor: request.nextUrl.searchParams.get('cursor') });
    return {
      status: 'ok',
      sample: false,
      nextCursor: page.nextCursor,
      rows: page.items.map((contact) => ({ id: contact.id, name: contact.fullName, initials: initialsFromName(contact.fullName), tone: 0, title: contact.jobTitle ?? '', org: contact.companyName ?? '—', owner: '—', last: contact.lastInteractionAt ? contact.lastInteractionAt.slice(0, 10) : '—', strength: null })),
    };
  } catch (error) {
    if (!(error instanceof CrmError && error.kind === 'unauthorized')) return { status: 'error', message: 'The CRM could not be reached.' };
    return { status: 'error', message: getConfig().crm.access === 'per_user' ? 'The CRM didn’t accept your connection. Reconnect it in Settings › Connected apps.' : 'The CRM rejected RedSky’s credentials.' };
  }
});
