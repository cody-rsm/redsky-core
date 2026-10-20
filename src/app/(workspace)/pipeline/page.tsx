import type { Metadata } from 'next';
import { PipelineView } from '@/components/pages/pipeline-view';

export const metadata: Metadata = { title: 'Deal Pipeline' };

export default function PipelinePage() {
  return <PipelineView />;
}
