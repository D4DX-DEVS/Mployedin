/**
 * @jest-environment node
 *
 * A changed password ends every session on the next request, but each server
 * caches the account's cut-off for 30 s (lib/auth/sessionCutOff.ts). Steps that
 * hand out access outliving the session — an MCP approval, an API key or
 * webhook, an address change — must not run in that gap, so their routes ask
 * withAuth for `freshSession`, which reads the cut-off from the database.
 */
import * as fs from "fs";
import * as path from "path";
import { NextRequest, NextResponse } from "next/server";

let session: unknown = null;
jest.mock("@/lib/auth/config", () => ({ auth: jest.fn(async () => session) }));
const sessionEndedNow = jest.fn(async (..._a: unknown[]) => false);
jest.mock("@/lib/auth/sessionCutOff", () => ({ sessionEndedNow: (...a: unknown[]) => sessionEndedNow(...a) }));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn() }));
jest.mock("@/models/TenantViewSession", () => ({ __esModule: true, default: {} }));

import { withAuth } from "@/lib/auth/withAuth";

const handler = jest.fn(async () => NextResponse.json({ ok: true }));
const call = (route: ReturnType<typeof withAuth>) =>
  route(new NextRequest("http://localhost/api/user/email-change", { method: "POST" }), { params: Promise.resolve({}) });

beforeEach(() => {
  handler.mockClear();
  sessionEndedNow.mockReset().mockResolvedValue(false);
  session = { user: { id: "user-1", role: "job_seeker", locale: "en", authAt: 1_700_000_000, authAtMs: 1_700_000_000_123 } };
});

describe("withAuth({ freshSession: true })", () => {
  const route = withAuth(handler, { skipTenantView: true, freshSession: true });

  it("refuses a session the database says has ended, before the handler runs", async () => {
    sessionEndedNow.mockResolvedValue(true);
    const res = await call(route);

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "SESSION_ENDED" });
    expect(handler).not.toHaveBeenCalled();
    expect(sessionEndedNow).toHaveBeenCalledWith("user-1", expect.objectContaining({ authAt: 1_700_000_000, authAtMs: 1_700_000_000_123 }));
  });

  it("runs the handler for a session that is still valid", async () => {
    const res = await call(route);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });
});

it("leaves every other route on the cached check", async () => {
  const res = await call(withAuth(handler, { skipTenantView: true }));
  expect(res.status).toBe(200);
  expect(sessionEndedNow).not.toHaveBeenCalled();
});

it.each([
  ["MCP connector approval", "app/api/mcp/consent/route.ts", /export const POST = withAuth\(postHandler, \{[^}]*freshSession: true/],
  ["API key and webhook creation", "app/api/developer/route.ts", /export const POST = withAuth\(postHandler, \{[^}]*freshSession: true/],
  ["email address change", "app/api/user/email-change/route.ts", /export const POST = withAuth\(postHandler, \{[^}]*freshSession: true/],
])("%s reads the cut-off fresh", (_name, file, pattern) => {
  const text = fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8");
  expect(text).toMatch(pattern);
});
