'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { WidgetLoading } from '@/components/dashboard/widget-states';
import { DocumentDrawer } from '@/components/documents/document-drawer';
import { Icon } from '@/components/ui/icon';
import { Tile } from '@/components/ui/tile';
import { DOCUMENT_STATUS_LABEL, DOCUMENT_VISIBILITY_OPTIONS, formatBytes } from '@/features/documents/catalog';
import type { DocumentRow } from '@/lib/api/contracts';
import { useDocuments, useDocumentSearch } from '@/lib/client/documents';
import { useUiStore } from '@/lib/client/ui-store';
import { useViewer } from '@/lib/client/viewer';

export function DocumentsView({ openId }: { openId: string | null }) {
  const viewer = useViewer();
  const router = useRouter();
  const openCreate = useUiStore((state) => state.openCreate);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searching = debouncedSearch.trim().length >= 2;
  const query = useDocuments();
  const first = query.data?.pages[0];
  const rows = query.data?.pages.flatMap((page) => (page.status === 'ok' ? page.documents : [])) ?? [];
  const configured = viewer.config.documentsAvailable && first?.status !== 'not_configured';

  // One request per pause in typing, not per keystroke.
  function onSearchChange(value: string) {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(value), 300);
  }

  const open = (id: string) => router.push(`/documents?open=${id}`, { scroll: false });
  const close = () => router.push('/documents', { scroll: false });

  return (
    <div className="page a-in">
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div className="grow">
          <div className="lbl">Knowledge & Intelligence</div>
          <h1 className="serif" style={{ fontSize: 32, marginTop: 4 }}>
            Documents
          </h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Files uploaded to RedSky. RedSky reads them, scans included, so you can search their text.
          </p>
        </div>
        {configured ? (
          <button type="button" className="btn btn-sm btn-p" onClick={() => openCreate('document')}>
            <Icon name="upload" size="s" />
            Upload
          </button>
        ) : null}
      </div>

      {configured && rows.length > 0 ? (
        <div style={{ position: 'relative', marginBottom: 12, maxWidth: 520 }}>
          <Icon name="search" size="s" style={{ position: 'absolute', left: 11, top: 10, color: 'var(--tx3)' }} />
          <input className="input" type="search" aria-label="Search document text" placeholder="Search the text of your documents" value={search} onChange={(event) => onSearchChange(event.target.value)} style={{ paddingLeft: 32 }} maxLength={200} />
        </div>
      ) : null}

      <div className="card" style={{ overflow: 'hidden' }}>
        {!viewer.config.documentsAvailable || first?.status === 'not_configured' ? (
          <div className="empty">
            <Tile icon="doc" />
            <div style={{ fontWeight: 600, color: 'var(--tx)' }}>Document storage isn’t set up yet</div>
            <div style={{ fontSize: 12.5, maxWidth: 380 }}>Once your administrator connects RedSky’s document storage and text reader, you can upload files here and search their text.</div>
          </div>
        ) : null}
        {configured && query.isPending ? <WidgetLoading rows={5} /> : null}
        {configured && query.isError ? (
          <div className="wstate" role="alert">
            <b>Couldn’t load documents</b>
            <span>{query.error.message}</span>
            <button type="button" className="btn btn-sm" onClick={() => void query.refetch()}>
              Try again
            </button>
          </div>
        ) : null}
        {configured && first?.status === 'ok' && searching ? <SearchResults query={debouncedSearch} onOpen={open} /> : null}
        {configured && first?.status === 'ok' && !searching ? <DocumentTable rows={rows} timeZone={viewer.config.timeZone} onOpen={open} onUpload={() => openCreate('document')} /> : null}
      </div>
      {!searching && query.hasNextPage ? (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
          <button type="button" className="btn btn-sm" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      ) : null}
      <DocumentDrawer documentId={openId} onClose={close} />
    </div>
  );
}

function DocumentTable({ rows, timeZone, onOpen, onUpload }: { rows: DocumentRow[]; timeZone: string; onOpen: (id: string) => void; onUpload: () => void }) {
  if (rows.length === 0) {
    return (
      <div className="empty">
        <Tile icon="upload" />
        <div style={{ fontWeight: 600, color: 'var(--tx)' }}>No documents yet</div>
        <div style={{ fontSize: 12.5, maxWidth: 380 }}>Upload a PDF, scan, photo or Office file. RedSky reads it and makes its text searchable.</div>
        <button type="button" className="btn btn-sm btn-p" onClick={onUpload}>
          Upload a document
        </button>
      </div>
    );
  }
  return (
    <div className="tlist" style={{ padding: '4px 10px' }} role="table" aria-label="Documents">
      <div className="trow th" role="row" data-cols="dc">
        <span role="columnheader">Name</span>
        <span role="columnheader">Status</span>
        <span role="columnheader" className="hide-sm">
          Visible to
        </span>
        <span role="columnheader" className="hide-sm">
          Uploaded
        </span>
        <span role="columnheader">Size</span>
      </div>
      {rows.map((document) => {
        const status = DOCUMENT_STATUS_LABEL[document.status];
        return (
          <div key={document.id} className="trow" role="row" data-cols="dc">
            <span role="cell" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <Tile icon="doc" small />
              <span style={{ minWidth: 0 }}>
                <button type="button" className="rel ell" style={{ maxWidth: '100%', display: 'block' }} onClick={() => onOpen(document.id)}>
                  {document.fileName}
                </button>
                {document.relatedLabel ? (
                  <span className="faint ell" style={{ display: 'block', fontSize: 11.5 }}>
                    {document.relatedLabel}
                  </span>
                ) : null}
              </span>
            </span>
            <span role="cell">
              <span className={`chip ${status.tone}`} title={document.statusMessage ?? undefined}>
                {status.label}
              </span>
            </span>
            <span role="cell" className="hide-sm muted">
              {DOCUMENT_VISIBILITY_OPTIONS.find((option) => option.value === document.visibility)?.label}
            </span>
            <span role="cell" className="hide-sm muted">
              {document.owner.name} · {new Date(document.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone })}
            </span>
            <span role="cell" className="muted">
              {document.pageCount ? `${document.pageCount} p` : formatBytes(document.sizeBytes)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SearchResults({ query, onOpen }: { query: string; onOpen: (id: string) => void }) {
  const search = useDocumentSearch(query);
  if (search.isPending) return <WidgetLoading rows={3} />;
  if (search.isError) {
    return (
      <div className="wstate" role="alert">
        <b>Search isn’t available right now</b>
        <span>{search.error.message}</span>
      </div>
    );
  }
  if (search.data.results.length === 0) return <div className="empty">No document text matches “{query.trim()}”.</div>;
  return (
    <ul aria-label="Search results" style={{ listStyle: 'none', margin: 0, padding: '4px 10px' }}>
      {search.data.results.map((result) => (
        <li key={`${result.documentId}:${result.pageNumber}`} className="row" style={{ alignItems: 'flex-start', padding: '10px 4px', borderBottom: '1px solid var(--bd)' }}>
          <Tile icon="doc" small />
          <div className="grow" style={{ minWidth: 0 }}>
            <button type="button" className="rel ell" style={{ maxWidth: '100%', display: 'block' }} onClick={() => onOpen(result.documentId)}>
              {result.fileName}
            </button>
            <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>
              Page {result.pageNumber}
            </div>
            <p className="hit muted" style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>
              <Snippet text={result.snippet} />
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

// redsky-ocr marks matches with << and >>. They become <mark> elements; the text itself is never parsed as HTML.
export function Snippet({ text }: { text: string }) {
  return (
    <>
      {text.split(/(<<[\s\S]*?>>)/g).map((part, index) =>
        part.startsWith('<<') && part.endsWith('>>') ? <mark key={index}>{part.slice(2, -2)}</mark> : <span key={index}>{part}</span>,
      )}
    </>
  );
}
