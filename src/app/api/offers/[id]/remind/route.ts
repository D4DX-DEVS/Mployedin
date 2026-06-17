import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Offer from "@/models/Offer";
import { Employer } from "@/models/Employer";
import JobSeeker from "@/models/JobSeeker";
import Agent from "@/models/Agent";
import Job from "@/models/Job";
import User from "@/models/User";
import { validateBody } from "@/lib/validators";
import { offerRemindSchema } from "@/lib/validators/offers";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/trigger";
import { isValidObjectId } from "@/lib/security/sanitize";
import type { UserRole } from "@/models/User";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

/** Minimum hours between reminders for the same offer. */
const REMINDER_COOLDOWN_HOURS = 12;

async function agentOwnsOffer(userId: string, employerId: unknown): Promise<boolean> {
  const agentDoc = await Agent.findOne({ userId }).select("assignedEmployerIds").lean();
  const assigned = (agentDoc?.assignedEmployerIds ?? []).map((id: unknown) => String(id));
  return assigned.includes(String(employerId));
}

// POST /api/offers/[id]/remind — employer or assigned agent nudges the candidate
async function postHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  if (!["employer", "agent", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Not allowed to send reminders" }, { status: 403 });
  }

  await connectDB();
  const offer = await Offer.findById(params?.id).populate("jobId", "title");
  if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

  if (offer.status !== "pending") {
    return NextResponse.json({ error: "Can only remind on pending offers" }, { status: 400 });
  }

  // Authorize.
  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp || String(offer.employerId) !== String(emp._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (!(await agentOwnsOffer(ctx.userId, offer.employerId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Throttle reminders.
  if (offer.lastRemindedAt) {
    const hoursSince = (Date.now() - new Date(offer.lastRemindedAt).getTime()) / 3_600_000;
    if (hoursSince < REMINDER_COOLDOWN_HOURS) {
      return NextResponse.json(
        { error: `A reminder was already sent recently. Try again in ${Math.ceil(REMINDER_COOLDOWN_HOURS - hoursSince)}h.` },
        { status: 429 }
      );
    }
  }

  const body = await validateBody(req, offerRemindSchema);

  offer.lastRemindedAt = new Date();
  offer.reminderCount = (offer.reminderCount ?? 0) + 1;
  const actor = await User.findById(ctx.userId).select("name").lean();
  offer.events = offer.events ?? [];
  offer.events.push({
    type: "reminded",
    at: new Date(),
    actorRole: ctx.role,
    actorName: (actor as { name?: string } | null)?.name ?? ctx.role,
    note: body.message,
  });
  await offer.save();

  // Notify the candidate.
  const jobSeeker = await JobSeeker.findById(offer.jobSeekerId).select("userId").lean();
  if (jobSeeker) {
    const jobTitle = (offer.jobId as unknown as { title?: string })?.title ?? "a position";
    const expiry = new Date(offer.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    await notify({
      userId: String(jobSeeker.userId),
      type: "offer_update",
      title: "Reminder: Pending Job Offer",
      message: `${body.message || `This is a friendly reminder about your offer for ${jobTitle}.`}\n\nThis offer expires on ${expiry}. Please review and respond.`,
      link: `/${ctx.locale}/job-seeker/offers`,
      sendEmail: true,
      metadata: { offerId: String(offer._id) },
    }).catch(() => {
      /* non-blocking */
    });
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "offer.remind",
    resource: "offers",
    resourceId: params?.id,
    meta: { reminderCount: offer.reminderCount },
    req,
  });

  return NextResponse.json({ ok: true, reminderCount: offer.reminderCount, lastRemindedAt: offer.lastRemindedAt });
}

export const POST = withAuth(postHandler, { resource: "offers", action: "update" });

// Job import is required so the populate("jobId") path is registered at runtime.
void Job;
