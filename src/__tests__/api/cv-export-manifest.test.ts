/**
 * @jest-environment node
 *
 * POST /api/cv-export/manifest: before a bulk CV export the browser asks which
 * of the selected candidates it may export and which CV versions exist. Every
 * row goes through the one CV gate (authorizeCvAccess, real here with its
 * models mocked), so the export can never reach a candidate the person could
 * not already open, and a refused row carries nothing but its id.
 */
import { NextRequest } from "next/server";
import { computeEffectivePermissions } from "@/lib/permissions/companyRoles";

const oid = (n: number) => `65${"0".repeat(20)}${String(n).padStart(2, "0")}`;
const EMP = oid(90);
const EMP_USER = oid(91);
const OTHER_EMP = oid(92);
const APP = oid(80);
const OTHER_APP = oid(81);

type Ctx = { userId: string; role: string; locale: string; [key: string]: unknown };
let ctx: Ctx | null;

jest.mock("@/lib/auth/config", () => ({ auth: jest.fn().mockResolvedValue(null) }));
// A signed-in request gets the context under test; with ctx = null the real
// withAuth runs (and refuses: auth() has no session).
jest.mock("@/lib/auth/withAuth", () => {
  const actual = jest.requireActual("@/lib/auth/withAuth");
  // validateBody throws a ready NextResponse on a bad body; withAuth turns it into the answer.
  const runLikeWithAuth = async (
    h: (req: NextRequest, c: unknown, params?: Record<string, string>) => Promise<Response>,
    req: NextRequest,
    c: unknown,
  ) => {
    try {
      return await h(req, c, undefined);
    } catch (err) {
      if (err instanceof Response) return err;
      throw err;
    }
  };
  return {
    ...actual,
    withAuth:
      (h: (req: NextRequest, c: unknown, params?: Record<string, string>) => Promise<Response>) =>
      (req: NextRequest, context: { params: Promise<Record<string, string>> }) =>
        ctx === null ? actual.withAuth(h)(req, context) : runLikeWithAuth(h, req, ctx),
  };
});
jest.mock("@/lib/db/mongoose", () => {
  const connectDB = jest.fn().mockResolvedValue(undefined);
  return { __esModule: true, default: connectDB, connectDB };
});
jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const checkRateLimit = jest.fn();
jest.mock("@/lib/security/rateLimit", () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) }));

const logActivity = jest.fn();
jest.mock("@/lib/audit/log", () => ({
  logActivity: (...a: unknown[]) => logActivity(...a),
  // The real one: it is what names the human behind a colleague or tenant-view context.
  actorFromCtx: jest.requireActual("@/lib/audit/log").actorFromCtx,
}));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ── data the fake models serve ──────────────────────────────────────────────
type Doc = Record<string, unknown>;
let seekers: Record<string, Doc>;
let ownSeeker: Doc | null;
let delays: Record<string, number>;
let inFlight = 0;
let maxInFlight = 0;

function gateChain(id: string) {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.lean = async () => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await sleep(delays[id] ?? 0);
    inFlight--;
    return seekers[id] ?? null;
  };
  return c;
}
function plain<T>(result: T) {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.lean = async () => result;
  return c;
}

const findById = jest.fn((id: string) => gateChain(id));
const findOne = jest.fn((_filter: unknown) => plain(ownSeeker));
let lastFindFilter: { _id: { $in: string[] } } | null;
let lastFindSelect: unknown;
const find = jest.fn((filter: { _id: { $in: string[] } }) => {
  lastFindFilter = filter;
  return {
    select: (projection: unknown) => {
      lastFindSelect = projection;
      return { lean: async () => filter._id.$in.map((id) => seekers[id]).filter(Boolean) };
    },
  };
});
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findById: (id: string) => findById(id),
    findOne: (f: unknown) => findOne(f),
    find: (f: { _id: { $in: string[] } }) => find(f),
  },
}));

let users: Record<string, Doc>;
const userFind = jest.fn((filter: { _id: { $in: string[] } }) => ({
  select: () => ({ lean: async () => filter._id.$in.map((id) => users[id]).filter(Boolean) }),
}));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { find: (f: { _id: { $in: string[] } }) => userFind(f) },
}));

let employerDoc: { _id: string } | null;
const employerFindOne = jest.fn((_filter: unknown) => plain(employerDoc));
jest.mock("@/models/Employer", () => {
  const Employer = { findOne: (f: unknown) => employerFindOne(f) };
  return { __esModule: true, default: Employer, Employer };
});

let employerSeekers: Set<string>;
const applicationExists = jest.fn(async (filter: { jobSeekerId: string }) =>
  employerSeekers.has(String(filter.jobSeekerId)) ? { _id: "x" } : null,
);
let applications: Doc[];
const applicationFindOne = jest.fn((filter: Doc) =>
  plain(applications.find((a) => Object.entries(filter).every(([k, v]) => String(a[k]) === String(v))) ?? null),
);
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    exists: (f: { jobSeekerId: string }) => applicationExists(f),
    findOne: (f: Doc) => applicationFindOne(f),
  },
}));
jest.mock("@/models/TalentPool", () => ({ __esModule: true, default: { exists: jest.fn().mockResolvedValue(null) } }));

let staffMayOpen: Set<string>;
const resolveStaffSeekerAccess = jest.fn(
  async (_ctx: unknown) => async (seeker: { _id?: unknown }) => staffMayOpen.has(String(seeker._id)),
);
jest.mock("@/lib/jobSeeker/staffAccess", () => ({
  resolveStaffSeekerAccess: (c: unknown) => resolveStaffSeekerAccess(c),
}));

jest.mock("@/lib/storage/spaces", () => ({
  isStoredFileUrl: (url: string) => url.startsWith("https://cdn/"),
}));

// ── helpers ─────────────────────────────────────────────────────────────────
function seekerDoc(n: number, extra: Doc = {}): Doc {
  return {
    _id: oid(n),
    userId: oid(100 + n),
    fullName: `Candidate ${n} Secret`,
    summary: "Ten years in logistics",
    experience: [{ jobTitle: "Driver" }],
    education: [],
    skills: [],
    cv: { originalUrl: `https://cdn/cvs/${n}.pdf` },
    documents: [],
    ...extra,
  };
}

type Item = { seekerId: string; applicationId?: string | null };
async function callManifest(body: unknown, init: { raw?: string } = {}) {
  const { POST } = await import("@/app/api/cv-export/manifest/route");
  const req = new NextRequest("http://localhost/api/cv-export/manifest", {
    method: "POST",
    body: init.raw ?? JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  const res = await (POST as unknown as (r: NextRequest, c: unknown) => Promise<Response>)(req, {
    params: Promise.resolve({}),
  });
  const text = await res.text();
  return { res, text, json: text ? JSON.parse(text) : null };
}
const manifest = (items: Item[]) => callManifest({ items });

const asAdmin = (): Ctx => ({ userId: oid(70), role: "admin", locale: "en" });
const asEmployer = (): Ctx => ({ userId: EMP_USER, role: "employer", locale: "en" });
const asAgent = (): Ctx => ({ userId: oid(71), role: "agent", locale: "en" });
const asSuperAgent = (): Ctx => ({ userId: oid(72), role: "super_agent", locale: "en" });

beforeEach(() => {
  jest.clearAllMocks();
  ctx = asAdmin();
  inFlight = 0;
  maxInFlight = 0;
  delays = {};
  lastFindFilter = null;
  lastFindSelect = null;
  seekers = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [oid(n), seekerDoc(n)]));
  ownSeeker = seekerDoc(50);
  users = {};
  employerDoc = { _id: EMP };
  employerSeekers = new Set([oid(1), oid(2), oid(3)]);
  applications = [
    {
      _id: APP,
      jobSeekerId: oid(1),
      employerId: EMP,
      documents: [{ name: "Tailored CV.pdf", url: "https://cdn/documents/sent-1.pdf", type: "resume" }],
    },
    { _id: OTHER_APP, jobSeekerId: oid(1), employerId: OTHER_EMP, documents: [] },
  ];
  staffMayOpen = new Set([oid(1), oid(2), oid(3)]);
  checkRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: Date.now() + 60_000 });
  logActivity.mockResolvedValue(undefined);
});

const cvPath = (id: string) => `/api/employers/candidates/${id}/cv`;

// ── who may call it ─────────────────────────────────────────────────────────
describe("who may ask", () => {
  it("is refused to a signed-out caller (401), before anything is read", async () => {
    ctx = null;
    const { res } = await manifest([{ seekerId: oid(1) }]);
    expect(res.status).toBe(401);
    expect(findById).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("is refused to a job seeker (403): export is for staff, and nothing is read", async () => {
    ctx = { userId: oid(60), role: "job_seeker", locale: "en" };
    const { res, json } = await manifest([{ seekerId: oid(1) }]);
    expect(res.status).toBe(403);
    expect(json.items).toBeUndefined();
    expect(findOne).not.toHaveBeenCalled();
    expect(findById).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
  });

  it("is refused to any other role (403)", async () => {
    ctx = { userId: oid(61), role: "hr", locale: "en" };
    expect((await manifest([{ seekerId: oid(1) }])).res.status).toBe(403);
  });

  it("is limited per person: 429 with nothing read or logged", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 30_000 });
    const { res } = await manifest([{ seekerId: oid(1) }]);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    // checkRateLimit builds the key as "<prefix>:<identifier>": the identifier must be the id alone,
    // or the key reads "cv-export:cv-export:<id>".
    expect(checkRateLimit).toHaveBeenCalledWith(oid(70), expect.objectContaining({ prefix: "cv-export" }));
    expect(findById).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });
});

// ── the body ────────────────────────────────────────────────────────────────
describe("the body", () => {
  it("accepts 50 items", async () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ seekerId: oid(1 + (i % 5)) }));
    const { res, json } = await manifest(items);
    expect(res.status).toBe(200);
    expect(json.items).toHaveLength(50);
  });

  it("refuses 51 items (400)", async () => {
    const items = Array.from({ length: 51 }, (_, i) => ({ seekerId: oid(1 + (i % 5)) }));
    const { res } = await manifest(items);
    expect(res.status).toBe(400);
    expect(findById).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty list", { items: [] }],
    ["no items", {}],
    ["items that is not a list", { items: "abc" }],
    ["a malformed seeker id", { items: [{ seekerId: "not-an-id" }] }],
    ["a seeker id of the wrong length", { items: [{ seekerId: oid(1) + "0" }] }],
    ["a missing seeker id", { items: [{ applicationId: APP }] }],
    ["a malformed application id", { items: [{ seekerId: oid(1), applicationId: "nope" }] }],
    ["a seeker id that is an object (operator injection)", { items: [{ seekerId: { $ne: null } }] }],
  ])("refuses %s (400)", async (_label, body) => {
    const { res } = await callManifest(body);
    expect(res.status).toBe(400);
    expect(findById).not.toHaveBeenCalled();
  });

  it("refuses a body that is not JSON (400)", async () => {
    const { res } = await callManifest(null, { raw: "{not json" });
    expect(res.status).toBe(400);
  });

  it("treats a null application id as none", async () => {
    const { res, json } = await manifest([{ seekerId: oid(1), applicationId: null }]);
    expect(res.status).toBe(200);
    expect(json.items[0].applicationId).toBeUndefined();
  });
});

// ── download counter ────────────────────────────────────────────────────────
describe("download counter flag", () => {
  it("an export fetch is a download: every Original URL carries download=1, and the Standardised one never does", async () => {
    const { json } = await manifest([{ seekerId: oid(1) }, { seekerId: oid(1), applicationId: APP }, { seekerId: oid(2) }]);
    for (const row of json.items) {
      if (row.denied) continue;
      expect(new URL(row.originalUrl, "http://x").searchParams.get("download")).toBe("1");
      expect(row.builtUrl).not.toMatch(/download/);
    }
  });
});

// ── each role ───────────────────────────────────────────────────────────────
describe("each role", () => {
  it("admin: any seeker, with the names, versions and same-origin URLs", async () => {
    const { res, json } = await manifest([{ seekerId: oid(1) }, { seekerId: oid(4) }]);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(json.items).toEqual([
      {
        seekerId: oid(1),
        name: "Candidate 1 Secret",
        hasStandardised: true,
        hasOriginal: true,
        originalIsBuilt: false,
        originalUrl: `${cvPath(oid(1))}?download=1`,
        builtUrl: `${cvPath(oid(1))}?kind=built`,
      },
      {
        seekerId: oid(4),
        name: "Candidate 4 Secret",
        hasStandardised: true,
        hasOriginal: true,
        originalIsBuilt: false,
        originalUrl: `${cvPath(oid(4))}?download=1`,
        builtUrl: `${cvPath(oid(4))}?kind=built`,
      },
    ]);
  });

  it("employer: seekers who applied or sit in a pool; the application's own CV when named", async () => {
    ctx = asEmployer();
    const { res, json } = await manifest([{ seekerId: oid(1), applicationId: APP }, { seekerId: oid(2) }]);
    expect(res.status).toBe(200);
    expect(json.items[0]).toMatchObject({
      seekerId: oid(1),
      applicationId: APP,
      name: "Candidate 1 Secret",
      hasOriginal: true,
      originalUrl: `${cvPath(oid(1))}?applicationId=${APP}&download=1`,
      builtUrl: `${cvPath(oid(1))}?kind=built`,
    });
    expect(json.items[1]).toMatchObject({ seekerId: oid(2), originalUrl: `${cvPath(oid(2))}?download=1` });
    expect(json.items[1].applicationId).toBeUndefined();
  });

  it("employer: a seeker outside their jobs and pools is refused", async () => {
    ctx = asEmployer();
    const { json } = await manifest([{ seekerId: oid(4) }]);
    expect(json.items).toEqual([{ seekerId: oid(4), denied: true }]);
  });

  it("employer without a company profile: everything refused", async () => {
    ctx = asEmployer();
    employerDoc = null;
    const { res, json } = await manifest([{ seekerId: oid(1) }, { seekerId: oid(2) }]);
    expect(res.status).toBe(200);
    expect(json.items.every((i: { denied?: boolean }) => i.denied === true)).toBe(true);
  });

  it("agent: seekers they may open; the application id is ignored, as the CV route does", async () => {
    ctx = asAgent();
    const { res, json } = await manifest([{ seekerId: oid(1), applicationId: APP }]);
    expect(res.status).toBe(200);
    expect(json.items[0]).toMatchObject({
      seekerId: oid(1),
      name: "Candidate 1 Secret",
      originalUrl: `${cvPath(oid(1))}?download=1`,
      builtUrl: `${cvPath(oid(1))}?kind=built`,
    });
    expect(applicationFindOne).not.toHaveBeenCalled();
  });

  it("super agent: seekers they may open", async () => {
    ctx = asSuperAgent();
    const { res, json } = await manifest([{ seekerId: oid(2) }, { seekerId: oid(3) }]);
    expect(res.status).toBe(200);
    expect(json.items.map((i: { seekerId: string }) => i.seekerId)).toEqual([oid(2), oid(3)]);
    expect(json.items.every((i: { denied?: boolean }) => !i.denied)).toBe(true);
  });
});

// ── refusals ────────────────────────────────────────────────────────────────
describe("refused rows", () => {
  it("keep their place among allowed rows and carry only their ids", async () => {
    ctx = asAgent();
    staffMayOpen = new Set([oid(1), oid(3)]);
    const { res, text, json } = await manifest([
      { seekerId: oid(1) },
      { seekerId: oid(4), applicationId: APP },
      { seekerId: oid(3) },
      { seekerId: oid(5) },
    ]);
    expect(res.status).toBe(200);
    expect(json.items.map((i: { seekerId: string }) => i.seekerId)).toEqual([oid(1), oid(4), oid(3), oid(5)]);
    expect(json.items[1]).toEqual({ seekerId: oid(4), applicationId: APP, denied: true });
    expect(json.items[3]).toEqual({ seekerId: oid(5), denied: true });
    expect(json.items[0].denied).toBeUndefined();
    // No refused candidate's name or file address reaches the response.
    expect(text).not.toContain("Candidate 4 Secret");
    expect(text).not.toContain("Candidate 5 Secret");
    expect(text).not.toContain("cvs/4.pdf");
  });

  it("agent: a seeker outside their scope is refused and their profile is never read (IDOR)", async () => {
    ctx = asAgent();
    staffMayOpen = new Set([oid(1)]);
    const { json } = await manifest([{ seekerId: oid(1) }, { seekerId: oid(2) }]);
    expect(json.items[1]).toEqual({ seekerId: oid(2), denied: true });
    expect(lastFindFilter?._id.$in).toEqual([oid(1)]);
  });

  it("super agent: a seeker outside their scope is refused", async () => {
    ctx = asSuperAgent();
    staffMayOpen = new Set();
    const { json } = await manifest([{ seekerId: oid(1) }]);
    expect(json.items).toEqual([{ seekerId: oid(1), denied: true }]);
    expect(find).not.toHaveBeenCalled();
  });

  it("an unknown seeker is refused like any other (no way to tell 'missing' from 'not yours')", async () => {
    const { json } = await manifest([{ seekerId: oid(77) }]);
    expect(json.items).toEqual([{ seekerId: oid(77), denied: true }]);
  });

  it("employer: another company's application id refuses the row (the CV route answers 404 for it too)", async () => {
    ctx = asEmployer();
    const { text, json } = await manifest([{ seekerId: oid(1), applicationId: OTHER_APP }]);
    expect(json.items).toEqual([{ seekerId: oid(1), applicationId: OTHER_APP, denied: true }]);
    expect(text).not.toContain("Candidate 1 Secret");
  });

  it("employer: an application of a different seeker refuses the row", async () => {
    ctx = asEmployer();
    const { json } = await manifest([{ seekerId: oid(2), applicationId: APP }]);
    expect(json.items).toEqual([{ seekerId: oid(2), applicationId: APP, denied: true }]);
  });
});

// ── the versions ────────────────────────────────────────────────────────────
describe("what exists for a candidate", () => {
  it("hasStandardised follows the one built-CV rule: any of experience, education, skills or a summary", async () => {
    const empty = { experience: [], education: [], skills: [], summary: "" };
    seekers[oid(1)] = seekerDoc(1, empty);
    seekers[oid(2)] = seekerDoc(2, { ...empty, summary: "About me" });
    seekers[oid(3)] = seekerDoc(3, { ...empty, skills: ["Forklift"] });
    seekers[oid(4)] = seekerDoc(4, { ...empty, education: [{ degree: "BA" }] });
    seekers[oid(5)] = seekerDoc(5, { ...empty, experience: [{ jobTitle: "Driver" }] });
    const { json } = await manifest([1, 2, 3, 4, 5].map((n) => ({ seekerId: oid(n) })));
    expect(json.items.map((i: { hasStandardised: boolean }) => i.hasStandardised)).toEqual([false, true, true, true, true]);
  });

  it("hasOriginal is false for a candidate with no CV file, and the row still carries its URLs", async () => {
    seekers[oid(1)] = seekerDoc(1, { cv: undefined, documents: [] });
    const { json } = await manifest([{ seekerId: oid(1) }]);
    expect(json.items[0]).toMatchObject({ hasOriginal: false, originalIsBuilt: false, hasStandardised: true });
  });

  it("hasOriginal reads a resume document when the Profile CV is empty", async () => {
    seekers[oid(1)] = seekerDoc(1, { cv: undefined, documents: [{ category: "resume", url: "https://cdn/documents/u.pdf" }] });
    const { json } = await manifest([{ seekerId: oid(1) }]);
    expect(json.items[0].hasOriginal).toBe(true);
  });

  it("employer with an application: the original is the CV sent with it, not the Profile CV", async () => {
    ctx = asEmployer();
    seekers[oid(1)] = seekerDoc(1, { cv: undefined, documents: [] });
    const { json } = await manifest([{ seekerId: oid(1), applicationId: APP }]);
    expect(json.items[0]).toMatchObject({ hasOriginal: true, originalIsBuilt: false });
  });

  it("employer with an application sent with no CV file and no Profile CV: no original", async () => {
    ctx = asEmployer();
    seekers[oid(1)] = seekerDoc(1, { cv: undefined, documents: [] });
    applications[0] = { ...applications[0], documents: [] };
    const { json } = await manifest([{ seekerId: oid(1), applicationId: APP }]);
    expect(json.items[0]).toMatchObject({ hasOriginal: false, originalIsBuilt: false });
  });

  it("originalIsBuilt: the application was sent with the CV built on Mployedin", async () => {
    ctx = asEmployer();
    applications[0] = {
      ...applications[0],
      documents: [{ name: "Candidate 1 - Mployedin CV.pdf", url: "https://cdn/documents/built-1.pdf", type: "resume" }],
    };
    const { json } = await manifest([{ seekerId: oid(1), applicationId: APP }]);
    expect(json.items[0]).toMatchObject({ hasOriginal: true, originalIsBuilt: true });
  });

  it("originalIsBuilt: the served file is the seeker's stored built copy", async () => {
    seekers[oid(1)] = seekerDoc(1, {
      cv: undefined,
      documents: [{ category: "resume", url: "https://cdn/documents/built-copy.pdf", builtHash: "abc123", name: "x.pdf" }],
    });
    const { json } = await manifest([{ seekerId: oid(1) }]);
    expect(json.items[0]).toMatchObject({ hasOriginal: true, originalIsBuilt: true });
  });

  it("originalIsBuilt is false for an uploaded CV even when a built copy exists", async () => {
    seekers[oid(1)] = seekerDoc(1, {
      documents: [{ category: "resume", url: "https://cdn/documents/built-copy.pdf", builtHash: "abc123" }],
    });
    const { json } = await manifest([{ seekerId: oid(1) }]);
    expect(json.items[0]).toMatchObject({ originalIsBuilt: false });
  });

  it("the name comes from the profile, else the account, else is empty", async () => {
    seekers[oid(1)] = seekerDoc(1, { fullName: "" });
    seekers[oid(2)] = seekerDoc(2, { fullName: undefined });
    seekers[oid(3)] = seekerDoc(3, { fullName: "   " });
    users = { [oid(101)]: { _id: oid(101), name: "Account Name" } };
    const { json } = await manifest([{ seekerId: oid(1) }, { seekerId: oid(2) }, { seekerId: oid(3) }, { seekerId: oid(4) }]);
    expect(json.items.map((i: { name: string }) => i.name)).toEqual(["Account Name", "", "", "Candidate 4 Secret"]);
    // One account read, only for the profiles that had no name.
    expect(userFind).toHaveBeenCalledTimes(1);
    expect(userFind.mock.calls[0][0]._id.$in.sort()).toEqual([oid(101), oid(102), oid(103)].sort());
  });

  it("reads no account when every profile has a name", async () => {
    await manifest([{ seekerId: oid(1) }, { seekerId: oid(2) }]);
    expect(userFind).not.toHaveBeenCalled();
  });

  it("reads profiles in one batch for the allowed ids, selecting only what the row needs", async () => {
    await manifest([{ seekerId: oid(1) }, { seekerId: oid(2) }, { seekerId: oid(2) }, { seekerId: oid(3) }]);
    expect(find).toHaveBeenCalledTimes(1);
    expect(lastFindFilter?._id.$in.slice().sort()).toEqual([oid(1), oid(2), oid(3)]);
    const projection = lastFindSelect as Record<string, unknown>;
    expect(Object.keys(projection).sort()).toEqual(["cvDesign.hiddenSections", "education", "experience", "fullName", "skills", "summary"]);
    // The arrays only have to say "is there one": a single entry settles it.
    expect(projection.experience).toEqual({ $slice: 1 });
    expect(projection.education).toEqual({ $slice: 1 });
    expect(projection.skills).toEqual({ $slice: 1 });
  });

  it("a candidate who hid every section (and has no summary) has no Standardised CV, though the profile holds the data", async () => {
    seekers[oid(5)] = seekerDoc(5, {
      summary: "",
      experience: [{ jobTitle: "Driver" }],
      education: [{ degree: "BSc" }],
      skills: ["Forklift"],
      cvDesign: { hiddenSections: ["experience", "education", "skills"] },
    });
    seekers[oid(6)] = seekerDoc(6, { summary: "", experience: [{ jobTitle: "Driver" }], cvDesign: { hiddenSections: ["skills"] } });
    const { json } = await manifest([{ seekerId: oid(5) }, { seekerId: oid(6) }]);
    expect(json.items[0]).toMatchObject({ seekerId: oid(5), hasStandardised: false });
    // Hiding one section leaves the others to draw from.
    expect(json.items[1]).toMatchObject({ seekerId: oid(6), hasStandardised: true });
  });

  it("repeats a seeker listed twice (two applications) with each row's own application", async () => {
    ctx = asEmployer();
    applications.push({ _id: oid(82), jobSeekerId: oid(1), employerId: EMP, documents: [] });
    const { json } = await manifest([
      { seekerId: oid(1), applicationId: APP },
      { seekerId: oid(1), applicationId: oid(82) },
    ]);
    expect(json.items[0].originalUrl).toBe(`${cvPath(oid(1))}?applicationId=${APP}&download=1`);
    expect(json.items[1].originalUrl).toBe(`${cvPath(oid(1))}?applicationId=${oid(82)}&download=1`);
    expect(json.items[1]).toMatchObject({ hasOriginal: true }); // the Profile CV: that application carried none
  });
});

// ── how it works ────────────────────────────────────────────────────────────
describe("one actor, bounded work, stable order", () => {
  it("resolves the employer's company once for three items", async () => {
    ctx = asEmployer();
    await manifest([{ seekerId: oid(1) }, { seekerId: oid(2) }, { seekerId: oid(3) }]);
    expect(employerFindOne).toHaveBeenCalledTimes(1);
  });

  it("resolves an agent's scope once for three items", async () => {
    ctx = asAgent();
    await manifest([{ seekerId: oid(1) }, { seekerId: oid(2) }, { seekerId: oid(3) }]);
    expect(resolveStaffSeekerAccess).toHaveBeenCalledTimes(1);
  });

  it("checks at most 5 candidates at a time", async () => {
    seekers = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [oid(i + 1), seekerDoc(i + 1)]));
    delays = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [oid(i + 1), 8]));
    const { res, json } = await manifest(Array.from({ length: 20 }, (_, i) => ({ seekerId: oid(i + 1) })));
    expect(res.status).toBe(200);
    expect(json.items).toHaveLength(20);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(5);
  });

  it("keeps the input order when later items finish first", async () => {
    delays = { [oid(1)]: 40, [oid(2)]: 25, [oid(3)]: 10, [oid(4)]: 0 };
    const { json } = await manifest([1, 2, 3, 4].map((n) => ({ seekerId: oid(n) })));
    expect(json.items.map((i: { seekerId: string }) => i.seekerId)).toEqual([oid(1), oid(2), oid(3), oid(4)]);
  });

  it("answers one error, not one per item, when the actor cannot be resolved", async () => {
    ctx = asEmployer();
    employerFindOne.mockImplementationOnce(() => {
      throw new Error("db down");
    });
    const { res, json } = await manifest(Array.from({ length: 10 }, (_, i) => ({ seekerId: oid((i % 3) + 1) })));
    expect(res.status).toBe(500);
    expect(json.items).toBeUndefined();
    expect(typeof json.error).toBe("string");
    expect(json.error).not.toMatch(/^Failed to/);
    expect(json.error).not.toContain("db down");
    expect(findById).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("answers one error when a lookup fails part-way", async () => {
    findById.mockImplementationOnce(() => {
      throw new Error("db blip");
    });
    const { res, json } = await manifest([{ seekerId: oid(1) }, { seekerId: oid(2) }]);
    expect(res.status).toBe(500);
    expect(json.items).toBeUndefined();
  });
});

// ── the audit trail ─────────────────────────────────────────────────────────
describe("audit", () => {
  it("records cv.export once with the actor, the count and which candidates it covered", async () => {
    ctx = asAgent();
    staffMayOpen = new Set([oid(1), oid(2)]);
    await manifest([{ seekerId: oid(1) }, { seekerId: oid(2) }, { seekerId: oid(3) }]);
    expect(logActivity).toHaveBeenCalledTimes(1);
    const entry = logActivity.mock.calls[0][0];
    expect(entry).toMatchObject({
      actorId: oid(71),
      actorRole: "agent",
      action: "cv.export",
      resource: "job_seekers",
      meta: { count: 3, allowed: 2, denied: 1, seekerIds: [oid(1), oid(2)], deniedIds: [oid(3)] },
    });
    expect(entry.req).toBeDefined();
  });

  it("lists each refused candidate once, as sent, so an attempt at someone out of scope can be traced", async () => {
    ctx = asEmployer();
    await manifest([{ seekerId: oid(4) }, { seekerId: oid(1) }, { seekerId: oid(4), applicationId: APP }, { seekerId: oid(5) }]);
    expect(logActivity.mock.calls[0][0].meta).toMatchObject({
      count: 4,
      allowed: 1,
      denied: 3,
      seekerIds: [oid(1)],
      deniedIds: [oid(4), oid(5)],
    });
  });

  it("is recorded even when every row was refused", async () => {
    ctx = asEmployer();
    await manifest([{ seekerId: oid(4) }, { seekerId: oid(5) }]);
    expect(logActivity).toHaveBeenCalledTimes(1);
    expect(logActivity.mock.calls[0][0].meta).toMatchObject({
      count: 2,
      allowed: 0,
      denied: 2,
      seekerIds: [],
      deniedIds: [oid(4), oid(5)],
    });
  });
});

// withAuth swaps userId/role for a colleague (the owner's workspace) and for tenant view
// (the employer's account), so the person behind the request is in `member` / `tenantView`.
describe("the person behind the request is the one limited and recorded", () => {
  const COLLEAGUE = oid(95);
  const ADMIN_ACTOR = oid(96);

  it("a company colleague: rate limit and audit name the colleague, not the owner they borrow", async () => {
    ctx = {
      ...asEmployer(), // userId is already the owner's
      member: { actorId: COLLEAGUE, companyId: EMP, companyRoles: ["recruiter"], permissions: computeEffectivePermissions(["viewer"], { canManageTalentPools: true }), jobAccess: [] },
    };
    const { res, json } = await manifest([{ seekerId: oid(1) }]);
    expect(res.status).toBe(200);
    expect(json.items[0].denied).toBeUndefined();
    expect(checkRateLimit).toHaveBeenCalledWith(COLLEAGUE, expect.objectContaining({ prefix: "cv-export" }));
    expect(logActivity.mock.calls[0][0]).toMatchObject({
      actorId: COLLEAGUE,
      actorRole: "employer",
      onBehalfOfId: EMP_USER,
      action: "cv.export",
    });
    // The company is still resolved from the owner: that is whose candidates they are.
    expect(employerFindOne).toHaveBeenCalledWith({ userId: EMP_USER });
  });

  it("tenant view: rate limit and audit name the admin, who acts on the employer's account", async () => {
    ctx = {
      ...asEmployer(),
      tenantView: { actorId: ADMIN_ACTOR, actorRole: "admin", employerId: EMP },
    };
    const { res } = await manifest([{ seekerId: oid(1) }]);
    expect(res.status).toBe(200);
    expect(checkRateLimit).toHaveBeenCalledWith(ADMIN_ACTOR, expect.objectContaining({ prefix: "cv-export" }));
    expect(logActivity.mock.calls[0][0]).toMatchObject({
      actorId: ADMIN_ACTOR,
      actorRole: "admin",
      onBehalfOfId: EMP_USER,
      onBehalfOfRole: "employer",
      action: "cv.export",
    });
  });
});

describe("a colleague with the applicant-review function only (the default hiring_manager role)", () => {
  const asHiringManager = (overrides?: Record<string, boolean>): Ctx => ({
    ...asEmployer(),
    member: {
      actorId: oid(97),
      companyId: EMP,
      companyRoles: ["hiring_manager"],
      permissions: computeEffectivePermissions(["hiring_manager"], overrides),
      jobAccess: [],
    },
  });

  it("may export items that all name an application, and each row's files carry that application", async () => {
    ctx = asHiringManager();
    const { res, json } = await manifest([{ seekerId: oid(1), applicationId: APP }]);
    expect(res.status).toBe(200);
    expect(json.items[0]).toMatchObject({
      seekerId: oid(1),
      originalUrl: `${cvPath(oid(1))}?applicationId=${APP}&download=1`,
      builtUrl: `${cvPath(oid(1))}?kind=built&applicationId=${APP}`,
    });
  });

  it("is refused (403) when any item is a talent-pool candidate with no application, and nothing is read", async () => {
    ctx = asHiringManager();
    const { res, json } = await manifest([{ seekerId: oid(1), applicationId: APP }, { seekerId: oid(2) }]);
    expect(res.status).toBe(403);
    expect(json.items).toBeUndefined();
    expect(findById).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("is refused when a colleague has neither function", async () => {
    ctx = asHiringManager({ canReviewApplicants: false });
    expect((await manifest([{ seekerId: oid(1), applicationId: APP }])).res.status).toBe(403);
  });

  it("with the candidate-pool function too, talent-pool items are allowed as before", async () => {
    ctx = asHiringManager({ canManageTalentPools: true });
    const { res, json } = await manifest([{ seekerId: oid(1), applicationId: APP }, { seekerId: oid(2) }]);
    expect(res.status).toBe(200);
    expect(json.items[1].builtUrl).toBe(`${cvPath(oid(2))}?kind=built`);
  });
});
