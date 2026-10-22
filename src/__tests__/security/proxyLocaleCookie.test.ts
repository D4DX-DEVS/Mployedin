/**
 * @jest-environment node
 */
/**
 * NEXT_LOCALE is a preference cookie. The proxy runs one next-intl middleware
 * that neither reads nor writes it, and a second that does; a request gets the
 * second only if it already carries NEXT_LOCALE and the visitor has not
 * objected to preferences. So a visit never creates the cookie, a language the
 * visitor chose is honoured on "/", and after an objection it is ignored.
 */
import { NextRequest, NextResponse } from "next/server";
import { CONSENT_COOKIE, serializeConsent } from "@/lib/consent/state";

const mockInstances: Array<{ config: Record<string, unknown>; run: jest.Mock }> = [];

jest.mock("@/lib/auth/edge-config", () => ({
  auth: (handler: (req: unknown) => unknown) => handler,
}));
jest.mock("next-intl/middleware", () => ({
  __esModule: true,
  default: (config: Record<string, unknown>) => {
    const run = jest.fn(() => NextResponse.next());
    mockInstances.push({ config, run });
    return run;
  },
}));

async function visit(path: string, cookie?: string) {
  const { default: proxy } = await import("@/proxy");
  const headers: Record<string, string> = cookie ? { cookie } : {};
  const req = new NextRequest(`http://localhost:3888${path}`, { headers });
  (req as unknown as { auth: unknown }).auth = null;
  await (proxy as unknown as (r: NextRequest) => Promise<Response>)(req);
}

const noCookie = () => mockInstances.find((i) => i.config.localeCookie === false)!;
const withCookie = () => mockInstances.find((i) => i.config.localeCookie !== false)!;
const consent = (preferences: boolean) =>
  `${CONSENT_COOKIE}=${serializeConsent({ v: 1, id: "x", preferences, media: false, at: "2026-10-20T00:00:00.000Z" })}`;

describe("proxy locale cookie", () => {
  beforeEach(async () => {
    await import("@/proxy");
    noCookie().run.mockClear();
    withCookie().run.mockClear();
  });

  it("builds one middleware without a locale cookie and one with a 1-year NEXT_LOCALE", () => {
    expect(mockInstances).toHaveLength(2);
    expect(noCookie().config).toMatchObject({ localePrefix: "always", defaultLocale: "en", localeCookie: false });
    expect(withCookie().config.localeCookie).toEqual({ name: "NEXT_LOCALE", maxAge: 31536000, sameSite: "lax" });
  });

  it("a visitor with no NEXT_LOCALE gets the middleware that never writes it", async () => {
    await visit("/ar");
    expect(noCookie().run).toHaveBeenCalledTimes(1);
    expect(withCookie().run).not.toHaveBeenCalled();
  });

  it("an existing NEXT_LOCALE is honoured while preferences are allowed (no choice yet)", async () => {
    await visit("/", "NEXT_LOCALE=ar");
    expect(withCookie().run).toHaveBeenCalledTimes(1);
    expect(noCookie().run).not.toHaveBeenCalled();
  });

  it("an existing NEXT_LOCALE is honoured when preferences were accepted", async () => {
    await visit("/", `NEXT_LOCALE=ar; ${consent(true)}`);
    expect(withCookie().run).toHaveBeenCalledTimes(1);
  });

  it("an existing NEXT_LOCALE is ignored after the visitor objected to preferences", async () => {
    await visit("/", `NEXT_LOCALE=ar; ${consent(false)}`);
    expect(noCookie().run).toHaveBeenCalledTimes(1);
    expect(withCookie().run).not.toHaveBeenCalled();
  });
});
