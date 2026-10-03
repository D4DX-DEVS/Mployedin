// src/lib/inngest/whatsappSchedules.ts
/**
 * Admin WhatsApp schedules.
 *  - tick: every 5 minutes, claims due schedules and emits one run event each.
 *    Admin-toggleable via SystemConfig.cronJobs.whatsappScheduler.
 *  - runner: one schedule run; streams the audience in _id batches (each a
 *    durable step) and sends through audienceSend.ts. Honours the WhatsApp
 *    master switch. What keeps one claim from being sent twice is layered:
 *    1. each path (tick, Run now) claims atomically, so two claims never win at once;
 *    2. the claim puts a single-use run token in the event, and the runner's first
 *       step consumes it, so an event whose claim was superseded (or that has no
 *       token) sends nothing;
 *    3. consuming it makes the run the schedule's owner (`runningRunId`); every batch
 *       renews the lock only while it still owns it, and a run that finds it was
 *       superseded stops without sending, so a lapsed lock never becomes two runs
 *       streaming the audience at once;
 *    4. Inngest drops a DUPLICATE event for the same claim before a run starts:
 *       `idempotency` on the runner (one run per `runId`) and an event id on both
 *       producers. The database cannot tell that duplicate from a re-executed begin
 *       step (which must still pass), so this layer is the only one that can.
 * Concurrency 1 on both: the free Inngest plan caps the account at 5.
 */
import { inngest } from "./client";
import { connectDB } from "@/lib/db/mongoose";
import logger from "@/lib/logger";
import User from "@/models/User";
import WhatsAppSchedule from "@/models/WhatsAppSchedule";
import { getWhatsAppSettings, isCronEnabled, updateCronRunStatus } from "@/models/SystemConfig";
import { broadcastRecipientQuery } from "@/lib/communications/broadcastAudience";
import type { BroadcastRole } from "@/lib/communications/broadcastAudience";
import { scheduleAudienceError, scheduleRunEventId } from "@/lib/communications/whatsapp/schedule";
import {
  beginScheduleRun,
  claimDueSchedules,
  finalizeScheduleRun,
  refreshScheduleLock,
  type ClaimedSchedule,
} from "@/lib/communications/whatsapp/scheduleRuntime";
import { sendWhatsAppToUsers, type AudienceUser } from "@/lib/communications/whatsapp/audienceSend";
import type { WhatsAppScheduleRunEvent } from "./events";

// ponytail: step budget. A run spends five steps of its own (begin, load, switch check, the final empty
// batch, finalize) and one per batch of 50, so under Inngest's 1,000-step cap the runner stops at about
// 995 batches: roughly 49.8k active users in the audience. A larger audience needs fan-out to child runs.
const BATCH_SIZE = 50;

export const whatsappScheduleTick = inngest.createFunction(
  {
    id: "whatsapp-schedule-tick",
    name: "WhatsApp Schedules — tick (every 5 min)",
    retries: 1,
    concurrency: { limit: 1 },
    triggers: [{ cron: "*/5 * * * *" }],
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async ({ step }: { step: any }) => {
    await connectDB();
    const enabled = await step.run("check-enabled", () => isCronEnabled("whatsappScheduler"));
    if (!enabled) {
      await step.run("log-skipped", () => updateCronRunStatus("whatsappScheduler", "success", "Skipped — disabled by admin"));
      return { skipped: true, reason: "disabled by admin" };
    }
    const claimed: ClaimedSchedule[] = await step.run("claim-due", () => claimDueSchedules(new Date()));
    // Nothing due (most ticks): no further steps, so an idle scheduler spends two steps per tick, not three.
    if (claimed.length === 0) return { triggered: 0 };
    // The event id makes a re-executed emit-runs step (Inngest accepted the events, then the step
    // was retried) a no-op for the events already accepted, instead of a second run per schedule.
    await step.run("emit-runs", () => inngest.send(claimed.map((c) => ({ id: scheduleRunEventId(c.runId), name: "whatsapp/schedule.run" as const, data: c }))));
    await step.run("record-status", () => updateCronRunStatus("whatsappScheduler", "success", `${claimed.length} schedule(s) triggered`));
    return { triggered: claimed.length };
  },
);

interface LeanSchedule {
  _id: unknown;
  name: string;
  template: { templateName: string; language: string; params: string[] };
  audience: { targetAll: boolean; targetRoles: string[] };
}

export const whatsappScheduleRunner = inngest.createFunction(
  {
    id: "whatsapp-schedule-runner",
    name: "WhatsApp Schedules — runner",
    retries: 1,
    concurrency: { limit: 1 },
    // At most one run per claim token (Inngest keeps the key for 24 hours): a duplicate event for the
    // same claim never starts a second run, which the database alone cannot tell from a replayed begin step.
    // ponytail: a dashboard Replay of a crashed run is a new run of the same event. While that run id still
    // owns the schedule, its begin step passes again and it sends from batch 0. Operators must not replay one.
    idempotency: "event.data.runId",
    triggers: [{ event: "whatsapp/schedule.run" }],
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async ({ event, step }: { event: WhatsAppScheduleRunEvent; step: any }) => {
    await connectDB();
    const { scheduleId: eventScheduleId, runId } = event.data;

    // Nothing else runs until the token is consumed: it is one layer of what makes a send happen at most
    // once per claim (see the header). An event whose claim was superseded after its lock lapsed, and one with no token
    // at all (queued before tokens existed), stop here. A re-executed begin step of the run that
    // already started passes on purpose, and so would a duplicate event with the same runId; that
    // duplicate never gets this far because the function's `idempotency` (and the event id) drop it.
    const began: boolean = runId ? await step.run("begin-run", () => beginScheduleRun(eventScheduleId, runId, new Date())) : false;
    if (!began) {
      // warn, not info: a refusal means a send was suppressed, which should be visible in the logs.
      logger.warn({ scheduleId: eventScheduleId }, "[whatsapp-schedule] run skipped: stale or duplicate run token");
      return { skipped: true, reason: "stale_or_duplicate_run" };
    }

    const schedule = (await step.run("load-schedule", () => WhatsAppSchedule.findById(eventScheduleId).lean())) as LeanSchedule | null;
    if (!schedule) return { skipped: true, reason: "schedule not found" };

    const scheduleId = String(schedule._id);

    // The master switch is the kill switch: it also stops a run that was claimed before
    // it was flipped. The run is recorded as an error (not dropped) so the admin sees on
    // the Schedules tab that this occurrence never went out, and the lock is released.
    // Nothing was sent, so it does not count as a run (countAsRun: false keeps lastRunAt, and
    // with it the once-per-hour gap, untouched).
    const noSend = { sent: 0, failed: 0, skipped: 0 };
    const whatsappOn: boolean = await step.run("check-whatsapp-enabled", async () => (await getWhatsAppSettings()).enabled !== false);
    if (!whatsappOn) {
      await step.run("finalize-switched-off", () => finalizeScheduleRun(scheduleId, runId, "error", noSend, { countAsRun: false }));
      logger.warn({ scheduleId }, "[whatsapp-schedule] run not sent: WhatsApp is switched off");
      return { skipped: true, reason: "whatsapp switched off" };
    }

    // The API refuses to save a schedule that reaches nobody, but this row may predate that or
    // have been edited directly. An empty audience must never reach the query below: with no
    // roles and targetAll false it is every active user, staff included.
    if (scheduleAudienceError(schedule.audience)) {
      await step.run("finalize-no-audience", () => finalizeScheduleRun(scheduleId, runId, "error", noSend, { countAsRun: false }));
      logger.error({ scheduleId }, "[whatsapp-schedule] run not sent: the schedule has no audience (neither everyone nor any role)");
      return { skipped: true, reason: "no audience" };
    }

    const baseQuery = broadcastRecipientQuery(Boolean(schedule.audience.targetAll), schedule.audience.targetRoles as BroadcastRole[]);
    const totals = { sent: 0, failed: 0, skipped: 0 };
    let lastId: string | null = null;
    let batchIndex = 0;

    for (;;) {
      const result: { superseded: true } | { done: true } | { done: false; lastId: string; sent: number; failed: number; skipped: number } = await step.run(`batch-${batchIndex}`, async () => {
        // Checked before every batch (including the one that finds nobody): the lock is renewed only
        // while this run still owns the schedule. If a newer claim took over (this run stalled past
        // its lock between batches), nothing from this batch is sent.
        if (!(await refreshScheduleLock(scheduleId, runId, new Date()))) return { superseded: true as const };
        const users = (await User.find({ ...baseQuery, ...(lastId ? { _id: { $gt: lastId } } : {}) })
          .sort({ _id: 1 })
          .limit(BATCH_SIZE)
          // phone/whatsapp are read per batch so a STOP that landed after this run was queued is honoured.
          .select("_id name role phone locale whatsapp")
          .lean()) as AudienceUser[];
        if (users.length === 0) return { done: true as const };
        // ponytail: a batch step that fails after some sends (or whose result is lost) is re-executed whole,
        // so up to BATCH_SIZE (50) recipients can get the message twice.
        const r = await sendWhatsAppToUsers(users, schedule.template, { source: "schedule", category: "system", scheduleId, tokens: { title: schedule.name } });
        return { done: false as const, lastId: String(users[users.length - 1]._id), ...r };
      });
      if ("superseded" in result) {
        logger.warn({ scheduleId, batch: batchIndex, ...totals }, "[whatsapp-schedule] run stopped: superseded by a newer claim or deleted");
        return { superseded: true };
      }
      if (result.done) break;
      lastId = result.lastId;
      totals.sent += result.sent;
      totals.failed += result.failed;
      totals.skipped += result.skipped;
      batchIndex += 1;
    }

    const status = totals.failed === 0 ? "success" : totals.sent === 0 ? "error" : "partial";
    await step.run("finalize", () => finalizeScheduleRun(scheduleId, runId, status, totals));
    logger.info({ scheduleId, ...totals, batches: batchIndex }, "[whatsapp-schedule] run complete");
    return { ...totals, batches: batchIndex };
  },
);
