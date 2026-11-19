/**
 * @jest-environment node
 *
 * One gate for "may this person open this seeker's CV": the file route, the
 * Mployedin-CV JSON and the standardised-CV manifest all ask it, so no surface
 * can show more than another. Staff scope is the real canStaffAccessSeeker (with
 * its Agent/SuperAgent lookups mocked), so the archived-role and hidden-profile
 * rules are tested where they actually live.
 */
const SEEKER = "650000000000000000000330";
const SEEKER_USER = "650000000000000000000331";
const OTHER_SEEKER = "650000000000000000000340";
const OWN_SEEKER = "650000000000000000000350";
const EMP = "650000000000000000000320";
const EMP_USER = "650000000000000000000321";
const OTHER_EMP = "650000000000000000000329";
const APP = "650000000000000000000310";
const OWN_APP = "650000000000000000000311";
const SEEKER_B = "650000000000000000000360";
const SEEKER_C = "650000000000000000000361";
const AGENT = "660000000000000000000001";
const OTHER_AGENT = "660000000000000000000009";
const SA = "660000000000000000000002";
const CITY = "880000000000000000000001";
const OTHER_CITY = "880000000000000000000002";

jest.mock("@/lib/db/mongoose", () => {
  const connectDB = jest.fn().mockResolvedValue(undefined);
  return { __esModule: true, default: connectDB, connectDB };
});

function chain<T>(result: T, onSelect?: (fields: string) => void) {
  const c: Record<string, unknown> = {};
  c.select = (fields: string) => {
    onSelect?.(fields);
    return c;
  };
  c.lean = async () => result;
  return c;
}

let seekers: Record<string, Record<string, unknown>>;
let ownSeeker: Record<string, unknown> | null;
let lastFindByIdSelect = "";
const findById = jest.fn((id: string) =>
  chain(seekers[id] ?? null, (fields) => {
    lastFindByIdSelect = fields;
  }),
);
const findOne = jest.fn((_filter: unknown) => chain(ownSeeker));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findById: (id: string) => findById(id), findOne: (filter: unknown) => findOne(filter) },
}));

let employerDoc: { _id: string } | null;
const employerFindOne = jest.fn((_filter: unknown) => chain(employerDoc));
jest.mock("@/models/Employer", () => {
  const Employer = { findOne: (filter: unknown) => employerFindOne(filter) };
  return { __esModule: true, default: Employer, Employer };
});

const applicationExists = jest.fn();
const applicationDistinct = jest.fn();
// A small store the fake findOne applies the filter to, so a denial comes from
// the scoping in the query and not from a canned null.
let applications: Array<Record<string, unknown>>;
const applicationFindOne = jest.fn((filter: Record<string, unknown>) =>
  chain(applications.find((a) => Object.entries(filter).every(([key, value]) => String(a[key]) === String(value))) ?? null),
);
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    exists: (filter: unknown) => applicationExists(filter),
    findOne: (filter: Record<string, unknown>) => applicationFindOne(filter),
    distinct: (field: string, filter: unknown) => applicationDistinct(field, filter),
  },
}));

const talentPoolExists = jest.fn();
const talentPoolDistinct = jest.fn();
jest.mock("@/models/TalentPool", () => ({
  __esModule: true,
  default: {
    exists: (filter: unknown) => talentPoolExists(filter),
    distinct: (field: string, filter: unknown) => talentPoolDistinct(field, filter),
  },
}));

let agentDoc: unknown;
const agentFindOne = jest.fn();
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    findOne: (...a: unknown[]) => {
      agentFindOne(...a);
      return { select: () => ({ lean: async () => agentDoc }) };
    },
  },
}));
let saDoc: unknown;
const saFindOne = jest.fn();
jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: {
    findOne: (...a: unknown[]) => {
      saFindOne(...a);
      return { select: () => ({ lean: async () => saDoc }) };
    },
  },
}));
let scope: unknown;
let territory: unknown;
const getSuperAgentScope = jest.fn(async () => scope);
const getSuperAgentTerritory = jest.fn(async () => territory);
const getAgentSeekerArea = jest.fn(async () => ({ assignedCityIds: [CITY], assignedStateIds: [] }));
jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentScope: () => getSuperAgentScope(),
  getSuperAgentTerritory: () => getSuperAgentTerritory(),
  getAgentSeekerArea: () => getAgentSeekerArea(),
  seekerInRegion: jest.requireActual("@/lib/auth/regionMatch").seekerInRegion,
}));

import {
  authorizeCvAccess,
  employerAccessibleSeekerIds,
  hasBuiltCvContent,
  resolveCvActor,
  type BuiltCvSource,
} from "@/lib/cv/cvAccess";
import { hasBuiltCvContent as clientHasBuiltCvContent } from "@/lib/cv/seekerCvAvailability";

const staff = (role: "agent" | "super_agent") => ({ userId: "u-staff", role });
const asEmployer = { userId: EMP_USER, role: "employer" };

function seekerDoc(extra: Record<string, unknown> = {}) {
  return { _id: SEEKER, userId: SEEKER_USER, cv: { originalUrl: "https://cdn/cvs/a.pdf" }, documents: [], ...extra };
}

beforeEach(() => {
  jest.clearAllMocks();
  lastFindByIdSelect = "";
  seekers = {
    [SEEKER]: seekerDoc(),
    [OTHER_SEEKER]: seekerDoc({ _id: OTHER_SEEKER }),
    [SEEKER_B]: seekerDoc({ _id: SEEKER_B }),
    [SEEKER_C]: seekerDoc({ _id: SEEKER_C }),
  };
  ownSeeker = { _id: OWN_SEEKER, userId: "u-seeker", cv: { originalUrl: "https://cdn/cvs/own.pdf" }, documents: [] };
  employerDoc = { _id: EMP };
  applicationExists.mockResolvedValue({ _id: "x" });
  talentPoolExists.mockResolvedValue(null);
  applications = [
    { _id: APP, jobSeekerId: SEEKER, employerId: EMP, documents: [{ name: "Tailored CV.pdf", url: "https://cdn/documents/sent.pdf", type: "resume" }] },
    { _id: OWN_APP, jobSeekerId: OWN_SEEKER, employerId: EMP, documents: [] },
  ];
  agentDoc = { _id: AGENT, assignedJobSeekerIds: [], assignedCityIds: [CITY], assignedStateIds: [] };
  saDoc = { _id: SA };
  scope = { effectiveAgentIds: [AGENT] };
  territory = { assignedCityIds: [CITY], assignedStateIds: [] };
});

describe("job seeker", () => {
  it("is given their own profile", async () => {
    const res = await authorizeCvAccess({ userId: "u-seeker", role: "job_seeker" }, OWN_SEEKER);
    expect(res).toMatchObject({ ok: true, employerId: null });
    expect(res.ok && res.seeker._id).toBe(OWN_SEEKER);
    expect(findOne).toHaveBeenCalledWith({ userId: "u-seeker" });
  });

  it("is never given another seeker's profile: the id asked for is ignored, as the route always did", async () => {
    const res = await authorizeCvAccess({ userId: "u-seeker", role: "job_seeker" }, OTHER_SEEKER);
    expect(findById).not.toHaveBeenCalled();
    expect(res.ok && res.seeker._id).toBe(OWN_SEEKER);
  });

  it("is not found when they have no profile", async () => {
    ownSeeker = null;
    expect(await authorizeCvAccess({ userId: "u-seeker", role: "job_seeker" }, SEEKER)).toEqual({
      ok: false,
      status: 404,
      error: "Candidate not found",
    });
  });
});

describe("admin", () => {
  it("may open any seeker, hidden or converted ones included", async () => {
    seekers[SEEKER] = seekerDoc({ profileVisibility: "hidden", roleArchivedAt: new Date() });
    const res = await authorizeCvAccess({ userId: "u-admin", role: "admin" }, SEEKER);
    expect(res.ok && res.seeker._id).toBe(SEEKER);
  });

  it("is told the candidate is not found for an unknown seeker", async () => {
    expect(await authorizeCvAccess({ userId: "u-admin", role: "admin" }, "650000000000000000000999")).toEqual({
      ok: false,
      status: 404,
      error: "Candidate not found",
    });
  });
});

describe("employer", () => {
  it("may open a seeker who applied to one of their jobs", async () => {
    const res = await authorizeCvAccess(asEmployer, SEEKER);
    expect(res).toMatchObject({ ok: true, employerId: EMP });
    expect(res.ok && res.seeker._id).toBe(SEEKER);
    expect(applicationExists).toHaveBeenCalledWith({ jobSeekerId: SEEKER, employerId: EMP });
  });

  it("may open a seeker who sits in one of their talent pools", async () => {
    applicationExists.mockResolvedValue(null);
    talentPoolExists.mockResolvedValue({ _id: "pool" });
    const res = await authorizeCvAccess(asEmployer, SEEKER);
    expect(res.ok).toBe(true);
    expect(talentPoolExists).toHaveBeenCalledWith({ employerId: EMP, "candidates.jobSeekerId": SEEKER });
  });

  it("is refused a seeker with no application and no talent pool entry, and the profile is never read", async () => {
    applicationExists.mockResolvedValue(null);
    expect(await authorizeCvAccess(asEmployer, SEEKER)).toEqual({ ok: false, status: 403, error: "Forbidden" });
    expect(findById).not.toHaveBeenCalled();
  });

  it("is refused when they have no employer profile", async () => {
    employerDoc = null;
    expect(await authorizeCvAccess(asEmployer, SEEKER)).toEqual({ ok: false, status: 403, error: "Forbidden" });
    expect(applicationExists).not.toHaveBeenCalled();
  });

  it("is told the candidate is not found once allowed in but the profile is gone", async () => {
    delete seekers[SEEKER];
    expect(await authorizeCvAccess(asEmployer, SEEKER)).toEqual({ ok: false, status: 404, error: "Candidate not found" });
  });

  it("is given the sent documents of an application that is theirs", async () => {
    const res = await authorizeCvAccess(asEmployer, SEEKER, { applicationId: APP });
    expect(applicationFindOne).toHaveBeenCalledWith({ _id: APP, jobSeekerId: SEEKER, employerId: EMP });
    expect(res.ok && res.application).toEqual(applications[0]);
  });

  it("is refused an applicationId that belongs to another employer: the lookup is scoped to them", async () => {
    // The seeker is theirs to open, but this application was sent to someone else.
    applications[0] = { ...applications[0], employerId: OTHER_EMP };
    expect(await authorizeCvAccess(asEmployer, SEEKER, { applicationId: APP })).toEqual({
      ok: false,
      status: 404,
      error: "Application not found",
    });
    expect(applicationFindOne).toHaveBeenCalledWith({ _id: APP, jobSeekerId: SEEKER, employerId: EMP });
    // Control: the same application, unscoped, exists. Only the scoping denied it.
    expect((await authorizeCvAccess({ userId: "u-admin", role: "admin" }, SEEKER, { applicationId: APP })).ok).toBe(true);
  });

  it("is refused an applicationId that belongs to another seeker", async () => {
    applications[0] = { ...applications[0], jobSeekerId: OTHER_SEEKER };
    expect((await authorizeCvAccess(asEmployer, SEEKER, { applicationId: APP })).ok).toBe(false);
  });

  it("looks no application up when none is named", async () => {
    const res = await authorizeCvAccess(asEmployer, SEEKER);
    expect(applicationFindOne).not.toHaveBeenCalled();
    expect(res.ok && res.application).toBeNull();
  });
});

describe("admin and job seeker with an applicationId", () => {
  it("find it by seeker alone: there is no employer to scope it to", async () => {
    const asAdmin = await authorizeCvAccess({ userId: "u-admin", role: "admin" }, SEEKER, { applicationId: APP });
    expect(applicationFindOne).toHaveBeenCalledWith({ _id: APP, jobSeekerId: SEEKER });
    expect(asAdmin.ok && asAdmin.application).toEqual(applications[0]);

    const asSeeker = await authorizeCvAccess({ userId: "u-seeker", role: "job_seeker" }, SEEKER, { applicationId: OWN_APP });
    expect(applicationFindOne).toHaveBeenLastCalledWith({ _id: OWN_APP, jobSeekerId: OWN_SEEKER });
    expect(asSeeker.ok && asSeeker.application).toEqual(applications[1]);
  });

  it("are told the application is not found when it is not this seeker's", async () => {
    expect(await authorizeCvAccess({ userId: "u-admin", role: "admin" }, OTHER_SEEKER, { applicationId: APP })).toEqual({
      ok: false,
      status: 404,
      error: "Application not found",
    });
    // A seeker naming someone else's application gets nothing, whatever id they ask for.
    expect((await authorizeCvAccess({ userId: "u-seeker", role: "job_seeker" }, SEEKER, { applicationId: APP })).ok).toBe(false);
  });
});

describe("agent", () => {
  it("may open a seeker assigned to them", async () => {
    seekers[SEEKER] = seekerDoc({ agentId: AGENT });
    expect((await authorizeCvAccess(staff("agent"), SEEKER)).ok).toBe(true);
  });

  it("is refused another agent's seeker", async () => {
    seekers[SEEKER] = seekerDoc({ agentId: OTHER_AGENT, referral: { agentId: OTHER_AGENT } });
    expect(await authorizeCvAccess(staff("agent"), SEEKER)).toEqual({ ok: false, status: 403, error: "Forbidden" });
  });

  it("is refused everything without an Agent profile", async () => {
    agentDoc = null;
    seekers[SEEKER] = seekerDoc({ agentId: AGENT });
    expect(await authorizeCvAccess(staff("agent"), SEEKER)).toEqual({ ok: false, status: 403, error: "Forbidden" });
  });

  it("may open a visible seeker in their area", async () => {
    seekers[SEEKER] = seekerDoc({ regionCityId: CITY, profileVisibility: "visible" });
    expect((await authorizeCvAccess(staff("agent"), SEEKER)).ok).toBe(true);
  });

  it("is refused a seeker outside their area", async () => {
    seekers[SEEKER] = seekerDoc({ regionCityId: OTHER_CITY, profileVisibility: "visible" });
    expect((await authorizeCvAccess(staff("agent"), SEEKER)).ok).toBe(false);
  });

  it("is refused a hidden profile that is only in their area", async () => {
    seekers[SEEKER] = seekerDoc({ regionCityId: CITY, profileVisibility: "hidden" });
    expect(await authorizeCvAccess(staff("agent"), SEEKER)).toEqual({ ok: false, status: 403, error: "Forbidden" });
  });

  it("is refused a converted (archived-role) account that is only in their area", async () => {
    seekers[SEEKER] = seekerDoc({ regionCityId: CITY, profileVisibility: "visible", roleArchivedAt: new Date() });
    expect(await authorizeCvAccess(staff("agent"), SEEKER)).toEqual({ ok: false, status: 403, error: "Forbidden" });
  });

  it("still opens a hidden profile they own", async () => {
    seekers[SEEKER] = seekerDoc({ agentId: AGENT, profileVisibility: "hidden" });
    expect((await authorizeCvAccess(staff("agent"), SEEKER)).ok).toBe(true);
  });

  it("is told the candidate is not found, before any scope check, for an unknown seeker", async () => {
    expect(await authorizeCvAccess(staff("agent"), "650000000000000000000999")).toEqual({
      ok: false,
      status: 404,
      error: "Candidate not found",
    });
  });

  it("reads the ownership and visibility fields the scope rule decides on", async () => {
    await authorizeCvAccess(staff("agent"), SEEKER);
    for (const field of ["agentId", "referral", "regionCityId", "regionStateId", "profileVisibility", "roleArchivedAt"]) {
      expect(lastFindByIdSelect).toContain(field);
    }
  });

  it("is never given an application, whatever is asked: staff views have none", async () => {
    seekers[SEEKER] = seekerDoc({ agentId: AGENT });
    const res = await authorizeCvAccess(staff("agent"), SEEKER, { applicationId: APP });
    expect(applicationFindOne).not.toHaveBeenCalled();
    expect(res.ok && res.application).toBeNull();
  });
});

describe("super agent", () => {
  it("may open a seeker owned by an agent on their team", async () => {
    seekers[SEEKER] = seekerDoc({ agentId: AGENT });
    expect((await authorizeCvAccess(staff("super_agent"), SEEKER)).ok).toBe(true);
  });

  it("may open a seeker they referred themselves", async () => {
    scope = { effectiveAgentIds: [] };
    seekers[SEEKER] = seekerDoc({ referral: { superAgentId: SA } });
    expect((await authorizeCvAccess(staff("super_agent"), SEEKER)).ok).toBe(true);
  });

  it("is refused a seeker outside their team and territory", async () => {
    seekers[SEEKER] = seekerDoc({ agentId: OTHER_AGENT, regionCityId: OTHER_CITY, profileVisibility: "visible" });
    expect(await authorizeCvAccess(staff("super_agent"), SEEKER)).toEqual({ ok: false, status: 403, error: "Forbidden" });
  });

  it("may open a visible seeker in their territory", async () => {
    seekers[SEEKER] = seekerDoc({ regionCityId: CITY, profileVisibility: "visible" });
    expect((await authorizeCvAccess(staff("super_agent"), SEEKER)).ok).toBe(true);
  });

  it("is refused a hidden profile that is only in their territory", async () => {
    seekers[SEEKER] = seekerDoc({ regionCityId: CITY, profileVisibility: "hidden" });
    expect((await authorizeCvAccess(staff("super_agent"), SEEKER)).ok).toBe(false);
  });

  it("is refused a converted (archived-role) account that is only in their territory", async () => {
    seekers[SEEKER] = seekerDoc({ regionCityId: CITY, profileVisibility: "visible", roleArchivedAt: new Date() });
    expect((await authorizeCvAccess(staff("super_agent"), SEEKER)).ok).toBe(false);
  });

  it("is refused everything without a scope", async () => {
    scope = null;
    saDoc = null;
    seekers[SEEKER] = seekerDoc({ agentId: AGENT });
    expect((await authorizeCvAccess(staff("super_agent"), SEEKER)).ok).toBe(false);
  });
});

describe("denials", () => {
  it("are fresh objects: changing one never changes the next", async () => {
    const first = await authorizeCvAccess({ userId: "u-x", role: "guest" }, SEEKER);
    if (first.ok) throw new Error("expected a denial");
    first.error = "changed";
    first.status = 404;
    expect(await authorizeCvAccess({ userId: "u-x", role: "guest" }, SEEKER)).toEqual({ ok: false, status: 403, error: "Forbidden" });
  });
});

describe("a pre-resolved actor (bulk use)", () => {
  const inArea = (ids: string[]) => {
    for (const id of ids) seekers[id] = seekerDoc({ _id: id, regionCityId: CITY, profileVisibility: "visible" });
  };

  it("runs an employer's lookup once for three seekers", async () => {
    const actor = await resolveCvActor(asEmployer);
    expect(employerFindOne).toHaveBeenCalledTimes(1);
    for (const id of [SEEKER, SEEKER_B, SEEKER_C]) {
      const res = await authorizeCvAccess(asEmployer, id, { actor });
      expect(res).toMatchObject({ ok: true, employerId: EMP });
      expect(res.ok && res.seeker._id).toBe(id);
    }
    expect(employerFindOne).toHaveBeenCalledTimes(1);
    // The per-seeker questions are still asked per seeker.
    expect(applicationExists).toHaveBeenCalledTimes(3);
  });

  it("runs an agent's lookups once for three seekers seen through their area", async () => {
    inArea([SEEKER, SEEKER_B, SEEKER_C]);
    const actor = await resolveCvActor(staff("agent"));
    for (const id of [SEEKER, SEEKER_B, SEEKER_C]) {
      expect((await authorizeCvAccess(staff("agent"), id, { actor })).ok).toBe(true);
    }
    expect(agentFindOne).toHaveBeenCalledTimes(1);
    expect(getAgentSeekerArea).toHaveBeenCalledTimes(1);
  });

  it("reads an agent's area only when a seeker is not already theirs", async () => {
    seekers[SEEKER] = seekerDoc({ agentId: AGENT });
    const actor = await resolveCvActor(staff("agent"));
    await authorizeCvAccess(staff("agent"), SEEKER, { actor });
    expect(agentFindOne).toHaveBeenCalledTimes(1);
    expect(getAgentSeekerArea).not.toHaveBeenCalled();
  });

  it("runs a super agent's scope and territory lookups once for three seekers", async () => {
    inArea([SEEKER, SEEKER_B, SEEKER_C]);
    const actor = await resolveCvActor(staff("super_agent"));
    for (const id of [SEEKER, SEEKER_B, SEEKER_C]) {
      expect((await authorizeCvAccess(staff("super_agent"), id, { actor })).ok).toBe(true);
    }
    expect(getSuperAgentScope).toHaveBeenCalledTimes(1);
    expect(saFindOne).toHaveBeenCalledTimes(1);
    expect(getSuperAgentTerritory).toHaveBeenCalledTimes(1);
  });

  it("shares one actor across calls running at the same time", async () => {
    inArea([SEEKER, SEEKER_B, SEEKER_C]);
    const actor = await resolveCvActor(staff("agent"));
    const results = await Promise.all([SEEKER, SEEKER_B, SEEKER_C].map((id) => authorizeCvAccess(staff("agent"), id, { actor })));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(agentFindOne).toHaveBeenCalledTimes(1);
    expect(getAgentSeekerArea).toHaveBeenCalledTimes(1);
  });

  it("without one, every call runs the actor lookups itself", async () => {
    for (const id of [SEEKER, SEEKER_B, SEEKER_C]) await authorizeCvAccess(asEmployer, id);
    expect(employerFindOne).toHaveBeenCalledTimes(3);
  });

  it("still refuses what the single call refuses", async () => {
    // An employer with no profile, one with no tie to the seeker, a hidden seeker only in an agent's area.
    employerDoc = null;
    const noProfile = await resolveCvActor(asEmployer);
    expect(await authorizeCvAccess(asEmployer, SEEKER, { actor: noProfile })).toEqual({ ok: false, status: 403, error: "Forbidden" });
    expect(applicationExists).not.toHaveBeenCalled();

    employerDoc = { _id: EMP };
    applicationExists.mockResolvedValue(null);
    const actor = await resolveCvActor(asEmployer);
    expect(await authorizeCvAccess(asEmployer, SEEKER, { actor })).toEqual({ ok: false, status: 403, error: "Forbidden" });

    seekers[SEEKER] = seekerDoc({ regionCityId: CITY, profileVisibility: "hidden" });
    const agent = await resolveCvActor(staff("agent"));
    expect(await authorizeCvAccess(staff("agent"), SEEKER, { actor: agent })).toEqual({ ok: false, status: 403, error: "Forbidden" });
    expect(await authorizeCvAccess(staff("agent"), "650000000000000000000999", { actor: agent })).toEqual({
      ok: false,
      status: 404,
      error: "Candidate not found",
    });
  });

  it("gives the same answer with and without an actor", async () => {
    seekers[SEEKER_B] = seekerDoc({ _id: SEEKER_B, regionCityId: CITY, profileVisibility: "hidden" });
    seekers[SEEKER_C] = seekerDoc({ _id: SEEKER_C, agentId: AGENT });
    const cases = [
      { ctx: asEmployer, ids: [SEEKER, SEEKER_B] },
      { ctx: staff("agent"), ids: [SEEKER, SEEKER_B, SEEKER_C] },
      { ctx: staff("super_agent"), ids: [SEEKER, SEEKER_B, SEEKER_C] },
      { ctx: { userId: "u-admin", role: "admin" }, ids: [SEEKER, SEEKER_B] },
      { ctx: { userId: "u-seeker", role: "job_seeker" }, ids: [SEEKER] },
      { ctx: { userId: "u-x", role: "guest" }, ids: [SEEKER] },
    ];
    for (const { ctx, ids } of cases) {
      const actor = await resolveCvActor(ctx);
      for (const id of ids) {
        expect(await authorizeCvAccess(ctx, id, { actor })).toEqual(await authorizeCvAccess(ctx, id));
      }
    }
  });

  it("is not trusted for anyone but the person it was resolved for", async () => {
    // An employer's actor handed to a call made as another employer: their own lookup still runs.
    const actor = await resolveCvActor(asEmployer);
    employerFindOne.mockClear();
    employerDoc = null; // the other caller has no employer profile
    const other = { userId: "someone-else", role: "employer" };
    expect(await authorizeCvAccess(other, SEEKER, { actor })).toEqual({ ok: false, status: 403, error: "Forbidden" });
    expect(employerFindOne).toHaveBeenCalledTimes(1);
    // A staff actor never lifts a lower role either.
    const agent = await resolveCvActor(staff("agent"));
    expect(await authorizeCvAccess({ userId: "u-staff", role: "guest" }, SEEKER, { actor: agent })).toEqual({
      ok: false,
      status: 403,
      error: "Forbidden",
    });
  });
});

describe("any other role", () => {
  it.each(["hr", "company_member", "guest", ""])("%p is refused, and nothing is read", async (role) => {
    expect(await authorizeCvAccess({ userId: "u-x", role }, SEEKER)).toEqual({ ok: false, status: 403, error: "Forbidden" });
    expect(findById).not.toHaveBeenCalled();
    expect(findOne).not.toHaveBeenCalled();
  });
});

describe("malformed ids", () => {
  it("never reach a query", async () => {
    expect(await authorizeCvAccess({ userId: "u-admin", role: "admin" }, "not-an-id")).toEqual({
      ok: false,
      status: 400,
      error: "Invalid candidate ID",
    });
    expect(await authorizeCvAccess({ userId: "u-admin", role: "admin" }, SEEKER, { applicationId: "nope" })).toEqual({
      ok: false,
      status: 400,
      error: "Invalid application ID",
    });
    expect(findById).not.toHaveBeenCalled();
    expect(applicationFindOne).not.toHaveBeenCalled();
  });
});

describe("hasBuiltCvContent", () => {
  it("is the client-safe rule itself, so View CV buttons and the export cannot disagree", () => {
    expect(hasBuiltCvContent).toBe(clientHasBuiltCvContent);
  });

  it("is false for a profile with nothing to draw a CV from", () => {
    expect(hasBuiltCvContent({})).toBe(false);
    expect(hasBuiltCvContent({ experience: [], education: [], skills: [], summary: "" })).toBe(false);
    expect(hasBuiltCvContent(null)).toBe(false);
    expect(hasBuiltCvContent(undefined)).toBe(false);
  });

  it("is true when any one of experience, education, skills or a summary is there", () => {
    expect(hasBuiltCvContent({ experience: [{}] })).toBe(true);
    expect(hasBuiltCvContent({ education: [{}] })).toBe(true);
    expect(hasBuiltCvContent({ skills: ["Welding"] })).toBe(true);
    expect(hasBuiltCvContent({ summary: "Ten years on site." })).toBe(true);
  });

  it("does not count fields the CV is not built from", () => {
    const profile = { languages: [{}], certifications: [{}], projects: [{}], headline: "Engineer" };
    expect(hasBuiltCvContent(profile as BuiltCvSource)).toBe(false);
  });
});

describe("employerAccessibleSeekerIds (the batched form of the employer branch)", () => {
  beforeEach(() => {
    applicationDistinct.mockResolvedValue([]);
    talentPoolDistinct.mockResolvedValue([]);
  });

  it("returns the seekers who applied, and the ones in a talent pool, and nobody else", async () => {
    applicationDistinct.mockResolvedValue([SEEKER]);
    talentPoolDistinct.mockResolvedValue([SEEKER_B, "650000000000000000000999"]); // a pool lists more than was asked
    const ids = await employerAccessibleSeekerIds(EMP, [SEEKER, SEEKER_B, SEEKER_C]);
    expect([...ids].sort()).toEqual([SEEKER, SEEKER_B].sort());
  });

  it("runs ONE query on applications and ONE on talent pools, however many seekers", async () => {
    await employerAccessibleSeekerIds(EMP, [SEEKER, SEEKER_B, SEEKER_C]);
    expect(applicationDistinct).toHaveBeenCalledTimes(1);
    expect(talentPoolDistinct).toHaveBeenCalledTimes(1);
  });

  it("scopes both queries to the employer", async () => {
    await employerAccessibleSeekerIds(EMP, [SEEKER, SEEKER_B]);
    expect(applicationDistinct).toHaveBeenCalledWith("jobSeekerId", { jobSeekerId: { $in: [SEEKER, SEEKER_B] }, employerId: EMP });
    expect(talentPoolDistinct).toHaveBeenCalledWith("candidates.jobSeekerId", { employerId: EMP, "candidates.jobSeekerId": { $in: [SEEKER, SEEKER_B] } });
  });

  it("reads nothing for no seekers, or no employer", async () => {
    expect((await employerAccessibleSeekerIds(EMP, [])).size).toBe(0);
    expect((await employerAccessibleSeekerIds(null, [SEEKER])).size).toBe(0);
    expect(applicationDistinct).not.toHaveBeenCalled();
    expect(talentPoolDistinct).not.toHaveBeenCalled();
  });

  it("uses the same predicate as the single-seeker gate, so the two cannot drift", async () => {
    await authorizeCvAccess(asEmployer, SEEKER);
    await employerAccessibleSeekerIds(EMP, [SEEKER]);
    const [, appFilterBatch] = applicationDistinct.mock.calls[0];
    const [, poolFilterBatch] = talentPoolDistinct.mock.calls[0];
    // The batch filter is the single filter with the id widened to $in.
    expect(applicationExists.mock.calls[0][0]).toEqual({ ...appFilterBatch, jobSeekerId: SEEKER });
    expect(talentPoolExists.mock.calls[0][0]).toEqual({ ...poolFilterBatch, "candidates.jobSeekerId": SEEKER });
  });
});
