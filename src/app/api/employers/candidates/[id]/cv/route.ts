import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import type { AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import Employer from "@/models/Employer";
import Application from "@/models/Application";
import TalentPool from "@/models/TalentPool";
import { isValidObjectId } from "@/lib/security/sanitize";
import { downloadBuffer } from "@/lib/storage/spaces";
import { guessMime } from "@/lib/storage/mime";
import { canStaffAccessSeeker, type SeekerOwnership } from "@/lib/jobSeeker/staffAccess";
import { servedApplicationCvUrl } from "@/lib/applications/sentCv";


interface SeekerDoc {
  _id?: unknown;
  userId: unknown;
  cv?: { originalUrl?: string };
  documents?: Array<{ category?: string; url?: string }>;
}

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
  // Set for an employer: the application must be one of theirs.
  let employerId: unknown = null;

  let seeker: SeekerDoc | null = null;
  if (ctx.role === "job_seeker") {
    // A job seeker may only ever view their own CV; the [id] param is ignored.
    seeker = (await JobSeeker.findOne({ userId: ctx.userId })
      .select("userId cv documents")
      .lean()) as SeekerDoc | null;
  } else if (ctx.role === "admin") {
    // Platform operator — may view any candidate CV for support.
    seeker = (await JobSeeker.findById(id)
      .select("userId cv documents")
      .lean()) as SeekerDoc | null;
  } else if (ctx.role === "employer") {
    // An employer may view a candidate's CV only if that candidate applied to
    // one of the employer's jobs OR sits in one of the employer's talent pools.
    // Without this gate any employer could stream any seeker's resume (PII IDOR).
    const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!employer) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const [hasApplication, inTalentPool] = await Promise.all([
      Application.exists({ jobSeekerId: id, employerId: employer._id }),
      TalentPool.exists({ employerId: employer._id, "candidates.jobSeekerId": id }),
    ]);
    if (!hasApplication && !inTalentPool) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    employerId = employer._id;
    seeker = (await JobSeeker.findById(id)
      .select("userId cv documents")
      .lean()) as SeekerDoc | null;
  } else if (ctx.role === "super_agent" || ctx.role === "agent") {
    // Owner, 2026-10-14: a super agent sees the CV along with the profile;
    // 2026-10-30 the same for an agent (client: agents could not open a
    // seeker's profile or CV). Same scope as the profile itself, so no seeker
    // is newly exposed.
    const full = await JobSeeker.findById(id)
      .select("userId cv documents agentId referral regionCityId regionStateId profileVisibility roleArchivedAt")
      .lean();
    if (!full) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    if (!(await canStaffAccessSeeker(full as unknown as SeekerOwnership, ctx, "view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    seeker = full as unknown as SeekerDoc;
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!seeker) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  let cvUrl: string | null | undefined;
  // Staff views have no application in hand; the parameter is for the
  // employer's applicant screens (and admin support, and the seeker's own).
  if (applicationId && ctx.role !== "agent" && ctx.role !== "super_agent") {
    const application = (await Application.findOne({
      _id: applicationId,
      jobSeekerId: seeker._id ?? id,
      ...(employerId ? { employerId } : {}),
    })
      .select("documents")
      .lean()) as { documents?: { url?: string; type?: string }[] } | null;
    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }
    cvUrl = servedApplicationCvUrl(application.documents, seeker.cv?.originalUrl);
  } else {
    const resumeDoc = seeker.documents?.find((d) => d.category === "resume" && d.url);
    cvUrl = seeker.cv?.originalUrl || resumeDoc?.url;
  }
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

  const mime = guessMime(cvUrl);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const GET = withAuth(getHandler);
