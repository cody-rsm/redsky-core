import 'server-only';
import { initialsFromName } from '@/components/ui/avatar';
import { connectorById, type ConnectorId } from '@/features/integrations/catalog';
import type { NotConnectedSource, RecordPreview, SearchResult, WidgetResponse } from '@/lib/api/contracts';
import { getCrmAccess } from '@/server/integrations/crm';
import { CrmError } from '@/server/integrations/crm/types';
import { logger } from '@/server/logging/logger';
import { documentsConfigured, recentDocumentViews } from '@/server/services/document-service';
import type { ProviderWidgetId, WorkspaceDataProvider } from './types';

// Production never shows sample content. A widget whose source system is not connected renders the designed
// "not connected" state (SPEC §8) with copy describing what connecting would enable.

function connectorSource(connectorId: ConnectorId, title: string, body: string): NotConnectedSource {
  const connector = connectorById(connectorId);
  return { connectorId, title, body, mono: connector?.mono ?? '··', tone: connector?.tone ?? 0, logo: connector?.logo };
}

const PLANNED_SOURCES: Record<Exclude<ProviderWidgetId, 'airecs'>, NotConnectedSource> = {
  meetings: connectorSource('cal', "Connect Outlook Calendar to see today's meetings", 'RedSky will show attendees, related deals and projects, and prepare briefs before each meeting.'),
  relationships: { connectorId: 'crm', title: 'Relationship intelligence needs the RSM CRM', body: 'Reconnect suggestions use interaction history from the CRM, email and calendar once they are connected.', mono: 'CR', tone: 0 },
  pipeline: { connectorId: 'crm', title: 'The deal pipeline arrives with the CRM deal model', body: 'Stage counts and movement appear once RSM’s deal records are connected (Phase 3).', mono: 'DP', tone: 5 },
  projects: { connectorId: 'projects', title: 'Projects arrive in Phase 3', body: 'Initiatives, milestones and owners will appear here when the Projects module ships.', mono: 'Pr', tone: 3 },
  intel: connectorSource('alphasense', 'Intelligence needs a licensed provider', 'News and market intelligence appear once an approved provider is configured by an administrator.'),
  govaffairs: connectorSource('legistorm', 'Connect LegiStorm to track legislation', 'Bills, proceedings and next dates you track will appear here once the firm license is configured.'),
  approvals: { connectorId: 'approvals', title: 'Approvals arrive in Phase 3', body: 'Decisions waiting on you will appear here when approval workflows ship.', mono: 'Ap', tone: 4 },
  portfolio: connectorSource('carta', 'Connect Carta to follow portfolio companies', 'Updates, status and owners for companies you follow appear once portfolio data is connected.'),
  documents: connectorSource('sp', 'Connect OneDrive / SharePoint', 'See recent files from the deals and projects you work on — with existing permissions respected.'),
  team: { connectorId: 'crm', title: 'Team activity needs the RSM CRM', body: 'Logged calls, uploads and stage changes from colleagues appear once the CRM is connected.', mono: 'Tm', tone: 2 },
};

export const productionProvider: WorkspaceDataProvider = {
  mode: 'production',

  async widget(id, context) {
    if (id === 'airecs') return { status: 'ok', sample: false, data: { items: [] } } as WidgetResponse<never>;
    // Files uploaded in RedSky; SharePoint documents join them once that connector exists.
    if (id === 'documents' && documentsConfigured()) return { status: 'ok', sample: false, data: { items: await recentDocumentViews(context.actor, 12) } } as WidgetResponse<never>;
    return { status: 'not_connected', source: PLANNED_SOURCES[id as Exclude<ProviderWidgetId, 'airecs'>] };
  },

  async externalAttention() {
    return [];
  },

  async brief(context, attentionOpenCount) {
    const tasks = attentionOpenCount === 1 ? '1 open task' : `${attentionOpenCount} open tasks`;
    return {
      status: 'ok',
      sample: false,
      data: {
        body: `You have ${tasks} in RedSky. Your Daily Brief will also summarize today’s meetings, relationships and pipeline once Outlook Calendar and the RSM CRM are connected.`,
        synthesized: false,
        provenance: 'From your RedSky tasks · other sources not connected yet',
        stats: [
          { key: 'meetings', value: '—', label: 'Calendar not connected', target: { kind: 'settings', tab: 'apps' } },
          { key: 'tasks', value: String(attentionOpenCount), label: 'Need your attention', target: { kind: 'tab', tab: 'tasks' } },
          { key: 'opps', value: '—', label: 'Pipeline not connected', target: { kind: 'nav', href: '/pipeline' } },
          { key: 'followups', value: '—', label: 'Email not connected', target: { kind: 'settings', tab: 'apps' } },
        ],
        highlights: [],
      },
    };
  },

  async pipelineBoard() {
    return { status: 'not_connected', source: PLANNED_SOURCES.pipeline };
  },

  async record(kind, id, context) {
    if (kind !== 'contact' && kind !== 'company') return null;
    const access = await getCrmAccess(context.userId);
    if (access.status !== 'connected') return null;
    const crm = access.adapter;
    try {
      if (kind === 'contact') {
        const contact = await crm.getContact(id);
        if (!contact) return null;
        return {
          ...emptyPreview('contact', id),
          kindLabel: 'Person',
          title: contact.fullName,
          subtitle: [contact.jobTitle, contact.companyName].filter(Boolean).join(' · '),
          avatar: { name: contact.fullName, initials: initialsFromName(contact.fullName), tone: 0 },
          icon: 'user',
          fields: [
            { label: 'Organization', value: contact.companyName ?? '—' },
            { label: 'Email', value: contact.email ?? '—' },
            { label: 'Phone', value: contact.phone ?? '—' },
            ...(contact.location ? [{ label: 'Location', value: contact.location }] : []),
            ...(contact.lastInteractionAt ? [{ label: 'Last interaction', value: contact.lastInteractionAt.slice(0, 10) }] : []),
          ],
          access: 'Visible under your CRM role',
          actions: ['create_task'],
          org: contact.companyName,
        };
      }
      const company = await crm.getCompany(id);
      if (!company) return null;
      return {
        ...emptyPreview('company', id),
        kindLabel: 'Company',
        title: company.name,
        subtitle: [company.domain, company.city].filter(Boolean).join(' · ') || 'Organization',
        icon: 'company',
        fields: [
          { label: 'Website', value: company.domain ?? '—' },
          { label: 'City', value: company.city ?? '—' },
        ],
        activity: company.description ? [{ date: 'Profile', text: company.description }] : [],
        access: 'Visible under your CRM role',
        actions: ['create_task'],
        org: company.name,
      };
    } catch (error) {
      logger.warn('CRM record lookup failed', { kind, error: error instanceof CrmError ? error.kind : error });
      return null;
    }
  },

  async meetingPrep() {
    return null;
  },

  async search(query, context) {
    if (query.trim().length < 2) return { results: [], recent: [] };
    const access = await getCrmAccess(context.userId);
    if (access.status !== 'connected') return { results: [], recent: [] };
    try {
      const contacts = await access.adapter.listContacts({ search: query, limit: 5 });
      const results: SearchResult[] = contacts.items.map((contact) => ({
        kind: 'person',
        id: contact.id,
        label: contact.fullName,
        sub: [contact.jobTitle, contact.companyName].filter(Boolean).join(' · '),
        icon: 'user',
        record: { kind: 'contact', id: contact.id },
      }));
      return { results, recent: [] };
    } catch (error) {
      logger.warn('CRM search failed', { error: error instanceof CrmError ? error.kind : error });
      return { results: [], recent: [] };
    }
  },

  async notifications() {
    return { status: 'empty' };
  },
};

function emptyPreview(kind: RecordPreview['kind'], id: string): RecordPreview {
  return { kind, id, kindLabel: '', title: '', subtitle: '', sample: false, avatar: null, icon: 'doc', fields: [], stages: null, progress: null, openCommitment: null, aiSuggestion: null, activity: [], related: [], access: '', actions: [], approval: null, asks: {}, isPublicOfficial: false, org: null };
}
