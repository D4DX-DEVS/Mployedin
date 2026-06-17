import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Offer from "@/models/Offer";
import { Employer } from "@/models/Employer";
import JobSeeker from "@/models/JobSeeker";
import Agent from "@/models/Agent";
import User from "@/models/User";
import { validateBody } from "@/lib/validators";
import { offerReviseSchema } from "@/lib/validators/offers";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/trigger";
import { isValidObjectId } from "@/lib/security/sanitize";
import type { UserRole } from "@/models/User";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

async function agentOwnsOffer(userId: string, employerId: unknown): Promise<boolean> {
  const agentDoc = await Agent.findOne({ userId }).select("assignedEmployerIds").lean();
  const assigned = (agentDoc?.assignedEmployerIds ?? []).map((id: unknown) => String(id));
  return assigned.includes(String(employerId));
}

// PATCH /api/offers/[id]/revise — employer or assigned agent revises offer terms
async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  if (!["employer", "agent", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Not allowed to revise offers" }, { status: 403 });
  }

  await connectDB();
  const offer = await Offer.findById(params?.id);
  if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

  // Only pending or countered offers can be revised.
  if (!["pending", "countered"].includes(offer.status)) {
    return NextResponse.json(
      { error: "Only pending or countered offers can be revised" },
      { status: 400 }
    );
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

  const body = await validateBody(req, offerReviseSchema);
  const { salary, startDate, benefits, notes, expiresAt, revisionNote } = body;

  const before = {
    amount: offer.salary?.amount,
    currency: offer.salary?.currency,
    period: offer.salary?.period,
    startDate: offer.startDate,
  };

  offer.salary = salary;
  offer.startDate = startDate;
  if (benefits !== undefined) offer.benefits = benefits;
  if (notes !== undefined) offer.notes = notes;
  offer.expiresAt = expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  offer.revisionNumber = (offer.revisionNumber ?? 1) + 1;
  // A revision re-opens the offer for the candidate.
  offer.status = "pending";
  offer.respondedAt = undefined;
  offer.counterOffer = undefined;

  const actor = await User.findById(ctx.userId).select("name").lean();
  offer.events = offer.events ?? [];
  offer.events.push({
    type: "revised",
    at: new Date(),
    actorRole: ctx.role,
    actorName: (actor as { name?: string } | null)?.name ?? ctx.role,
    note: revisionNote,
  });

  await offer.save();

  // Notify the candidate that the offer was updated.
  const jobSeeker = await JobSeeker.findById(offer.jobSeekerId).select("userId").lean();
  if (jobSeeker) {
    const salaryText = `${salary.currency} ${Number(salary.amount).toLocaleString()} / ${salary.period}`;
    await notify({
      userId: String(jobSeeker.userId),
      type: "offer_update",
      title: "Offer Revised",
      message: `Your offer has been revised.\n\nNew salary: ${salaryText}${revisionNote ? `\n\nNote: ${revisionNote}` : ""}\n\nPlease review and respond.`,
      link: `/${ctx.locale}/job-seeker/offers`,
      sendEmail: true,
      metadata: { offerId: String(offer._id), revisionNumber: offer.revisionNumber },
    }).catch(() => {
      /* non-blocking */
    });
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "offer.revise",
    resource: "offers",
    resourceId: params?.id,
    changes: { before, after: { ...salary, startDate } },
    meta: { revisionNumber: offer.revisionNumber, revisionNote },
    req,
  });

  return NextResponse.json({ offer });
}

export const PATCH = withAuth(patchHandler, { resource: "offers", action: "update" });
