/**
 * @jest-environment node
 */
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn() }));

const jobCount = jest.fn();
const jobAggregate = jest.fn();
const jobDistinct = jest.fn();
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    countDocuments: (...a: unknown[]) => jobCount(...a),
    aggregate: (...a: unknown[]) => jobAggregate(...a),
    distinct: (...a: unknown[]) => jobDistinct(...a),
  },
}));
const employerCount = jest.fn();
jest.mock("@/models/Employer", () => ({ __esModule: true, default: { countDocuments: (...a: unknown[]) => employerCount(...a) } }));
const placementCount = jest.fn();
jest.mock("@/models/Placement", () => ({ __esModule: true, default: { countDocuments: (...a: unknown[]) => placementCount(...a) } }));

const countryFind = jest.fn();
jest.mock("@/models/Country", () => ({
  __esModule: true,
  default: { find: () => ({ select: () => ({ lean: async () => countryFind() }) }) },
}));

import { getLandingStats } from "@/lib/public/landingStats";

describe("getLandingStats", () => {
  it("merges the spellings of a country, names it from the master list, skips states, and counts verified hiring employers", async () => {
    jobCount.mockImplementation(async (filter: Record<string, unknown>) => (filter["location.isRemote"] ? 7 : 100));
    jobAggregate.mockResolvedValue([
      { _id: "IN", count: 30 },
      { _id: "India", count: 5 },
      { _id: "United Arab Emirates", count: 50 },
      { _id: "Oman (Muscat)", count: 3 },
      { _id: "Remote / Global", count: 9 },
      { _id: "Kerala", count: 4 },
      { _id: "", count: 2 },
    ]);
    countryFind.mockReturnValue([
      { name: "India", nameAr: "الهند", code: "IN" },
      { name: "United Arab Emirates", nameAr: "الإمارات", code: "AE" },
      { name: "Oman", nameAr: "عُمان", code: "OM" },
    ]);
    jobDistinct.mockResolvedValue(["e1", "e2", "e3"]);
    employerCount.mockResolvedValue(2);
    placementCount.mockResolvedValue(4);

    const stats = await getLandingStats();

    expect(stats).toMatchObject({ activeJobs: 100, remoteJobs: 7, verifiedEmployers: 2, placementsThisMonth: 4, countries: 3 });
    expect(stats.topCountries).toEqual([
      { name: "United Arab Emirates", nameAr: "الإمارات", count: 50 },
      { name: "India", nameAr: "الهند", count: 35 },
      { name: "Oman", nameAr: "عُمان", count: 3 },
    ]);
    expect(employerCount).toHaveBeenCalledWith(expect.objectContaining({ _id: { $in: ["e1", "e2", "e3"] } }));
  });

  it("serves the cached numbers for ten minutes instead of querying again", async () => {
    jobCount.mockClear();
    await getLandingStats();
    expect(jobCount).not.toHaveBeenCalled();
  });
});
