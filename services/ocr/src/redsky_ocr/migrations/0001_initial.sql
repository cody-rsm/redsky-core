-- Originals live with whoever owns them (the RedSky documents bucket, or
-- Twenty for attachments). This schema holds only what the service derives
-- from them, so a document's footprint here can be purged in one delete.

create table redsky_ocr.document (
  id uuid primary key,
  tenant_id text not null,
  -- 'storage': a key in the RedSky documents bucket. 'twenty': an attachment.
  source_system text not null check (source_system in ('storage', 'twenty')),
  source_id text not null,
  -- Source-specific details, for example Twenty's file id.
  source_metadata jsonb not null default '{}',
  filename text not null,
  mime_type text,
  size_bytes bigint,
  sha256 text,
  uploaded_by text,
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

create unique index document_source_key
  on redsky_ocr.document (tenant_id, source_system, source_id);

-- The records a document belongs to, named by the system that owns each
-- record ('twenty' today; RedSky's own services as areas move over). Used
-- for filtering only: access is decided by the caller, never from these.
create table redsky_ocr.document_link (
  document_id uuid not null references redsky_ocr.document (id) on delete cascade,
  system text not null,
  object text not null,
  record_id text not null,
  primary key (document_id, system, object, record_id)
);

create index document_link_record on redsky_ocr.document_link (system, object, record_id);

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
  requested_by text,
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

-- How far the Twenty sweep has read: it catches attachments whose webhook
-- never arrived (Twenty does not retry webhooks and rate-limits them).
create table redsky_ocr.sync_state (
  source_system text not null,
  tenant_id text not null,
  created_since timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (source_system, tenant_id)
);

-- Events for the RedSky API, written in the same transaction as the change
-- they describe and delivered at least once. No foreign key: an event about
-- a deleted document must survive the delete.
create table redsky_ocr.event_outbox (
  id uuid primary key,
  tenant_id text not null,
  document_id uuid not null,
  event_type text not null,
  payload jsonb not null,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz,
  abandoned_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index event_outbox_due
  on redsky_ocr.event_outbox (next_attempt_at)
  where delivered_at is null and abandoned_at is null;
