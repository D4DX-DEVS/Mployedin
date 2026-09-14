/**
 * @jest-environment node
 */
/**
 * The regional seeker directory read four fields JobSeeker does not have —
 * `city`, `currentJobTitle`, `experienceYears`, `profileCompletion` — so every
 * row rendered "—", "0 yrs" and a 0% bar no matter what the profile held. The
 * experience filter queried the same dead field (always empty), the
 * availability filter was sent by the page and never read, and the four header
 * figures were computed from the ten rows of the current page rather than the
 * scope.
 *
 * These assert the filter handed to the model and the payload handed to the
 * page, because both are where those bugs lived — the route returned 200 in
 * every case.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => {
    return async (req: NextRequest) => handler(req, (req as unknown as { __ctx: unknown }).__ctx);
  },
}));

jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentScope: jest.fn(async () => ({
    saProfileId: "sa_profile_1",
    teamAgentIds: ["agent_1"],
    regionAgentIds: [],
    effectiveAgentIds: ["agent_1"],
    assignedCityIds: [],
    assignedStateIds: [],
  })),
}));

jest.mock("@/lib/referrals/summary", () => ({
  decorateReferralSummaries: jest.fn(async (items: unknown[]) => items),
}));

jest.mock("@/lib/security/sanitize", () => ({
  escapeRegex: (value: string) => value,
}));

/** One seeker, spelled the way the collection actually spells a seeker. */
const SEEKER = {
  _id: "seeker_1",
  userId: { name: "Yusuf Rupani", email: "y@example.com", phone: "+96890000000", isActive: true },
  country: "Oman",
  currentLocation: "Muscat",
  headline: "Site supervisor",
  experience: [
    { jobTitle: "Welder", company: "Prior Co", isCurrent: false },
    { jobTitle: "Senior Welder", company: "Gulf Fabrication", isCurrent: true },
  ],
  totalExperienceYears: 7,
  profileCompleteness: 82,
  availabilityStatus: "immediately",
  skills: ["Welding", "Blueprint Reading"],
  createdAt: new Date("2026-06-02T00:00:00.000Z"),
};

/** Filters every read was given, and the pipeline the stats were taken from. */
const seen: { filters: unknown[]; pipelines: unknown[][] } = { filters: [], pipelines: [] };

/** Scope-wide totals, deliberately unlike the one row on the page. */
let statsRow: Record<string, unknown> | undefined = {
  _id: null,
  total: 181,
  active: 74,
  completionSum: 5792,
  experienced: 31,
};

function chain(result: unknown) {
  const node: Record<string, unknown> = {};
  for (const method of ["sort", "skip", "limit", "populate", "select"]) {
    node[method] = jest.fn(() => node);
  }
  node.lean = jest.fn(async () => result);
  return node;
}

jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    find: jest.fn((filter: unknown) => {
      seen.filters.push(filter);
      return chain([SEEKER]);
    }),
    countDocuments: jest.fn(async (filter: unknown) => {
      seen.filters.push(filter);
      return 181;
    }),
    /* Real profiles carry their location as free text in `currentLocation`;
       the `country` field is unset on every one of them. */
    distinct: jest.fn(async (field: string) =>
      field === "currentLocation"
        ? ["Dubai, UAE", "Riyadh, Al Murooj, Saudi Arabia (Transferable Iqama)", "Srinagar, Kashmir, India", ""]
        : [],
    ),
    aggregate: jest.fn(async (pipeline: unknown[]) => {
      seen.pipelines.push(pipeline);
      return statsRow ? [statsRow] : [];
    }),
  },
}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { find: jest.fn(() => chain([{ assignedJobSeekerIds: ["seeker_1"] }])) },
}));

jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ _id: "sa_1" }) }) })) },
}));

jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { find: jest.fn(() => chain([])) },
}));

type MockedRoute = (req: NextRequest) => Promise<Response>;
type Payload = {
  items: Array<Record<string, unknown>>;
  stats: { total: number; active: number; avgCompletion: number; withExperience: number };
};

async function get(query = "") {
  const { GET } = (await import("@/app/api/super-agent/job-seekers/route")) as unknown as { GET: MockedRoute };
  const req = new NextRequest(`http://t/api/super-agent/job-seekers${query}`);
  (req as unknown as { __ctx: unknown }).__ctx = { userId: "sa_user_1", role: "super_agent", locale: "en" };
  const res = await GET(req);
  return (await res.json()) as Payload;
}

/** The clauses of the `$and` the route builds, ignoring the scope union. */
function clauses(filter: unknown): Array<Record<string, unknown>> {
  const f = filter as { $and?: Array<Record<string, unknown>> };
  return (f.$and ?? []).filter((c) => !("$or" in c));
}

beforeEach(() => {
  seen.filters = [];
  seen.pipelines = [];
  statsRow = { _id: null, total: 181, active: 74, completionSum: 5792, experienced: 31 };
});

describe("GET /api/super-agent/job-seekers — row fields", () => {
  it("reads each column from the field the model actually has", async () => {
    const data = await get();
    const row = data.items[0];

    expect(row.currentJobTitle).toBe("Senior Welder");
    expect(row.experienceYears).toBe(7);
    expect(row.profileCompletion).toBe(82);
    expect(row.location).toBe("Muscat");
  });

  it("falls back to the headline when no experience entry is current", async () => {
    const original = SEEKER.experience;
    SEEKER.experience = [{ jobTitle: "Welder", company: "Prior Co", isCurrent: false }];
    try {
      const data = await get();
      expect(data.items[0].currentJobTitle).toBe("Site supervisor");
    } finally {
      SEEKER.experience = original;
    }
  });

  it("falls back to the last role held when there is no headline either", async () => {
    const experience = SEEKER.experience;
    const headline = SEEKER.headline;
    SEEKER.experience = [{ jobTitle: "Welder", company: "Prior Co", isCurrent: false }];
    SEEKER.headline = "";
    try {
      const data = await get();
      expect(data.items[0].currentJobTitle).toBe("Welder");
    } finally {
      SEEKER.experience = experience;
      SEEKER.headline = headline;
    }
  });

  it("does not ship a phone number the directory never renders", async () => {
    const data = await get();
    expect(data.items[0].phone).toBeUndefined();
  });
});

describe("GET /api/super-agent/job-seekers — filters", () => {
  it("filters minimum experience on totalExperienceYears", async () => {
    await get("?experienceMin=3");
    expect(clauses(seen.filters[0])).toContainEqual({ totalExperienceYears: { $gte: 3 } });
  });

  /* "Fresh (0 yrs)" sends experienceMin=0, which as a `$gte` matched every
     profile that had the field and none of the older ones that do not. */
  it("reads the fresher option as under a year, profiles with no figure included", async () => {
    await get("?experienceMin=0");
    expect(clauses(seen.filters[0])).toContainEqual({ totalExperienceYears: { $not: { $gte: 1 } } });
  });

  it("filters immediate availability on availabilityStatus", async () => {
    await get("?availability=immediate");
    expect(clauses(seen.filters[0])).toContainEqual({ availabilityStatus: "immediately" });
  });

  it("treats a notice period as either of the two notice states", async () => {
    await get("?availability=notice_period");
    expect(clauses(seen.filters[0])).toContainEqual({
      availabilityStatus: { $in: ["within_month", "within_3_months"] },
    });
  });

  it("ignores an availability value that is not one of the three options", async () => {
    await get("?availability=whenever");
    expect(clauses(seen.filters[0]).some((c) => "availabilityStatus" in c)).toBe(false);
  });
});

/* The country dropdown was built from `distinct("country")`, a field no
   profile fills, so it only ever offered "All countries" — and the filter
   behind it queried that same empty field. */
describe("GET /api/super-agent/job-seekers — country", () => {
  it("offers the countries named in the profiles' own location text", async () => {
    const data = await get() as unknown as { countries: string[] };
    expect(data.countries).toEqual(["India", "Saudi Arabia", "United Arab Emirates"]);
  });

  it("matches the location text, not just the legacy country field", async () => {
    await get(`?country=${encodeURIComponent("United Arab Emirates")}`);
    const branches = ((seen.filters[0] as { $and: Array<{ $or?: Array<Record<string, { $regex?: string }>> }> }).$and ?? [])
      .flatMap((c) => c.$or ?? [])
      .filter((b) => "currentLocation" in b || "country" in b);

    expect(branches.map((b) => Object.keys(b)[0]).sort()).toEqual(["country", "currentLocation"]);
    const pattern = branches.find((b) => "currentLocation" in b)!.currentLocation.$regex!;
    expect(new RegExp(pattern, "i").test("Dubai, UAE")).toBe(true);
    expect(new RegExp(pattern, "i").test("Riyadh, Saudi Arabia")).toBe(false);
  });
});

describe("GET /api/super-agent/job-seekers — header figures", () => {
  it("counts the whole scope, not the page the reader is on", async () => {
    const data = await get();

    expect(data.items).toHaveLength(1);
    expect(data.stats.total).toBe(181);
    expect(data.stats.active).toBe(74);
    expect(data.stats.withExperience).toBe(31);
    expect(data.stats.avgCompletion).toBe(32); // 5792 / 181
  });

  it("takes the figures from a pipeline carrying the same scope as the list", async () => {
    await get("?experienceMin=3");
    const match = (seen.pipelines[0]?.[0] as { $match?: unknown })?.$match;
    expect(clauses(match)).toContainEqual({ totalExperienceYears: { $gte: 3 } });
  });

  it("reports zeroes rather than NaN when the scope is empty", async () => {
    statsRow = undefined;
    const data = await get();
    expect(data.stats).toEqual({ total: 181, active: 0, avgCompletion: 0, withExperience: 0 });
  });
});
