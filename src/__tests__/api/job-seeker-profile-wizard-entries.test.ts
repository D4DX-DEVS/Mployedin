/**
 * @jest-environment node
 *
 * Onboarding saves the one job and one qualification it shows. The route used
 * to $set those as the whole lists, erasing every other job and degree a CV
 * import had stored moments earlier (2026-09-30).
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: { userId: string; role: string }) => Promise<Response>) =>
    (req: NextRequest) => handler(req, { userId: "seeker_user_001", role: "job_seeker" }),
}));

jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/clientIp", () => ({ getClientIp: () => "127.0.0.1" }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("@/models/ConsentLog", () => ({ __esModule: true, default: { create: jest.fn().mockResolvedValue({}) } }));
jest.mock("@/lib/jobSeeker/persistCompleteness", () => ({ recomputeCompleteness: jest.fn().mockResolvedValue(undefined) }));

const E1 = "a0000000000000000000e001";
const E2 = "a0000000000000000000e002";
const D1 = "a0000000000000000000d001";
const D2 = "a0000000000000000000d002";

const stored = {
  experience: [
    { _id: E1, jobTitle: "Manager, Client Acquisition", company: "IndiaMART", startDate: new Date("2025-03-01"), isCurrent: true },
    { _id: E2, jobTitle: "Assistant Sales Manager", company: "Autumn Rooms", startDate: new Date("2024-07-01"), endDate: new Date("2025-02-01") },
  ],
  education: [
    { _id: D1, degree: "MBA", field: "Finance & Marketing", institution: "AIM" },
    { _id: D2, degree: "B.Com", field: "Marketing", institution: "Cochin College" },
  ],
};

const findOneAndUpdate = jest.fn();
const findOne = jest.fn();

jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOne: (...args: unknown[]) => findOne(...args),
    findOneAndUpdate: (...args: unknown[]) => findOneAndUpdate(...args),
  },
}));

jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { findByIdAndUpdate: jest.fn().mockResolvedValue({}) },
  User: {},
}));

import { PATCH } from "@/app/api/job-seekers/profile/route";

function patch(body: unknown) {
  return new NextRequest("http://localhost/api/job-seekers/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const noParams = { params: Promise.resolve({}) };

beforeEach(() => {
  findOneAndUpdate.mockReset();
  findOne.mockReset();
  findOne.mockImplementation(() => ({ select: () => ({ lean: () => Promise.resolve(structuredClone(stored)) }) }));
  // Echo what was written, the way returnDocument: "after" does.
  findOneAndUpdate.mockImplementation((_q: unknown, update: { $set: Record<string, unknown> }) =>
    Promise.resolve({ _id: "js1", ...update.$set }),
  );
});

const written = () => findOneAndUpdate.mock.calls[0][1].$set as { experience?: Array<Record<string, unknown>>; education?: Array<Record<string, unknown>> };

describe("onboarding saves keep the rest of a CV import", () => {
  it("updates the job the form showed and keeps the others", async () => {
    const res = await PATCH(patch({
      experience: [{ _id: E1, jobTitle: "Sales Manager", company: "IndiaMART", startDate: "2025-03-01", isCurrent: true }],
    }), noParams);

    expect(res.status).toBe(200);
    expect(written().experience).toHaveLength(2);
    expect(written().experience![0]).toMatchObject({ _id: E1, jobTitle: "Sales Manager" });
    expect(written().experience![1]).toMatchObject({ _id: E2, endDate: new Date("2025-02-01") });
    expect((await res.json()).entryIds).toEqual({ experience: E1 });
  });

  it("updates the qualification the form showed and keeps the other degree", async () => {
    const res = await PATCH(patch({
      education: [{ _id: D1, degree: "Masters/Post-Graduation", course: "MBA", field: "Finance & Marketing", institution: "AIM" }],
    }), noParams);

    expect(res.status).toBe(200);
    expect(written().education!.map((e) => e.degree)).toEqual(["Masters/Post-Graduation", "B.Com"]);
    expect((await res.json()).entryIds).toEqual({ education: D1 });
  });

  it("stores a first job as before when the profile had none", async () => {
    findOne.mockImplementation(() => ({ select: () => ({ lean: () => Promise.resolve(null) }) }));
    await PATCH(patch({
      experience: [{ jobTitle: "Engineer", company: "Acme", isCurrent: true, annualSalary: 1000, salaryCurrency: "AED" }],
    }), noParams);

    expect(written().experience).toEqual([expect.objectContaining({ jobTitle: "Engineer", company: "Acme", isCurrent: true })]);
    expect(findOneAndUpdate.mock.calls[0][1].$set.currentSalary).toEqual({ amount: 1000, currency: "AED" });
  });

  it("rejects an id that is not an ObjectId-shaped string", async () => {
    // validateBody throws its 400 for withAuth to return; the stub above doesn't catch.
    const res = await PATCH(patch({ experience: [{ _id: "e1; drop", jobTitle: "A", company: "B" }] }), noParams)
      .catch((thrown: unknown) => thrown as Response);
    expect(res.status).toBe(400);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });
});
