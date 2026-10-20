-- Originals stay in Twenty (attachment files in its bucket). This schema holds
-- only what the service derives from them, so a document's footprint here can
-- be purged in one delete when its attachment goes away.

create table redsky_ocr.document (
  id uuid primary key,
  workspace_id uuid not null,
  attachment_id uuid not null,
  file_id uuid,
  filename text not null,
  mime_type text,
  size_bytes bigint,
  sha256 text,
  -- The record the attachment hangs off, copied from Twenty for filtering.
  -- Access is always re-checked against Twenty, never decided from these.
  linked_object text,
  linked_record_id uuid,
  uploaded_by_user_id uuid,
  uploaded_by_workspace_member_id uuid,
  no_ai boolean not null default false,
  status text not null check (
    status in ('uploaded', 'queued', 'processing', 'completed', 'failed', 'needs_review')
  ),
  status_reason text,
  status_message text,
  current_extraction_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index document_attachment_key
  on redsky_ocr.document (workspace_id, attachment_id);
create index document_linked_record
  on redsky_ocr.document (workspace_id, linked_object, linked_record_id);

create table redsky_ocr.extraction (
  id uuid primary key,
  document_id uuid not null references redsky_ocr.document (id) on delete cascade,
  requested_engine text not null,
  engine text,
  engine_version text,
  status text not null check (
    status in ('queued', 'processing', 'completed', 'failed', 'needs_review')
  ),
  attempts integer not null default 0,
  max_attempts integer not null,
  run_after timestamptz not null default now(),
  locked_by text,
  locked_at timestamptz,
  heartbeat_at timestamptz,
  requested_by_workspace_member_id uuid,
  routing jsonb,
  quality jsonb,
  page_count integer,
  ocr_page_count integer,
  mean_ocr_confidence real,
  markdown text,
  plaintext text,
  error_code text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index extraction_claimable
  on redsky_ocr.extraction (run_after) where status = 'queued';
-- One queued or running extraction per document: repeated reprocess requests
-- and duplicate webhook deliveries collapse onto it.
create unique index extraction_one_active
  on redsky_ocr.extraction (document_id) where status in ('queued', 'processing');

alter table redsky_ocr.document
  add constraint document_current_extraction_fk
  foreign key (current_extraction_id) references redsky_ocr.extraction (id)
  on delete set null;

create table redsky_ocr.page (
  extraction_id uuid not null references redsky_ocr.extraction (id) on delete cascade,
  page_number integer not null,
  method text not null,
  text text not null,
  markdown text not null,
  ocr_confidence real,
  width real,
  height real,
  search_vector tsvector generated always as (to_tsvector('english', text)) stored,
  primary key (extraction_id, page_number)
);

create index page_search on redsky_ocr.page using gin (search_vector);

create table redsky_ocr.extracted_table (
  extraction_id uuid not null references redsky_ocr.extraction (id) on delete cascade,
  table_index integer not null,
  page_number integer,
  row_count integer not null,
  column_count integer not null,
  cells jsonb not null,
  markdown text not null,
  caption text,
  primary key (extraction_id, table_index)
);

-- Retrieval units with citations. An embedding column (pgvector) goes here
-- once RedSky has a vector store; the chunks will not need recomputing.
create table redsky_ocr.chunk (
  extraction_id uuid not null references redsky_ocr.extraction (id) on delete cascade,
  chunk_index integer not null,
  text text not null,
  headings text[] not null default '{}',
  page_start integer,
  page_end integer,
  primary key (extraction_id, chunk_index)
);

-- Docling's lossless document model, so chunking and exports can be redone
-- later without re-running OCR.
create table redsky_ocr.extraction_artifact (
  extraction_id uuid primary key references redsky_ocr.extraction (id) on delete cascade,
  docling_json_gzip bytea not null
);
