/**
 * DigitalOcean Spaces file storage
 * Drop-in replacement for Cloudinary. Uses the S3-compatible API.
 *
 * Env vars required:
 *   SPACES_ACCESS_KEY_ID
 *   SPACES_SECRET_ACCESS_KEY
 *   SPACES_BUCKET_NAME
 *   SPACES_ENDPOINT          e.g. blr1.digitaloceanspaces.com  (region only, NO https://)
 *   NEXT_PUBLIC_APP_URL      used to build CDN URLs if needed
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import path from "path";

// ─── Client singleton ────────────────────────────────────────────────────────

function getClient(): S3Client {
  const endpoint = process.env.SPACES_ENDPOINT ?? "blr1.digitaloceanspaces.com";
  return new S3Client({
    region: endpoint.split(".")[0], // "blr1"
    endpoint: `https://${endpoint}`,
    credentials: {
      accessKeyId: process.env.SPACES_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.SPACES_SECRET_ACCESS_KEY ?? "",
    },
    forcePathStyle: false, // Spaces uses virtual-hosted style
  });
}

function getBucket(): string {
  return process.env.SPACES_BUCKET_NAME ?? process.env.BUCKET_NAME ?? "people-erp";
}

/** Public CDN base URL for the bucket */
function cdnBase(): string {
  const endpoint = process.env.SPACES_ENDPOINT ?? "blr1.digitaloceanspaces.com";
  const bucket = getBucket();
  return `https://${bucket}.${endpoint}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UploadResult {
  /** Full public URL */
  url: string;
  /** Object key inside the bucket */
  key: string;
  /** Bucket name */
  bucket: string;
  /** File size in bytes */
  size: number;
  /** MIME type */
  contentType: string;
}

export type UploadFolder =
  | "cvs"
  | "avatars"
  | "documents"
  | "media"
  | "exports"
  | "other";

// ─── Upload – Buffer / Blob ───────────────────────────────────────────────────

/**
 * Upload a Buffer or Blob to DigitalOcean Spaces.
 * Returns the public URL and key.
 */
export async function uploadBuffer(
  buffer: Buffer | Blob,
  options: {
    folder?: UploadFolder;
    fileName?: string;
    contentType?: string;
    /** Set to true to make the object private (default: public-read) */
    private?: boolean;
  } = {}
): Promise<UploadResult> {
  const client = getClient();
  const bucket = getBucket();

  const ext = options.fileName ? path.extname(options.fileName) : "";
  const key = `${options.folder ?? "other"}/${randomUUID()}${ext}`;

  const body = buffer instanceof Blob ? Buffer.from(await buffer.arrayBuffer()) : buffer;
  const size = body.byteLength;

  const params: PutObjectCommandInput = {
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: options.contentType ?? "application/octet-stream",
    ACL: options.private ? "private" : "public-read",
    ...(options.fileName && { ContentDisposition: `inline; filename="${options.fileName}"` }),
  };

  await client.send(new PutObjectCommand(params));

  return {
    url: `${cdnBase()}/${key}`,
    key,
    bucket,
    size,
    contentType: options.contentType ?? "application/octet-stream",
  };
}

// ─── Upload – multipart (large files) ────────────────────────────────────────

/**
 * Upload a large file using S3 multipart upload.
 * Recommended for files > 10 MB.
 */
export async function uploadLarge(
  stream: NodeJS.ReadableStream | Buffer,
  options: {
    folder?: UploadFolder;
    fileName?: string;
    contentType?: string;
    private?: boolean;
  } = {}
): Promise<UploadResult> {
  const client = getClient();
  const bucket = getBucket();

  const ext = options.fileName ? path.extname(options.fileName) : "";
  const key = `${options.folder ?? "other"}/${randomUUID()}${ext}`;

  const upload = new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: key,
      Body: stream as any,
      ContentType: options.contentType ?? "application/octet-stream",
      ACL: options.private ? "private" : "public-read",
    },
  });

  await upload.done();

  // Determine size for Buffer input
  const size = Buffer.isBuffer(stream) ? stream.byteLength : 0;

  return {
    url: `${cdnBase()}/${key}`,
    key,
    bucket,
    size,
    contentType: options.contentType ?? "application/octet-stream",
  };
}

// ─── Upload – Next.js FormData File ──────────────────────────────────────────

/**
 * Upload a file received from a Next.js API route (FormData / File object).
 */
export async function uploadFile(
  file: File,
  options: { folder?: UploadFolder; private?: boolean } = {}
): Promise<UploadResult> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return uploadBuffer(buffer, {
    folder: options.folder,
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
    private: options.private,
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete an object from Spaces by key or full URL.
 */
export async function deleteFile(keyOrUrl: string): Promise<void> {
  const client = getClient();
  const bucket = getBucket();

  // If a full URL was passed, strip the CDN base to get the key
  const base = cdnBase() + "/";
  const key = keyOrUrl.startsWith(base) ? keyOrUrl.slice(base.length) : keyOrUrl;

  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

// ─── Existence check ──────────────────────────────────────────────────────────

/** Returns true if the given key exists in the bucket. */
export async function fileExists(key: string): Promise<boolean> {
  const client = getClient();
  try {
    await client.send(new HeadObjectCommand({ Bucket: getBucket(), Key: key }));
    return true;
  } catch {
    return false;
  }
}

// ─── Presigned URL (private downloads) ───────────────────────────────────────

/**
 * Generate a time-limited presigned URL for a private file.
 * @param key    Object key
 * @param ttl    Expiry in seconds (default 3600 = 1 hour)
 */
export async function getPresignedUrl(key: string, ttl = 3600): Promise<string> {
  const client = getClient();
  const command = new GetObjectCommand({ Bucket: getBucket(), Key: key });
  return getSignedUrl(client, command, { expiresIn: ttl });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a Spaces URL back to its object key */
export function urlToKey(url: string): string {
  const base = cdnBase() + "/";
  return url.startsWith(base) ? url.slice(base.length) : url;
}

/** Build the public URL for a known key */
export function keyToUrl(key: string): string {
  return `${cdnBase()}/${key}`;
}
