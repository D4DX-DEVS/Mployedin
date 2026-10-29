/**
 * @jest-environment node
 */
/**
 * Server components read their language through next-intl's request header
 * (X-NEXT-INTL-LOCALE). The proxy forwards its own request headers, not the
 * ones next-intl's middleware set, so it must set this one itself. Without it a
 * full page load still worked (the [locale] layout calls setRequestLocale), but a
 * client-side navigation renders only the page segment, which fell back to
 * English: /ar → footer link → /ar/about showed English text.
 */
import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/auth/edge-config", () => ({
  auth: (handler: (req: unknown) => unknown) => handler,
}));
jest.mock("next-intl/middleware", () => ({
  __esModule: true,
  default: () => jest.fn(() => NextResponse.next()),
}));

async function forwardedLocale(path: string, headers: Record<string, string> = {}): Promise<string | null> {
  const { default: proxy } = await import("@/proxy");
  const req = new NextRequest(`http://localhost:3888${path}`, { headers });
  (req as unknown as { auth: unknown }).auth = null;
  const res = await (proxy as unknown as (r: NextRequest) => Promise<Response>)(req);
  return res.headers.get("x-middleware-request-x-next-intl-locale");
}

describe("proxy forwards the page language to server components", () => {
  it.each([
    ["/ar/about", "ar"],
    ["/ar/companies?page=2", "ar"],
    ["/en/about", "en"],
  ])("%s → %s", async (path, locale) => {
    expect(await forwardedLocale(path)).toBe(locale);
  });

  it("an RSC navigation request gets it too", async () => {
    expect(await forwardedLocale("/ar/about?_rsc=abc", { rsc: "1" })).toBe("ar");
  });

  it("a header the browser sent is replaced by the URL's language", async () => {
    expect(await forwardedLocale("/ar/about", { "x-next-intl-locale": "en" })).toBe("ar");
  });
});
