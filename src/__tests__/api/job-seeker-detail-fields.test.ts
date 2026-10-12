/**
 * @jest-environment node
 */
/**
 * GET /api/job-seekers/[id] returned the whole JobSeeker document, including
 * `cv.rawText` (the full text extracted from the CV) and `cv.atsReport` — to any
 * staff member allowed to view the seeker, region-only agents included. No
 * screen reads either field from this route; they now stay in the database.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => async (req: NextRequest, params?: Record<string, string>) =>
    handler(req, (req as unknown as { __ctx: unknown }).__ctx, params ?? {}),
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn() }));
jest.mock("@/lib/audit/log", () => ({ actorFromCtx: jest.fn(), logActivity: jest.fn() }));
jest.mock("@/lib/notifications/trigger", () => ({ notify: jest.fn() }));
jest.mock("@/lib/jobSeeker/staffAccess", () => ({ canStaffAccessSeeker: jest.fn().mockResolvedValue(true) }));
jest.mock("@/models/User", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/ProfileView", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/Employer", () => ({ __esModule: true, default: {} }));

const SEEKER_ID = "64b0000000000000000000d1";
const STORED = {
  _id: SEEKER_ID,
  fullName: "Asha Rao",
  userId: { _id: "u1", name: "Asha Rao", email: "asha@example.test" },
  cv: { fileUrl: "cv/asha.pdf", rawText: "ASHA RAO — full CV text …", atsScore: 71, atsReport: { gaps: ["sql"] } },
};

/** Applies `.select("-a.b -c")` exclusions the way MongoDB would. */
function project(doc: Record<string, unknown>, fields: string) {
  const out = structuredClone(doc);
  for (const f of fields.split(/\s+/).filter((x) => x.startsWith("-"))) {
    const parts = f.slice(1).split(".");
    let node = out as Record<string, unknown>;
    for (const p of parts.slice(0, -1)) node = (node?.[p] ?? {}) as Record<string, unknown>;
    delete node[parts[parts.length - 1]];
  }
  return out;
}
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findById: () => {
      let fields = "";
      const q: Record<string, unknown> = {};
      q.populate = () => q;
      q.select = (f: string) => { fields = f; return q; };
      q.lean = async () => project(STORED, fields);
      return q;
    },
  },
}));

import { GET } from "@/app/api/job-seekers/[id]/route";

it("returns the profile without the extracted CV text or the ATS report", async () => {
  const req = new NextRequest(`http://t/api/job-seekers/${SEEKER_ID}`);
  (req as unknown as { __ctx: unknown }).__ctx = { userId: "admin-1", role: "admin", locale: "en" };
  const res = await (GET as unknown as (r: NextRequest, p: Record<string, string>) => Promise<Response>)(req, { id: SEEKER_ID });
  const { jobSeeker } = await res.json();

  expect(res.status).toBe(200);
  expect(jobSeeker.fullName).toBe("Asha Rao");
  expect(jobSeeker.cv.fileUrl).toBe("cv/asha.pdf");
  expect(jobSeeker.cv.atsScore).toBe(71);
  expect(jobSeeker.cv).not.toHaveProperty("rawText");
  expect(jobSeeker.cv).not.toHaveProperty("atsReport");
});
