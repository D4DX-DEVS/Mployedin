/**
 * @jest-environment node
 *
 * SEC-A1 / SEC-C8 — webhooks are tenant-scoped and employer self-service is
 * bounded: employers can only subscribe to recruiting events, their webhooks
 * carry an employerId, dispatch only reaches the owning tenant (plus admin
 * platform webhooks), and self-issued API keys are read-only.
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => async (req: NextRequest) =>
    handler(req, (req as unknown as { __ctx: unknown }).__ctx, {}),
}));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/ssrf", () => ({ safeFetch: jest.fn() }));

const webhookCreate = jest.fn();
const webhookFindLean = jest.fn();
const webhookFind = jest.fn((..._args: unknown[]) => ({ select: jest.fn(() => ({ lean: webhookFindLean })) }));
jest.mock("@/models/Webhook", () => {
  const actual = jest.requireActual("@/models/Webhook");
  return {
    __esModule: true,
    ...actual,
    default: { create: (...a: unknown[]) => webhookCreate(...a), find: (...a: unknown[]) => webhookFind(...a) },
  };
});

const apiKeyCreate = jest.fn();
jest.mock("@/models/ApiKey", () => ({
  __esModule: true,
  default: {
    create: (...a: unknown[]) => apiKeyCreate(...a),
    countDocuments: jest.fn().mockResolvedValue(0),
  },
}));

const EMPLOYER_ID = "507f1f77bcf86cd799439011";
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ lean: jest.fn().mockResolvedValue({ _id: EMPLOYER_ID }) })),
  },
}));

const userFindLean = jest.fn();
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { find: jest.fn(() => ({ select: jest.fn(() => ({ lean: userFindLean })) })) },
}));

const USER_ID = "507f1f77bcf86cd799439022";

function post(body: unknown): NextRequest {
  const req = new NextRequest("http://localhost:3000/api/developer", {
    method: "POST",
    body: JSON.stringify(body),
  });
  (req as unknown as { __ctx: unknown }).__ctx = { userId: USER_ID, role: "employer" };
  return req;
}

describe("POST /api/developer — webhook + API key bounds", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    webhookCreate.mockImplementation(async (doc) => ({ ...doc, _id: "w1", toObject: () => doc }));
    apiKeyCreate.mockImplementation(async (doc) => ({ ...doc, _id: "k1", toObject: () => doc }));
  });

  it("rejects subscriptions to financial events", async () => {
    const { POST } = await import("@/app/api/developer/route");
    const res = await POST(
      post({ type: "webhook", name: "x", url: "https://example.com/h", events: ["job.created", "invoice.paid"] }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(400);
    expect(webhookCreate).not.toHaveBeenCalled();
  });

  it("stores the caller's employerId on an allowed webhook", async () => {
    const { POST } = await import("@/app/api/developer/route");
    const res = await POST(
      post({ type: "webhook", name: "x", url: "https://example.com/h", events: ["application.created"] }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(201);
    expect(webhookCreate).toHaveBeenCalledWith(expect.objectContaining({ employerId: EMPLOYER_ID }));
  });

  it("drops write / full_access scopes from self-issued API keys", async () => {
    const { POST } = await import("@/app/api/developer/route");
    const res = await POST(
      post({ type: "api_key", name: "k", scopes: ["full_access", "write:jobs", "read:applications"] }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(201);
    expect(apiKeyCreate).toHaveBeenCalledWith(expect.objectContaining({ scopes: ["read:applications"] }));
  });
});

describe("findWebhookTargets — tenant filter at dispatch", () => {
  beforeEach(() => jest.clearAllMocks());

  it("queries only the owning tenant's webhooks plus unscoped ones", async () => {
    webhookFindLean.mockResolvedValue([]);
    const { findWebhookTargets } = await import("@/lib/integrations/webhookDispatcher");
    await findWebhookTargets("application.created", EMPLOYER_ID);

    const filter = webhookFind.mock.calls[0][0] as unknown as { $or: Record<string, unknown>[] };
    expect(filter.$or).toEqual(
      expect.arrayContaining([
        { employerId: { $exists: false } },
        { employerId: null },
      ]),
    );
    const scoped = filter.$or.find((c) => c.employerId && typeof c.employerId === "object" && !("$exists" in (c.employerId as object)));
    expect(String(scoped?.employerId)).toBe(EMPLOYER_ID);
  });

  it("drops legacy unscoped webhooks unless an admin created them", async () => {
    webhookFindLean.mockResolvedValue([
      { _id: "a", createdBy: "admin-user" },
      { _id: "b", createdBy: "employer-user" },
      { _id: "c", createdBy: "employer-user", employerId: EMPLOYER_ID },
    ]);
    userFindLean.mockResolvedValue([{ _id: "admin-user" }]);

    const { findWebhookTargets } = await import("@/lib/integrations/webhookDispatcher");
    const targets = await findWebhookTargets("invoice.paid", null);
    expect(targets.map((w) => String(w._id)).sort()).toEqual(["a", "c"]);
  });
});
