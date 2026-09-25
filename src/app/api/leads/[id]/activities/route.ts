import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Lead from "@/models/Lead";
import { canAccessLead } from "@/lib/leads/access";
import { isValidObjectId } from "@/lib/security/sanitize";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { z } from "zod";
import { validateBody } from "@/lib/validators";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

const activityCreateSchema = z.object({
  action: z.enum(["call", "email", "meeting", "note", "follow_up", "whatsapp", "site_visit"]),
  note: z.string().max(2000).trim().optional(),
});

/** Load the lead and refuse anyone outside its scope — same rule as /api/leads/[id]. */
async function verifyAccess(leadId: string, ctx: AuthCtx) {
  const lead = await Lead.findById(leadId);
  if (!lead) return { lead: null, error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (!(await canAccessLead(ctx, lead))) {
    return { lead: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { lead, error: null };
}

/**
 * GET /api/leads/[id]/activities
 * Returns the activity log for a lead, sorted newest first.
 */
export const GET = withAuth(async (req: NextRequest, ctx: AuthCtx) => {
  const id = req.nextUrl.pathname.split("/").at(-2); // /api/leads/[id]/activities
  if (!isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();

  const { lead, error } = await verifyAccess(id!, ctx);
  if (error) return error;

  const activities = ([...(lead!.activityLog ?? [])])
    .sort((a: { timestamp: Date }, b: { timestamp: Date }) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return NextResponse.json({ activities });
}, { resource: "leads", action: "read" });

/**
 * POST /api/leads/[id]/activities
 * Add a new activity to the lead's activity log.
 */
export const POST = withAuth(async (req: NextRequest, ctx: AuthCtx) => {
  const id = req.nextUrl.pathname.split("/").at(-2);
  if (!isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();

  const { lead, error } = await verifyAccess(id!, ctx);
  if (error) return error;

  const body = await validateBody(req, activityCreateSchema);

  const activity = {
    action: body.action,
    note: body.note,
    timestamp: new Date(),
    by: ctx.userId,
  };

  lead!.activityLog.push(activity as never);
  await lead!.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "lead.add_activity",
    resource: "leads",
    resourceId: id!,
    meta: { activityType: body.action },
    req,
  });

  return NextResponse.json({ activity }, { status: 201 });
}, { resource: "leads", action: "update" });
