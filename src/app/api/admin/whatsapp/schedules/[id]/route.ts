import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import { whatsAppScheduleUpdateSchema } from "@/lib/validators/whatsapp";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";
import WhatsAppSchedule from "@/models/WhatsAppSchedule";
import { computeNextRunAt, scheduleAudienceError, scheduleTimingError } from "@/lib/communications/whatsapp/schedule";

interface AuthCtx { userId: string; role: string; locale: string }

interface LeanSchedule {
  enabled: boolean;
  kind: "once" | "recurring";
  cron?: string;
  runAt?: Date;
  timezone: string;
}

function idFromPath(req: NextRequest): string | null {
  const id = req.nextUrl.pathname.split("/").pop() ?? "";
  return isValidObjectId(id) ? id : null;
}

/**
 * PATCH /api/admin/whatsapp/schedules/[id] — edit, pause or resume.
 *
 * Timing is validated as the stored schedule merged with the patch, because the
 * update schema has no cross-field check: switching to "recurring" needs a cron,
 * switching to "once" needs a future run time, and the once-per-hour floor applies
 * to whatever the merged result is. nextRunAt is recomputed whenever the timing
 * changes and on resume (a schedule paused for weeks must not fire the occurrence it
 * missed), and left alone when pausing or editing text. A schedule that is enabled
 * after the patch must have a next run; a paused one may not.
 */
async function patchHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = idFromPath(req);
  if (!id) return NextResponse.json({ error: "Invalid schedule ID" }, { status: 400 });
  const body = await validateBody(req, whatsAppScheduleUpdateSchema);

  await connectDB();
  const existing = (await WhatsAppSchedule.findById(id).lean()) as LeanSchedule | null;
  if (!existing) return NextResponse.json({ error: "Schedule not found" }, { status: 404 });

  const $set: Record<string, unknown> = {};
  const $unset: Record<string, 1> = {};
  if (body.name !== undefined) $set.name = body.name;
  if (body.enabled !== undefined) $set.enabled = body.enabled;
  if (body.template !== undefined) $set.template = body.template;
  if (body.audience !== undefined) {
    const problem = scheduleAudienceError(body.audience);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    $set.audience = body.audience;
  }

  const enabled = body.enabled ?? existing.enabled;
  const resuming = body.enabled === true && !existing.enabled;
  const timingTouched = body.kind !== undefined || body.cron !== undefined || body.runAt !== undefined || body.timezone !== undefined;
  if (timingTouched || resuming) {
    const merged = {
      kind: body.kind ?? existing.kind,
      cron: body.cron ?? existing.cron ?? null,
      runAt: body.runAt ?? existing.runAt ?? null,
      timezone: body.timezone ?? existing.timezone,
    };
    const problem = scheduleTimingError(merged, enabled);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    if (timingTouched) {
      $set.kind = merged.kind;
      $set.timezone = merged.timezone;
      // Keep only the half of the timing that applies to the kind; $unset drops the other.
      if (merged.kind === "recurring") {
        $set.cron = merged.cron;
        $unset.runAt = 1;
      } else {
        $set.runAt = new Date(merged.runAt as string | Date);
        $unset.cron = 1;
      }
    }
    $set.nextRunAt = computeNextRunAt(merged);
  }

  if (Object.keys($set).length === 0) return NextResponse.json({ error: "No valid updates provided" }, { status: 400 });
  $set.updatedBy = ctx.userId;

  const updated = await WhatsAppSchedule.findByIdAndUpdate(
    id,
    Object.keys($unset).length > 0 ? { $set, $unset } : { $set },
    { returnDocument: "after" },
  );
  if (!updated) return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  await logActivity({ ...actorFromCtx(ctx), action: "admin.whatsapp.schedule.update", resource: "notifications", resourceId: id, changes: { after: $set }, req });
  return NextResponse.json({ schedule: updated.toObject() });
}

/** DELETE /api/admin/whatsapp/schedules/[id] */
async function deleteHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = idFromPath(req);
  if (!id) return NextResponse.json({ error: "Invalid schedule ID" }, { status: 400 });
  await connectDB();
  const deleted = await WhatsAppSchedule.findByIdAndDelete(id);
  if (!deleted) return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  await logActivity({ ...actorFromCtx(ctx), action: "admin.whatsapp.schedule.delete", resource: "notifications", resourceId: id, req });
  return NextResponse.json({ success: true });
}

export const PATCH = withAuth(patchHandler, { resource: "notifications", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "notifications", action: "delete" });
