import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import { notify } from "@/lib/notifications/trigger";
import { Employer } from "@/models/Employer";
import User from "@/models/User";

// Called by cron scheduler (e.g. Vercel Cron)
// Closes all active jobs whose expiresAt has passed

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const now = new Date();

  const expiredJobs = await Job.find({
    status: "active",
    expiresAt: { $lte: now },
  })
    .select("_id title employerId")
    .lean();

  if (!expiredJobs.length) {
    return NextResponse.json({ success: true, closed: 0, timestamp: now.toISOString() });
  }

  const jobIds = expiredJobs.map((j) => j._id);
  await Job.updateMany({ _id: { $in: jobIds } }, { $set: { status: "closed" } });

  // Notify each employer
  const errors: string[] = [];
  for (const job of expiredJobs) {
    try {
      const employer = await Employer.findById(job.employerId).select("userId").lean();
      if (!employer) continue;
      const user = await User.findById(employer.userId).select("_id").lean();
      if (!user) continue;

      await notify({
        userId: String(user._id),
        type: "system",
        title: "Job listing expired",
        message: `Your job posting "${job.title}" has expired and been closed automatically. Repost it to receive new applications.`,
        link: `/employer/jobs`,
      });
    } catch (err) {
      errors.push(`Job ${job._id}: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }

  return NextResponse.json({
    success: true,
    closed: expiredJobs.length,
    errors: errors.length ? errors : undefined,
    timestamp: now.toISOString(),
  });
}
