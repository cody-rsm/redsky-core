import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { documentExtension } from '@/features/documents/catalog';

export type DetectedType = { mime: string; extension: string };

const OFFICE_TYPES: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

// The type comes from the bytes, never from the browser's Content-Type. Office files are ZIP containers, so the
// extension picks which one; redsky-ocr opens them and refuses anything that doesn't match (or carries macros).
export function detectDocumentType(bytes: Buffer, name: string): DetectedType | null {
  const startsWith = (signature: number[]) => bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return { mime: 'application/pdf', extension: 'pdf' };
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: 'image/png', extension: 'png' };
  if (startsWith([0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', extension: 'jpg' };
  if (startsWith([0x49, 0x49, 0x2a, 0x00]) || startsWith([0x4d, 0x4d, 0x00, 0x2a])) return { mime: 'image/tiff', extension: 'tif' };
  if (startsWith([0x50, 0x4b, 0x03, 0x04])) {
    const extension = documentExtension(name);
    const mime = OFFICE_TYPES[extension];
    return mime ? { mime, extension } : null;
  }
  return null;
}

// The name people see: no folders, no control characters, at most 200 characters with the extension kept.
export function displayFileName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!base) return 'document';
  if (base.length <= 200) return base;
  const extension = documentExtension(base);
  return extension ? `${base.slice(0, 199 - extension.length)}.${extension}` : base.slice(0, 200);
}

// Bucket keys are `documents/<uuid>/<name>`. redsky-ocr accepts only keys under that prefix made of
// [A-Za-z0-9!_.*'()/-], so the name part is a slug; the real name is kept in RedSky's database.
export function storageKeyFor(name: string, detected: DetectedType): string {
  const stem = name.replace(/\.[^.]*$/, '');
  const slug = stem.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 80) || 'document';
  return `documents/${randomUUID()}/${slug}.${detected.extension}`;
}

export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
