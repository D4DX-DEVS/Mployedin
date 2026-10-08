/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { CONSENT_COOKIE, CONSENT_POLICY_VERSION, serializeConsent } from "@/lib/consent/config";

const create = jest.fn().mockResolvedValue({});
const findOne = jest.fn();
let sessionUser: { id: string } | null = null;

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/config", () => ({ auth: jest.fn(async () => (sessionUser ? { user: sessionUser } : null)) }));
jest.mock("@/models/CookieConsentRecord", () => ({
  __esModule: true,
  default: {
    create: (...a: unknown[]) => create(...a),
    findOne: (...a: unknown[]) => findOne(...a),
  },
}));

const CONSENT_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

function post(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/consent", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "203.0.113.7", ...headers },
    body: JSON.stringify(body),
  });
}

const valid = {
  consentId: CONSENT_ID,
  policyVersion: CONSENT_POLICY_VERSION,
  choices: { functional: true, analytics: true, marketing: true },
  method: "accept_all",
  locale: "en",
  pageUrl: "/en/jobs?search=secret",
};

beforeEach(() => {
  create.mockClear();
  findOne.mockReset();
  sessionUser = null;
});

describe("POST /api/consent", () => {
  it("records a proof-of-consent row without the raw IP or query string", async () => {
    const { POST } = await import("@/app/api/consent/route");
    const res = await POST(post(valid));
    expect(res.status).toBe(200);
    const row = create.mock.calls[0][0];
    expect(row).toMatchObject({
      consentId: CONSENT_ID,
      method: "accept_all",
      choices: { necessary: true, functional: true, analytics: true, marketing: true },
      pageUrl: "/en/jobs",
    });
    expect(row.userId).toBeUndefined();
    expect(JSON.stringify(row)).not.toContain("203.0.113.7");
    expect(row.ipHash).toMatch(/^[0-9a-f]{32}$/);
  });

  it("links the record to the signed-in account", async () => {
    sessionUser = { id: "64d000000000000000000001" };
    const { POST } = await import("@/app/api/consent/route");
    await POST(post(valid));
    expect(create.mock.calls[0][0].userId).toBe("64d000000000000000000001");
  });

  it("never records marketing as granted by accept-all under a GPC signal", async () => {
    const { POST } = await import("@/app/api/consent/route");
    await POST(post(valid, { "sec-gpc": "1" }));
    expect(create.mock.calls[0][0]).toMatchObject({ gpc: true, choices: { marketing: false, analytics: true } });
  });

  it("clears the analytics cookie when analytics is refused", async () => {
    const { POST } = await import("@/app/api/consent/route");
    const res = await POST(post({ ...valid, method: "reject_all", choices: { functional: false, analytics: false, marketing: false } }));
    expect(res.headers.get("set-cookie")).toMatch(/jv=;/);
  });

  it("rejects malformed bodies", async () => {
    const { POST } = await import("@/app/api/consent/route");
    const res = await POST(post({ ...valid, consentId: "<x>", method: "yes" }));
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("GET /api/consent", () => {
  const lean = (value: unknown) => ({ sort: () => ({ select: () => ({ lean: () => Promise.resolve(value) }) }) });

  it("returns null without a cookie or session", async () => {
    const { GET } = await import("@/app/api/consent/route");
    const res = await GET(new NextRequest("http://localhost/api/consent"));
    expect(await res.json()).toEqual({ consent: null });
    expect(findOne).not.toHaveBeenCalled();
  });

  it("returns the account's latest current choice for a new device", async () => {
    sessionUser = { id: "64d000000000000000000001" };
    findOne.mockReturnValue(lean({
      consentId: CONSENT_ID,
      policyVersion: CONSENT_POLICY_VERSION,
      choices: { necessary: true, functional: false, analytics: true, marketing: false },
      method: "custom",
      gpc: false,
      createdAt: new Date(),
    }));
    const { GET } = await import("@/app/api/consent/route");
    const res = await GET(new NextRequest("http://localhost/api/consent"));
    const body = await res.json();
    expect(findOne).toHaveBeenCalledWith({ userId: "64d000000000000000000001" });
    expect(body.consent).toMatchObject({ id: CONSENT_ID, choices: { analytics: true, functional: false } });
  });

  it("does not hand back a choice made against an old policy version", async () => {
    findOne.mockReturnValue(lean({
      consentId: CONSENT_ID,
      policyVersion: "2000-01-01",
      choices: { necessary: true, functional: true, analytics: true, marketing: true },
      method: "accept_all",
      gpc: false,
      createdAt: new Date(),
    }));
    const cookie = serializeConsent({
      id: CONSENT_ID, version: "2000-01-01", timestamp: Date.now(),
      choices: { functional: true, analytics: true, marketing: true }, method: "accept_all", gpc: false,
    });
    const { GET } = await import("@/app/api/consent/route");
    const res = await GET(new NextRequest("http://localhost/api/consent", { headers: { cookie: `${CONSENT_COOKIE}=${encodeURIComponent(cookie)}` } }));
    expect((await res.json()).consent).toBeNull();
  });
});
