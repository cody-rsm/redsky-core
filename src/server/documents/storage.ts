import 'server-only';
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, NoSuchKey, PutObjectCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import type { DocumentStorageConfig } from '@/server/config/env';

export type StoredObject = { body: ReadableStream<Uint8Array>; contentLength: number | null };

export interface DocumentStorage {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  // Null when the object does not exist.
  get(key: string): Promise<StoredObject | null>;
  // Deleting a missing object succeeds.
  delete(key: string): Promise<void>;
  health(): Promise<'ok' | 'error'>;
}

export class StorageError extends Error {}

// RedSky's documents bucket (Railway Storage Bucket, or any S3-compatible store). RedSky writes originals here;
// redsky-ocr only reads them.
export class S3DocumentStorage implements DocumentStorage {
  private readonly client: S3Client;

  constructor(private readonly config: DocumentStorageConfig) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint?.toString(),
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      // Newer SDKs add CRC checksums to every request by default, which not every S3-compatible store accepts.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      maxAttempts: 3,
    });
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    try {
      await this.client.send(new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: bytes, ContentType: contentType, ContentLength: bytes.length }), { abortSignal: AbortSignal.timeout(60_000) });
    } catch (error) {
      throw new StorageError(`Storing the document failed (${errorName(error)})`);
    }
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key }), { abortSignal: AbortSignal.timeout(30_000) });
      if (!response.Body) return null;
      return { body: response.Body.transformToWebStream(), contentLength: response.ContentLength ?? null };
    } catch (error) {
      if (error instanceof NoSuchKey || (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404)) return null;
      throw new StorageError(`Reading the document failed (${errorName(error)})`);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }), { abortSignal: AbortSignal.timeout(30_000) });
    } catch (error) {
      throw new StorageError(`Deleting the document failed (${errorName(error)})`);
    }
  }

  async health(): Promise<'ok' | 'error'> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }), { abortSignal: AbortSignal.timeout(5_000) });
      return 'ok';
    } catch {
      return 'error';
    }
  }
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown error';
}
