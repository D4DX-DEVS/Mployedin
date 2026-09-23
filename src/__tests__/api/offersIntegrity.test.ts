/**
 * @jest-environment node
 *
 * Offer integrity: one open offer per application, no offers on closed
 * applications, and a candidate can never end up hired twice.
 * Reproduced live on 2026-09-23: three parallel POST /api/offers created three
 * pending offers, and after accepting one the candidate accepted a second.
 */

import { NextRequest } from "next/server";

const ctxState: { role: string; userId: string } = { role: "employer", userId: "user_emp" };

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    async (req: NextRequest, routeCtx?: { params?: Promise<Record<string, string>> }) =>
      handler(req, { ...ctxState, locale: "en" }, routeCtx?.params ? await routeCtx.params : undefined),
}));

function chain<T>(value: T) {
  const q: Record<string, jest.Mock> = {};
  for (const k of ["select", "populate", "sort", "lean"]) q[k] = jest.fn(() => q);
  q.lean = jest.fn().mockResolvedValue(value);
  (q as unknown as { then: unknown }).then = (res: (v: T) => unknown) => Promise.resolve(value).then(res);
  return q;
}

const Offer = {
  findOne: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateMany: jest.fn(),
};
jest.mock("@/models/Offer", () => ({ __esModule: true, default: Offer }));

const Application = { findById: jest.fn(), findByIdAndUpdate: jest.fn(), updateOne: jest.fn() };
jest.mock("@/models/Application", () => ({ __esModule: true, default: Application }));

const Employer = { findOne: jest.fn(), findById: jest.fn() };
jest.mock("@/models/Employer", () => ({ __esModule: true, Employer }));

const JobSeeker = { findOne: jest.fn(), findById: jest.fn() };
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: JobSeeker }));

jest.mock("@/models/Job", () => ({ __esModule: true, default: { find: jest.fn(), findById: jest.fn() } }));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn() }, Agent: { findOne: jest.fn() } }));

const User = { findById: jest.fn() };
jest.mock("@/models/User", () => ({ __esModule: true, default: User }));

const validateBody = jest.fn();
jest.mock("@/lib/validators", () => ({ validateBody: (...a: unknown[]) => validateBody(...a) }));
jest.mock("@/lib/validators/offers", () => ({ offerCreateSchema: {}, offerRespondSchema: {} }));
jest.mock("@/lib/audit/log", () => ({ actorFromCtx: jest.fn(() => ({})), logActivity: jest.fn() }));
jest.mock("@/lib/notifications/trigger", () => ({ notify: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/hiring/closeOpenInterviews", () => ({ closeOpenInterviewsForAdvance: jest.fn() }));

const session = {
  withTransaction: jest.fn(async (fn: () => Promise<unknown>) => fn()),
  endSession: jest.fn(),
};
jest.mock("mongoose", () => {
  const actual = jest.requireActual("mongoose");
  return { __esModule: true, ...actual, default: { ...actual, startSession: jest.fn(async () => session) } };
});

const APP_ID = "64b000000000000000000a01";
const OFFER_ID = "64b000000000000000000f01";
const offerBody = {
  applicationId: APP_ID,
  salary: { amount: 15000, currency: "AED", period: "monthly" },
  startDate: new Date(Date.now() + 30 * 864e5).toISOString(),
};

function post() {
  return new NextRequest("http://localhost/api/offers", { method: "POST", body: JSON.stringify(offerBody) });
}

function applicationDoc(status: string) {
  return { _id: APP_ID, status, jobId: { employerId: "emp_1", title: "QA" }, jobSeekerId: "seeker_1" };
}

beforeEach(() => {
  jest.clearAllMocks();
  ctxState.role = "employer";
  ctxState.userId = "user_emp";
  validateBody.mockResolvedValue(offerBody);
  Employer.findOne.mockReturnValue(chain({ _id: "emp_1" }));
  Employer.findById.mockReturnValue(chain({ userId: "user_emp" }));
  User.findById.mockReturnValue(chain({ name: "Emp" }));
  JobSeeker.findById.mockReturnValue(chain({ userId: "user_seeker" }));
  Offer.findOne.mockReturnValue(chain(null));
  Offer.create.mockResolvedValue({ _id: OFFER_ID });
  Offer.findById.mockReturnValue(chain({ _id: OFFER_ID }));
  Application.findByIdAndUpdate.mockResolvedValue({});
});

describe("POST /api/offers integrity", () => {
  it.each(["hired", "rejected", "withdrawn"])("refuses an offer on a %s application", async (status) => {
    Application.findById.mockReturnValue(chain(applicationDoc(status)));
    const { POST } = await import("@/app/api/offers/route");
    const res = await POST(post(), { params: Promise.resolve({}) });
    expect(res.status).toBe(409);
    expect(Offer.create).not.toHaveBeenCalled();
    expect(Application.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("treats a countered or accepted offer as blocking, not only a pending one", async () => {
    Application.findById.mockReturnValue(chain(applicationDoc("offer")));
    Offer.findOne.mockReturnValue(chain({ _id: "other", status: "countered" }));
    const { POST } = await import("@/app/api/offers/route");
    const res = await POST(post(), { params: Promise.resolve({}) });
    expect(res.status).toBe(409);
    const filter = Offer.findOne.mock.calls[0][0];
    expect(filter.applicationId).toBe(APP_ID);
    expect(filter.status.$in).toEqual(expect.arrayContaining(["pending", "countered", "accepted"]));
    expect(Offer.create).not.toHaveBeenCalled();
  });

  it("maps a duplicate-key race on create to 409 instead of a 500", async () => {
    Application.findById.mockReturnValue(chain(applicationDoc("interview_scheduled")));
    Offer.create.mockRejectedValue(Object.assign(new Error("E11000 duplicate key"), { code: 11000 }));
    const { POST } = await import("@/app/api/offers/route");
    const res = await POST(post(), { params: Promise.resolve({}) });
    expect(res.status).toBe(409);
    expect(Application.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("still creates an offer for an open application", async () => {
    Application.findById.mockReturnValue(chain(applicationDoc("interview_scheduled")));
    const { POST } = await import("@/app/api/offers/route");
    const res = await POST(post(), { params: Promise.resolve({}) });
    expect(res.status).toBe(201);
    expect(Offer.create).toHaveBeenCalledTimes(1);
  });
});

describe("PATCH /api/offers/[id] integrity", () => {
  function patch(status: string) {
    return new NextRequest(`http://localhost/api/offers/${OFFER_ID}`, { method: "PATCH", body: JSON.stringify({ status }) });
  }

  beforeEach(() => {
    ctxState.role = "job_seeker";
    ctxState.userId = "user_seeker";
    Offer.findById.mockResolvedValue({ _id: OFFER_ID, applicationId: APP_ID, jobSeekerId: "seeker_1", employerId: "emp_1", status: "pending" });
    JobSeeker.findOne.mockReturnValue(chain({ _id: "seeker_1" }));
    Offer.findOneAndUpdate.mockResolvedValue({ _id: OFFER_ID, employerId: "emp_1", applicationId: APP_ID, status: "accepted" });
    Offer.updateMany.mockResolvedValue({ modifiedCount: 0 });
  });

  it("refuses to accept when the application is already hired or closed", async () => {
    validateBody.mockResolvedValue({ status: "accepted", signatureName: "Cand" });
    Application.updateOne.mockResolvedValue({ matchedCount: 0 });
    const { PATCH } = await import("@/app/api/offers/[id]/route");
    const res = await PATCH(patch("accepted"), { params: Promise.resolve({ id: OFFER_ID }) });
    expect(res.status).toBe(409);
    const [filter] = Application.updateOne.mock.calls[0];
    expect(filter.status.$nin).toEqual(expect.arrayContaining(["hired", "rejected", "withdrawn"]));
  });

  it("withdraws the application's other open offers when one is accepted", async () => {
    validateBody.mockResolvedValue({ status: "accepted", signatureName: "Cand" });
    Application.updateOne.mockResolvedValue({ matchedCount: 1 });
    const { PATCH } = await import("@/app/api/offers/[id]/route");
    const res = await PATCH(patch("accepted"), { params: Promise.resolve({ id: OFFER_ID }) });
    expect(res.status).toBe(200);
    expect(Offer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: APP_ID, _id: { $ne: OFFER_ID }, status: { $in: ["pending", "countered"] } }),
      expect.objectContaining({ $set: expect.objectContaining({ status: "withdrawn" }) }),
      expect.objectContaining({ session }),
    );
  });
});

describe("offer index registration", () => {
  // autoIndex is off, so only ensureIndexes() creates indexes; the schema
  // declaration alone would leave the race open in production.
  function block(file: string, marker: string): string {
    const src = jest.requireActual<typeof import("node:fs")>("node:fs")
      .readFileSync(require("node:path").join(process.cwd(), file), "utf8");
    const start = src.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    return src.slice(start, src.indexOf("]);", start)).replace(/\s+/g, " ");
  }

  it("ensureIndexes() registers one open offer per application", () => {
    const offers = block("src/lib/db/indexes.ts", 'safeCreateIndexes(db, "offers"');
    expect(offers).toContain(
      'key: { applicationId: 1, status: 1 }, unique: true, partialFilterExpression: { status: { $in: ["pending", "countered"] } }',
    );
  });
});
