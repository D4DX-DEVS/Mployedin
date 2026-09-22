/**
 * @jest-environment node
 */

import { isCsrfExempt } from "@/lib/security/csrf";

describe("CSRF exemptions", () => {
  it("does not exempt AI routes that persist or mutate user data", () => {
    expect(isCsrfExempt("/api/ai/generate-summary")).toBe(false);
    expect(isCsrfExempt("/api/ai/profile-fill")).toBe(false);
    expect(isCsrfExempt("/api/ai/skills-gap")).toBe(false);
    expect(isCsrfExempt("/api/ai/cv-extract")).toBe(false);
    expect(isCsrfExempt("/api/ai/interview-questions")).toBe(false);
    expect(isCsrfExempt("/api/ai/match")).toBe(false);
  });

  it("keeps stateless streaming AI routes exempt", () => {
    expect(isCsrfExempt("/api/ai/chat")).toBe(true);
    expect(isCsrfExempt("/api/ai/speech-to-text")).toBe(true);
  });
});
/**
 * The public interview-response endpoint is reached from a link in an email.
 * The candidate has no session and therefore no CSRF cookie, so double-submit
 * cannot apply — the unguessable token in the path is the anti-forgery guard,
 * exactly as the signed token is for one-click unsubscribe.
 *
 * Browser verification caught this: every unit test mocked the route directly
 * and never met the middleware, so "Missing CSRF token" only appeared once a
 * real candidate journey was walked.
 */
describe("interview response CSRF exemption", () => {
  it("exempts the public response endpoint", () => {
    expect(isCsrfExempt("/api/interviews/response/abc123")).toBe(true);
  });

  it("does not exempt the authenticated interview routes", () => {
    expect(isCsrfExempt("/api/interviews")).toBe(false);
    expect(isCsrfExempt("/api/interviews/64b000000000000000000001")).toBe(false);
    expect(isCsrfExempt("/api/interviews/64b000000000000000000001/respond")).toBe(false);
    expect(isCsrfExempt("/api/interviews/bulk")).toBe(false);
  });
});
