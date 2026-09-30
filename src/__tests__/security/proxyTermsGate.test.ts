/**
 * @jest-environment node
 */
/**
 * The proxy sends a signed-in user who still owes a Terms/Privacy acceptance
 * (session.user.termsPending) to /accept-terms before any signed-in page, and
 * brings them back afterwards through callbackUrl. APIs stay open — the
 * acceptance page needs them — and so does /accept-terms itself.
 */
import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/auth/edge-config", () => ({
  auth: (handler: (req: unknown) => unknown) => handler,
}));
jest.mock("next-intl/middleware", () => ({
  __esModule: true,
  default: () => () => NextResponse.next(),
}));

type SessionUser = {
  id: string;
  role: string;
  locale: string;
  isEmailVerified?: boolean;
  isOnboarded?: boolean;
  termsPending?: boolean;
};

async function run(path: string, user: SessionUser | null) {
  const { default: proxy } = await import("@/proxy");
  const req = new NextRequest(`http://localhost:3888${path}`);
  (req as unknown as { auth: unknown }).auth = user ? { user } : null;
  return (proxy as unknown as (r: NextRequest) => Promise<Response>)(req);
}

const agent: SessionUser = { id: "u1", role: "agent", locale: "en", isEmailVerified: true, termsPending: true };

describe("proxy Terms gate", () => {
  it("sends a pending user from their dashboard to /accept-terms, keeping where they were going", async () => {
    const res = await run("/en/agent/leads?stage=new", agent);
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.pathname).toBe("/en/accept-terms");
    expect(location.searchParams.get("callbackUrl")).toBe("/en/agent/leads?stage=new");
  });

  it("gates notifications and onboarding too", async () => {
    for (const path of ["/en/notifications", "/ar/onboarding"]) {
      const res = await run(path, { ...agent, role: "job_seeker", isOnboarded: false });
      expect(new URL(res.headers.get("location") ?? "").pathname).toMatch(/\/accept-terms$/);
    }
  });

  it("lets a pending user open /accept-terms itself (no loop)", async () => {
    const res = await run("/en/accept-terms?callbackUrl=%2Fen%2Fagent", agent);
    expect(res.headers.get("location")).toBeNull();
  });

  it("leaves APIs alone, so the acceptance can be saved", async () => {
    const res = await run("/api/user/consent", agent);
    expect(res.headers.get("location")).toBeNull();
  });

  it("leaves public pages alone, so the Terms can be read", async () => {
    const res = await run("/en/terms", agent);
    expect(res.headers.get("location")).toBeNull();
  });

  it("lets a user who has accepted through", async () => {
    const res = await run("/en/agent", { ...agent, termsPending: false });
    expect(res.headers.get("location")).toBeNull();
  });

  it("verifies e-mail before asking for the Terms", async () => {
    const res = await run("/en/agent", { ...agent, isEmailVerified: false });
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/en/verify-email");
  });

  it("sends a signed-out visitor of /accept-terms to sign in", async () => {
    const res = await run("/en/accept-terms", null);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/en/login");
  });
});
