import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import logger from "@/lib/logger";
import { isValidObjectId } from "@/lib/security/sanitize";
import { inngest } from "@/lib/inngest/client";
import { getWhatsAppSettings } from "@/models/SystemConfig";
import { claimScheduleNow, releaseScheduleClaim } from "@/lib/communications/whatsapp/scheduleRuntime";
import { scheduleRunEventId } from "@/lib/communications/whatsapp/schedule";

interface AuthCtx { userId: string; role: string; locale: string }

/**
 * POST /api/admin/whatsapp/schedules/[id]/run — fire once now, regardless of the
 * schedule's timing or pause switch. Refused with 409 `whatsapp_disabled` while the
 * WhatsApp master switch is off (nothing is claimed or queued), `run_in_progress` while a
 * claimed run still holds its lock, and `too_soon` when it last ran under the minimum gap ago.
 *
 * What actually keeps one schedule from being sent twice is not a check here but four layers.
 * In scheduleRuntime: one atomic claim per path (claimScheduleNow here, the tick's claim there;
 * the lock clause is in every claim filter, so two clicks, or a click and a scheduler tick,
 * cannot both win); a single-use token that the event carries and the runner consumes at run
 * start, so an event whose claim was superseded sends nothing; and ownership (`runningRunId`)
 * kept while the run streams, so a run whose lock lapsed is superseded by the next claim and
 * stops at its next batch. Then in Inngest: the event id below and the runner's idempotency on
 * the run token, which drop a duplicate event for the same claim before a run starts (the
 * database alone cannot tell it from a replayed begin step). If the event can't be queued the
 * claim is handed back.
 */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const segments = req.nextUrl.pathname.split("/");
  const id = segments[segments.length - 2] ?? "";
  if (!isValidObjectId(id)) return NextResponse.json({ error: "Invalid schedule ID" }, { status: 400 });

  await connectDB();

  // Same reading of the switch the runner uses, so the route never queues a run the runner would refuse.
  if ((await getWhatsAppSettings()).enabled === false) {
    return NextResponse.json({ error: "whatsapp_disabled" }, { status: 409 });
  }

  const now = new Date();
  const claim = await claimScheduleNow(id, now);
  if (!claim.ok) {
    if (claim.reason === "not_found") return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    return NextResponse.json({ error: claim.reason }, { status: 409 });
  }

  try {
    await inngest.send({ id: scheduleRunEventId(claim.runId), name: "whatsapp/schedule.run", data: { scheduleId: id, runAt: now.toISOString(), runId: claim.runId } });
  } catch (err) {
    // Nothing was queued, so the claim must not keep the schedule locked for ten minutes. A failed
    // release is only logged: it lapses on its own, and the send failure is what the caller needs.
    await releaseScheduleClaim(id, claim.runId).catch((releaseErr: unknown) => {
      logger.error({ scheduleId: id, err: releaseErr }, "[whatsapp-schedule] could not release the run claim after a failed send");
    });
    throw err;
  }

  await logActivity({ ...actorFromCtx(ctx), action: "admin.whatsapp.schedule.run", resource: "notifications", resourceId: id, req });
  return NextResponse.json({ queued: true });
}

export const POST = withAuth(postHandler, { resource: "notifications", action: "update" });
