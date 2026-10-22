/**
 * @jest-environment node
 *
 * The sign-in cookie's lifetime and what the Cookie Policy says about it must
 * not drift apart (PECR reg 6: clear and comprehensive information).
 *
 * The edge config (the proxy, which re-issues the session cookie on every
 * request) had no maxAge, so Auth.js used its 30-day default while the Node
 * config and the published policy said 3 days. Both configs now take one
 * constant, and the registry row the policy is generated from must state it.
 */
import { readFileSync } from "fs";
import path from "path";
import { SESSION_MAX_AGE_S } from "@/lib/auth/sessionMaxAge";
import { REGISTRY } from "@/lib/consent/registry";

const ROOT = path.resolve(__dirname, "../../../..");
const source = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

describe("session lifetime", () => {
  it("is 3 days", () => {
    expect(SESSION_MAX_AGE_S).toBe(3 * 24 * 60 * 60);
  });

  it.each(["src/lib/auth/edge-config.ts", "src/lib/auth/config.ts"])("%s sets the session and the JWT to the shared lifetime", (file) => {
    const text = source(file);
    expect(text).toMatch(/session:\s*\{[^}]*maxAge:\s*SESSION_MAX_AGE_S/);
    expect(text).toMatch(/jwt:\s*\{[^}]*maxAge:\s*SESSION_MAX_AGE_S/);
  });

  it("is what the registry (and so the Cookie Policy) states for the sign-in cookies", () => {
    const days = SESSION_MAX_AGE_S / (24 * 60 * 60);
    // The session-token cookies (plain and __Secure-); __Host-authjs.* is the CSRF cookie, a browser-session cookie.
    const rows = REGISTRY.filter((row) => /authjs/.test(row.name) && !row.name.startsWith("__Host-"));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows) {
      expect(row.duration).toContain(`up to ${days} days`);
    }
  });
});
