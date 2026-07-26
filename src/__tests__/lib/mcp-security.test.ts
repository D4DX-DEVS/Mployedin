/**
 * @jest-environment node
 */

import { isCsrfExempt } from "@/lib/security/csrf";
import {
  isAllowedMcpRedirectUri,
  isValidPkceChallenge,
  isValidPkceVerifier,
} from "@/lib/mcp/oauth";
import {
  defaultScopesForRole,
  scopesForRole,
} from "@/lib/mcp/scopes";

describe("MCP OAuth security helpers", () => {
  it("only permits HTTPS or exact loopback HTTP redirect URIs", () => {
    expect(isAllowedMcpRedirectUri("https://chatgpt.com/connector/oauth/callback")).toBe(true);
    expect(isAllowedMcpRedirectUri("http://localhost:3210/callback")).toBe(true);
    expect(isAllowedMcpRedirectUri("http://127.0.0.1:3210/callback")).toBe(true);
    expect(isAllowedMcpRedirectUri("http://[::1]:3210/callback")).toBe(true);

    expect(isAllowedMcpRedirectUri("http://localhost.evil.example/callback")).toBe(false);
    expect(isAllowedMcpRedirectUri("http://localhost@evil.example/callback")).toBe(false);
    expect(isAllowedMcpRedirectUri("https://user:pass@example.com/callback")).toBe(false);
    expect(isAllowedMcpRedirectUri("https://example.com/callback#fragment")).toBe(false);
    expect(isAllowedMcpRedirectUri("http://example.com/callback")).toBe(false);
  });

  it("validates S256 challenge and verifier shapes", () => {
    expect(isValidPkceChallenge("A".repeat(43))).toBe(true);
    expect(isValidPkceChallenge("A".repeat(42))).toBe(false);
    expect(isValidPkceChallenge(`${"A".repeat(42)}=`)).toBe(false);

    expect(isValidPkceVerifier("a".repeat(43))).toBe(true);
    expect(isValidPkceVerifier(`${"a".repeat(42)}~`)).toBe(true);
    expect(isValidPkceVerifier("a".repeat(129))).toBe(false);
    expect(isValidPkceVerifier(`${"a".repeat(42)}+`)).toBe(false);
  });

  it("defaults omitted scopes by role and never grants cross-role scopes", () => {
    expect(scopesForRole([], "job_seeker")).toEqual([
      "read:jobs",
      "read:applications",
      "read:profile",
    ]);
    expect(defaultScopesForRole("admin")).toEqual([
      "read:employer_jobs",
      "read:applicants",
    ]);
    expect(scopesForRole(["read:jobs", "read:applicants"], "employer")).toEqual([
      "read:applicants",
    ]);
    expect(defaultScopesForRole("agent")).toContain("read:employer_jobs");
    expect(defaultScopesForRole("super_agent")).toContain("read:applicants");
  });

  it("keeps browser consent protected while exempting server OAuth exchanges", () => {
    expect(isCsrfExempt("/api/mcp")).toBe(true);
    expect(isCsrfExempt("/api/mcp/token")).toBe(true);
    expect(isCsrfExempt("/api/mcp/revoke")).toBe(true);
    expect(isCsrfExempt("/api/mcp/consent")).toBe(false);
    expect(isCsrfExempt("/api/mcp/authorize")).toBe(false);
  });
});
