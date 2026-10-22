/**
 * @jest-environment node
 *
 * The banner's "Cookie Policy" link must never open implied-consent text
 * ("By using our website, you consent..."): PECR and the ICO reject it. The
 * live CMS page still holds that old text until the owner runs
 * scripts/update-legal-content.mjs --apply, so the public page API checks for
 * the marker the generator writes into every policy it builds. A page without
 * it (in either language), or no page at all, is answered with the policy
 * generated from the registry, and a warning is logged so the owner knows the
 * CMS copy needs applying.
 */
import { NextRequest } from "next/server";
import { REGISTRY } from "@/lib/consent/registry";
import enMessages from "../../../messages/en.json";
import arMessages from "../../../messages/ar.json";
import { GENERATED_POLICY_MARKER, buildCookiePolicy } from "../../../scripts/lib/cookiePolicyFromRegistry.mjs";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/rateLimit", () => ({ checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }) }));
const warn = jest.fn();
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { warn: (...a: unknown[]) => warn(...a), error: jest.fn(), info: jest.fn() } }));
let stored: Record<string, unknown> | null = null;
jest.mock("@/models/StaticPage", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => ({ select: () => ({ lean: async () => stored }) })) },
}));

const STALE_EN = "<h2>4. Cookie Consent and Control</h2>\n<p>By using our website, you consent to the use of cookies as described in this Cookie Policy.</p>";
const STALE_AR = "<p>باستخدام موقعنا، فإنك توافق على استخدام ملفات تعريف الارتباط كما هو موضح في هذه السياسة.</p>";
const generated = (locale: "en" | "ar") =>
  buildCookiePolicy({ registry: REGISTRY, messages: locale === "en" ? enMessages : arMessages, locale }) as string;

const get = async (slug: string) => {
  const { GET } = await import("@/app/api/public/pages/[slug]/route");
  const res = await GET(new NextRequest(`http://localhost/api/public/pages/${slug}`), { params: Promise.resolve({ slug }) });
  return { status: res.status, body: await res.json() };
};

beforeEach(() => {
  jest.clearAllMocks();
  stored = null;
});

describe("the generator's marker", () => {
  it("is in every policy the generator builds, in both languages", () => {
    expect(generated("en")).toContain(GENERATED_POLICY_MARKER);
    expect(generated("ar")).toContain(GENERATED_POLICY_MARKER);
  });
});

describe("GET /api/public/pages/cookie-policy", () => {
  it("serves the generated policy instead of stale CMS text with no marker, and logs a warning", async () => {
    stored = { slug: "cookie-policy", title: "Cookie Policy", titleAr: "سياسة ملفات تعريف الارتباط", body: STALE_EN, bodyAr: STALE_AR, updatedAt: "2026-09-28T00:00:00.000Z" };
    const { status, body } = await get("cookie-policy");

    expect(status).toBe(200);
    expect(body.page.body).toBe(generated("en"));
    expect(body.page.bodyAr).toBe(generated("ar"));
    expect(JSON.stringify(body)).not.toContain("By using our website");
    expect(body.page.title).toBe("Cookie Policy");
    // The stale page's date is not the generated text's date.
    expect(body.page.updatedAt).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ slug: "cookie-policy" }), expect.stringMatching(/update-legal-content/));
  });

  it("replaces only the language that is stale", async () => {
    stored = { slug: "cookie-policy", title: "Cookie Policy", body: generated("en"), bodyAr: STALE_AR };
    const { body } = await get("cookie-policy");

    expect(body.page.body).toBe(generated("en"));
    expect(body.page.bodyAr).toBe(generated("ar"));
  });

  it("serves the generated policy when there is no published page at all", async () => {
    stored = null;
    const { status, body } = await get("cookie-policy");

    expect(status).toBe(200);
    expect(body.page.body).toBe(generated("en"));
    expect(body.page.bodyAr).toBe(generated("ar"));
  });

  it("serves the CMS page as stored once it carries the marker (the applied generated text), without a warning", async () => {
    const applied = { slug: "cookie-policy", title: "Cookie Policy", body: generated("en"), bodyAr: generated("ar"), updatedAt: "2026-10-30T00:00:00.000Z" };
    stored = applied;
    const { body } = await get("cookie-policy");

    expect(body.page).toEqual(applied);
    expect(warn).not.toHaveBeenCalled();
  });

  it("leaves every other legal page alone, marker or not", async () => {
    stored = { slug: "privacy-policy", title: "Privacy Policy", body: "<p>Our privacy policy</p>" };
    const { body } = await get("privacy-policy");

    expect(body.page.body).toBe("<p>Our privacy policy</p>");
    expect(warn).not.toHaveBeenCalled();
  });
});
