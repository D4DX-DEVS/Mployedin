/**
 * @jest-environment node
 */
/**
 * GET /api/admin/super-agents/:id/territory/locations
 *
 * Admin → Add / Edit Agent: once a super agent is picked, the region picker
 * must offer only that super agent's territory (the agents API rejects an
 * agent region outside it). This route feeds the picker the cascade narrowed
 * to the super agent named in the URL — admins only.
 */
import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn() } }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => async (req: NextRequest, context: { params: Promise<Record<string, string>> }) =>
    handler(req, (req as unknown as { __ctx: unknown }).__ctx, await context.params),
}));

const REGION = { assignedCityIds: ["c_tirur"], assignedStateIds: [] };
const getSuperAgentOwnRegion = jest.fn(async () => REGION);
jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentOwnRegion: (...args: unknown[]) => getSuperAgentOwnRegion(...(args as [])),
}));

const territoryLocationsResponse = jest.fn(async () => NextResponse.json({ countries: [{ _id: "co_in" }] }));
jest.mock("@/lib/auth/territoryLocations", () => ({
  territoryLocationsResponse: (...args: unknown[]) => territoryLocationsResponse(...(args as [])),
}));

import { GET } from "@/app/api/admin/super-agents/[id]/territory/locations/route";

const SA_USER_ID = "64b000000000000000000001";

function call(role: string, id: string, query = "level=countries") {
  const req = new NextRequest(`http://localhost/api/admin/super-agents/${id}/territory/locations?${query}`);
  (req as unknown as { __ctx: unknown }).__ctx = { userId: "u1", role, locale: "en" };
  return GET(req, { params: Promise.resolve({ id }) } as never);
}

beforeEach(() => {
  getSuperAgentOwnRegion.mockClear();
  territoryLocationsResponse.mockClear();
});

describe("GET /api/admin/super-agents/:id/territory/locations", () => {
  it("answers with the named super agent's territory cascade", async () => {
    const res = await call("admin", SA_USER_ID, "level=states&countryId=co_in");
    expect(res.status).toBe(200);
    expect(getSuperAgentOwnRegion).toHaveBeenCalledWith(SA_USER_ID);
    const [region, params] = territoryLocationsResponse.mock.calls[0] as unknown as [unknown, URLSearchParams];
    expect(region).toBe(REGION);
    expect(params.get("level")).toBe("states");
    expect(params.get("countryId")).toBe("co_in");
  });

  it.each(["super_agent", "agent", "employer"])("refuses %s", async (role) => {
    const res = await call(role, SA_USER_ID);
    expect(res.status).toBe(403);
    expect(getSuperAgentOwnRegion).not.toHaveBeenCalled();
  });

  it("rejects a malformed id", async () => {
    const res = await call("admin", "not-an-id");
    expect(res.status).toBe(400);
    expect(getSuperAgentOwnRegion).not.toHaveBeenCalled();
  });
});
