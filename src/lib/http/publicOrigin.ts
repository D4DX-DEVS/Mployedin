/**
 * Public origin of this deployment.
 *
 * `new URL(req.url).origin` is the *internal* origin behind a reverse proxy
 * (DigitalOcean App Platform hands the container http://localhost:8080), which
 * produced calendar feed URLs no client could ever reach. Prefer the configured
 * public URL, then the proxy's forwarded headers, and only fall back to the
 * request origin for local dev.
 */
export function publicOrigin(req: { url: string; headers: Headers }): string {
  const configured =
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");

  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "")
    .split(",")[0]
    .trim();
  if (host) {
    const proto = (req.headers.get("x-forwarded-proto") ?? "").split(",")[0].trim();
    const scheme = proto || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
    return `${scheme}://${host}`;
  }

  return new URL(req.url).origin;
}
