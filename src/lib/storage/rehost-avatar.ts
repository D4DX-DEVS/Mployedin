/**
 * Re-host external OAuth provider avatars (Google / LinkedIn) onto our own
 * DigitalOcean Spaces bucket so the URL never expires.
 *
 * LinkedIn avatar URLs (`media.licdn.com/...?e=<expiry>&t=<sig>`) are signed and
 * expire after a few weeks, after which they return HTTP 403 and the image
 * breaks. Google avatars are stable but can still 404/rate-limit when hotlinked
 * at scale. Storing a permanent copy at login removes both failure modes.
 *
 * This helper is intentionally fail-safe: on ANY error it returns `null` and the
 * caller keeps the original provider URL. It must NEVER throw into the login flow.
 */
import { uploadBuffer } from "./spaces";
import logger from "@/lib/logger";
import { safeFetch } from "@/lib/security/ssrf";

const FETCH_TIMEOUT_MS = 8_000;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Download an external avatar URL and re-upload it to our own storage.
 *
 * @param url The provider avatar URL (e.g. googleusercontent.com / media.licdn.com).
 * @returns Our permanent CDN URL, or `null` if re-hosting is not applicable or fails.
 */
export async function rehostExternalAvatar(
  url: string | null | undefined,
): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  // Already on our own storage — nothing to do.
  if (/digitaloceanspaces\.com/i.test(url)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    // safeFetch blocks private-IP targets and re-validates every redirect hop.
    res = await safeFetch(url, { signal: controller.signal });
  } catch (err) {
    logger.warn({ err, url }, "rehostExternalAvatar: fetch failed");
    return null;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    logger.warn({ status: res.status, url }, "rehostExternalAvatar: non-OK response");
    return null;
  }

  const contentType = (res.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!contentType.startsWith("image/")) {
    logger.warn({ contentType, url }, "rehostExternalAvatar: not an image");
    return null;
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0 || buf.length > MAX_BYTES) {
    logger.warn({ size: buf.length, url }, "rehostExternalAvatar: empty or too large");
    return null;
  }

  const ext = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
      ? "webp"
      : contentType.includes("gif")
        ? "gif"
        : "jpg";

  try {
    const result = await uploadBuffer(buf, {
      folder: "avatars",
      fileName: `oauth-avatar.${ext}`,
      contentType,
      validateAs: "image",
    });
    return result.url;
  } catch (err) {
    logger.warn({ err, url }, "rehostExternalAvatar: upload failed");
    return null;
  }
}
