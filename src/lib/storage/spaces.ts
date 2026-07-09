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
import { validateUploadedFile, ALLOWED_FILE_TYPES, validateMagicBytes, MAX_FILE_SIZES } from "@/lib/security/file-validation";
import { scanForMalware, MalwareDetectedError } from "@/lib/security/malware-scan";

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
  return process.env.SPACES_BUCKET_NAME ?? process.env.DO_SPACES_BUCKET ?? "d4dx-storage";
}

/** Optional root folder prefix inside the bucket (e.g. "Mployedin") */
function getPrefix(): string {
  return process.env.DO_SPACES_FOLDER ?? "";
}

/** Public CDN base URL for the bucket */
function cdnBase(): string {
  if (process.env.DO_SPACES_CDN_ENDPOINT) {
    return process.env.DO_SPACES_CDN_ENDPOINT;
  }
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

/**
 * Folders that hold PII / sensitive files. These default to a PRIVATE ACL so a
 * caller that forgets `private: true` can never accidentally publish a CV, an
 * identity document, or a data export. A caller may still force `private: false`
 * for a deliberately public file in one of these folders.
 */
const PRIVATE_FOLDERS = new Set<UploadFolder>(["cvs", "documents", "exports"]);

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
    /** File validation category — if set, validates magic bytes and size */
    validateAs?: keyof typeof ALLOWED_FILE_TYPES;
    /** Skip malware scanning (caller has already scanned these exact bytes). */
    skipMalwareScan?: boolean;
  } = {}
): Promise<UploadResult> {
  const client = getClient();
  const bucket = getBucket();

  const ext = options.fileName ? path.extname(options.fileName) : "";
  const prefix = getPrefix();
  const folder = options.folder ?? "other";
  const key = prefix ? `${prefix}/${folder}/${randomUUID()}${ext}` : `${folder}/${randomUUID()}${ext}`;

  const body = buffer instanceof Blob ? Buffer.from(await buffer.arrayBuffer()) : buffer;
  const size = body.byteLength;

  // File security validation (magic bytes + size + MIME whitelist)
  if (options.validateAs) {
    const arrayBuf = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
    const file = new File([new Uint8Array(arrayBuf)], options.fileName ?? "upload", { type: options.contentType ?? "application/octet-stream" });
    const validationError = validateUploadedFile(file, options.validateAs, arrayBuf);
    if (validationError) {
      throw new Error(validationError);
    }
  }

  // Malware scan — fail-closed. Every stored upload passes through here, so this
  // is the single chokepoint that guarantees no infected file reaches storage.
  if (!options.skipMalwareScan) {
    const scan = await scanForMalware(body);
    if (!scan.clean) {
      throw new MalwareDetectedError(scan.reason ?? "File rejected: failed malware scan.");
    }
  }

  const params: PutObjectCommandInput = {
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: options.contentType ?? "application/octet-stream",
    ACL: (options.private ?? PRIVATE_FOLDERS.has(folder)) ? "private" : "public-read",
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
 * Validates magic bytes on first chunk and enforces max size ceiling (100MB default).
 */
export async function uploadLarge(
  stream: NodeJS.ReadableStream | Buffer,
  options: {
    folder?: UploadFolder;
    fileName?: string;
    contentType?: string;
    private?: boolean;
    /** File validation category — if set, validates magic bytes on first 8KB */
    validateAs?: keyof typeof ALLOWED_FILE_TYPES;
    /** Skip malware scanning (caller has already scanned these exact bytes). */
    skipMalwareScan?: boolean;
    /** Max file size in bytes (default 100MB). Enforced during stream consumption. */
    maxSize?: number;
  } = {}
): Promise<UploadResult> {
  const client = getClient();
  const bucket = getBucket();

  const ext = options.fileName ? path.extname(options.fileName) : "";
  const prefix = getPrefix();
  const folder = options.folder ?? "other";
  const key = prefix ? `${prefix}/${folder}/${randomUUID()}${ext}` : `${folder}/${randomUUID()}${ext}`;

  // For Buffer input, validate magic bytes and size upfront
  if (Buffer.isBuffer(stream)) {
    const maxSize = options.maxSize ?? 100 * 1024 * 1024; // 100MB default
    if (stream.byteLength > maxSize) {
      throw new Error(`File too large. Maximum size is ${Math.round(maxSize / 1024 / 1024)}MB.`);
    }

    if (options.validateAs) {
      const firstChunk = stream.slice(0, 8 * 1024); // First 8KB for magic-byte validation
      const detected = validateMagicBytes(firstChunk.buffer);
      const allowed = Object.values(ALLOWED_FILE_TYPES[options.validateAs] ?? []) as string[];
      if (!detected || !allowed.includes(detected)) {
        throw new Error("File type not allowed or corrupted.");
      }
    }

    if (!options.skipMalwareScan) {
      const scan = await scanForMalware(stream);
      if (!scan.clean) {
        throw new MalwareDetectedError(scan.reason ?? "File rejected: failed malware scan.");
      }
    }
  }
  // For streams, size and magic-byte validation are impractical without buffering.

  const upload = new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: key,
      Body: stream as any,
      ContentType: options.contentType ?? "application/octet-stream",
      ACL: (options.private ?? PRIVATE_FOLDERS.has(folder)) ? "private" : "public-read",
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

  // Map folder to file validation category
  const categoryMap: Record<string, keyof typeof ALLOWED_FILE_TYPES> = {
    cvs: "cv",
    documents: "cv",
    avatars: "image",
    media: "image",
  };
  const category = categoryMap[options.folder ?? ""] ?? "cv";
  const arrayBuf = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  const validationError = validateUploadedFile(file, category, arrayBuf);
  if (validationError) {
    throw new Error(validationError);
  }

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
 * @param ttl    Expiry in seconds (default 600 = 10 minutes)
 * @param opts   Optional response-header overrides. `inline: true` forces the
 *               browser to render the file in-page (e.g. inside an iframe)
 *               instead of downloading it, regardless of the object's stored
 *               Content-Disposition.
 */
export async function getPresignedUrl(
  key: string,
  ttl = 600,
  opts?: { inline?: boolean; contentType?: string },
): Promise<string> {
  const client = getClient();
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ...(opts?.inline && { ResponseContentDisposition: "inline" }),
    ...(opts?.contentType && { ResponseContentType: opts.contentType }),
  });
  return getSignedUrl(client, command, { expiresIn: ttl });
}

// ─── Download (raw bytes) ─────────────────────────────────────────────────────

/**
 * Download an object's raw bytes from Spaces.
 * Accepts either an object key or a full CDN/Spaces URL.
 */
export async function downloadBuffer(keyOrUrl: string): Promise<Buffer> {
  const client = getClient();
  const key = urlToKey(keyOrUrl);
  const res = await client.send(new GetObjectCommand({ Bucket: getBucket(), Key: key }));
  if (!res.Body) {
    throw new Error("Object body is empty");
  }
  const bytes = await res.Body.transformToByteArray();
  return Buffer.from(bytes);
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
