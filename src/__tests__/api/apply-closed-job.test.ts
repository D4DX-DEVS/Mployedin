/**
 * @jest-environment node
 *
 * A job past its closing date stays "active" until the hourly expiry cron
 * closes it (500 jobs a run), and no apply path looked at `expiresAt` — so a
 * candidate holding the page open, or a direct API call, could apply to a job
 * the listings already hide (audit FUNC-012). Every apply path now refuses a
 * job that is inactive or past its closing date with code JOB_CLOSED, which
 * the apply dialogs turn into translated copy.
 */
import { NextRequest } from "next/server";

const JOB = "650000000000000000000110";
const EMP = "650000000000000000000120";
const SEEKER = "650000000000000000000130";
const SEEKER_USER = "650000000000000000000131";

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (h: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    (req: NextRequest) =>
      h(req, { userId: SEEKER_USER, role: "job_seeker", locale: "en" }, { id: JOB }),
}));
jest.mock("@/lib/subscription/withSubscription", () => ({ withSubscription: (h: unknown) => h }));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimitDual: jest.fn(async () => ({ allowed: true, resetAt: 0 })),
  RATE_LIMIT_CONFIGS: { applications: {} },
}));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: jest.fn(() => ({})) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("@/lib/inngest/client", () => ({ inngest: { send: jest.fn().mockResolvedValue(undefined) } }));
jest.mock("@/lib/notifications/trigger", () => ({ notifyApplicationReceived: jest.fn().mockResolvedValue(undefined) }));

function chain<T>(result: T) {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.populate = () => c;
  c.lean = async () => result;
  return c;
}

let job: Record<string, unknown>;
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    findOne: () => chain(job),
    findById: () => chain(job),
    updateOne: jest.fn().mockResolvedValue({}),
  },
}));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findOne: () => chain({ _id: SEEKER, fullName: "Sara Ali", documents: [] }) },
}));
jest.mock("@/models/User", () => ({ __esModule: true, default: { findById: () => chain({ name: "Sara" }) } }));
const create = jest.fn(async () => ({ _id: "650000000000000000000140" }));
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { findOne: () => chain(null), create: (...a: unknown[]) => create(...(a as [])) },
}));

const DAY = 86_400_000;
beforeEach(() => {
  jest.clearAllMocks();
  job = { _id: JOB, title: "Nurse", employerId: EMP, status: "active", screeningQuestions: [], applicantIds: [], expiresAt: new Date(Date.now() - DAY) };
});

describe("isPastClosingDate", () => {
  it("is true only once the closing date has gone by", async () => {
    const { isPastClosingDate } = await import("@/lib/jobs/expiry");
    const now = new Date("2026-10-12T10:00:00Z");
    expect(isPastClosingDate(new Date("2026-10-12T09:59:59Z"), now)).toBe(true);
    expect(isPastClosingDate("2026-10-11T00:00:00Z", now)).toBe(true);
    expect(isPastClosingDate(new Date("2026-10-13T00:00:00Z"), now)).toBe(false);
    expect(isPastClosingDate(null, now)).toBe(false);
    expect(isPastClosingDate(undefined, now)).toBe(false);
  });
});

describe("POST /api/applications (Easy Apply dialogs)", () => {
  const post = async () => {
    const { postHandler } = await import("@/app/api/applications/handlers");
    return postHandler(
      new NextRequest("http://localhost/api/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: JOB, easyApply: true }),
      }),
      { userId: SEEKER_USER, role: "job_seeker", locale: "en" } as never,
    );
  };

  it("refuses a job past its closing date that the cron hasn't closed yet", async () => {
    const res = await post();
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "JOB_CLOSED" });
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses a closed job with the same code", async () => {
    job = { ...job, status: "closed", expiresAt: undefined };
    const res = await post();
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "JOB_CLOSED" });
  });
});

describe("POST /api/jobs/[id]/apply", () => {
  const apply = async () => {
    const { POST } = await import("@/app/api/jobs/[id]/apply/route");
    return (POST as unknown as (req: NextRequest) => Promise<Response>)(
      new NextRequest(`http://localhost/api/jobs/${JOB}/apply`, { method: "POST" }),
    );
  };

  it("refuses a job past its closing date", async () => {
    const res = await apply();
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "JOB_CLOSED" });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("Copilot apply_to_job", () => {
  it("refuses a job past its closing date", async () => {
    const { applyToJobTool } = await import("@/lib/ai/copilot/tools/jobSeeker");
    const result = await applyToJobTool.execute({ jobId: JOB }, { userId: SEEKER_USER, role: "job_seeker", locale: "en" } as never);
    expect(result).toMatchObject({ ok: false });
    expect(create).not.toHaveBeenCalled();
  });
});

/**
 * The job pages decide "closed" before the apply form renders. They read the
 * status only, so until the cron ran a job past its closing date still showed
 * the form — which the server now refuses. Source guard: the pages are server
 * components that load from the database.
 */
describe("job pages treat a job past its closing date as closed", () => {
  const fs = jest.requireActual("node:fs") as typeof import("node:fs");
  const path = jest.requireActual("node:path") as typeof import("node:path");
  const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, "../../..", rel), "utf8");

  it.each([
    "src/app/[locale]/(public)/jobs/[id]/page.tsx",
    "src/app/[locale]/(dashboard)/job-seeker/jobs/[id]/page.tsx",
  ])("%s", (rel) => {
    const src = read(rel);
    expect(src).toMatch(/job\.status !== "active" \|\| isPastClosingDate\(/);
  });
});
