/**
 * @jest-environment node
 */
import { parseEmployerJobIdFromPath, buildEmployerJobContext } from "@/lib/ai/copilot/pageContext";

const EMPLOYER_USER = "64b000000000000000000001";
const EMPLOYER_ID = "64b000000000000000000002";
const JOB_ID = "64b000000000000000000010";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

function chain<T>(result: T) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["populate", "sort", "skip", "limit", "select"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}

jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: {
    findOne: jest.fn(({ userId }) => {
      if (userId === EMPLOYER_USER) {
        return chain({ _id: EMPLOYER_ID, userId: EMPLOYER_USER });
      }
      return chain(null);
    }),
  },
}));

jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn((query) => {
      if (String(query._id) === JOB_ID && String(query.employerId) === EMPLOYER_ID) {
        return chain({ _id: JOB_ID, title: "Senior Developer" });
      }
      return chain(null);
    }),
  },
}));

jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    countDocuments: jest.fn(({ jobId, status }) => {
      if (String(jobId) === JOB_ID && status === undefined) return Promise.resolve(42);
      if (String(jobId) === JOB_ID && status === "applied") return Promise.resolve(15);
      return Promise.resolve(0);
    }),
  },
}));

describe("pageContext", () => {
  describe("parseEmployerJobIdFromPath", () => {
    it("matches /employer/jobs/<24 hex> in a locale-prefixed path", () => {
      const result = parseEmployerJobIdFromPath("/en/employer/jobs/64b000000000000000000010/applications");
      expect(result).toBe("64b000000000000000000010");
    });

    it("matches /employer/jobs/<24 hex> with arabic locale", () => {
      const result = parseEmployerJobIdFromPath("/ar/employer/jobs/64b000000000000000000010");
      expect(result).toBe("64b000000000000000000010");
    });

    it("returns null for /employer/jobs/new", () => {
      const result = parseEmployerJobIdFromPath("/en/employer/jobs/new");
      expect(result).toBeNull();
    });

    it("returns null when path doesn't contain /employer/jobs/<id>", () => {
      const result = parseEmployerJobIdFromPath("/en/employer/applications");
      expect(result).toBeNull();
    });

    it("handles case-insensitive hex", () => {
      const result = parseEmployerJobIdFromPath("/en/employer/jobs/64B000000000000000000010");
      expect(result).toBe("64B000000000000000000010");
    });

    it("returns null for undefined path", () => {
      const result = parseEmployerJobIdFromPath(undefined);
      expect(result).toBeNull();
    });
  });

  describe("buildEmployerJobContext", () => {
    it("returns job context when employer owns the job", async () => {
      const result = await buildEmployerJobContext(EMPLOYER_USER, JOB_ID);
      expect(result).toEqual({
        jobId: JOB_ID,
        title: "Senior Developer",
        applicants: 42,
        atApplied: 15,
      });
    });

    it("returns null when employer not found", async () => {
      const result = await buildEmployerJobContext("unknown-user-id", JOB_ID);
      expect(result).toBeNull();
    });

    it("returns null when job is not owned by employer", async () => {
      // Job lookup will return null because the mock checks if the employer ID matches
      const result = await buildEmployerJobContext(EMPLOYER_USER, "64b999999999999999999999");
      expect(result).toBeNull();
    });
  });
});
