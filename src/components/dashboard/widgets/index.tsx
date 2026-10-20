import type { ComponentType } from 'react';
import type { WidgetId } from '@/features/personalization/catalog';
import type { WidgetSlot } from '../widget-frame';
import { AiRecsWidget } from './airecs-widget';
import { ApprovalsWidget } from './approvals-widget';
import { AttentionWidget } from './attention-widget';
import { BriefWidget } from './brief-widget';
import { DocumentsWidget } from './documents-widget';
import { GovAffairsWidget } from './govaffairs-widget';
import { IntelWidget } from './intel-widget';
import { MeetingsWidget } from './meetings-widget';
import { PipelineWidget } from './pipeline-widget';
import { PortfolioWidget } from './portfolio-widget';
import { ProjectsWidget } from './projects-widget';
import { RelationshipsWidget } from './relationships-widget';
import { TeamWidget } from './team-widget';

export const WIDGET_COMPONENTS: Record<WidgetId, ComponentType<{ slot: WidgetSlot }>> = {
  brief: BriefWidget,
  attention: AttentionWidget,
  meetings: MeetingsWidget,
  relationships: RelationshipsWidget,
  pipeline: PipelineWidget,
  projects: ProjectsWidget,
  intel: IntelWidget,
  govaffairs: GovAffairsWidget,
  airecs: AiRecsWidget,
  approvals: ApprovalsWidget,
  portfolio: PortfolioWidget,
  documents: DocumentsWidget,
  team: TeamWidget,
};
