import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";
import Application from "@/models/Application";
import JobSeeker from "@/models/JobSeeker";
import { validateBody } from "@/lib/validators";
import { notify } from "@/lib/notifications/trigger";
import { z } from "zod";

const notifySchema = z.object({
  scoreMin: z.number().min(0).max(100),
  scoreMax: z.number().min(0).max(101),
});

/**
 * POST /api/employer/applications/notify-matches
 *
 * One-click "Notify" action for the dashboard AI Recommended Candidates
 * bands. Tells un-actioned ("applied") candidates in the given match-score
 * range that the employer is reviewing their application. Idempotent per
 * candidate via aiMatchNotifiedAt — re-clicking only reaches newly-scored or
 * newly-applied candidates, never re-spams the same person.
 */
async function handler(req: NextRequest, ctx: { userId: string; locale: string }) {
  await connectDB();

  const { scoreMin, scoreMax } = await validateBody(req, notifySchema);

  const emp = await Employer.findOne({ userId: ctx.userId }).select("_id companyName").lean();
  if (!emp) return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });

  const candidates = await Application.find({
    employerId: emp._id,
    status: "applied",
    aiMatchScore: { $gte: scoreMin, $lt: scoreMax },
    aiMatchNotifiedAt: { $exists: false },
  })
    .select("_id jobSeekerId jobId")
    .populate({ path: "jobId", select: "title" })
    .limit(50)
    .lean();

  if (candidates.length === 0) {
    return NextResponse.json({ notified: 0 });
  }

  const companyName = (emp as { companyName?: string }).companyName ?? "An employer";

  const seekers = await JobSeeker.find({ _id: { $in: candidates.map((c) => c.jobSeekerId) } })
    .select("_id userId")
    .lean();
  const userIdByJobSeekerId = new Map(seekers.map((s) => [String(s._id), String(s.userId)]));

  await Promise.all(
    candidates.map((app) => {
      const seekerUserId = userIdByJobSeekerId.get(String(app.jobSeekerId));
      if (!seekerUserId) return Promise.resolve();
      const jobTitle = (app.jobId as unknown as { title?: string } | null)?.title ?? "the role";
      return notify({
        userId: seekerUserId,
        type: "application_status_update",
        title: "You're a strong match!",
        message: `${companyName} noticed your application for "${jobTitle}" is a strong match and is reviewing it now.`,
        link: `/${ctx.locale}/job-seeker/applications`,
        sendEmail: true,
        metadata: { applicationId: String(app._id), jobTitle, companyName },
      }).catch(() => {
        /* best-effort — one failed notification must not block the rest */
      });
    })
  );

  await Application.updateMany(
    { _id: { $in: candidates.map((c) => c._id) } },
    { $set: { aiMatchNotifiedAt: new Date() } }
  );

  return NextResponse.json({ notified: candidates.length });
}

export const POST = withAuth(handler, { resource: "applications", action: "update" });
