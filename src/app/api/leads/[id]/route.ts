import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Lead from "@/models/Lead";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { leadUpdateSchema } from "@/lib/validators/leads";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/** Verify agent owns this lead, or user is super_agent/admin */
async function verifyLeadAccess(leadId: string, ctx: AuthCtx) {
  const lead = await Lead.findById(leadId).lean() as { assignedAgentId?: string } | null;
  if (!lead) return { lead: null, error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (ctx.role === "agent" && String(lead.assignedAgentId) !== ctx.userId) {
    return { lead: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { lead, error: null };
}

export const GET = withAuth(async (req: NextRequest, ctx: AuthCtx) => {
  await connectDB();
  const id = req.nextUrl.pathname.split("/").at(-1);
  const { lead, error } = await verifyLeadAccess(id!, ctx);
  if (error) return error;
  return NextResponse.json(lead);
}, { resource: "leads", action: "read" });

export const PATCH = withAuth(async (req: NextRequest, ctx: AuthCtx) => {
  await connectDB();
  const id = req.nextUrl.pathname.split("/").at(-1);
  const { error } = await verifyLeadAccess(id!, ctx);
  if (error) return error;

  const body = await validateBody(req, leadUpdateSchema);
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (v !== undefined) update[k] = v;

  const lead = await Lead.findByIdAndUpdate(id, { $set: update }, { new: true });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "lead.update",
    resource: "leads",
    resourceId: id,
    changes: { after: update },
    req,
  });

  return NextResponse.json(lead);
}, { resource: "leads", action: "update" });

export const DELETE = withAuth(async (req: NextRequest, ctx: AuthCtx) => {
  await connectDB();
  const id = req.nextUrl.pathname.split("/").at(-1);
  const { error } = await verifyLeadAccess(id!, ctx);
  if (error) return error;

  await Lead.findByIdAndDelete(id);

  await logActivity({
    ...actorFromCtx(ctx),
    action: "lead.delete",
    resource: "leads",
    resourceId: id,
    req,
  });

  return NextResponse.json({ message: "Lead deleted" });
}, { resource: "leads", action: "delete" });
