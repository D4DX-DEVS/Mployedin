/**
 * Pure helpers for the one-off move of stored files from DigitalOcean Spaces to
 * Cloudflare R2 (scripts/copy-spaces-to-r2.ts, scripts/rewrite-storage-urls.ts).
 * No I/O here, so the mapping and the rewrite are unit-tested.
 */

import { R2_PRIVATE_PREFIX, type Env } from "@/lib/storage/storageConfig";

/** One copied object: written by the copy script, read by the rewrite script. */
export interface ManifestEntry {
  oldKey: string;
  newKey: string;
  newUrl: string;
  isPublic: boolean;
  /** Re-encoded through optimizeImage (metadata stripped); the extension may differ. */
  optimized: boolean;
  size: number;
}

/**
 * The R2 key for a Spaces key: the optional Spaces root folder (DO_SPACES_FOLDER)
 * dropped, `private/` added for an object that was not public-read, and the
 * extension swapped when the copy was re-encoded.
 */
export function r2KeyForSpacesKey(
  spacesKey: string,
  opts: { spacesPrefix?: string; isPublic: boolean; newExt?: string },
): string {
  const root = (opts.spacesPrefix ?? "").replace(/^\/+|\/+$/g, "");
  let key = root && spacesKey.startsWith(`${root}/`) ? spacesKey.slice(root.length + 1) : spacesKey;
  if (opts.newExt) {
    const dot = key.lastIndexOf(".");
    const slash = key.lastIndexOf("/");
    key = (dot > slash ? key.slice(0, dot) : key) + opts.newExt;
  }
  return opts.isPublic ? key : `${R2_PRIVATE_PREFIX}${key}`;
}

/**
 * Folders whose objects are private whatever their Spaces ACL says. Older CVs and
 * documents were uploaded public-read (scripts/migrate-documents-private.mjs),
 * and an ACL must never be the only thing between a CV and the public bucket.
 * Mirrors PRIVATE_FOLDERS in lib/storage/spaces.ts.
 */
const ALWAYS_PRIVATE_FOLDERS = ["cvs", "documents", "exports"];

/** True only for an object that may live in the public bucket: public-read AND not in a private folder. */
export function isPublicObject(spacesKey: string, publicRead: boolean, spacesPrefix = ""): boolean {
  if (!publicRead) return false;
  const root = spacesPrefix.replace(/^\/+|\/+$/g, "");
  const key = root && spacesKey.startsWith(`${root}/`) ? spacesKey.slice(root.length + 1) : spacesKey;
  return !ALWAYS_PRIVATE_FOLDERS.includes(key.split("/")[0]);
}

/**
 * Every host a stored Spaces URL can carry: the bucket's origin host, its CDN
 * host, and DO_SPACES_CDN_ENDPOINT's host when set.
 */
export function spacesHosts(env: Env = process.env): Set<string> {
  const bucket = (env.SPACES_BUCKET_NAME ?? env.DO_SPACES_BUCKET ?? "d4dx-storage").toLowerCase();
  const endpoint = (env.SPACES_ENDPOINT ?? "blr1.digitaloceanspaces.com").toLowerCase();
  const hosts = new Set([`${bucket}.${endpoint}`]);
  const [region, ...rest] = endpoint.split(".");
  if (rest.join(".") === "digitaloceanspaces.com") hosts.add(`${bucket}.${region}.cdn.digitaloceanspaces.com`);
  const cdn = env.DO_SPACES_CDN_ENDPOINT?.trim();
  if (cdn) {
    try {
      hosts.add(new URL(cdn.includes("://") ? cdn : `https://${cdn}`).hostname.toLowerCase());
    } catch {
      // not a URL: ignored
    }
  }
  return hosts;
}

const URL_IN_TEXT = /https?:\/\/[^\s"'<>()\\]+/g;

export interface Rewriter {
  /** The value with every old URL / old key replaced; `changed` counts replacements. */
  rewrite<T>(value: T): { value: T; changed: number };
}

/**
 * Rewrites stored values from Spaces to R2: a string that IS an old key becomes
 * the new key; any Spaces URL inside a string (a field holding a URL, or CMS
 * HTML holding <img src>) becomes the new URL when the manifest has its key.
 * Arrays and plain objects are walked; ObjectIds, Dates and Buffers are kept as is.
 */
export function createRewriter(entries: ManifestEntry[], hosts: Set<string>): Rewriter {
  const byKey = new Map(entries.map((e) => [e.oldKey, e]));

  const rewriteString = (s: string): { value: string; changed: number } => {
    const exact = byKey.get(s);
    if (exact) return { value: exact.newKey, changed: 1 };
    let changed = 0;
    const value = s.replace(URL_IN_TEXT, (match) => {
      let url: URL;
      try {
        url = new URL(match);
      } catch {
        return match;
      }
      if (!hosts.has(url.hostname.toLowerCase())) return match;
      let key: string;
      try {
        key = decodeURIComponent(url.pathname.slice(1));
      } catch {
        return match; // a malformed %-sequence in free text: not one of ours
      }
      const entry = byKey.get(key);
      if (!entry) return match;
      changed++;
      return entry.newUrl;
    });
    return { value, changed };
  };

  const walk = (value: unknown): { value: unknown; changed: number } => {
    if (typeof value === "string") return rewriteString(value);
    if (Array.isArray(value)) {
      let changed = 0;
      const out = value.map((item) => {
        const r = walk(item);
        changed += r.changed;
        return r.value;
      });
      return changed ? { value: out, changed } : { value, changed: 0 };
    }
    if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
      let changed = 0;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        const r = walk(v);
        changed += r.changed;
        out[k] = r.value;
      }
      return changed ? { value: out, changed } : { value, changed: 0 };
    }
    return { value, changed: 0 };
  };

  return {
    rewrite<T>(value: T) {
      const r = walk(value);
      return { value: r.value as T, changed: r.changed };
    },
  };
}
