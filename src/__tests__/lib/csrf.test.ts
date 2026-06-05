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