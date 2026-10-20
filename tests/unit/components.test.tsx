// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Segmented } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';
import { ConsentCheckbox, ReportDrop } from '@/components/workstyle/intake';
import { ReviewForm } from '@/components/workstyle/review-form';
import type { WorkstyleDetail } from '@/lib/api/contracts';

afterEach(cleanup);

const withQuery = (node: ReactNode) => <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>;

function ConsentAndDrop({ onFile }: { onFile: (file: File) => void }) {
  const [consent, setConsent] = useState(false);
  return (
    <>
      <ConsentCheckbox checked={consent} onChange={setConsent} />
      <ReportDrop consent={consent} onFile={onFile} />
    </>
  );
}

describe('Workstyle intake', () => {
  it('keeps upload disabled until consent is given', async () => {
    const user = userEvent.setup();
    const onFile = vi.fn();
    render(<ConsentAndDrop onFile={onFile} />);
    const input = screen.getByLabelText('Upload your TTI Talent Insights report (PDF)');
    expect(input).toBeDisabled();
    expect(screen.getByText('Confirm consent above to enable upload')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /I consent to RedSky processing my assessment/ }));
    expect(screen.getByRole('checkbox', { name: /I consent/ })).toHaveAttribute('aria-checked', 'true');
    expect(input).toBeEnabled();
    await user.upload(input, new File(['%PDF-1.7'], 'report.pdf', { type: 'application/pdf' }));
    expect(onFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'report.pdf' }));
  });
});

describe('ReviewForm', () => {
  const detail: WorkstyleDetail = {
    present: true,
    consentGiven: true,
    sourceKind: 'upload',
    fileName: 'report.pdf',
    addedAt: '2026-10-19T12:00:00.000Z',
    extraction: { status: 'partial', foundCount: 2, expectedCount: 14, parserVersion: 'tti-heuristic-0.1', pageCount: 20 },
    draft: {
      disc: { D: { natural: 72, adapted: 68 }, I: { natural: null, adapted: null }, S: { natural: null, adapted: null }, C: { natural: null, adapted: null } },
      drivingForces: { knowledge: null, utility: null, surroundings: null, others: null, power: null, methodologies: null },
      preferences: { communication: '', decisionMaking: '', motivation: '', environment: '' },
    },
    found: { disc: { D: { natural: true, adapted: true } }, drivingForces: {} },
    profile: null,
    recommendations: [],
    recommendationStates: null,
    baseline: null,
    sharing: { manager: false, colleagues: false },
    retainOriginal: false,
  };

  it('explains a partial extraction and blocks confirmation until every score is entered', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(withQuery(<ReviewForm detail={detail} />));
    expect(screen.getByRole('status')).toHaveTextContent('RedSky found 2 of 14 scores');
    expect(screen.getByLabelText('Dominance natural score')).toHaveValue(72);
    expect(screen.getAllByText('Not found').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Use these values' }));
    expect(await screen.findByText('Enter each DISC score as a whole number from 0 to 100.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/workstyle/review', expect.anything());
    vi.unstubAllGlobals();
  });
});

describe('form primitives', () => {
  it('exposes switches as role="switch" with aria-checked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch checked={false} label="Share a summary" onCheckedChange={onChange} />);
    const control = screen.getByRole('switch', { name: 'Share a summary' });
    expect(control).toHaveAttribute('aria-checked', 'false');
    await user.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('marks the selected segmented option as pressed', () => {
    render(<Segmented label="Detail level" value="balanced" onChange={() => undefined} options={[{ value: 'focused', label: 'Focused' }, { value: 'balanced', label: 'Balanced' }]} />);
    expect(screen.getByRole('button', { name: 'Balanced' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Focused' })).toHaveAttribute('aria-pressed', 'false');
  });
});
