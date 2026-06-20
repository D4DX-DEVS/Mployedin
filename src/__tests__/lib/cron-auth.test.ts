/**
 * @jest-environment node
 */
/**
 * Cron auth contract — verifies that the HMAC headers produced by
 * `buildCronHeaders()` (used by the Inngest scheduled-cron self-calls in
 * src/lib/inngest/scheduledCrons.ts) are accepted by `verifyCronRequest()`
 * on the /api/cron/* routes. This is the integration point that lets Inngest
 * replace the GitHub Actions scheduler without any GitHub secret.
 */

import { NextRequest } from "next/server";
import { buildCronHeaders, verifyCronRequest } from "@/lib/security/cron-auth";

const ROUTE = "/api/cron/interview-reminders";
const REQ_URL = `http://localhost:3000${ROUTE}`;

describe("cron auth (Inngest self-call contract)", () => {
  const original = process.env.CRON_SECRET;

  beforeAll(() => {
    process.env.CRON_SECRET = "test-cron-secret-123";
  });

  afterAll(() => {
    process.env.CRON_SECRET = original;
  });

  it("accepts HMAC headers produced by buildCronHeaders", () => {
    const headers = buildCronHeaders(ROUTE);
    const req = new NextRequest(REQ_URL, { headers });
    expect(verifyCronRequest(req)).toBeNull(); // null === authorized
  });

  it("rejects a request with no auth headers", () => {
    const req = new NextRequest(REQ_URL);
    const res = verifyCronRequest(req);
    expect(res).not.toBeNull();
    expect(res?.status).toBe(401);
  });

  it("rejects a tampered signature", () => {
    const headers = buildCronHeaders(ROUTE);
    const req = new NextRequest(REQ_URL, {
      headers: { ...headers, "x-cron-signature": "00".repeat(32) },
    });
    const res = verifyCronRequest(req);
    expect(res).not.toBeNull();
    expect(res?.status).toBe(401);
  });

  it("rejects an expired timestamp (replay protection)", () => {
    const headers = buildCronHeaders(ROUTE);
    const stale = String(Math.floor(Date.now() / 1000) - 10 * 60); // 10 min old
    const req = new NextRequest(REQ_URL, {
      headers: { ...headers, "x-cron-timestamp": stale },
    });
    const res = verifyCronRequest(req);
    expect(res).not.toBeNull();
    expect(res?.status).toBe(401);
  });

  it("binds the signature to the exact pathname", () => {
    // Headers signed for a different route must not authorize this one.
    const headers = buildCronHeaders("/api/cron/job-expiry");
    const req = new NextRequest(REQ_URL, { headers });
    const res = verifyCronRequest(req);
    expect(res).not.toBeNull();
    expect(res?.status).toBe(401);
  });
});
