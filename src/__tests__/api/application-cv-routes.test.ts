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
import { computeEffectivePermissions } from "@/lib/permissions/companyRoles";

const APP = "650000000000000000000310";
const EMP = "650000000000000000000320";
const SEEKER = "650000000000000000000330";
const SEEKER_USER = "650000000000000000000331";
const EMP_USER = "650000000000000000000321";

let ctx: { userId: string; role: string; locale: string; member?: unknown };
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
jest.mock("@/lib/jobSeeker/staffAccess", () => ({
  canStaffAccessSeeker: jest.fn().mockResolvedValue(true),
  // The per-actor half the CV gate resolves once: staff may open anyone here.
  resolveStaffSeekerAccess: jest.fn().mockResolvedValue(async () => true),
}));
// The Mployedin-CV view reads the account's name, email and phone.
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { findById: () => chain({ name: "Sara Ali", email: "sara@example.com", phone: "+971500000000" }) },
}));
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

  describe("X-Mployedin-Cv-Built: the file is the Mployedin-built PDF sent with the application", () => {
    const BUILT_NAME = "Sara Ali - Mployedin CV.pdf";

    it("is set when the application was sent with the CV built on Mployedin", async () => {
      application!.documents = [{ name: BUILT_NAME, url: SENT_CV, type: "resume" }];
      const res = await stream(`?applicationId=${APP}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("x-mployedin-cv-built")).toBe("1");
    });

    it("is absent for an uploaded resume sent with the application", async () => {
      const res = await stream(`?applicationId=${APP}`);
      expect(res.status).toBe(200);
      expect(res.headers.has("x-mployedin-cv-built")).toBe(false);
    });

    it("is absent where the served file is the seeker's stored built copy but no application applies", async () => {
      seeker = { ...seeker, documents: [{ category: "resume", url: PROFILE_CV, builtHash: "abc" }] };
      const res = await stream();
      expect(res.status).toBe(200);
      expect(res.headers.has("x-mployedin-cv-built")).toBe(false);
    });

    it("is absent for staff, who never get an application's CV, even when the profile file is a built copy", async () => {
      ctx = { userId: "650000000000000000000399", role: "agent", locale: "en" };
      seeker = { ...seeker, documents: [{ category: "resume", url: PROFILE_CV, builtHash: "abc" }] };
      application!.documents = [{ name: BUILT_NAME, url: SENT_CV, type: "resume" }];
      const res = await stream(`?applicationId=${APP}`);
      expect(res.status).toBe(200);
      expect(res.headers.has("x-mployedin-cv-built")).toBe(false);
    });

    it("is absent on the standardised (?kind=built) JSON answer", async () => {
      application!.documents = [{ name: BUILT_NAME, url: SENT_CV, type: "resume" }];
      const res = await stream(`?kind=built&applicationId=${APP}`);
      expect(res.status).toBe(200);
      expect(res.headers.has("x-mployedin-cv-built")).toBe(false);
    });
  });

  describe("the seeker's CV download counter: actual downloads and exports (download=1), never viewer opens", () => {
    it("does not count the viewer's preview fetch (no download flag), with or without an application", async () => {
      const withApp = await stream(`?applicationId=${APP}`);
      const noApp = await stream();
      expect(withApp.status).toBe(200);
      expect(noApp.status).toBe(200);
      expect(seekerUpdateOne).not.toHaveBeenCalled();
    });

    it("counts one download=1 by an employer, once", async () => {
      const res = await stream(`?applicationId=${APP}&download=1`);
      expect(res.status).toBe(200);
      expect(seekerUpdateOne).toHaveBeenCalledTimes(1);
      expect(seekerUpdateOne).toHaveBeenCalledWith({ _id: SEEKER }, { $inc: { "cv.downloadCount": 1 } });
    });

    it("counts a talent-pool download too (no application): it is a real download", async () => {
      const res = await stream("?download=1");
      expect(res.status).toBe(200);
      expect(seekerUpdateOne).toHaveBeenCalledTimes(1);
    });

    it("only the exact flag counts: download=0 or download=true is not a download", async () => {
      await stream(`?applicationId=${APP}&download=0`);
      await stream(`?applicationId=${APP}&download=true`);
      await stream(`?applicationId=${APP}&download=`);
      expect(seekerUpdateOne).not.toHaveBeenCalled();
    });

    it("still serves the CV when the counter cannot be written, replacing a null cv like the old route did", async () => {
      seekerUpdateOne.mockRejectedValueOnce(new Error("Cannot create field 'downloadCount' in element {cv: null}"));
      const res = await stream(`?applicationId=${APP}&download=1`);
      expect(res.status).toBe(200);
      expect(seekerUpdateOne).toHaveBeenLastCalledWith({ _id: SEEKER, cv: null }, { $set: { cv: { downloadCount: 1 } } });
    });

    it("does not count the Standardised (?kind=built) answer, flag or not", async () => {
      await stream(`?kind=built&applicationId=${APP}&download=1`);
      await stream(`?kind=built&download=1`);
      expect(seekerUpdateOne).not.toHaveBeenCalled();
    });

    it("does not count staff or the seeker looking at their own CV, even with the flag", async () => {
      ctx = { userId: "650000000000000000000399", role: "agent", locale: "en" };
      await stream(`?applicationId=${APP}&download=1`);
      ctx = { userId: "650000000000000000000398", role: "admin", locale: "en" };
      await stream(`?applicationId=${APP}&download=1`);
      ctx = { userId: SEEKER_USER, role: "job_seeker", locale: "en" };
      await stream(`?applicationId=${APP}&download=1`);
      expect(seekerUpdateOne).not.toHaveBeenCalled();
    });

    it("does not count when no file could be served (storage down, or no CV on file)", async () => {
      downloadBuffer.mockRejectedValueOnce(new Error("storage down"));
      const failed = await stream(`?applicationId=${APP}&download=1`);
      expect(failed.status).toBe(502);
      seeker = { ...seeker, cv: null };
      application = { ...application, documents: [] };
      const none = await stream("?download=1");
      expect(none.status).toBe(404);
      expect(seekerUpdateOne).not.toHaveBeenCalled();
    });
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

  describe("a colleague with the applicant-review function only (the default hiring_manager role)", () => {
    // userId is already the owner's, as withAuth swaps it in for a colleague.
    const asColleague = (permissions = computeEffectivePermissions(["hiring_manager"])) => {
      ctx = {
        ...ctx,
        member: { actorId: "650000000000000000000399", companyId: EMP, companyRoles: ["hiring_manager"], permissions, jobAccess: [] },
      };
    };

    it("opens the CV sent with an application of their company", async () => {
      asColleague();
      const res = await stream(`?applicationId=${APP}`);
      expect(res.status).toBe(200);
      expect(downloadBuffer).toHaveBeenCalledWith(SENT_CV);
    });

    it("is refused an application that is not their company's (404, nothing streamed)", async () => {
      asColleague();
      appFindOne.mockImplementation(() => chain(null));
      expect((await stream(`?applicationId=${APP}`)).status).toBe(404);
      expect(downloadBuffer).not.toHaveBeenCalled();
    });

    it("is refused the talent-pool view of the same CV (no applicationId): 403, nothing read", async () => {
      asColleague();
      expect((await stream("")).status).toBe(403);
      expect(downloadBuffer).not.toHaveBeenCalled();
    });

    it("gets the standardised view only through an application of their company, which is looked up", async () => {
      asColleague();
      seeker = { ...seeker, summary: "Ten years on site.", skills: ["Welding"] };
      expect((await stream("?kind=built")).status).toBe(403);
      appFindOne.mockImplementation(() => chain(null));
      expect((await stream(`?kind=built&applicationId=${APP}`)).status).toBe(404);
      appFindOne.mockImplementation(() => chain(application));
      expect((await stream(`?kind=built&applicationId=${APP}`)).status).toBe(200);
    });

    it("a colleague who also manages talent pools keeps the talent-pool view", async () => {
      asColleague(computeEffectivePermissions(["hiring_manager"], { canManageTalentPools: true }));
      expect((await stream("")).status).toBe(200);
      expect(downloadBuffer).toHaveBeenCalledWith(PROFILE_CV);
    });
  });

  describe("?kind=built", () => {
    it("ignores an applicationId: another employer's id still returns the built CV, with no application lookup", async () => {
      // Nothing is found for this application, as for one sent to someone else.
      appFindOne.mockImplementation(() => chain(null));
      seeker = { ...seeker, summary: "Ten years on site.", skills: ["Welding"] };
      const res = await stream(`?kind=built&applicationId=${APP}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      const body = await res.json();
      expect(body).toMatchObject({
        hasContent: true,
        identity: { fullName: "Sara Ali", email: "sara@example.com", phone: "+971500000000" },
        profile: { summary: "Ten years on site.", skills: ["Welding"] },
      });
      expect(body.profile.userId).toBeUndefined();
      expect(appFindOne).not.toHaveBeenCalled();
      expect(downloadBuffer).not.toHaveBeenCalled();
    });

    it("still rejects a malformed applicationId before anything is read", async () => {
      expect((await stream("?kind=built&applicationId=not-an-id")).status).toBe(400);
    });

    it("says there is nothing to build a CV from when the profile is empty", async () => {
      const res = await stream("?kind=built");
      expect((await res.json()).hasContent).toBe(false);
    });
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

  it("a row with only a profile to build from still has View CV, on the candidate route; the Original link stays absent", async () => {
    const { candidateCvHref, candidateHasCv, candidateViewCvHref } = await import("@/lib/applications/candidateCv");
    const row = { _id: SEEKER, canBuildCv: true };
    expect(candidateHasCv(row)).toBe(true);
    expect(candidateViewCvHref(row)).toBe(`/api/employers/candidates/${SEEKER}/cv#cv.pdf`);
    expect(candidateCvHref(row)).toBeNull();
    // A file or an application CV still wins for the viewer's URL.
    expect(candidateViewCvHref({ ...row, cv: { originalUrl: "https://cdn/a.docx" } })).toContain("#cv.docx");
    expect(candidateViewCvHref({ _id: SEEKER })).toBeNull();
  });
  describe("cvAccessible: View CV only where the CV route would serve the seeker", () => {
    it("a row the viewer cannot open (cvAccessible false) has no View CV and no Original link, whatever it carries", async () => {
      const { candidateCvHref, candidateHasCv, candidateViewCvHref } = await import("@/lib/applications/candidateCv");
      const row = { _id: SEEKER, canBuildCv: true, cv: { originalUrl: PROFILE_CV }, cvAccessible: false };
      expect(candidateHasCv(row)).toBe(false);
      expect(candidateViewCvHref(row)).toBeNull();
      expect(candidateCvHref(row)).toBeNull();
    });

    it("an unset or true cvAccessible changes nothing (application rows never carry it)", async () => {
      const { candidateHasCv, candidateViewCvHref } = await import("@/lib/applications/candidateCv");
      expect(candidateHasCv({ _id: SEEKER, canBuildCv: true })).toBe(true);
      expect(candidateHasCv({ _id: SEEKER, canBuildCv: true, cvAccessible: true })).toBe(true);
      expect(candidateViewCvHref({ _id: SEEKER, canBuildCv: true, cvAccessible: true })).toBe(`/api/employers/candidates/${SEEKER}/cv#cv.pdf`);
    });

    it("an accessible row with neither a file nor a buildable profile still has nothing", async () => {
      const { candidateHasCv } = await import("@/lib/applications/candidateCv");
      expect(candidateHasCv({ _id: SEEKER, cvAccessible: true })).toBe(false);
    });

    it("a colleague with the applicant-review function only keeps View CV on application rows (it carries the application) and loses it on talent rows", async () => {
      const { forApplicationOnlyViewer, candidateHasCv } = await import("@/lib/applications/candidateCv");
      const applicationRow = { _id: SEEKER, canBuildCv: true, applicationCv: { applicationId: APP, extension: "pdf" } };
      const talentRow = { _id: SEEKER, canBuildCv: true, cvAccessible: true };
      expect(candidateHasCv(forApplicationOnlyViewer(applicationRow))).toBe(true);
      expect(candidateHasCv(forApplicationOnlyViewer(talentRow))).toBe(false);
    });
  });

  it("the Original link is a download: it carries download=1 (View CV, the preview, never does)", async () => {
    const { candidateOriginalDownloadHref, candidateViewCvHref } = await import("@/lib/applications/candidateCv");
    const row = { _id: SEEKER, applicationCv: { applicationId: APP, extension: "pdf" } };
    expect(candidateOriginalDownloadHref(row)).toBe(`/api/employers/candidates/${SEEKER}/cv?applicationId=${APP}&download=1#cv.pdf`);
    expect(candidateOriginalDownloadHref({ _id: SEEKER, cv: { originalUrl: PROFILE_CV } })).toBe(`/api/employers/candidates/${SEEKER}/cv?download=1#cv.pdf`);
    expect(candidateOriginalDownloadHref({ _id: SEEKER })).toBeNull();
    expect(candidateViewCvHref(row)).not.toContain("download");
  });
});
