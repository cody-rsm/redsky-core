import { Icon } from '@/components/ui/icon';
import type { WorkstyleDetail } from '@/lib/api/contracts';

export function sourceLabel(detail: WorkstyleDetail): string {
  if (detail.sourceKind === 'sample') return 'sample data';
  if (detail.sourceKind === 'manual') return detail.profile ? 'entered by you' : 'not yet confirmed';
  return detail.profile ? 'scores reviewed by you' : 'waiting for your review';
}

// Shown when the deployment has no encryption key: assessment data is never stored unencrypted.
export function WorkstyleStorageNote() {
  return (
    <div className="note note-wn" style={{ marginTop: 12 }} role="status">
      <Icon name="alert" size="s" style={{ marginTop: 1, color: 'var(--wn)' }} />
      <span>Workstyle Intelligence isn’t available yet — your administrator hasn’t configured encrypted storage for assessments. You can still set every preference yourself.</span>
    </div>
  );
}
