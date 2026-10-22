/**
 * @jest-environment node
 *
 * The proxy's matcher skipped every path ending in .svg/.png/.jpg/.jpeg/.gif/.webp, API paths included, so
 * POST /api/<anything>.png bypassed the proxy's CSRF check and client-IP normalisation. API paths now always run the
 * proxy; static files outside /api/ are still skipped.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const source = readFileSync(path.resolve(__dirname, "../../proxy.ts"), "utf8");
const literal = /matcher:\s*\[\s*("(?:[^"\\]|\\.)*")/.exec(source);
const matcher = new RegExp(`^${JSON.parse((literal as RegExpExecArray)[1]) as string}$`);

describe("proxy matcher", () => {
  it("is found in proxy.ts", () => {
    expect(literal).not.toBeNull();
  });

  it.each(["/api/public/blogs/a.png", "/api/user/avatar.jpg", "/api/x.svg", "/api/upload/photo.webp"])(
    "runs the proxy (CSRF, client IP) for the API path %s, whatever its extension",
    (p) => {
      expect(matcher.test(p)).toBe(true);
    },
  );

  it.each(["/en/jobs", "/api/auth/session", "/"])("runs the proxy for %s", (p) => {
    expect(matcher.test(p)).toBe(true);
  });

  it.each(["/images/logo.png", "/icons/a.svg", "/uploads/photo.jpeg", "/_next/static/chunk.js", "/favicon.ico", "/robots.txt"])(
    "still skips the static file %s",
    (p) => {
      expect(matcher.test(p)).toBe(false);
    },
  );
});
