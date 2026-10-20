'use client';

import { Drawer, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { DOCUMENT_STATUS_IN_PROGRESS, DOCUMENT_STATUS_LABEL, DOCUMENT_VISIBILITY_OPTIONS, formatBytes } from '@/features/documents/catalog';
import type { DocumentContentView, DocumentRow } from '@/lib/api/contracts';
import { errorMessage } from '@/lib/client/api';
import { useDocument, useDocumentActions, useDocumentContent } from '@/lib/client/documents';
import { useUiStore } from '@/lib/client/ui-store';
import { useViewer } from '@/lib/client/viewer';

const OCR_METHODS = new Set(['ocr', 'layout_ocr', 'vlm']);

export function DocumentDrawer({ documentId, onClose }: { documentId: string | null; onClose: () => void }) {
  return (
    <Drawer open={Boolean(documentId)} onOpenChange={(open) => !open && onClose()} label="Document" wide>
      {documentId ? <DocumentBody key={documentId} documentId={documentId} onClose={onClose} /> : null}
    </Drawer>
  );
}

function DocumentBody({ documentId, onClose }: { documentId: string; onClose: () => void }) {
  const viewer = useViewer();
  const query = useDocument(documentId);
  const document = query.data;
  const content = useDocumentContent(document);
  const { retry, remove } = useDocumentActions();
  const { toast, requestConfirm } = useUiStore.getState();

  function confirmDelete(target: DocumentRow) {
    requestConfirm({
      title: 'Delete this document?',
      body: 'This removes the file and the text RedSky read from it, for everyone who can see it. It can’t be undone.',
      items: [target.fileName],
      ok: 'Delete',
      run: async () => {
        await remove(target.id);
        onClose();
        toast('Document deleted');
      },
    });
  }

  async function retryReading(target: DocumentRow) {
    try {
      await retry(target.id);
      toast('RedSky is reading it again');
    } catch (error) {
      toast(errorMessage(error));
    }
  }

  return (
    <>
      <header className="dh" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <DialogTitle className="grow lbl">Document</DialogTitle>
        <button type="button" className="btn btn-g btn-sm btn-i" aria-label="Close" onClick={onClose}>
          <Icon name="x" size="s" />
        </button>
      </header>
      <div className="db scroll" style={{ gap: 16 }}>
        {query.isPending ? (
          <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="sk-load" style={{ width: '70%', height: 24 }} />
            <span className="sk-load" style={{ width: '100%', height: 90 }} />
          </div>
        ) : null}
        {query.isError ? (
          <div className="empty">
            <span className="tile">
              <Icon name="lock" />
            </span>
            <div style={{ fontWeight: 600, color: 'var(--tx)' }}>This document isn’t available</div>
            <div style={{ fontSize: 12.5 }}>It was deleted, or it isn’t shared with you.</div>
          </div>
        ) : null}
        {document ? (
          <>
            <div>
              <h2 className="serif" style={{ fontSize: 24, overflowWrap: 'anywhere' }}>
                {document.fileName}
              </h2>
              <p className="muted" style={{ marginTop: 6, fontSize: 12.5 }}>
                {[
                  document.owner.isYou ? 'Uploaded by you' : `Uploaded by ${document.owner.name}`,
                  new Date(document.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: viewer.config.timeZone }),
                  formatBytes(document.sizeBytes),
                  document.pageCount ? `${document.pageCount} ${document.pageCount === 1 ? 'page' : 'pages'}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                <span className={`chip ${DOCUMENT_STATUS_LABEL[document.status].tone}`}>{DOCUMENT_STATUS_LABEL[document.status].label}</span>
                <span className="chip chip-o">{DOCUMENT_VISIBILITY_OPTIONS.find((option) => option.value === document.visibility)?.label}</span>
                {document.relatedLabel ? <span className="chip chip-o">{document.relatedLabel}</span> : null}
              </div>
            </div>
            {document.statusMessage ? (
              <div className={document.status === 'failed' || document.status === 'needs_review' ? 'note note-wn' : 'note'} role="status">
                <Icon name={DOCUMENT_STATUS_IN_PROGRESS.includes(document.status) ? 'clock' : 'alert'} size="s" style={{ marginTop: 1 }} />
                <span>{document.statusMessage}</span>
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a className="btn btn-sm" href={`/api/documents/${document.id}/file`} download>
                <Icon name="down" size="s" />
                Download original
              </a>
              {document.canChange && (document.status === 'failed' || document.status === 'registering') ? (
                <button type="button" className="btn btn-sm" onClick={() => void retryReading(document)}>
                  <Icon name="refresh" size="s" />
                  Try reading again
                </button>
              ) : null}
              {document.canChange ? (
                <button type="button" className="btn btn-sm btn-g" onClick={() => confirmDelete(document)}>
                  <Icon name="x" size="s" />
                  Delete
                </button>
              ) : null}
            </div>
            <ExtractedText document={document} content={content.data} loading={content.isPending && content.fetchStatus !== 'idle'} error={content.isError ? errorMessage(content.error) : null} />
          </>
        ) : null}
      </div>
    </>
  );
}

function ExtractedText({ document, content, loading, error }: { document: DocumentRow; content: DocumentContentView | undefined; loading: boolean; error: string | null }) {
  if (document.noAi) return null;
  if (DOCUMENT_STATUS_IN_PROGRESS.includes(document.status)) {
    return (
      <div className="wstate" aria-busy="true">
        <Icon name="refresh" className="spin" />
        <b>RedSky is reading this file</b>
        <span>Scanned pages take a few seconds each. This page updates by itself.</span>
      </div>
    );
  }
  if (loading) return <span className="sk-load" style={{ width: '100%', height: 160 }} />;
  if (error) {
    return (
      <div className="wstate" role="alert">
        <b>Couldn’t load the text</b>
        <span>{error}</span>
      </div>
    );
  }
  if (!content || content.status !== 'ready') return null;
  const nonEmptyPages = content.pages.filter((page) => page.text.trim());
  return (
    <section aria-label="Extracted text" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="lbl">Extracted text</div>
      {nonEmptyPages.length === 0 ? <div className="empty">No text was found in this file.</div> : null}
      {nonEmptyPages.map((page) => (
        <article key={page.pageNumber} style={{ border: '1px solid var(--bd)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <span className="faint" style={{ fontSize: 11.5, fontWeight: 600 }}>
              Page {page.pageNumber}
            </span>
            {page.method && OCR_METHODS.has(page.method) ? <span className="chip">Read from a scan</span> : null}
          </div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, overflowWrap: 'anywhere' }}>{page.text}</div>
        </article>
      ))}
      {content.tables.length > 0 ? <div className="lbl">Tables</div> : null}
      {content.tables.map((table) => (
        <div key={table.index} style={{ overflowX: 'auto', border: '1px solid var(--bd)', borderRadius: 10 }}>
          <table className="tbl" aria-label={table.caption ?? `Table ${table.index + 1}${table.pageNumber ? `, page ${table.pageNumber}` : ''}`}>
            <tbody>
              {table.cells.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <p className="faint" style={{ fontSize: 11.5 }}>
        Read by RedSky{content.engine ? ` (${content.engine})` : ''}. Check figures against the original before relying on them.
      </p>
    </section>
  );
}
