/**
 * @jest-environment node
 */
/**
 * PATCH /api/employers/[id]/region — the admin's "move this employer to
 * another region". The employer's own address edits never move it; only this
 * does, and only for an admin (agents and super-agents hold employers:update
 * in the matrix, so the route must refuse them itself).
 */
import { NextRequest } from "next/server";

let caller = { userId: "admin-1", role: "admin", locale: "en" };
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    async (req: NextRequest, params?: Record<string, string>) => handler(req, caller, params),
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
const logActivity = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/audit/log", () => ({ logActivity: (...a: unknown[]) => logActivity(...a), actorFromCtx: () => ({}) }));

const EMPLOYER_USER = "64b000000000000000000011";
const EMPLOYER_ID = "64b000000000000000000012";
const NEW_CITY = "64b000000000000000000013";

const updateOne = jest.fn().mockResolvedValue({});
let employerDoc: Record<string, unknown> | null = null;
jest.mock("@/models/Employer", () => ({
  Employer: {
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => employerDoc }) })),
    updateOne: (...a: unknown[]) => updateOne(...a),
  },
}));

const resolveEmployerRegion = jest.fn();
const summariseEmployerRegions = jest.fn();
jest.mock("@/lib/agents/territoryCoverage", () => ({
  resolveEmployerRegion: (...a: unknown[]) => resolveEmployerRegion(...a),
  summariseEmployerRegions: (...a: unknown[]) => summariseEmployerRegions(...a),
}));

function patch(body: unknown) {
  return new NextRequest(`http://t/api/employers/${EMPLOYER_USER}/region`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function call(body: unknown) {
  const { PATCH } = (await import("@/app/api/employers/[id]/region/route")) as unknown as {
    PATCH: (req: NextRequest, params: Record<string, string>) => Promise<Response>;
  };
  return PATCH(patch(body), { id: EMPLOYER_USER });
}

beforeEach(() => {
  jest.clearAllMocks();
  caller = { userId: "admin-1", role: "admin", locale: "en" };
  employerDoc = { _id: EMPLOYER_ID, companyName: "ABC", regionCityId: "old-city", regionStateId: "old-state" };
  summariseEmployerRegions.mockResolvedValue(new Map());
});

it("moves the employer to the new city and its state, and audits the move", async () => {
  resolveEmployerRegion.mockResolvedValue({ cityId: NEW_CITY, stateId: "new-state", cityName: "Abu Dhabi", countryCode: "AE" });

  const res = await call({ cityId: NEW_CITY });

  expect(res.status).toBe(200);
  expect(updateOne).toHaveBeenCalledWith(
    { _id: EMPLOYER_ID },
    { $set: { regionCityId: NEW_CITY, regionStateId: "new-state" } },
  );
  expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "employer.change_region" }));
});

it("rejects a city that is not in the catalogue without writing", async () => {
  resolveEmployerRegion.mockResolvedValue(null);
  const res = await call({ cityId: NEW_CITY });
  expect(res.status).toBe(400);
  expect(updateOne).not.toHaveBeenCalled();
});

it.each(["super_agent", "agent", "employer"])("refuses a %s", async (role) => {
  caller = { userId: "someone", role, locale: "en" };
  const res = await call({ cityId: NEW_CITY });
  expect(res.status).toBe(403);
  expect(updateOne).not.toHaveBeenCalled();
});
