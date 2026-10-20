'use client';

import type { WsRecommendationId } from '@/features/workstyle/catalog';
import { useViewer } from '@/lib/client/viewer';
import { useWorkstyle } from '@/lib/client/workstyle';

// "Workstyle suggestion" chips on later onboarding steps: shown when an undismissed recommendation proposes
// exactly that option (prototype wsSuggests).
export function useWorkstyleSuggestion() {
  const viewer = useViewer();
  const enabled = viewer.config.workstyleStorageAvailable && viewer.workstyle.present && viewer.workstyle.reviewed;
  const query = useWorkstyle(enabled);
  return (id: WsRecommendationId, value: string) => {
    if (!enabled || !query.data) return false;
    const recommendation = query.data.recommendations.find((entry) => entry.id === id);
    return Boolean(recommendation && recommendation.status !== 'dismissed' && recommendation.choice === value);
  };
}
