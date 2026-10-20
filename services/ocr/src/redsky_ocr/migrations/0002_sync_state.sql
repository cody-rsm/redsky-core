-- Where the reconciliation sweep has read Twenty's attachments up to. It
-- catches files whose webhook never arrived (redsky-ocr restarting, Twenty's
-- webhook rate limit, no retries on Twenty's side).
create table redsky_ocr.sync_state (
  workspace_id uuid primary key,
  attachments_created_since timestamptz not null,
  updated_at timestamptz not null default now()
);
