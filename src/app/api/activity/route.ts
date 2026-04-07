import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { ActivityEvent } from "@/models/ActivityEvent";
import JobSeeker from "@/models/JobSeeker";

const CTA_CONFIG: Record<string, { label: string; href: string }> = {
  job_match: { label: "View Jobs", href: "/job-seeker/jobs" },
  profile_view: { label: "View Profile", href: "/job-seeker/profile" },
  application_update: { label: "View Applications", href: "/job-seeker/applications" },
  general: { label: "Go to Dashboard", href: "/job-seeker" },
};

const EVENT_MESSAGES: Record<string, (meta: Record<string, unknown>) => string> = {
  job_match: (m) => `${m.count ?? "New"} jobs match your skills${m.role ? ` for ${m.role}` : ""}`,
  profile_view: () => "A recruiter viewed your profile",
  application_update: (m) =>
    m.company && m.title
      ? `Your application to ${m.title} at ${m.company} was updated`
      : "Your application status was updated",
  general: (m) => String(m.message ?? "Activity recorded"),
};

/**
 * GET /api/activity
 *
 * Returns last 10 ActivityEvents for the current job seeker.
 * Sorted by createdAt DESC then priority DESC.
 * The single highest-priority item gets hasCta: true.
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!seeker) {
    return NextResponse.json({ events: [] });
  }

  const rawEvents = await ActivityEvent.find({ jobSeekerId: seeker._id })
    .sort({ createdAt: -1, priority: -1 })
    .limit(10)
    .lean();

  if (rawEvents.length === 0) {
    return NextResponse.json({ events: [] });
  }

  // Find the highest-priority event index
  let topIdx = 0;
  for (let i = 1; i < rawEvents.length; i++) {
    if (rawEvents[i].priority > rawEvents[topIdx].priority) {
      topIdx = i;
    }
  }

  const events = rawEvents.map((ev, i) => {
    const meta = (ev.metadata ?? {}) as Record<string, unknown>;
    const msgFn = EVENT_MESSAGES[ev.type] ?? EVENT_MESSAGES.general;
    const cta = CTA_CONFIG[ev.type] ?? CTA_CONFIG.general;
    const hasCta = i === topIdx;

    return {
      id: String(ev._id),
      type: ev.type,
      message: msgFn(meta),
      metadata: meta,
      createdAt: ev.createdAt.toISOString(),
      hasCta,
      ...(hasCta ? { ctaLabel: cta.label, ctaHref: cta.href } : {}),
    };
  });

  return NextResponse.json({ events });
});
