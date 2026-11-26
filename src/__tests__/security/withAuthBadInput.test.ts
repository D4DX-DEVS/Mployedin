/**
 * @jest-environment node
 *
 * Audit 2026-11-26 (SA-04/SA-10/AG-05/AG-12/F-07/F-08): a malformed id, date
 * or body that reached Mongoose surfaced as "Internal server error" 500.
 * withAuth now answers the caller's mistake with 400, and keeps 500 for real
 * faults.
 */
import { NextRequest, NextResponse } from "next/server";

let session: unknown = null;
jest.mock("@/lib/auth/config", () => ({ auth: jest.fn(async () => session) }));
jest.mock("@/lib/auth/sessionCutOff", () => ({ sessionEndedNow: jest.fn(async () => false) }));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn() }));
jest.mock("@/models/TenantViewSession", () => ({ __esModule: true, default: {} }));

import { withAuth, badInputResponse } from "@/lib/auth/withAuth";

const named = (name: string) => Object.assign(new Error(name), { name });
const call = (thrown: unknown) =>
  withAuth(async () => { throw thrown; }, { skipTenantView: true })(
    new NextRequest("http://localhost/api/invoices/xyz"),
    { params: Promise.resolve({}) },
  );

beforeEach(() => {
  session = { user: { id: "user-1", role: "admin", locale: "en", authAt: 1_700_000_000, authAtMs: 1_700_000_000_123 } };
});

describe("withAuth bad-input mapping", () => {
  it.each(["CastError", "ValidationError", "StrictModeError"])("answers a Mongoose %s with 400", async (name) => {
    const res = await call(named(name));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid id or value in the request" });
  });

  it("answers an unparseable JSON body with 400", async () => {
    const res = await call(new SyntaxError("Unexpected token"));
    expect(res.status).toBe(400);
  });

  it("keeps 500 for a real server fault", async () => {
    const res = await call(new Error("boom"));
    expect(res.status).toBe(500);
  });

  it("still passes a thrown NextResponse through unchanged", async () => {
    const res = await call(NextResponse.json({ error: "Validation failed" }, { status: 422 }));
    expect(res.status).toBe(422);
  });

  it("badInputResponse returns null for errors it does not own", () => {
    expect(badInputResponse(new Error("x"))).toBeNull();
    expect(badInputResponse(null)).toBeNull();
  });
});
