/**
 * @jest-environment node
 */
/**
 * A talent row says whether the Standardised CV can be drawn (hasBuiltCvContent),
 * as a yes/no: "View CV" needs it, and the profile text behind it stays on the server.
 */
import { NextRequest } from "next/server";

const docs = [
  { _id: "a1", fullName: "Has Summary", summary: "Ten years of retail", experience: [], skills: [], education: [] },
  { _id: "a2", fullName: "Has Skills", experience: [], skills: ["React"], education: [] },
  { _id: "a3", fullName: "Languages Only", experience: [], skills: [], education: [], languages: [{ name: "Arabic" }] },
  { _id: "a4", fullName: "Hid Skills", experience: [], skills: ["React"], education: [], sectionVisibility: { skills: false } },
  // Hid it from the CV (cvDesign), not from the profile: still not a reason to offer a CV.
  { _id: "a5", fullName: "Hid Skills On CV", experience: [], skills: ["React"], education: [], cvDesign: { hiddenSections: ["skills"] } },
  { _id: "a6", fullName: "Hid Skills On CV, Has Summary", summary: "Retail", experience: [], skills: ["React"], education: [], cvDesign: { hiddenSections: ["skills"] } },
];

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => async (req: NextRequest) => handler(req, (req as unknown as { __ctx: unknown }).__ctx),
}));
const selectMock = jest.fn();
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => ({
      select: (fields: string) => {
        selectMock(fields);
        return {
          populate: () => ({ sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => docs }) }) }) }),
        };
      },
    })),
    countDocuments: jest.fn(async () => 6),
  },
}));
jest.mock("@/models/User", () => ({ __esModule: true, default: {} }));
// The access answer has its own suite (talent-search-cv-accessible).
jest.mock("@/lib/cv/cvAccess", () => ({
  resolveCvActor: jest.fn().mockResolvedValue({ employerId: "e1", canViewSeeker: null }),
  employerAccessibleSeekerIds: jest.fn().mockResolvedValue(new Set()),
}));

import { GET as _GET } from "@/app/api/employer/talent-search/route";

const GET = _GET as unknown as (req: NextRequest) => Promise<Response>;

async function rows() {
  const req = new NextRequest("http://localhost:3000/api/employer/talent-search");
  (req as unknown as { __ctx: unknown }).__ctx = { userId: "u1", role: "employer", locale: "en" };
  const body = await (await GET(req)).json();
  return body.items as Array<Record<string, unknown>>;
}

describe("GET /api/employer/talent-search canBuildCv", () => {
  it("is true for a summary or skills, false for languages only or a hidden section", async () => {
    const items = await rows();
    expect(items.map((i) => i.canBuildCv)).toEqual([true, true, false, false, false, true]);
  });

  it("reads the sections the candidate hid on the CV (cvDesign), to decide, without returning them", async () => {
    const items = await rows();
    expect(selectMock.mock.calls.at(-1)?.[0]).toMatch(/cvDesign\.hiddenSections/);
    for (const item of items) expect(item).not.toHaveProperty("cvDesign");
  });

  it("reads education and summary to decide, without returning them or any CV path", async () => {
    const items = await rows();
    expect(selectMock.mock.calls[0][0]).toMatch(/\beducation\b.*\bsummary\b/);
    for (const item of items) {
      expect(item).not.toHaveProperty("summary");
      expect(item).not.toHaveProperty("education");
      expect(item).not.toHaveProperty("cv");
    }
  });
});
