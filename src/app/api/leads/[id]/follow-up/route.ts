import { NextRequest, NextResponse } from "next/server";
import type { Types } from "mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Lead from "@/models/Lead";
import { canAccessLead } from "@/lib/leads/access";
import { isValidObjectId } from "@/lib/security/sanitize";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { leadFollowUpSchema } from "@/lib/validators/leads";
import { CONTACT_METHODS, type ContactMethod } from "@/lib/leads/stageRules";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function loadLead(req: NextRequest, ctx: AuthCtx) {
  const id = req.nextUrl.pathname.split("/").at(-2); // /api/leads/[id]/follow-up
  if (!isValidObjectId(id)) return { id, lead: null, error: NextResponse.json({ error: "Invalid ID" }, { status: 400 }) };
  await connectDB();
  const lead = await Lead.findById(id);
  if (!lead) return { id, lead: null, error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (!(await canAccessLead(ctx, lead))) return { id, lead: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { id, lead, error: null };
}

/**
 * PUT /api/leads/[id]/follow-up — schedule or reschedule the next follow-up
 * (date and time, how, and what it is for).
 *
 * Its own route because PATCH drops blank values, so it could never clear a
 * follow-up; DELETE below can.
 */
export const PUT = withAuth(async (req: NextRequest, ctx: AuthCtx) => {
  const { id, lead, error } = await loadLead(req, ctx);
  if (error) return error;
  const body = await validateBody(req, leadFollowUpSchema);

  lead!.followUpAt = new Date(body.followUpAt);
  lead!.followUpType = body.followUpType;
  lead!.followUpNote = body.followUpNote;
  // The reminder cron skips leads reminded in the last 20 hours; that applied
  // to the old date, not this one.
  lead!.lastFollowupReminderAt = undefined;
  await lead!.save();

  await logActivity({ ...actorFromCtx(ctx), action: "lead.follow_up_set", resource: "leads", resourceId: id!, req });
  return NextResponse.json(lead);
}, { resource: "leads", action: "update" });

/**
 * DELETE /api/leads/[id]/follow-up — clear the follow-up. With `?done=1` the
 * follow-up happened: it is logged on the timeline (as the call, WhatsApp…
 * it was planned as) and counts as the lead's latest contact.
 */
export const DELETE = withAuth(async (req: NextRequest, ctx: AuthCtx) => {
  const { id, lead, error } = await loadLead(req, ctx);
  if (error) return error;

  const done = req.nextUrl.searchParams.get("done") === "1";
  if (done && lead!.followUpAt) {
    const now = new Date();
    const type = lead!.followUpType;
    lead!.activityLog.push({
      action: type ?? "follow_up",
      note: lead!.followUpNote,
      timestamp: now,
      by: ctx.userId as unknown as Types.ObjectId,
    });
    if (type && (CONTACT_METHODS as readonly string[]).includes(type)) {
      lead!.lastContactedAt = now;
      lead!.lastContactMethod = type as ContactMethod;
    }
  }
  lead!.followUpAt = undefined;
  lead!.followUpType = undefined;
  lead!.followUpNote = undefined;
  await lead!.save();

  await logActivity({ ...actorFromCtx(ctx), action: done ? "lead.follow_up_done" : "lead.follow_up_cleared", resource: "leads", resourceId: id!, req });
  return NextResponse.json(lead);
}, { resource: "leads", action: "update" });
