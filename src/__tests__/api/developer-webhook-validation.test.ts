/**
 * @jest-environment node
 *
 * POST /api/developer { type: "webhook" } stored whatever the caller sent —
 * any string as the URL, any header map, any retry count — while the admin
 * route validated the same fields. Employer-created webhooks now go through
 * the same rules, and cannot set fields the route owns (secret, isActive).
 */
import { NextRequest } from "next/server";

const USER_ID = "650000000000000000000001";

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (h: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    (req: NextRequest) =>
      h(req, { userId: USER_ID, role: "employer", locale: "en" }),
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/models/ApiKey", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: { findOne: () => ({ lean: () => Promise.resolve({ _id: "650000000000000000000e01" }) }) },
}));

const webhookCreate = jest.fn(async (doc: Record<string, unknown>) => ({
  _id: "650000000000000000000f01",
  toObject: () => ({ _id: "650000000000000000000f01", ...doc }),
}));
jest.mock("@/models/Webhook", () => ({
  __esModule: true,
  WEBHOOK_EVENTS: jest.requireActual("@/models/Webhook").WEBHOOK_EVENTS,
  default: { create: (doc: Record<string, unknown>) => webhookCreate(doc) },
}));

import { POST as _POST } from "@/app/api/developer/route";
const POST = _POST as unknown as (req: NextRequest) => Promise<Response>;

const valid = {
  type: "webhook",
  name: "  Billing sync  ",
  url: "https://api.example.com/hooks",
  events: ["invoice.created", "invoice.paid"],
};

const post = (body: Record<string, unknown>) =>
  POST(
    new NextRequest("http://localhost/api/developer", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );

beforeEach(() => jest.clearAllMocks());

describe("POST /api/developer — webhook validation", () => {
  it("creates a webhook from a valid body", async () => {
    const res = await post(valid);

    expect(res.status).toBe(201);
    expect(webhookCreate).toHaveBeenCalledTimes(1);
    const doc = webhookCreate.mock.calls[0][0];
    expect(doc.name).toBe("Billing sync");
    expect(doc.url).toBe("https://api.example.com/hooks");
    expect(doc.events).toEqual(["invoice.created", "invoice.paid"]);
    expect(doc.retryCount).toBe(3);
    expect(doc.isActive).toBe(true);
    expect(typeof doc.secret).toBe("string");
  });

  it.each([
    ["a URL that is not a URL", { url: "not-a-url" }],
    ["a bare host", { url: "http://localhost/hook" }],
    ["an unknown event", { events: ["invoice.created", "everything.*"] }],
    ["no events", { events: [] }],
    ["events that is not a list", { events: "invoice.created" }],
    ["a name that is not text", { name: { $gt: "" } }],
    ["a name over 100 characters", { name: "x".repeat(101) }],
    ["a retry count above 10", { retryCount: 500 }],
    ["a negative retry count", { retryCount: -1 }],
    ["headers that are not text", { headers: { "X-Key": { nested: true } } }],
    ["an oversized header value", { headers: { "X-Key": "v".repeat(501) } }],
  ])("rejects %s", async (_label, override) => {
    const res = await post({ ...valid, ...override });

    expect(res.status).toBe(400);
    expect(webhookCreate).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.error).toBe("Validation failed");
    expect(Array.isArray(json.details)).toBe(true);
  });

  it("ignores a caller-supplied secret and isActive", async () => {
    const res = await post({ ...valid, secret: "caller-chosen-secret-123", isActive: false });

    expect(res.status).toBe(201);
    const doc = webhookCreate.mock.calls[0][0];
    expect(doc.secret).not.toBe("caller-chosen-secret-123");
    expect(doc.isActive).toBe(true);
  });

  it("keeps a valid retry count and headers", async () => {
    const res = await post({ ...valid, retryCount: 5, headers: { "X-Key": "abc" } });

    expect(res.status).toBe(201);
    const doc = webhookCreate.mock.calls[0][0];
    expect(doc.retryCount).toBe(5);
    expect(doc.headers).toEqual({ "X-Key": "abc" });
  });
});
