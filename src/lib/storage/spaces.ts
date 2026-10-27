/**
 * Object storage: DigitalOcean Spaces (default) or Cloudflare R2, both through
 * the S3-compatible API. STORAGE_PROVIDER picks one; lib/storage/storageConfig.ts
 * documents the R2 env and the bucket layout.
 *
 * Spaces env:
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
import { FileValidationError } from "@/lib/storage/uploadErrors";
import {
  R2_PRIVATE_PREFIX,
  r2ApiHost,
  r2PrivateBucket,
  r2PublicBucket,
  r2UrlForKey,
  storageProvider,
} from "@/lib/storage/storageConfig";
import {
  AVATAR_MAX_EDGE,
  DEFAULT_MAX_EDGE,
  imageOptimizationEnabled,
  isOptimizableImage,
  optimizeImage,
} from "@/lib/storage/optimizeImage";

// ─── Client singleton ────────────────────────────────────────────────────────

function getClient(): S3Client {
  if (storageProvider() === "r2") {
    return new S3Client({
      region: "auto",
      endpoint: `https://${r2ApiHost() ?? "r2-not-configured.invalid"}`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
      },
      // Path style keeps every presigned URL on the one API host the CSP lists.
      forcePathStyle: true,
      // Newer SDKs add CRC checksums (trailing ones on multipart streams) by
      // default; R2 has refused some of them. Send only what R2 requires.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
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

// ─── Provider-aware bucket / key / URL ───────────────────────────────────────

/** The bucket holding `key`. On R2 the `private/` key prefix selects the private bucket. */
function bucketForKey(key: string): string {
  if (storageProvider() !== "r2") return getBucket();
  return key.startsWith(R2_PRIVATE_PREFIX) ? r2PrivateBucket() : r2PublicBucket();
}

function newKey(folder: UploadFolder, ext: string, isPrivate: boolean): string {
  const name = `${folder}/${randomUUID()}${ext}`;
  if (storageProvider() === "r2") return isPrivate ? `${R2_PRIVATE_PREFIX}${name}` : name;
  const prefix = getPrefix();
  return prefix ? `${prefix}/${name}` : name;
}

/**
 * Base every stored URL of this provider starts with. R2 private objects get the
 * API endpoint address: it never serves without a signature, as Spaces' CDN URL
 * of a private object never did.
 */
function urlBases(): string[] {
  if (storageProvider() !== "r2") return [cdnBase() + "/"];
  return [r2UrlForKey(""), r2UrlForKey(R2_PRIVATE_PREFIX).slice(0, -R2_PRIVATE_PREFIX.length)];
}

/**
 * Browser/CDN caching for public R2 objects. Keys are random and never
 * rewritten, so a year would be safe for freshness, but a GDPR erasure deletes
 * the object without purging caches: one day bounds how long an erased photo
 * (and each resized CDN copy of it) can still be served.
 */
const PUBLIC_CACHE = "public, max-age=86400";

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

  // A plain short extension only: the key is stored (max 500 chars) and served.
  const rawExt = options.fileName ? path.extname(options.fileName) : "";
  let ext = /^\.[a-z0-9]{1,10}$/i.test(rawExt) ? rawExt.toLowerCase() : "";
  const folder = options.folder ?? "other";
  const isPrivate = options.private ?? PRIVATE_FOLDERS.has(folder);

  let body = buffer instanceof Blob ? Buffer.from(await buffer.arrayBuffer()) : buffer;
  let contentType = options.contentType ?? "application/octet-stream";
  let fileName = options.fileName;

  // File security validation (magic bytes + size + MIME whitelist)
  if (options.validateAs) {
    const arrayBuf = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
    const file = new File([new Uint8Array(arrayBuf)], options.fileName ?? "upload", { type: options.contentType ?? "application/octet-stream" });
    const validationError = validateUploadedFile(file, options.validateAs, arrayBuf);
    if (validationError) {
      throw new FileValidationError(validationError);
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

  // Public images are cleaned once here (metadata stripped, size capped). Private
  // ones (ID scans, CV photos) are evidence and are stored byte for byte.
  if (!isPrivate && imageOptimizationEnabled() && isOptimizableImage(contentType)) {
    const optimized = await optimizeImage(body, folder === "avatars" ? AVATAR_MAX_EDGE : DEFAULT_MAX_EDGE);
    if (optimized) {
      body = optimized.buffer;
      contentType = optimized.contentType;
      ext = optimized.ext;
      if (fileName) fileName = `${path.parse(fileName).name}${optimized.ext}`;
    }
  }

  const key = newKey(folder, ext, isPrivate);
  const bucket = bucketForKey(key);
  const r2 = storageProvider() === "r2";

  const params: PutObjectCommandInput = {
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    // R2 has no object ACLs: the bucket decides who can read.
    ...(r2 ? (isPrivate ? {} : { CacheControl: PUBLIC_CACHE }) : { ACL: isPrivate ? "private" : "public-read" }),
    // Header values must be Latin-1: an Arabic file name used to throw here.
    ...(fileName && { ContentDisposition: contentDisposition("inline", fileName) }),
  };

  await client.send(new PutObjectCommand(params));

  return {
    url: keyToUrl(key),
    key,
    bucket,
    size: body.byteLength,
    contentType,
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

  const ext = options.fileName ? path.extname(options.fileName) : "";
  const folder = options.folder ?? "other";
  const isPrivate = options.private ?? PRIVATE_FOLDERS.has(folder);
  const key = newKey(folder, ext, isPrivate);
  const bucket = bucketForKey(key);

  // For Buffer input, validate magic bytes and size upfront
  if (Buffer.isBuffer(stream)) {
    const maxSize = options.maxSize ?? 100 * 1024 * 1024; // 100MB default
    if (stream.byteLength > maxSize) {
      throw new FileValidationError(`File too large. Maximum size is ${Math.round(maxSize / 1024 / 1024)}MB.`);
    }

    if (options.validateAs) {
      const firstChunk = stream.slice(0, 8 * 1024); // First 8KB for magic-byte validation
      const detected = validateMagicBytes(firstChunk.buffer);
      const allowed = Object.values(ALLOWED_FILE_TYPES[options.validateAs] ?? []) as string[];
      if (!detected || !allowed.includes(detected)) {
        throw new FileValidationError("File type not allowed or corrupted.");
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
      ...(storageProvider() === "r2"
        ? (isPrivate ? {} : { CacheControl: PUBLIC_CACHE })
        : { ACL: isPrivate ? "private" : "public-read" }),
    },
  });

  await upload.done();

  // Determine size for Buffer input
  const size = Buffer.isBuffer(stream) ? stream.byteLength : 0;

  return {
    url: keyToUrl(key),
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
    throw new FileValidationError(validationError);
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
 * Delete a stored object by key or full URL.
 */
export async function deleteFile(keyOrUrl: string): Promise<void> {
  const client = getClient();
  // If a full URL was passed, strip the base to get the key
  const key = urlToKey(keyOrUrl);
  await client.send(new DeleteObjectCommand({ Bucket: bucketForKey(key), Key: key }));
}

// ─── Existence check ──────────────────────────────────────────────────────────

/** Returns true if the given key exists in the bucket. */
export async function fileExists(key: string): Promise<boolean> {
  const client = getClient();
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucketForKey(key), Key: key }));
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
 *               Content-Disposition. `downloadName` forces a download saved
 *               under that file name instead (it wins over `inline`).
 */
export async function getPresignedUrl(
  key: string,
  ttl = 600,
  opts?: { inline?: boolean; contentType?: string; downloadName?: string },
): Promise<string> {
  const client = getClient();
  const disposition = opts?.downloadName
    ? attachmentDisposition(opts.downloadName)
    : opts?.inline ? "inline" : undefined;
  const command = new GetObjectCommand({
    Bucket: bucketForKey(key),
    Key: key,
    ...(disposition && { ResponseContentDisposition: disposition }),
    ...(opts?.contentType && { ResponseContentType: opts.contentType }),
  });
  return getSignedUrl(client, command, { expiresIn: ttl });
}

// ─── Download (raw bytes) ─────────────────────────────────────────────────────

/**
 * Download an object's raw bytes.
 * Accepts either an object key or a full stored URL.
 */
export async function downloadBuffer(keyOrUrl: string): Promise<Buffer> {
  const client = getClient();
  const key = urlToKey(keyOrUrl);
  const res = await client.send(new GetObjectCommand({ Bucket: bucketForKey(key), Key: key }));
  if (!res.Body) {
    throw new Error("Object body is empty");
  }
  const bytes = await res.Body.transformToByteArray();
  return Buffer.from(bytes);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * `attachment` header that survives non-ASCII names: a plain ASCII fallback
 * plus the RFC 5987 `filename*` form browsers prefer.
 */
function attachmentDisposition(fileName: string): string {
  return contentDisposition("attachment", fileName);
}

/** An ASCII fallback name plus the RFC 5987 UTF-8 one. */
function contentDisposition(type: "inline" | "attachment", fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/** Convert a stored URL back to its object key (anything else is returned unchanged) */
export function urlToKey(url: string): string {
  const base = urlBases().find((b) => url.startsWith(b));
  return base ? url.slice(base.length) : url;
}

/** Build the stored URL for a known key */
export function keyToUrl(key: string): string {
  return storageProvider() === "r2" ? r2UrlForKey(key) : `${cdnBase()}/${key}`;
}
