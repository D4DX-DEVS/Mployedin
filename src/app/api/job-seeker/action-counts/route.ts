import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import JobSeeker from "@/models/JobSeeker";
import Offer from "@/models/Offer";
import Interview from "@/models/Interview";

const EMPTY = { pendingOffers: 0, interviewsAwaitingResponse: 0, upcomingInterviews: 0 };

/**
 * GET /api/job-seeker/action-counts — what is waiting on the seeker right now.
 *
 * The nav badges and the home page both need "how many things need a decision",
 * a question no existing endpoint answered without pulling whole lists down to
 * the client and counting them there. Unread messages stay out of this: they
 * already have `useUnreadMessageCount`, which reads the conversation cache the
 * inbox has loaded anyway.
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!seeker) return NextResponse.json(EMPTY);

  const now = new Date();

  const [pendingOffers, interviewsAwaitingResponse, upcomingInterviews] = await Promise.all([
    Offer.countDocuments({ jobSeekerId: seeker._id, status: "pending" }),
    // The same gate `/api/interviews/[id]/respond` enforces: only a scheduled or
    // rescheduled interview is still awaiting the candidate's answer.
    Interview.countDocuments({
      jobSeekerId: seeker._id,
      status: { $in: ["scheduled", "rescheduled"] },
      scheduledAt: { $gte: now },
    }),
    Interview.countDocuments({
      jobSeekerId: seeker._id,
      status: "confirmed",
      scheduledAt: { $gte: now },
    }),
  ]);

  return NextResponse.json({
    pendingOffers,
    interviewsAwaitingResponse,
    upcomingInterviews,
  });
});
