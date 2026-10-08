/**
 * @jest-environment node
 *
 * LD-1 / LD-2 / LD-4: "converted" is reachable only through the convert route,
 * a converted lead's status is final, and convert refuses a lead that already
 * has an employer.
 */
import { NextRequest } from "next/server";
import { leadUpdateSchema, leadConvertSchema } from "@/lib/validators/leads";

const LEAD_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";
let lead: Record<string, unknown> = {};

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (h: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    async (req: NextRequest) =>
      h(req, { userId: "eeeeeeeeeeeeeeeeeeeeeeee", role: "admin", locale: "en" }),
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: jest.fn(() => ({})) }));
jest.mock("@/lib/leads/access", () => ({ canAccessLead: jest.fn().mockResolvedValue(true) }));
jest.mock("@/lib/leads/autoRouter", () => ({ autoRouteLead: jest.fn() }));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimitDual: jest.fn().mockResolvedValue({ allowed: true }),
  RATE_LIMIT_CONFIGS: { employers: {} },
}));
const findOneAndUpdate = jest.fn();
jest.mock("@/models/Lead", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => {
      const p = Promise.resolve(lead) as Promise<unknown> & { lean: () => Promise<unknown> };
      p.lean = () => Promise.resolve(lead);
      return p;
    }),
    findOneAndUpdate: (...a: unknown[]) => findOneAndUpdate(...a),
  },
}));

const req = (url: string, method: string, body: unknown) =>
  new NextRequest(url, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe("lead validators", () => {
  it("refuses 'converted' as a PATCH status", () => {
    expect(leadUpdateSchema.safeParse({ status: "converted" }).success).toBe(false);
    expect(leadUpdateSchema.safeParse({ status: "lost" }).success).toBe(true);
  });

  it("validates convert overrides", () => {
    expect(leadConvertSchema.safeParse({ contactEmail: "not-an-email" }).success).toBe(false);
    expect(leadConvertSchema.safeParse({ contactEmail: "" }).success).toBe(true); // blank = omitted
    expect(leadConvertSchema.safeParse({ contactEmail: "a@b.co", companyName: "Acme" }).success).toBe(true);
  });
});

describe("PATCH /api/leads/[id]", () => {
  beforeEach(() => findOneAndUpdate.mockReset());

  it("409s any status change on a converted lead", async () => {
    lead = { _id: LEAD_ID, status: "converted", agentId: "x" };
    const { PATCH } = await import("@/app/api/leads/[id]/route");
    const res = await PATCH(req(`http://localhost/api/leads/${LEAD_ID}`, "PATCH", { status: "new" }), {} as never);
    expect(res.status).toBe(409);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("guards the write itself against a concurrent conversion", async () => {
    lead = { _id: LEAD_ID, status: "negotiating", agentId: "x" };
    findOneAndUpdate.mockResolvedValue(null); // converted between read and write
    const { PATCH } = await import("@/app/api/leads/[id]/route");
    const res = await PATCH(req(`http://localhost/api/leads/${LEAD_ID}`, "PATCH", { status: "lost" }), {} as never);
    expect(res.status).toBe(409);
    expect(findOneAndUpdate.mock.calls[0][0]).toEqual({ _id: LEAD_ID, status: { $ne: "converted" } });
  });
});

describe("POST /api/leads/[id]/convert", () => {
  it("409s a lead that already has an employer, whatever its status says", async () => {
    lead = { _id: LEAD_ID, status: "negotiating", convertedToEmployerId: "bbbbbbbbbbbbbbbbbbbbbbbb" };
    const { POST } = await import("@/app/api/leads/[id]/convert/route");
    const res = await POST(req(`http://localhost/api/leads/${LEAD_ID}/convert`, "POST", {}), {} as never);
    expect(res.status).toBe(409);
  });
});
