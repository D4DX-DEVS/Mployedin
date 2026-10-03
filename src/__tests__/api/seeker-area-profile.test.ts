/**
 * @jest-environment node
 *
 * Client report 2026-09-30, #5: a job seeker picks their area — a catalogue
 * city — at onboarding and on their profile, through /api/job-seekers/profile.
 * The city's id (and its state) is what agents' areas match on. A seeker whose
 * city isn't listed picks just the region (state) instead (owner, 2026-10-02).
 */
import { NextRequest } from "next/server";

const USER = "651000000000000000000001";
const CITY = "550000000000000000000001";
const STATE = "540000000000000000000001";
const UNKNOWN_CITY = "550000000000000000000009";
const UNKNOWN_STATE = "540000000000000000000009";

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    (req: NextRequest) => handler(req, { userId: USER, role: "job_seeker", locale: "en" }),
}));
jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: jest.fn(async () => undefined), connectDB: jest.fn(async () => undefined) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(async () => undefined) }));
jest.mock("@/lib/jobSeeker/persistCompleteness", () => ({ recomputeCompleteness: jest.fn(async () => undefined) }));
jest.mock("@/models/ConsentLog", () => ({ __esModule: true, default: { create: jest.fn(async () => ({})) } }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));

const mockResolve = jest.fn();
jest.mock("@/lib/agents/territoryCoverage", () => ({ resolveSeekerArea: (...a: unknown[]) => mockResolve(...a) }));

const mockUpdate = jest.fn();
let storedProfile: Record<string, unknown> | null;
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => storedProfile }), lean: async () => storedProfile })),
    findOneAndUpdate: (...a: unknown[]) => mockUpdate(...a),
  },
}));
const mockUserUpdate = jest.fn(async () => ({}));
// The phone-change reset (whatsapp/waId.ts): null means the stored phone was the same, so nothing else runs.
const mockUserReset = jest.fn((..._a: unknown[]) => ({ select: () => ({ lean: async () => null }) }));
jest.mock("@/models/NotificationPreference", () => ({ __esModule: true, default: { updateOne: jest.fn(async () => ({ modifiedCount: 0 })) }, CATEGORY_KEYS: [] }));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findByIdAndUpdate: (...a: unknown[]) => mockUserUpdate(...(a as [])),
    findOneAndUpdate: (...a: unknown[]) => mockUserReset(...a),
    findById: jest.fn(() => ({ select: () => ({ lean: async () => ({ phone: "+971500000000" }) }) })),
  },
}));

async function patch(body: Record<string, unknown>) {
  const { PATCH } = await import("@/app/api/job-seekers/profile/route");
  return PATCH(new NextRequest("http://localhost/api/job-seekers/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), {} as never);
}
const setOf = () => (mockUpdate.mock.calls[0][1] as { $set: Record<string, unknown> }).$set;

beforeEach(() => {
  jest.clearAllMocks();
  storedProfile = { _id: "js1", userId: USER, regionCityId: CITY };
  mockResolve.mockImplementation(async ({ cityId, stateId }: { cityId?: string; stateId?: string }) => {
    if (cityId) return cityId === CITY ? { cityId: CITY, cityName: "Kochi", stateId: STATE, stateName: "Kerala", countryCode: "IN" } : null;
    return stateId === STATE ? { cityId: null, cityName: null, stateId: STATE, stateName: "Kerala", countryCode: "IN" } : null;
  });
  mockUpdate.mockResolvedValue({ _id: "js1", isOnboarded: false, fullName: "Asha" });
});

it("saves the picked city and its state, and the location line follows", async () => {
  const res = await patch({ cityId: CITY });
  expect(res.status).toBe(200);
  expect(setOf()).toMatchObject({ regionCityId: CITY, regionStateId: STATE, currentLocation: "Kochi, India" });
  expect((await res.json()).area).toEqual({ cityId: CITY, cityName: "Kochi", stateId: STATE, stateName: "Kerala", countryCode: "IN" });
});

it("saves just the region when the seeker's city isn't listed", async () => {
  const res = await patch({ stateId: STATE });
  expect(res.status).toBe(200);
  expect(setOf()).toMatchObject({ regionCityId: null, regionStateId: STATE, currentLocation: "Kerala, India" });
  expect((await res.json()).area).toEqual({ cityId: null, cityName: null, stateId: STATE, stateName: "Kerala", countryCode: "IN" });
});

it("refuses a region that isn't in the list, before writing anything", async () => {
  const res = await patch({ stateId: UNKNOWN_STATE });
  expect(res.status).toBe(400);
  expect(mockUpdate).not.toHaveBeenCalled();
});

it("refuses a city and a region in the same save", async () => {
  // validateBody throws its 400; the real withAuth returns it.
  const res = await patch({ cityId: CITY, stateId: STATE }).catch((thrown: Response) => thrown);
  expect(res.status).toBe(400);
  expect(mockUpdate).not.toHaveBeenCalled();
});

it("keeps a location line sent in the same save", async () => {
  await patch({ cityId: CITY, currentLocation: "Kakkanad, Kochi" });
  expect(setOf()).toMatchObject({ regionCityId: CITY, currentLocation: "Kakkanad, Kochi" });
});

it("refuses a city that isn't in the list, before writing anything", async () => {
  const res = await patch({ cityId: UNKNOWN_CITY, name: "Asha" });
  expect(res.status).toBe(400);
  expect(mockUpdate).not.toHaveBeenCalled();
  expect(mockUserUpdate).not.toHaveBeenCalled();
});

it("clears the area on null", async () => {
  await patch({ cityId: null });
  expect(setOf()).toMatchObject({ regionCityId: null, regionStateId: null });
  expect(setOf()).not.toHaveProperty("currentLocation");
  jest.clearAllMocks();
  await patch({ stateId: null });
  expect(setOf()).toMatchObject({ regionCityId: null, regionStateId: null });
});

it("leaves the area alone when a save doesn't mention it", async () => {
  await patch({ headline: "Accountant" });
  expect(setOf()).not.toHaveProperty("regionCityId");
  expect(mockResolve).not.toHaveBeenCalled();
});

it("returns the saved area with the profile, for the pickers to show", async () => {
  const { GET } = await import("@/app/api/job-seekers/profile/route");
  const body = await (await GET(new NextRequest("http://localhost/api/job-seekers/profile"), {} as never)).json();
  expect(body.profile.area).toEqual({ cityId: CITY, cityName: "Kochi", stateId: STATE, stateName: "Kerala", countryCode: "IN" });
});

it("still returns the region when the stored city has been taken off the list", async () => {
  storedProfile = { _id: "js1", userId: USER, regionCityId: UNKNOWN_CITY, regionStateId: STATE };
  const { GET } = await import("@/app/api/job-seekers/profile/route");
  const body = await (await GET(new NextRequest("http://localhost/api/job-seekers/profile"), {} as never)).json();
  expect(body.profile.area).toMatchObject({ cityId: null, stateId: STATE, stateName: "Kerala" });
});

it("returns a region-only area too", async () => {
  storedProfile = { _id: "js1", userId: USER, regionCityId: null, regionStateId: STATE };
  const { GET } = await import("@/app/api/job-seekers/profile/route");
  const body = await (await GET(new NextRequest("http://localhost/api/job-seekers/profile"), {} as never)).json();
  expect(body.profile.area).toEqual({ cityId: null, cityName: null, stateId: STATE, stateName: "Kerala", countryCode: "IN" });
  expect(mockResolve).toHaveBeenCalledWith({ stateId: STATE });
});

describe("a phone change and the WhatsApp id learned for the old number", () => {
  it("forgets the stored wa_id, before saving, when a save carries a phone", async () => {
    const res = await patch({ phone: "+971 50 765 4321" });
    expect(res.status).toBe(200);
    // The stored phone (+971500000000) is another number: the reset applies while it is still the one stored.
    expect(mockUserReset).toHaveBeenCalledWith(
      { _id: USER, phone: "+971500000000" },
      { $unset: { "whatsapp.waId": 1, "whatsapp.optInAt": 1, "whatsapp.lastInboundAt": 1, "whatsapp.verifiedNumber": 1, "whatsapp.verifiedAt": 1, "whatsapp.startCode": 1 } },
      { returnDocument: "before" },
    );
    expect(mockUserUpdate).toHaveBeenCalledWith(USER, { phone: "+971 50 765 4321" });
    expect(mockUserReset.mock.invocationCallOrder[0]).toBeLessThan(mockUserUpdate.mock.invocationCallOrder[0]);
  });

  it("leaves the wa_id alone when a save carries no phone", async () => {
    await patch({ name: "Asha", headline: "Accountant" });
    expect(mockUserUpdate).toHaveBeenCalled();
    expect(mockUserReset).not.toHaveBeenCalled();
  });
});
