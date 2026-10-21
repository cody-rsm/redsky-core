import type { IconName } from '@/components/ui/icon';

export const CREATE_TYPES = ['task', 'contact', 'meeting', 'opportunity', 'document', 'research', 'note'] as const;
export type CreateType = (typeof CREATE_TYPES)[number];

export type CreateDefinition = {
  title: string;
  icon: IconName;
  fieldLabel: string;
  placeholder: string;
  relLabel: string;
  choice?: { label: string; options: ReadonlyArray<string> };
  note: string;
  saveLabel: string;
  // RedSky-native creates persist in RedSky. The others write to systems that are not connected yet, so in
  // production they explain that instead of pretending to save (demo mode simulates them, labeled).
  native: boolean;
};

export const PIPELINE_STAGES = ['Sourcing', 'Initial Review', 'Due Diligence', 'Investment Committee', 'Negotiation', 'Closed / Portfolio'] as const;

export const CREATE_DEFINITIONS: Record<CreateType, CreateDefinition> = {
  task: { title: 'Create task', icon: 'tasks', fieldLabel: 'Task', placeholder: 'What needs to happen?', relLabel: 'Related to', choice: { label: 'Due', options: ['Today', 'Tomorrow', 'This week', 'Next week'] }, note: 'Tasks you create are assigned to you and appear in My Tasks.', saveLabel: 'Create task', native: true },
  contact: { title: 'Add contact', icon: 'user', fieldLabel: 'Full name', placeholder: 'e.g. Jordan Alvarez', relLabel: 'Organization', note: 'RedSky checks for duplicates and routes new contacts for review before they are added.', saveLabel: 'Submit for review', native: false },
  meeting: { title: 'Log meeting', icon: 'calendar', fieldLabel: 'Meeting', placeholder: 'e.g. Coffee with Elena Sorensen', relLabel: 'Related to', choice: { label: 'When', options: ['Today', 'Yesterday', 'Earlier this week'] }, note: 'If a public official attended, this log supports disclosure review.', saveLabel: 'Log meeting', native: false },
  opportunity: { title: 'Add opportunity', icon: 'pipeline', fieldLabel: 'Company', placeholder: 'Company name', relLabel: 'Source / introduced via', choice: { label: 'Stage', options: PIPELINE_STAGES.slice(0, 3) }, note: 'New opportunities start in Sourcing unless a stage is chosen. Sample only.', saveLabel: 'Add opportunity', native: false },
  document: { title: 'Upload document', icon: 'upload', fieldLabel: 'Document name', placeholder: 'e.g. Site visit notes', relLabel: 'Link to', choice: { label: 'Visibility', options: ['Only me', 'Deal or project team', 'All RSM staff'] }, note: 'Uploads in this prototype are simulated — files stay on your device.', saveLabel: 'Upload', native: false },
  note: { title: 'Add note', icon: 'edit', fieldLabel: 'Note', placeholder: '', relLabel: 'Related to', note: 'Saved to the RSM CRM as you.', saveLabel: 'Add note', native: false },
  research: { title: 'Start research', icon: 'flask', fieldLabel: 'Company, person or topic', placeholder: 'e.g. Halcyon Robotics', relLabel: 'Related to', choice: { label: 'Depth', options: ['Quick scan', 'Standard brief', 'Deep dive'] }, note: 'RedSky AI compiles internal records first, then approved external sources.', saveLabel: 'Start research', native: true },
};

export const QUICK_ACTIONS: ReadonlyArray<{ label: string; icon: IconName; type: CreateType }> = [
  { label: 'Add contact', icon: 'user', type: 'contact' },
  { label: 'Log meeting', icon: 'calendar', type: 'meeting' },
  { label: 'Create task', icon: 'tasks', type: 'task' },
  { label: 'Add opportunity', icon: 'pipeline', type: 'opportunity' },
  { label: 'Upload document', icon: 'upload', type: 'document' },
  { label: 'Start research', icon: 'flask', type: 'research' },
];
