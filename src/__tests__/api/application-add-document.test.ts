/**
 * @jest-environment node
 *
 * A seeker can add a document to their application by typing a link. A link to
 * another site is theirs to give; the address of a file in OUR storage is not,
 * unless it is one of their own files — the download routes sign or stream
 * whatever an application lists, so a stored address the seeker came by could
 * otherwise be attached and handed back to them (or shown to the employer as
 * their "resume").
 */
import { NextRequest } from "next/server";

const APP = "650000000000000000000410";
const SEEKER = "650000000000000000000430";
const SEEKER_USER = "650000000000000000000431";

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (h: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    (req: NextRequest) =>
      h(req, { userId: SEEKER_USER, role: "job_seeker", locale: "en" }, { id: APP }),
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: jest.fn(() => ({})) }));
jest.mock("@/lib/applications/staffScope", () => ({ verifyApplicationReadAccess: jest.fn().mockResolvedValue(true) }));
jest.mock("@/lib/storage/spaces", () => ({
  isStoredFileUrl: (url: string) => url.startsWith("https://cdn.mployedin.test/"),
}));

const save = jest.fn().mockResolvedValue(undefined);
let application: { jobSeekerId: string; status: string; documents: { name: string; url: string; type: string }[]; save: jest.Mock };
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { findById: jest.fn(async () => application) },
}));
let seeker: Record<string, unknown>;
let claimMatches: number;
const seekerUpdateOne = jest.fn(async () => ({ matchedCount: claimMatches }));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOne: () => ({ select: () => ({ lean: async () => seeker }) }),
    updateOne: (...a: unknown[]) => seekerUpdateOne(...(a as [])),
  },
}));

const OWN_FILE = "https://cdn.mployedin.test/documents/my-own.pdf";
const OTHER_FILE = "https://cdn.mployedin.test/documents/someone-elses-passport.pdf";

beforeEach(() => {
  jest.clearAllMocks();
  application = { jobSeekerId: SEEKER, status: "applied", documents: [], save };
  seeker = { _id: SEEKER, cv: { originalUrl: "https://cdn.mployedin.test/cvs/profile.pdf" }, documents: [{ url: OWN_FILE }] };
  claimMatches = 1;
});

const add = async (document: { name: string; url: string; type: string }) => {
  const { POST } = await import("@/app/api/applications/[id]/documents/route");
  return (POST as unknown as (req: NextRequest) => Promise<Response>)(
    new NextRequest(`http://localhost/api/applications/${APP}/documents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(document),
    }),
  );
};

describe("POST /api/applications/[id]/documents", () => {
  it("refuses the address of a stored file that is not the seeker's own", async () => {
    const res = await add({ name: "My resume", url: OTHER_FILE, type: "resume" });
    expect(res.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
    expect(application.documents).toEqual([]);
  });

  it("refuses it whatever type it is declared as", async () => {
    expect((await add({ name: "Other", url: OTHER_FILE, type: "other" })).status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });

  it("takes one of the seeker's own stored files", async () => {
    const res = await add({ name: "My resume", url: OWN_FILE, type: "resume" });
    expect(res.status).toBeLessThan(300);
    expect(application.documents).toEqual([{ name: "My resume", url: OWN_FILE, type: "resume" }]);
  });

  it("takes the seeker's Profile CV", async () => {
    expect((await add({ name: "CV", url: "https://cdn.mployedin.test/cvs/profile.pdf", type: "resume" })).status).toBeLessThan(300);
  });

  it("refuses one of the seeker's files removed in another tab meanwhile", async () => {
    claimMatches = 0;
    const res = await add({ name: "My resume", url: OWN_FILE, type: "resume" });
    expect(res.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });

  it("still takes a link to another site", async () => {
    const res = await add({ name: "Portfolio", url: "https://behance.net/sara", type: "portfolio" });
    expect(res.status).toBeLessThan(300);
    expect(save).toHaveBeenCalledTimes(1);
    // Not a file of ours: nothing to hold.
    expect(seekerUpdateOne).not.toHaveBeenCalled();
  });
});
