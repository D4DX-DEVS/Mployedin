/**
 * Which object store holds our files, and the hosts it is served from.
 *
 * No AWS SDK here: the CSP builder, the image-src helpers (which also run in the
 * browser) and the image proxy read it, as well as lib/storage/spaces.ts.
 *
 * STORAGE_PROVIDER=spaces (default): DigitalOcean Spaces, one bucket, public or
 *   private per object ACL. Env as documented in spaces.ts.
 * STORAGE_PROVIDER=r2: Cloudflare R2, two buckets. Public objects live in
 *   R2_PUBLIC_BUCKET and are served from https://NEXT_PUBLIC_R2_PUBLIC_HOST (a
 *   custom domain on Cloudflare). Private objects live in R2_PRIVATE_BUCKET with
 *   keys under `private/`, so a bare key always tells which bucket holds it, and
 *   are only reachable through presigned URLs.
 *
 * R2 env (either name works; the second is what the Cloudflare dashboard .env uses):
 *   R2_ACCOUNT_ID | CLOUDFLARE_ACCOUNT_ID   (or an R2_ENDPOINT of <account>.r2.cloudflarestorage.com)
 *   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 *   R2_PUBLIC_BUCKET | R2_BUCKET_NAME
 *   R2_PRIVATE_BUCKET                       default mployedin-private (the Worker archives there too)
 *   NEXT_PUBLIC_R2_PUBLIC_HOST | R2_PUBLIC_ENDPOINT   cdn.mployedin.com or pub-….r2.dev; next.config
 *                                           copies the second into the first for browser code
 *   R2_JURISDICTION                         optional: "eu" for EU-jurisdiction buckets
 */

export type StorageProvider = "spaces" | "r2";

/** process.env or a plain test record (NodeJS.ProcessEnv here also requires NODE_ENV). */
export type Env = Record<string, string | undefined>;

/** Key prefix that marks an object as living in the private R2 bucket. */
export const R2_PRIVATE_PREFIX = "private/";

export function storageProvider(env: Env = process.env): StorageProvider {
  return env.STORAGE_PROVIDER?.trim().toLowerCase() === "r2" ? "r2" : "spaces";
}

export const R2_DEFAULT_PRIVATE_BUCKET = "mployedin-private";

/** Each setting R2 needs, and the env names it may come from (first set wins). */
export const R2_REQUIRED_ENV: readonly (readonly string[])[] = [
  ["R2_ACCOUNT_ID", "CLOUDFLARE_ACCOUNT_ID", "R2_ENDPOINT"],
  ["R2_ACCESS_KEY_ID"],
  ["R2_SECRET_ACCESS_KEY"],
  ["R2_PUBLIC_BUCKET", "R2_BUCKET_NAME"],
  ["NEXT_PUBLIC_R2_PUBLIC_HOST", "R2_PUBLIC_ENDPOINT"],
];

export function firstEnv(env: Env, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function r2PublicBucket(env: Env = process.env): string {
  return firstEnv(env, ["R2_PUBLIC_BUCKET", "R2_BUCKET_NAME"]) ?? "";
}

export function r2PrivateBucket(env: Env = process.env): string {
  return firstEnv(env, ["R2_PRIVATE_BUCKET"]) ?? R2_DEFAULT_PRIVATE_BUCKET;
}

/** The public host as configured, under either name (server side; browser code gets it inlined). */
function publicHostEnv(env: Env): string | undefined {
  return firstEnv(env, ["NEXT_PUBLIC_R2_PUBLIC_HOST", "R2_PUBLIC_ENDPOINT"]);
}

/** Host of the R2 S3 API endpoint: presigned (private) URLs point here. */
export function r2ApiHost(env: Env = process.env): string | null {
  const fromEndpoint = env.R2_ENDPOINT?.trim()
    .toLowerCase()
    .replace(/^https:\/\//, "")
    .replace(/\/+$/, "")
    .match(/^([a-f0-9]{32})(?:\.(eu|fedramp))?\.r2\.cloudflarestorage\.com$/);
  const account = (firstEnv(env, ["R2_ACCOUNT_ID", "CLOUDFLARE_ACCOUNT_ID"]) ?? fromEndpoint?.[1])?.toLowerCase();
  if (!account || !/^[a-f0-9]{32}$/.test(account)) return null;
  const jurisdiction = (env.R2_JURISDICTION?.trim() || fromEndpoint?.[2])?.toLowerCase();
  return jurisdiction === "eu" || jurisdiction === "fedramp"
    ? `${account}.${jurisdiction}.r2.cloudflarestorage.com`
    : `${account}.r2.cloudflarestorage.com`;
}

/**
 * Public CDN host of the R2 public bucket. NEXT_PUBLIC_ so the browser and the
 * server agree while rendering image URLs (a server-only value would make them
 * disagree and fail hydration). The default reads the variable literally: Next
 * only inlines `process.env.NEXT_PUBLIC_*` into browser code when written out.
 */
export function r2PublicHost(raw: string | undefined = process.env.NEXT_PUBLIC_R2_PUBLIC_HOST): string | null {
  const host = raw?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return host && /^[a-z0-9.-]+$/.test(host) ? host : null;
}

/**
 * Origins the CSP must allow so stored files load (images, the PDF viewer's
 * fetch, framed and embedded previews). Empty while R2 is not configured, so
 * the policy stays exactly what it was on Spaces.
 */
export function r2CspOrigins(env: Env = process.env): string[] {
  return [r2PublicHost(publicHostEnv(env)), r2ApiHost(env)]
    .filter((h): h is string => Boolean(h))
    .map((h) => `https://${h}`);
}

/**
 * True when `url` is an https address on one of our own R2 hosts: the public
 * CDN host, or (server side only, where R2_ACCOUNT_ID is visible) the API host
 * private objects are presigned on.
 */
export function isOwnR2Url(url: URL): boolean {
  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return host === r2PublicHost() || host === r2ApiHost();
}

/**
 * The URL stored for an R2 key: the public CDN address, or for a `private/` key
 * the API endpoint address (it never serves without a presigned signature).
 */
export function r2UrlForKey(key: string, env: Env = process.env): string {
  return key.startsWith(R2_PRIVATE_PREFIX)
    ? `https://${r2ApiHost(env)}/${r2PrivateBucket(env)}/${key}`
    : `https://${r2PublicHost(publicHostEnv(env))}/${key}`;
}

/** isOwnR2Url for a stored string; false for anything that is not a URL. */
export function isOwnR2Address(raw: string): boolean {
  try {
    return isOwnR2Url(new URL(raw));
  } catch {
    return false;
  }
}
