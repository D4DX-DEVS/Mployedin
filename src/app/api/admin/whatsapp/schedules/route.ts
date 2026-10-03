import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import { whatsAppScheduleCreateSchema } from "@/lib/validators/whatsapp";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import WhatsAppSchedule from "@/models/WhatsAppSchedule";
import { computeNextRunAt, scheduleAudienceError, scheduleTimingError } from "@/lib/communications/whatsapp/schedule";

interface AuthCtx { userId: string; role: string; locale: string }

/** GET /api/admin/whatsapp/schedules — every schedule, newest first. */
async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await connectDB();
  const schedules = await WhatsAppSchedule.find().sort({ createdAt: -1 }).lean();
  return NextResponse.json({ schedules });
}

/**
 * POST /api/admin/whatsapp/schedules — create. The timing must pass the frequency
 * floor and, for an enabled schedule, produce a first run; the audience must reach
 * somebody. A cron is kept only on a recurring schedule and a run time only on a
 * one-time one.
 */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await validateBody(req, whatsAppScheduleCreateSchema);

  const problem = scheduleAudienceError(body.audience) ?? scheduleTimingError(body, body.enabled);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  await connectDB();
  const doc = await WhatsAppSchedule.create({
    name: body.name,
    enabled: body.enabled,
    kind: body.kind,
    runAt: body.kind === "once" && body.runAt ? new Date(body.runAt) : undefined,
    cron: body.kind === "recurring" ? body.cron : undefined,
    timezone: body.timezone,
    template: body.template,
    audience: body.audience,
    nextRunAt: computeNextRunAt(body),
    createdBy: ctx.userId,
  });
  const schedule = doc.toObject();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "admin.whatsapp.schedule.create",
    resource: "notifications",
    resourceId: String(schedule._id),
    changes: { after: { name: body.name, enabled: body.enabled, kind: body.kind, cron: body.cron, runAt: body.runAt, timezone: body.timezone, template: body.template.templateName, language: body.template.language, audience: body.audience } },
    req,
  });
  return NextResponse.json({ schedule }, { status: 201 });
}

export const GET = withAuth(getHandler, { resource: "notifications", action: "read" });
export const POST = withAuth(postHandler, { resource: "notifications", action: "create" });
