/**
 * The hosts our own DigitalOcean Spaces bucket is served from, for server code that must fetch only from it
 * (/api/image-proxy). Same env as lib/storage/spaces.ts, without the AWS SDK.
 *
 * - NEXT_PUBLIC_SPACES_PUBLIC_HOST (or the older SPACES_PUBLIC_HOST), when set: exactly those host(s), a comma list
 *   allowed (the bucket host and its .cdn. host can both be named).
 * - Otherwise the configured bucket: `<bucket>.<endpoint>`, its `<bucket>.<region>.cdn.digitaloceanspaces.com`
 *   CDN host, and the DO_SPACES_CDN_ENDPOINT host. Never any other bucket on Spaces.
 */
export function ownStorageHosts(): Set<string> {
  const pinned = (process.env.NEXT_PUBLIC_SPACES_PUBLIC_HOST || process.env.SPACES_PUBLIC_HOST || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (pinned.length > 0) return new Set(pinned);

  const hosts = new Set<string>();
  const bucket = (process.env.SPACES_BUCKET_NAME ?? process.env.DO_SPACES_BUCKET ?? "d4dx-storage").trim().toLowerCase();
  const endpoint = (process.env.SPACES_ENDPOINT ?? "blr1.digitaloceanspaces.com").trim().toLowerCase();
  if (bucket && endpoint) {
    hosts.add(`${bucket}.${endpoint}`);
    const [region, ...rest] = endpoint.split(".");
    if (region && rest.join(".") === "digitaloceanspaces.com") hosts.add(`${bucket}.${region}.cdn.digitaloceanspaces.com`);
  }
  const cdn = process.env.DO_SPACES_CDN_ENDPOINT?.trim();
  if (cdn) {
    try {
      hosts.add(new URL(cdn.includes("://") ? cdn : `https://${cdn}`).hostname.toLowerCase());
    } catch {
      // not a URL: ignored
    }
  }
  return hosts;
}

/** An https URL on one of our own storage hosts, with no port or credentials. */
export function isOwnStorageUrl(url: URL): boolean {
  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
  return ownStorageHosts().has(url.hostname.toLowerCase());
}
