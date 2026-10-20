// Documents uploaded in RedSky: stored in RedSky's bucket and read by redsky-ocr (docs/DECISIONS.md 3 and 8).

// redsky-ocr's own default limit (REDSKY_OCR_MAX_FILE_BYTES); a larger upload would only fail there.
export const DOCUMENT_MAX_BYTES = 50 * 1024 * 1024;

export const DOCUMENT_ACCEPT = '.pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg,.tif,.tiff,application/pdf,image/png,image/jpeg,image/tiff';

export const DOCUMENT_EXTENSIONS = ['pdf', 'docx', 'pptx', 'xlsx', 'png', 'jpg', 'jpeg', 'tif', 'tiff'] as const;

export type DocumentVisibility = 'private' | 'firm';

export const DOCUMENT_VISIBILITY_OPTIONS: ReadonlyArray<{ value: DocumentVisibility; label: string; hint: string }> = [
  { value: 'private', label: 'Only me', hint: 'Only you can open it' },
  { value: 'firm', label: 'All RSM staff', hint: 'Anyone signed in to RedSky can open it' },
];

// redsky-ocr's statuses, plus `registering`: stored in the bucket but not yet handed to redsky-ocr.
export type DocumentStatus = 'registering' | 'uploaded' | 'queued' | 'processing' | 'completed' | 'needs_review' | 'failed';

export const DOCUMENT_STATUS_IN_PROGRESS: ReadonlyArray<DocumentStatus> = ['registering', 'queued', 'processing'];

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, { label: string; tone: '' | 'chip-ok' | 'chip-wn' | 'chip-ac' | 'chip-ai' }> = {
  registering: { label: 'Waiting', tone: '' },
  uploaded: { label: 'Stored', tone: '' },
  queued: { label: 'Queued', tone: '' },
  processing: { label: 'Reading', tone: 'chip-ai' },
  completed: { label: 'Ready', tone: 'chip-ok' },
  needs_review: { label: 'Check quality', tone: 'chip-wn' },
  failed: { label: 'Couldn’t read', tone: 'chip-ac' },
};

// redsky-ocr's stable error codes (services/ocr/README.md), worded for the person who uploaded the file.
const STATUS_REASON_MESSAGES: Record<string, string> = {
  EMPTY_FILE: 'The file is empty.',
  FILE_TOO_LARGE: 'The file is larger than 50 MB.',
  UNSUPPORTED_TYPE: 'This kind of file can’t be read. Use PDF, Word, PowerPoint, Excel or an image.',
  MACRO_ENABLED: 'Files with macros are refused. Save it without macros and upload it again.',
  ARCHIVE_BOMB: 'The file expands to an unsafe size, so it was refused.',
  ENCRYPTED_FILE: 'The file is password-protected. Remove the password and upload it again.',
  CORRUPT_FILE: 'The file is damaged and can’t be opened.',
  TOO_MANY_PAGES: 'The file has more pages than RedSky reads (500).',
  IMAGE_TOO_LARGE: 'The image is too large to read.',
  MALWARE_DETECTED: 'The malware scanner flagged this file, so it wasn’t read.',
  MALWARE_SCAN_FAILED: 'The malware scanner couldn’t check this file, so it wasn’t read.',
  ENGINE_UNAVAILABLE: 'Text extraction isn’t available right now.',
  ENGINE_FAILED: 'Text extraction failed on this file.',
  PROCESSING_TIMEOUT: 'Reading this file took too long.',
  WORKER_CRASHED: 'Text extraction stopped unexpectedly.',
  SOURCE_UNAVAILABLE: 'The file couldn’t be fetched from storage.',
  SOURCE_DELETED: 'The file is no longer in storage.',
  SOURCE_NOT_FOUND: 'The file is no longer in storage.',
  SOURCE_NOT_CONFIGURED: 'Text extraction can’t reach RedSky’s document storage.',
  NO_AI_DOCUMENT: 'Marked _NOAI, so RedSky stores it but never reads it.',
};

export function documentStatusMessage(status: DocumentStatus, reason: string | null): string | null {
  if (reason && STATUS_REASON_MESSAGES[reason]) return STATUS_REASON_MESSAGES[reason];
  if (status === 'registering') return 'Stored. Text extraction starts as soon as the reader is reachable.';
  if (status === 'needs_review') return 'Read, but the text may be incomplete or garbled. Check it against the original.';
  if (status === 'failed') return 'Text extraction failed.';
  return null;
}

export function documentExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

// Quick checks before sending; the server re-checks the bytes, and redsky-ocr validates the content.
export function validateDocumentFile(file: { name: string; size: number }): string | null {
  if (file.size === 0) return 'That file is empty.';
  if (file.size > DOCUMENT_MAX_BYTES) return 'Files can be up to 50 MB.';
  if (!(DOCUMENT_EXTENSIONS as ReadonlyArray<string>).includes(documentExtension(file.name))) return 'RedSky reads PDF, Word, PowerPoint, Excel and image files (PNG, JPEG, TIFF).';
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
