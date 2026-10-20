export const CONNECTOR_IDS = [
  'm365', 'mail', 'cal', 'teams', 'sp', 'alphasense', 'harmonic', 'carta', 'pitchbook', 'godel', 'legistorm', 'opensecrets', 'plaud', 'superhuman', 'todoist',
] as const;
export type ConnectorId = (typeof CONNECTOR_IDS)[number];

export type ConnectorGroupId = 'prod' | 'inv' | 'gov';

// SPEC §8. `soon` is the only live state in this release; the others are supported for later phases.
export type ConnectorState = 'connected' | 'connecting' | 'available' | 'admin' | 'requested' | 'soon' | 'notify';

export type Connector = {
  id: ConnectorId;
  name: string;
  mono: string;
  logo?: string;
  group: ConnectorGroupId;
  tone: 0 | 1 | 2 | 3 | 4 | 5;
  kind: string;
  enables: string;
  access: string;
  focusAreas?: ReadonlyArray<string>;
};

export const CONNECTORS: ReadonlyArray<Connector> = [
  { id: 'm365', name: 'Microsoft 365', mono: 'M365', logo: '/logos/microsoft365.svg', group: 'prod', tone: 0, kind: 'Identity & directory', enables: 'Single sign-on, your directory profile and permissions.', access: 'Signed in with Microsoft Entra ID' },
  { id: 'mail', name: 'Outlook Email', mono: 'Ol', logo: '/logos/outlook.svg', group: 'prod', tone: 0, kind: 'Email', enables: 'Turn important threads into relationship history and follow-ups — or forward to redsky@rsmcapital.com.', access: 'Reads only messages you forward or flag' },
  { id: 'cal', name: 'Outlook Calendar', mono: 'Ca', logo: '/logos/outlook.svg', group: 'prod', tone: 0, kind: 'Calendar', enables: "Today's meetings with attendees, related deals and AI preparation briefs.", access: 'Reads events on your calendar' },
  { id: 'teams', name: 'Microsoft Teams', mono: 'Tm', logo: '/logos/teams.svg', group: 'prod', tone: 4, kind: 'Chat & meetings', enables: 'Surface decisions and notes from meetings you attend; deliver your Daily Brief.', access: 'Reads meeting notes you can already see' },
  { id: 'sp', name: 'OneDrive / SharePoint', mono: 'Sp', logo: '/logos/onedrive.svg', group: 'prod', tone: 2, kind: 'Documents', enables: 'Search and link documents to deals, projects and people.', access: 'Respects existing SharePoint permissions' },
  { id: 'alphasense', name: 'AlphaSense', mono: 'As', group: 'inv', tone: 1, kind: 'Market research', enables: 'Expert calls and research inside company profiles and briefs.', access: 'Firm license — configured by an administrator', focusAreas: ['vc', 'research', 'exec'] },
  { id: 'harmonic', name: 'Harmonic', mono: 'Hm', group: 'inv', tone: 3, kind: 'Venture sourcing', enables: 'Company signals, hiring trends and sourcing alerts.', access: 'Firm license — configured by an administrator', focusAreas: ['vc', 'research'] },
  { id: 'carta', name: 'Carta', mono: 'Ct', group: 'inv', tone: 2, kind: 'Cap tables', enables: 'Portfolio ownership and cap-table context on company records.', access: 'Read-only portfolio access', focusAreas: ['vc', 'finance', 'exec'] },
  { id: 'pitchbook', name: 'PitchBook', mono: 'Pb', group: 'inv', tone: 5, kind: 'Private markets', enables: 'Comparable transactions and deal history.', access: 'Licensing under review', focusAreas: ['vc', 'research'] },
  { id: 'godel', name: 'Gödel Terminal', mono: 'Gö', group: 'inv', tone: 4, kind: 'Market data', enables: 'Market data and terminal workflows — evaluation in progress.', access: 'Integration being verified', focusAreas: ['vc', 'finance'] },
  { id: 'legistorm', name: 'LegiStorm', mono: 'Ls', group: 'gov', tone: 1, kind: 'Government relations', enables: 'Track legislation, staff and officials alongside your relationships.', access: 'Firm license — configured by an administrator', focusAreas: ['ga', 'legal', 'exec'] },
  { id: 'opensecrets', name: 'OpenSecrets', mono: 'Os', group: 'gov', tone: 3, kind: 'Public data', enables: 'Campaign-finance and lobbying context on organizations.', access: 'Public data source', focusAreas: ['ga', 'research'] },
  { id: 'plaud', name: 'Plaud', mono: 'Pl', group: 'prod', tone: 5, kind: 'Meeting recorder', enables: 'Bring Plaud recordings, transcripts and summaries into meeting notes and follow-ups.', access: 'Only recordings you choose to share' },
  { id: 'superhuman', name: 'Superhuman Mail', mono: 'Su', group: 'prod', tone: 1, kind: 'Email', enables: 'Log Superhuman threads and reminders to relationship history and My Tasks.', access: 'Only threads you choose to log' },
  { id: 'todoist', name: 'Todoist', mono: 'Td', logo: '/logos/todoist.svg', group: 'prod', tone: 3, kind: 'Task manager', enables: 'Keep Todoist tasks and My Tasks in sync, with links to deals and projects.', access: 'Tasks in projects you select' },
];

export const CONNECTOR_GROUPS: ReadonlyArray<{ id: ConnectorGroupId; name: string; desc: string }> = [
  { id: 'prod', name: 'Productivity', desc: 'Microsoft 365 is RSM’s system of record for email, calendar and files.' },
  { id: 'inv', name: 'Investment Intelligence', desc: 'Research and data providers for the investment team.' },
  { id: 'gov', name: 'Government Affairs & Research', desc: 'Legislative and public-interest data.' },
];

export const CONNECTOR_STATE_VIEW: Record<ConnectorState, { chip: 'ok' | 'outline' | 'warn' | 'neutral'; label: string; action: string; actionVariant: 'ghost' | 'primary' | 'default'; disabled: boolean; busy?: boolean }> = {
  connected: { chip: 'ok', label: 'Connected', action: 'Disconnect', actionVariant: 'ghost', disabled: false },
  connecting: { chip: 'outline', label: 'Connecting…', action: 'Connecting', actionVariant: 'default', disabled: true, busy: true },
  available: { chip: 'outline', label: 'Available to connect', action: 'Connect', actionVariant: 'primary', disabled: false },
  admin: { chip: 'warn', label: 'Requires administrator setup', action: 'Request access', actionVariant: 'default', disabled: false },
  requested: { chip: 'warn', label: 'Access requested', action: 'Request sent', actionVariant: 'default', disabled: true },
  soon: { chip: 'neutral', label: 'Coming soon', action: 'Notify me', actionVariant: 'ghost', disabled: false },
  notify: { chip: 'neutral', label: 'Coming soon', action: 'You’ll be notified', actionVariant: 'ghost', disabled: true },
};

export function connectorById(id: string): Connector | undefined {
  return CONNECTORS.find((connector) => connector.id === id);
}
