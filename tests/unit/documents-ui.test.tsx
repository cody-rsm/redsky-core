// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentUploadForm } from '@/components/documents/upload-form';
import { Modal } from '@/components/ui/dialog';
import { Snippet } from '@/components/pages/documents-view';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// As in the app: the form sits in the quick-create dialog.
const inDialog = (node: ReactNode) => (
  <QueryClientProvider client={new QueryClient()}>
    <Modal open onOpenChange={() => undefined} label="Upload document">
      {node}
    </Modal>
  </QueryClientProvider>
);

describe('Snippet', () => {
  it('highlights matches and never interprets the text as HTML', () => {
    const { container } = render(
      <p>
        <Snippet text={'Revenue <b>grew</b> in the <<third quarter>> of <<2026>>'} />
      </p>,
    );
    expect(screen.getByText('third quarter').tagName).toBe('MARK');
    expect(screen.getByText('2026').tagName).toBe('MARK');
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toBe('Revenue <b>grew</b> in the third quarter of 2026');
  });
});

describe('DocumentUploadForm', () => {
  it('uploads the chosen file with its visibility, after checking it', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'd1', fileName: 'memo.pdf', status: 'queued', noAi: false }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const onClose = vi.fn();
    render(inDialog(<DocumentUploadForm onClose={onClose} />));

    const upload = screen.getByRole('button', { name: 'Upload' });
    expect(upload).toBeDisabled();
    await user.upload(screen.getByLabelText('Choose a file to upload'), new File(['MZ'], 'setup.exe'));
    expect(screen.getByRole('alert')).toHaveTextContent('RedSky reads PDF, Word');
    expect(upload).toBeDisabled();

    await user.upload(screen.getByLabelText('Choose a file to upload'), new File(['%PDF-1.7'], 'memo.pdf', { type: 'application/pdf' }));
    expect(screen.queryByRole('alert')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'All RSM staff' }));
    await user.type(screen.getByLabelText('Link to'), 'Halcyon Robotics');
    await user.click(upload);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/documents');
    const form = init.body as FormData;
    expect((form.get('file') as File).name).toBe('memo.pdf');
    expect(form.get('visibility')).toBe('firm');
    expect(form.get('related')).toBe('Halcyon Robotics');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the server’s reason when an upload is refused', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'bad_request', message: 'RedSky reads PDF, Word, PowerPoint, Excel and image files (PNG, JPEG, TIFF).' } }), { status: 400 })));
    const onClose = vi.fn();
    render(inDialog(<DocumentUploadForm onClose={onClose} />));
    await user.upload(screen.getByLabelText('Choose a file to upload'), new File(['not really a pdf'], 'notes.pdf', { type: 'application/pdf' }));
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('RedSky reads PDF');
    expect(onClose).not.toHaveBeenCalled();
  });
});
