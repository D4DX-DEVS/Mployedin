/**
 * @jest-environment node
 *
 * Guards the onboarding → JobSeeker field mapping.
 *
 * Every case here is a bug that shipped: answers the wizard collected were
 * dropped on the way to the database, or landed in a field that meant something
 * else. They were invisible because the UI showed the value back to the seeker
 * either way, so only the stored document reveals them.
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

const findOneAndUpdate = jest.fn();

jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(null) }) })),
    findOneAndUpdate: (...args: unknown[]) => findOneAndUpdate(...args),
  },
}));

jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    findById: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve({ phone: "+971501234567" }) }) })),
  },
  User: {},
}));

import { PATCH, GET } from "@/app/api/job-seekers/profile/route";

function patch(body: unknown) {
  return new NextRequest("http://localhost/api/job-seekers/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Route context shape withAuth expects — these routes carry no path params. */
const noParams = { params: Promise.resolve({}) };

/** The `$set` object the route would write for a given request body. */
async function storedUpdate(body: unknown): Promise<Record<string, unknown>> {
  findOneAndUpdate.mockResolvedValue({ _id: "seeker_001", isOnboarded: true, fullName: "QA" });
  const res = await PATCH(patch(body), noParams);
  expect(res.status).toBe(200);
  return findOneAndUpdate.mock.calls.at(-1)?.[1].$set as Record<string, unknown>;
}

beforeEach(() => {
  findOneAndUpdate.mockReset();
});

describe("onboarding employment step", () => {
  it("stores department, role category and job role under careerProfile", async () => {
    const set = await storedUpdate({
      department: "Engineering - Software & QA",
      roleCategory: "Software Development",
      jobRole: "Backend Developer",
    });

    // Dot-paths, so saving one answer doesn't wipe the sibling ones.
    expect(set["careerProfile.department"]).toBe("Engineering - Software & QA");
    expect(set["careerProfile.roleCategory"]).toBe("Software Development");
    expect(set["careerProfile.jobRole"]).toBe("Backend Developer");
  });

  it("keeps the seeker's city as a location, not as a country", async () => {
    const set = await storedUpdate({
      currentLocation: "Dubai",
      experience: [{ jobTitle: "Senior Backend Developer", company: "Acme Gulf LLC" }],
    });

    expect(set.currentLocation).toBe("Dubai");
    expect((set.experience as Array<{ country?: string }>)[0].country).toBeUndefined();
  });

  it("accepts an expected salary with no upper bound", async () => {
    const set = await storedUpdate({ preferredSalary: { min: 220000, currency: "AED" } });

    // `max: 0` used to be sent alongside min, producing a range whose top was
    // below its bottom.
    expect(set.preferredSalary).toEqual({ min: 220000, currency: "AED" });
  });
});

describe("onboarding education step", () => {
  const education = [{
    degree: "Graduation/Diploma",
    institution: "Dubai Institute of Technology",
    field: "Computer Science",
    course: "B.Tech/B.E.",
    courseType: "Full Time",
    startYear: 2017,
    passingYear: 2021,
  }];

  it("persists course, course type and start year instead of discarding them", async () => {
    const set = await storedUpdate({ education });
    const stored = (set.education as Array<Record<string, unknown>>)[0];

    expect(stored.course).toBe("B.Tech/B.E.");
    expect(stored.startYear).toBe(2017);
    // Course type is its own answer — it used to be written into `grade`.
    expect(stored.courseType).toBe("Full Time");
    expect(stored.grade).toBeUndefined();
    expect(stored.field).toBe("Computer Science");
  });

  it("dates graduation at year end in UTC", async () => {
    const set = await storedUpdate({ education });
    const stored = (set.education as Array<{ graduationDate: Date }>)[0];

    // Built with local-time `new Date(y, 11, 31)` this landed on 30 December
    // for any server east of UTC.
    expect(stored.graduationDate.toISOString()).toBe("2021-12-31T00:00:00.000Z");
  });
});

describe("profile read", () => {
  it("returns the phone number so onboarding can pre-fill it", async () => {
    const JobSeeker = (await import("@/models/JobSeeker")).default as unknown as {
      findOne: jest.Mock;
    };
    JobSeeker.findOne.mockReturnValueOnce({ lean: () => Promise.resolve({ fullName: "QA" }) });

    const res = await GET(new NextRequest("http://localhost/api/job-seekers/profile"), noParams);
    const body = await res.json();

    // Phone lives on User, not JobSeeker; without it the wizard asked returning
    // seekers to retype a number we already held.
    expect(body.profile.phone).toBe("+971501234567");
  });
});
