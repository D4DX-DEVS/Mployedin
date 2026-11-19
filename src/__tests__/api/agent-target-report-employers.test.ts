/**
 * @jest-environment node
 */
/**
 * GET /api/agent/target-report/employers — an agent sees only their own
 * employers, with the rate in effect (employer rate, else their default) and
 * their own revenue and commission. Mocks only.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
let role = "agent";
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => async (req: NextRequest) => handler(req, { userId: "u-agent", role, locale: "en" }),
}));

const chain = (v: unknown) => ({ select: () => ({ lean: async () => v }) });
const employerFind = jest.fn((filter: unknown) => { void filter; return chain([
  { _id: "e1", userId: "eu1", companyName: "Acme", agentCommissionRates: [{ rate: 7, effectiveFrom: new Date("2026-01-01"), setByRole: "admin" }] },
  { _id: "e2", userId: "eu2", companyName: "Beta", agentCommissionRates: [] },
]); });
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn(() => chain({ _id: "a1", commissionRate: 4 })) } }));
jest.mock("@/models/Employer", () => ({ __esModule: true, default: { find: (f: unknown) => employerFind(f) } }));
jest.mock("@/models/Invoice", () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => chain([
      { employerId: "e2", currency: "AED", subtotal: 1000, totalAmount: 1050, lineItems: [{ amount: 1000, placementId: "p1" }], commissions: [{ role: "agent", agentId: "a1", amount: 40, status: "paid" }] },
    ])),
  },
}));

import { GET } from "@/app/api/agent/target-report/employers/route";

const get = (q = "") => (GET as unknown as (r: NextRequest) => Promise<Response>)(new NextRequest(`http://localhost/api/agent/target-report/employers${q}`));

beforeEach(() => { role = "agent"; employerFind.mockClear(); });

it("lists only the agent's employers, biggest revenue first, with the rate in effect", async () => {
  const json = await (await get("?year=2026")).json();
  expect(employerFind).toHaveBeenCalledWith({ agentId: "a1" });
  expect(json.total).toBe(2);
  expect(json.data[0]).toEqual({
    employerUserId: "eu2", companyName: "Beta", rate: 4, rateSource: "agent_default",
    money: [{ currency: "AED", revenue: 1000, commission: 40, commissionPaid: 40 }],
  });
  expect(json.data[1]).toEqual(expect.objectContaining({ companyName: "Acme", rate: 7, rateSource: "employer_rate", money: [] }));
});

it("pages on the server and rejects odd page sizes", async () => {
  const json = await (await get("?page=2&pageSize=1")).json();
  expect(json.pageSize).toBe(10);
  expect(json.data).toHaveLength(0);
});

it("is for agents only", async () => {
  role = "super_agent";
  expect((await get()).status).toBe(403);
});
