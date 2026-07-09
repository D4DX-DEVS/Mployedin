import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Employer from "@/models/Employer";
import Application from "@/models/Application";
import Interview from "@/models/Interview";
import JobSeeker from "@/models/JobSeeker";
import TalentPool from "@/models/TalentPool";
import { isValidObjectId } from "@/lib/security/sanitize";

/**
 * GET /api/employers/candidates/[id]
 *
 * Returns a unified candidate profile: all applications, interviews,
 * and notes for a single job seeker at the current employer's company.
 * The [id] param is the JobSeeker _id.
 */
async function handler(req: NextRequest, ctx: { userId: string }, params?: Record<string, string>) {
  const jobSeekerId = params?.id;
  if (!isValidObjectId(jobSeekerId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id companyName").lean();
  if (!employer) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }

  const seeker = await JobSeeker.findById(jobSeekerId)
    .populate("userId", "name email avatar")
    .select("userId currentLocation skills experience education languages preferredSalary preferredJobType availabilityStatus profileCompleteness badges createdAt cv.originalUrl certifications headline summary totalExperienceYears preferredLocations preferredRoles noticePeriod workStatus profileVisibility")
    .lean();

  if (!seeker) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  // Access rule (mirrors /api/employer/talent-search + candidates/[id]/cv):
  // a relationship (application to this employer, or membership in one of this
  // employer's talent pools) grants the full profile; otherwise the seeker must
  // have opted into discoverability, and contact/salary details are withheld.
  const [hasApplication, inTalentPool] = await Promise.all([
    Application.exists({ jobSeekerId, employerId: employer._id }),
    TalentPool.exists({ employerId: employer._id, "candidates.jobSeekerId": jobSeekerId }),
  ]);
  const hasRelationship = Boolean(hasApplication || inTalentPool);
  if (!hasRelationship && seeker.profileVisibility !== "visible") {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }
  if (!hasRelationship) {
    const user = seeker.userId as { email?: string } | null;
    if (user) delete user.email;
    delete (seeker as { preferredSalary?: unknown }).preferredSalary;
  }

  const [applications, interviews] = await Promise.all([
    Application.find({ jobSeekerId, employerId: employer._id })
      .populate("jobId", "title location category salary status")
      .sort({ appliedAt: -1 })
      .lean(),
    Interview.find({ jobSeekerId, employerId: employer._id })
      .populate("applicationId", "jobId")
      .populate("jobId", "title")
      .sort({ scheduledAt: -1 })
      .lean(),
  ]);

  // Collect all notes across applications
  const allNotes = applications.flatMap((app) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((app as any).notes ?? []).map((note: any) => ({
      ...note,
      applicationId: String(app._id),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jobTitle: (app.jobId as any)?.title ?? "Unknown",
    })),
  );
  allNotes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Build a combined activity timeline from statusHistory across all applications
  const timeline = applications.flatMap((app) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((app.statusHistory ?? []) as any[]).map((entry: { status: string; changedAt: Date; note?: string }) => ({
      applicationId: String(app._id),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jobTitle: (app.jobId as any)?.title ?? "Unknown",
      status: entry.status,
      changedAt: entry.changedAt,
      note: entry.note,
    })),
  );
  timeline.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());

  return NextResponse.json({
    candidate: seeker,
    company: employer.companyName,
    applications: applications.map((app) => ({
      _id: String(app._id),
      job: app.jobId,
      status: app.status,
      aiMatchScore: app.aiMatchScore,
      matchBreakdown: app.matchBreakdown,
      behaviorScore: app.behaviorScore,
      appliedAt: app.appliedAt,
      rejectionReason: app.rejectionReason,
      source: app.source,
    })),
    interviews: interviews.map((iv) => ({
      _id: String(iv._id),
      applicationId: String(iv.applicationId),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jobTitle: (iv.jobId as any)?.title ?? "Unknown",
      type: iv.type,
      scheduledAt: iv.scheduledAt,
      duration: iv.duration,
      status: iv.status,
      outcome: iv.outcome,
      candidateResponse: iv.candidateResponse,
    })),
    notes: allNotes,
    timeline,
    summary: {
      totalApplications: applications.length,
      activeApplications: applications.filter((a) => !["rejected", "withdrawn", "hired"].includes(a.status)).length,
      totalInterviews: interviews.length,
      hired: applications.some((a) => a.status === "hired"),
    },
  });
}

export const GET = withAuth(handler, { resource: "employers", action: "read" });
