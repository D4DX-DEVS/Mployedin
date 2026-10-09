/**
 * @jest-environment node
 */
/**
 * BUG-010: an anonymous visitor opening a protected deep link must be sent to
 * /login with the deep link as a *path* callback, so sign-in can bring them
 * back. Storing the full URL tripped the open-redirect guard
 * (safeCallbackPath rejects absolute URLs) and everyone landed on the
 * dashboard instead of the requested page.
 */
import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/auth/edge-config", () => ({
  auth: (handler: (req: unknown) => unknown) => handler,
}));
jest.mock("next-intl/middleware", () => ({
  __esModule: true,
  default: () => () => NextResponse.next(),
}));

async function run(path: string) {
  const { default: proxy } = await import("@/proxy");
  const req = new NextRequest(`http://localhost:3888${path}`);
  (req as unknown as { auth: unknown }).auth = null;
  return (proxy as unknown as (r: NextRequest) => Promise<Response>)(req);
}

describe("proxy login redirect (BUG-010)", () => {
  it("keeps a protected deep link as a path callback", async () => {
    const res = await run("/en/admin/users");
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.pathname).toBe("/en/login");
    expect(location.searchParams.get("callbackUrl")).toBe("/en/admin/users");
  });

  it("keeps the query string of the deep link", async () => {
    const res = await run("/en/admin/users?search=acme");
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.searchParams.get("callbackUrl")).toBe(
      "/en/admin/users?search=acme",
    );
  });

  it("never stores an absolute URL as the callback", async () => {
    const res = await run("/en/agent/leads?stage=new");
    const callback = new URL(res.headers.get("location") ?? "").searchParams.get("callbackUrl") ?? "";
    expect(callback).not.toContain("://");
  });
});
