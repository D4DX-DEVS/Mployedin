/**
 * @jest-environment node
 */

import { isCsrfExempt } from "@/lib/security/csrf";
import {
  grantPredatesPasswordChange,
  isAllowedMcpRedirectUri,
  MCP_AUTHORIZATION_TTL_SECONDS,
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

  it("only sends approval codes back to supported AI client hosts", () => {
    expect(isAllowedMcpRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(isAllowedMcpRedirectUri("https://chat.openai.com/aip/callback")).toBe(true);
    // Anyone can register a client named "ChatGPT"; its redirect is what counts.
    expect(isAllowedMcpRedirectUri("https://example.com/callback")).toBe(false);
    expect(isAllowedMcpRedirectUri("https://chatgpt.com.evil.example/callback")).toBe(false);
    expect(isAllowedMcpRedirectUri("http://chatgpt.com/callback")).toBe(false);
  });

  it("adds hosts from MCP_EXTRA_REDIRECT_HOSTS", () => {
    const previous = process.env.MCP_EXTRA_REDIRECT_HOSTS;
    process.env.MCP_EXTRA_REDIRECT_HOSTS = " vscode.dev , Example.org ";
    try {
      expect(isAllowedMcpRedirectUri("https://vscode.dev/redirect")).toBe(true);
      expect(isAllowedMcpRedirectUri("https://example.org/cb")).toBe(true);
      expect(isAllowedMcpRedirectUri("https://example.net/cb")).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.MCP_EXTRA_REDIRECT_HOSTS;
      else process.env.MCP_EXTRA_REDIRECT_HOSTS = previous;
    }
  });

  it("ends a grant approved before the last password change", () => {
    const now = Date.now();
    const grantedAt = now - 10 * 24 * 3600 * 1000;
    const authorizationExpiresAt = new Date(grantedAt + MCP_AUTHORIZATION_TTL_SECONDS * 1000);
    expect(grantPredatesPasswordChange(authorizationExpiresAt, undefined)).toBe(false);
    expect(grantPredatesPasswordChange(authorizationExpiresAt, new Date(grantedAt - 1000))).toBe(false);
    expect(grantPredatesPasswordChange(authorizationExpiresAt, new Date(now))).toBe(true);
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

  it("grants each role exactly its own scopes, whatever the client asks for", () => {
    const expected = {
      job_seeker: ["read:reports"],
      employer: ["read:reports", "read:jobs", "write:posters"],
      agent: ["read:reports", "read:jobs"],
      super_agent: ["read:reports", "read:jobs"],
      admin: ["read:reports", "read:jobs", "write:posters"],
    } as const;
    for (const [role, scopes] of Object.entries(expected) as [keyof typeof expected, readonly string[]][]) {
      expect(defaultScopesForRole(role)).toEqual(scopes);
      expect(scopesForRole([], role)).toEqual(scopes);
      // A stale request (reports only, or retired names) can't leave tools unusable…
      expect(scopesForRole(["read:reports", "read:applicants"], role)).toEqual(scopes);
    }
    // …and can't widen a role either.
    expect(scopesForRole(["write:posters", "read:jobs"], "job_seeker")).toEqual(["read:reports"]);
    expect(scopesForRole(["write:posters"], "agent")).toEqual(["read:reports", "read:jobs"]);
  });

  it("keeps browser consent protected while exempting server OAuth exchanges", () => {
    expect(isCsrfExempt("/api/mcp")).toBe(true);
    expect(isCsrfExempt("/api/mcp/token")).toBe(true);
    expect(isCsrfExempt("/api/mcp/revoke")).toBe(true);
    expect(isCsrfExempt("/api/mcp/consent")).toBe(false);
    expect(isCsrfExempt("/api/mcp/authorize")).toBe(false);
  });
});
