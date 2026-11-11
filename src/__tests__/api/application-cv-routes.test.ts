/**
 * @jest-environment node
 *
 * The employer's "View CV" / "Download CV" for an applicant is the CV sent
 * with that application. Both routes used to serve the seeker's Profile CV
 * instead: a different file from the one the seeker chose (and the one the
 * application was scored on), and "not found" for an applicant whose CV was
 * an uploaded resume or the one built on Mployedin.
 */
import { NextRequest } from "next/server";

const APP = "650000000000000000000310";
const EMP = "650000000000000000000320";
const SEEKER = "650000000000000000000330";
const SEEKER_USER = "650000000000000000000331";
const EMP_USER = "650000000000000000000321";

let ctx: { userId: string; role: string; locale: string };
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (h: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    (req: NextRequest, params: Record<string, string>) =>
      h(req, ctx, params),
}));
jest.mock("@/lib/db/mongoose", () => {
  const connectDB = jest.fn().mockResolvedValue(undefined);
  return { __esModule: true, default: connectDB, connectDB };
});

function chain<T>(result: T) {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.lean = async () => result;
  return c;
}

let application: Record<string, unknown> | null;
const appFindOne = jest.fn();
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    findById: () => chain(application),
    findOne: (filter: unknown) => appFindOne(filter),
    exists: jest.fn().mockResolvedValue({ _id: "x" }),
  },
}));
let seeker: Record<string, unknown>;
const seekerUpdateOne = jest.fn();
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findById: () => chain(seeker), findOne: () => chain(seeker), updateOne: (...a: unknown[]) => seekerUpdateOne(...a) },
}));
jest.mock("@/models/Employer", () => {
  const Employer = { findOne: () => chain({ _id: "650000000000000000000320" }) };
  return { __esModule: true, default: Employer, Employer };
});
jest.mock("@/models/TalentPool", () => ({ __esModule: true, default: { exists: jest.fn().mockResolvedValue(null) } }));
jest.mock("@/lib/jobSeeker/staffAccess", () => ({ canStaffAccessSeeker: jest.fn().mockResolvedValue(true) }));
jest.mock("@/lib/security/documentAccess", () => ({
  classifyDocumentTier: () => "standard",
  canAccessApplicationDocument: jest.fn().mockResolvedValue(true),
}));
const downloadBuffer = jest.fn(async (_url: string) => Buffer.from("%PDF-1.4"));
jest.mock("@/lib/storage/spaces", () => ({
  getPresignedUrl: jest.fn(async (key: string) => `https://signed.example/${encodeURIComponent(key)}`),
  urlToKey: (url: string) => url,
  // Our storage in this test; anything else is a link to another site.
  isStoredFileUrl: (url: string) => url.startsWith("https://cdn/"),
  downloadBuffer: (url: string) => downloadBuffer(url),
}));

const PROFILE_CV = "https://cdn/cvs/profile.pdf";
const SENT_CV = "https://cdn/documents/sent-with-application.pdf";
const sentDocuments = [
  { name: "Portfolio", url: "https://behance.net/sara", type: "portfolio" },
  { name: "Tailored CV.pdf", url: SENT_CV, type: "resume" },
];

beforeEach(() => {
  jest.clearAllMocks();
  ctx = { userId: EMP_USER, role: "employer", locale: "en" };
  seeker = { _id: SEEKER, userId: SEEKER_USER, cv: { originalUrl: PROFILE_CV }, documents: [] };
  application = { _id: APP, jobSeekerId: SEEKER, employerId: EMP, status: "applied", documents: sentDocuments };
  appFindOne.mockImplementation(() => chain(application));
  seekerUpdateOne.mockResolvedValue({});
});

describe("GET /api/applications/[id]/documents/download?cv=1", () => {
  const download = async () => {
    const { GET } = await import("@/app/api/applications/[id]/documents/download/route");
    return (GET as unknown as (req: NextRequest, params: Record<string, string>) => Promise<Response>)(
      new NextRequest(`http://localhost/api/applications/${APP}/documents/download?cv=1`),
      { id: APP },
    );
  };

  it("is the resume sent with the application, not the Profile CV", async () => {
    const res = await download();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`https://signed.example/${encodeURIComponent(SENT_CV)}`);
  });

  it("serves it for an applicant who has no Profile CV at all", async () => {
    seeker.cv = undefined;
    const res = await download();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain(encodeURIComponent(SENT_CV));
  });

  it("falls back to the Profile CV only for an application sent with none", async () => {
    application!.documents = [];
    const res = await download();
    expect(res.headers.get("location")).toBe(`https://signed.example/${encodeURIComponent(PROFILE_CV)}`);
  });

  it("still serves the CV when the download counter cannot be written", async () => {
    // A seeker with no Profile CV can have `cv` stored as null: $inc fails on it.
    seeker.cv = null;
    seekerUpdateOne.mockRejectedValueOnce(new Error("Cannot create field 'downloadCount' in element {cv: null}"));
    const res = await download();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain(encodeURIComponent(SENT_CV));
    // Counted all the same, by replacing the null.
    expect(seekerUpdateOne).toHaveBeenLastCalledWith({ _id: SEEKER, cv: null }, { $set: { cv: { downloadCount: 1 } } });
  });

  it("never serves a typed link as the CV: a resume that is a link to another site is skipped", async () => {
    // Added from the seeker's application page, where a document is a name and a link.
    application!.documents = [{ name: "My CV on Drive", url: "https://drive.example.com/file/abc", type: "resume" }];
    const res = await download();
    expect(res.headers.get("location")).toBe(`https://signed.example/${encodeURIComponent(PROFILE_CV)}`);
  });

  it("is not found when neither exists", async () => {
    application!.documents = [];
    seeker.cv = undefined;
    expect((await download()).status).toBe(404);
  });
});

describe("GET /api/employers/candidates/[id]/cv", () => {
  const stream = async (query = "") => {
    const { GET } = await import("@/app/api/employers/candidates/[id]/cv/route");
    return (GET as unknown as (req: NextRequest, params: Record<string, string>) => Promise<Response>)(
      new NextRequest(`http://localhost/api/employers/candidates/${SEEKER}/cv${query}`),
      { id: SEEKER },
    );
  };

  it("streams the CV sent with the named application", async () => {
    const res = await stream(`?applicationId=${APP}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe("inline");
    expect(downloadBuffer).toHaveBeenCalledWith(SENT_CV);
  });

  it("looks the application up as this seeker's and this employer's own", async () => {
    await stream(`?applicationId=${APP}`);
    expect(appFindOne).toHaveBeenCalledWith({ _id: APP, jobSeekerId: SEEKER, employerId: EMP });
  });

  it("serves nothing for an application that is not theirs", async () => {
    appFindOne.mockImplementation(() => chain(null));
    const res = await stream(`?applicationId=${APP}`);
    expect(res.status).toBe(404);
    expect(downloadBuffer).not.toHaveBeenCalled();
  });

  it("falls back to the Profile CV for an application sent with none", async () => {
    application!.documents = [];
    await stream(`?applicationId=${APP}`);
    expect(downloadBuffer).toHaveBeenCalledWith(PROFILE_CV);
  });

  it("does not stream a typed link: it falls back to the Profile CV", async () => {
    application!.documents = [{ name: "My CV on Drive", url: "https://drive.example.com/file/abc", type: "resume" }];
    await stream(`?applicationId=${APP}`);
    expect(downloadBuffer).toHaveBeenCalledWith(PROFILE_CV);
    expect(downloadBuffer).not.toHaveBeenCalledWith("https://drive.example.com/file/abc");
  });

  it("rejects a malformed application id", async () => {
    expect((await stream("?applicationId=not-an-id")).status).toBe(400);
    expect(downloadBuffer).not.toHaveBeenCalled();
  });

  it("is still the seeker's own CV where there is no application (talent pool)", async () => {
    await stream();
    expect(appFindOne).not.toHaveBeenCalled();
    expect(downloadBuffer).toHaveBeenCalledWith(PROFILE_CV);
  });

  it("gives staff the seeker's CV, never an application's, whatever the query says", async () => {
    ctx = { userId: "650000000000000000000399", role: "agent", locale: "en" };
    await stream(`?applicationId=${APP}`);
    expect(appFindOne).not.toHaveBeenCalled();
    expect(downloadBuffer).toHaveBeenCalledWith(PROFILE_CV);
  });
});

describe("employer candidates list — which CV a row opens", () => {
  it("opens the CV sent with the application the row came from", async () => {
    const { candidateCvHref, candidateHasCv } = await import("@/lib/applications/candidateCv");
    const row = { _id: SEEKER, cv: { originalUrl: PROFILE_CV }, applicationCv: { applicationId: APP, extension: "pdf" } };
    expect(candidateHasCv(row)).toBe(true);
    expect(candidateCvHref(row)).toBe(`/api/employers/candidates/${SEEKER}/cv?applicationId=${APP}#cv.pdf`);
  });

  it("shows a CV for an applicant with no Profile CV", async () => {
    const { candidateCvHref, candidateHasCv } = await import("@/lib/applications/candidateCv");
    const row = { _id: SEEKER, applicationCv: { applicationId: APP, extension: "docx" } };
    expect(candidateHasCv(row)).toBe(true);
    expect(candidateCvHref(row)).toContain("#cv.docx");
  });

  it("uses the Profile CV for a talent-pool row, and none when there is none", async () => {
    const { candidateCvHref, candidateHasCv } = await import("@/lib/applications/candidateCv");
    expect(candidateCvHref({ _id: SEEKER, cv: { originalUrl: "https://cdn/cvs/a.PDF?sig=1" } })).toBe(`/api/employers/candidates/${SEEKER}/cv#cv.pdf`);
    expect(candidateHasCv({ _id: SEEKER })).toBe(false);
    expect(candidateCvHref({ _id: SEEKER })).toBeNull();
  });
});
