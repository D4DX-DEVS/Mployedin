/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: { userId: string; role: "admin"; locale: string }) => Promise<Response>) =>
    (req: NextRequest) => handler(req, { userId: "507f1f77bcf86cd799439099", role: "admin", locale: "en" }),
}));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn(() => ({})),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

const userFindOne = jest.fn();
const userCreate = jest.fn();
const userDelete = jest.fn();
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findOne: (...a: unknown[]) => userFindOne(...a),
    create: (...a: unknown[]) => userCreate(...a),
    findByIdAndDelete: (...a: unknown[]) => userDelete(...a),
    findByIdAndUpdate: jest.fn(),
  },
}));

const seekerCreate = jest.fn();
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: { create: (...a: unknown[]) => seekerCreate(...a) } }));

const employerFind = jest.fn();
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: {
    find: (...a: unknown[]) => employerFind(...a),
    findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    create: jest.fn(),
  },
}));

const jobSave = jest.fn();
const jobCtor = jest.fn();
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation((doc: unknown) => {
    jobCtor(doc);
    return { save: jobSave };
  }),
}));

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/bulk-import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function employersFound(list: Array<{ _id: string }>) {
  employerFind.mockReturnValue({ select: () => ({ limit: () => ({ lean: () => Promise.resolve(list) }) }) });
}

describe("POST /api/admin/bulk-import", () => {
  let POST: (req: NextRequest) => Promise<Response>;
  beforeAll(async () => {
    POST = (await import("@/app/api/admin/bulk-import/route")).POST as unknown as typeof POST;
  });
  beforeEach(() => {
    jest.clearAllMocks();
    userFindOne.mockResolvedValue(null);
    userCreate.mockImplementation(async (doc: Record<string, unknown>) => ({ _id: "u1", ...doc }));
    seekerCreate.mockResolvedValue({});
    jobSave.mockResolvedValue(undefined);
  });

  it("imports users as job seekers with a profile and an unguessable password", async () => {
    const res = await POST(post({ type: "users", rows: [{ fullName: "Sam Lee", email: "Sam@Example.com", country: "UAE" }] }));
    const body = await res.json();

    expect(body).toEqual({ success: 1, failed: 0, errors: [] });
    const created = userCreate.mock.calls[0][0];
    expect(created).toMatchObject({ name: "Sam Lee", email: "sam@example.com", role: "job_seeker", isActive: true });
    expect(typeof created.passwordHash).toBe("string");
    expect(seekerCreate).toHaveBeenCalledWith({ userId: "u1", fullName: "Sam Lee", isOnboarded: false });
  });

  it("refuses any role but job seeker, even when the CSV names one", async () => {
    const res = await POST(post({ type: "users", rows: [{ fullName: "Eve", email: "eve@example.com", role: "admin" }] }));
    const body = await res.json();

    expect(body.success).toBe(0);
    expect(body.errors).toEqual([expect.objectContaining({ row: 1, code: "role_not_allowed" })]);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("removes the account again when the profile cannot be created", async () => {
    seekerCreate.mockRejectedValueOnce(new Error("boom"));
    const res = await POST(post({ type: "users", rows: [{ fullName: "Sam", email: "sam@example.com" }] }));
    const body = await res.json();

    expect(body.failed).toBe(1);
    expect(userDelete).toHaveBeenCalledWith("u1");
  });

  it("imports a job as a draft under the named employer", async () => {
    employersFound([{ _id: "emp1" }]);
    const res = await POST(post({
      type: "jobs",
      rows: [{ title: "Chef", company: "Acme", city: "Dubai", country: "UAE", description: "Cook.", type: "contract" }],
    }));
    const body = await res.json();

    expect(body).toEqual({ success: 1, failed: 0, errors: [] });
    expect(jobCtor).toHaveBeenCalledWith(expect.objectContaining({
      employerId: "emp1",
      title: "Chef",
      status: "draft",
      employmentType: "contract",
      location: { city: "Dubai", country: "UAE", isRemote: false },
    }));
  });

  it("names the company when no employer matches, or when several do", async () => {
    employersFound([]);
    let body = await (await POST(post({ type: "jobs", rows: [{ title: "Chef", company: "Nope", city: "Dubai", country: "UAE", description: "x" }] }))).json();
    expect(body.errors).toEqual([expect.objectContaining({ code: "employer_not_found", params: { company: "Nope" } })]);

    employersFound([{ _id: "a" }, { _id: "b" }]);
    body = await (await POST(post({ type: "jobs", rows: [{ title: "Chef", company: "Twin", city: "Dubai", country: "UAE", description: "x" }] }))).json();
    expect(body.errors).toEqual([expect.objectContaining({ code: "employer_ambiguous", params: { company: "Twin" } })]);
    expect(jobCtor).not.toHaveBeenCalled();
  });
});
