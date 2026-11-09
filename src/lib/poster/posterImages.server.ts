import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isOwnStorageUrl } from "@/lib/storage/storageHosts";
import logger from "@/lib/logger";

/**
 * Images for server-drawn posters, as data URLs.
 *
 * next/og refuses to fetch localhost/private addresses (its own SSRF guard),
 * and it fetches at stream time where errors can't be answered cleanly. So the
 * route hands it bytes instead: site files are read from /public, and remote
 * logos are fetched here under the same rules as /api/image-proxy (our storage
 * hosts only, no redirects, raster only), plus a size cap and a timeout.
 * Anything else is left off the poster rather than fetched.
 */

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };
const REMOTE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const PUBLIC_DIR = path.join(process.cwd(), "public");

/** next/og draws PNG, JPEG and GIF only; a WebP logo (allowed by the logo upload) is turned into PNG. */
async function asDataUrl(bytes: ArrayBuffer | Buffer, type: string): Promise<string> {
  let data = Buffer.from(bytes as ArrayBuffer);
  let mime = type;
  if (type === "image/webp") {
    const { default: sharp } = await import("sharp");
    data = await sharp(data).png().toBuffer();
    mime = "image/png";
  }
  return `data:${mime};base64,${data.toString("base64")}`;
}

async function fromPublic(sitePath: string): Promise<string | null> {
  const clean = decodeURIComponent(sitePath.split(/[?#]/)[0]);
  const file = path.resolve(PUBLIC_DIR, `.${clean}`);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return null; // no escaping /public
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!type) return null;
  const bytes = await readFile(file);
  return bytes.length <= MAX_BYTES ? await asDataUrl(bytes, type) : null;
}

async function fromStorage(url: URL): Promise<string | null> {
  if (!isOwnStorageUrl(url)) return null;
  const res = await fetch(url.toString(), { redirect: "manual", signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!REMOTE_TYPES.has(type)) return null;
  if (Number(res.headers.get("content-length") || 0) > MAX_BYTES) return null;
  const bytes = await res.arrayBuffer();
  return bytes.byteLength <= MAX_BYTES ? await asDataUrl(bytes, type) : null;
}

/** A logo or badge as a data URL the poster renderer can draw, or null to leave it off. */
export async function posterImageDataUrl(src: string | null | undefined): Promise<string | null> {
  if (!src) return null;
  try {
    if (src.startsWith("data:image/")) return src;
    if (src.startsWith("/") && !src.startsWith("//")) return await fromPublic(src);
    const url = new URL(src);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return await fromStorage(url);
  } catch (err) {
    logger.warn({ err, src }, "[poster] image left off the poster");
    return null;
  }
}
