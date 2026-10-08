/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { CONSENT_COOKIE, CONSENT_POLICY_VERSION, serializeConsent } from "@/lib/consent/config";

const updateOne = jest.fn().mockResolvedValue({});
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/models/Job", () => ({ __esModule: true, default: { updateOne: (...a: unknown[]) => updateOne(...a) } }));

const JOB_ID = "64d000000000000000000009";

function consentCookie(analytics: boolean) {
  return `${CONSENT_COOKIE}=${encodeURIComponent(serializeConsent({
    id: "0f8fad5b-d9cb-469f-a165-70867728950e",
    version: CONSENT_POLICY_VERSION,
    timestamp: Date.now(),
    choices: { functional: false, analytics, marketing: false },
    method: "custom",
    gpc: false,
  }))}`;
}

async function call(cookie?: string) {
  const { POST } = await import("@/app/api/jobs/[id]/track-view/route");
  const req = new NextRequest(`http://localhost/api/jobs/${JOB_ID}/track-view`, {
    method: "POST",
    headers: cookie ? { cookie } : {},
  });
  return POST(req, { params: Promise.resolve({ id: JOB_ID }) });
}

beforeEach(() => updateOne.mockClear());

describe("job view tracking respects analytics consent", () => {
  it("without consent counts the view but sets no cookie and no unique view", async () => {
    const res = await call();
    expect(updateOne.mock.calls[0][1]).toEqual({ $inc: { views: 1 } });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("with analytics consent de-duplicates with the jv cookie", async () => {
    const res = await call(consentCookie(true));
    expect(updateOne.mock.calls[0][1]).toEqual({ $inc: { views: 1, uniqueViews: 1 } });
    expect(res.headers.get("set-cookie")).toMatch(/jv=64d000000000000000000009/);
  });

  it("clears a leftover jv cookie after consent was refused", async () => {
    const res = await call(`${consentCookie(false)}; jv=${JOB_ID}`);
    expect(updateOne.mock.calls[0][1]).toEqual({ $inc: { views: 1 } });
    expect(res.headers.get("set-cookie")).toMatch(/jv=;/);
  });
});
