import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import type { AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import { isValidObjectId } from "@/lib/security/sanitize";
import { downloadBuffer } from "@/lib/storage/spaces";
import { guessMime } from "@/lib/storage/mime";
import { authorizeCvAccess, hasBuiltCvContent, type BuiltCvSource } from "@/lib/cv/cvAccess";
import { resolveOriginalCvSource } from "@/lib/cv/originalCvSource";
import User from "@/models/User";

/** What the Mployedin CV is drawn from: the profile, as the CV Builder saves it. */
const BUILT_CV_FIELDS =
  "userId fullName phone nationality currentLocation summary headline avatar socialLinks skills experience education languages certifications projects cvDesign";

/**
 * GET /api/employers/candidates/[id]/cv
 * GET /api/employers/candidates/[id]/cv?applicationId=<id>
 *
 * With `applicationId` it is the CV of that application — the resume sent
 * with it, else the Profile CV — so an employer reading an applicant sees the
 * file the seeker chose for that job. The application must be this seeker's
 * and, for an employer, one of their own. Without it (a talent-pool or staff
 * view, where there is no application) it is the seeker's own CV.
 *
 * Streams a candidate's CV inline through our own origin so the browser
 * renders it in the in-app viewer instead of downloading it. The stored
 * object lives on a cross-origin CDN that serves `Content-Disposition:
 * attachment`; proxying lets us force `inline` and avoids CSP frame-src /
 * CORS restrictions on the third-party domain.
 *
 * `&download=1` marks an actual download or export (not a viewer open): the only
 * request that counts toward the seeker's CV download statistic, and only when the
 * file is served in full. The Standardised CV (generated, not the uploaded file) is
 * never counted.
 *
 * GET /api/employers/candidates/[id]/cv?kind=built
 *
 * The details the Mployedin CV is drawn from (JSON), for the viewer's
 * "Mployedin CV" view. Same access rule as the file: it is the same person's
 * CV in another layout, so no one sees more than the file already shows.
 *
 * The [id] param is the JobSeeker _id. An employer may view a candidate's CV
 * only if that candidate applied to one of the employer's jobs or sits in one
 * of the employer's talent pools; admins may view any; a super agent or an
 * agent may view the CV of any seeker whose profile they may open (the same
 * canStaffAccessSeeker rule as /api/job-seekers/[id]); job seekers may view
 * their own CV.
 */
async function getHandler(
  req: NextRequest,
  ctx: AuthContext,
  params?: Record<string, string>,
) {
  const id = params?.id;
  if (!id || !isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid candidate ID" }, { status: 400 });
  }

  await connectDB();

  const applicationId = req.nextUrl.searchParams.get("applicationId");
  if (applicationId && !isValidObjectId(applicationId)) {
    return NextResponse.json({ error: "Invalid application ID" }, { status: 400 });
  }

  // The access rule lives in authorizeCvAccess (shared with the other CV
  // surfaces). The built-CV view has always ignored `applicationId`, so it is
  // not passed there.
  const built = req.nextUrl.searchParams.get("kind") === "built";

  // A colleague who may review applicants but not manage talent pools (the
  // default hiring_manager role) opens a CV only through an application of
  // their company: withAuth lets the request in on that promise, and here it is
  // kept — the application is required, and checked even for the built view,
  // which otherwise ignores it. Anyone else is unchanged.
  const applicationOnly = !!ctx.member && ctx.member.permissions.canManageTalentPools !== true;
  if (applicationOnly && !applicationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const access = await authorizeCvAccess(ctx, id, { applicationId: built && !applicationOnly ? null : applicationId });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { seeker } = access;

  if (built) {
    const profile = (await JobSeeker.findById(seeker._id ?? id).select(BUILT_CV_FIELDS).lean()) as
      | (BuiltCvSource & Record<string, unknown> & { userId?: unknown; phone?: string })
      | null;
    if (!profile) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    const user = (await User.findById(profile.userId).select("name email phone").lean()) as
      | { name?: string; email?: string; phone?: string }
      | null;
    const hasContent = hasBuiltCvContent(profile);
    const { userId: _userId, ...cvProfile } = profile;
    return NextResponse.json(
      {
        hasContent,
        identity: { fullName: (profile.fullName as string | undefined) || user?.name || "", email: user?.email ?? "", phone: user?.phone || profile.phone || "" },
        profile: cvProfile,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  // `access.application` is set only where an application applies (the
  // employer's applicant screens, admin support, the seeker's own); staff views
  // have none and get the seeker's own CV. The rule is shared with the export
  // manifest, which reports whether this file exists before anyone fetches it.
  const { url: cvUrl, isBuilt } = resolveOriginalCvSource(seeker, access.application);
  if (!cvUrl) {
    return NextResponse.json(
      { error: "No CV on file for this candidate.", code: "NO_CV" },
      { status: 404 },
    );
  }

  let buffer: Buffer;
  try {
    buffer = await downloadBuffer(cvUrl);
  } catch {
    return NextResponse.json(
      { error: "Could not load the CV file.", code: "DOWNLOAD_FAILED" },
      { status: 502 },
    );
  }

  // The seeker's "CV downloads" statistic counts ACTUAL downloads and exports, not
  // viewer opens: only a request that says so (`download=1`: the viewer's Download,
  // the "Original CV" menu links, the bulk export) counts. The viewer's preview
  // always fetches the file, so it never carries the flag. Employer downloads only,
  // as the statistic always was (it moved here from the per-application download
  // route, which only employers used); staff and the seeker's own are not counted.
  // It is a statistic: it never fails the response. A seeker with no Profile CV can
  // have `cv` stored as null, which $inc cannot reach into.
  if (ctx.role === "employer" && req.nextUrl.searchParams.get("download") === "1") {
    try {
      await JobSeeker.updateOne({ _id: seeker._id }, { $inc: { "cv.downloadCount": 1 } });
    } catch {
      await JobSeeker.updateOne({ _id: seeker._id, cv: null }, { $set: { cv: { downloadCount: 1 } } }).catch(() => {});
    }
  }

  const mime = guessMime(cvUrl);
  const headers: Record<string, string> = {
    "Content-Type": mime,
    "Content-Disposition": "inline",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  // The file is the PDF built on Mployedin that went with this application, not
  // an upload: the viewer names that tab "CV sent with application" rather than
  // "Original CV (Uploaded)". Only said where an application applies; the
  // seeker's stored built copy on a staff view is just their profile file.
  if (isBuilt && access.application) headers["X-Mployedin-Cv-Built"] = "1";
  return new NextResponse(new Uint8Array(buffer), { status: 200, headers });
}

export const GET = withAuth(getHandler);
