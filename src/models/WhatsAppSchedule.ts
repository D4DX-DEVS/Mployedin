import mongoose, { Document, Schema } from "mongoose";

/**
 * WhatsAppSchedule — an admin-authored WhatsApp send with a time rule: once at
 * `runAt`, or recurring on `cron` in `timezone`. The 5-minute Inngest tick
 * claims due schedules atomically (nextRunAt + lockedUntil) and the runner
 * delivers through audienceSend.ts. Editable at runtime; no deploy needed.
 *
 * `activeRunId` is the single-use claim token. Whoever claims a run (the tick, or
 * Run now) writes a fresh one and puts it in the `whatsapp/schedule.run` event.
 * The runner's first step consumes it atomically by moving it to `runningRunId`,
 * so an event whose claim was superseded finds neither and sends nothing.
 * `runningRunId` is the started run's ownership: the runner checks it (and renews
 * `lockedUntil`) before every batch, and finalizes only while it still holds it.
 * Every new claim clears it, so a run whose lock lapsed and was superseded stops
 * at its next batch instead of streaming the audience a second time alongside the
 * new run. These fields cannot refuse a DUPLICATE event carrying the same token
 * (it matches `runningRunId`, exactly like a replayed begin step, which must pass):
 * Inngest idempotency on the runner and an event id on both producers do that.
 * All of these are runtime bookkeeping written with `timestamps: false`, so
 * `updatedAt` keeps meaning "an admin edited this schedule".
 */
export type ScheduleKind = "once" | "recurring";
export type ScheduleRunStatus = "success" | "error" | "partial";

export interface IWhatsAppSchedule extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  enabled: boolean;
  kind: ScheduleKind;
  runAt?: Date;
  cron?: string;
  timezone: string;
  template: { templateName: string; language: string; params: string[] };
  audience: { targetAll: boolean; targetRoles: string[] };
  nextRunAt?: Date;
  lockedUntil?: Date;
  activeRunId?: string;
  runningRunId?: string;
  lastRunAt?: Date;
  lastRunStatus?: ScheduleRunStatus;
  lastRunSummary?: { sent: number; failed: number; skipped: number };
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const WhatsAppScheduleSchema = new Schema<IWhatsAppSchedule>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    enabled: { type: Boolean, default: true },
    kind: { type: String, enum: ["once", "recurring"], required: true },
    runAt: Date,
    cron: { type: String, maxlength: 64 },
    timezone: { type: String, default: "Asia/Dubai", maxlength: 64 },
    template: {
      templateName: { type: String, required: true, maxlength: 512 },
      language: { type: String, required: true, maxlength: 16 },
      params: { type: [String], default: [] },
    },
    audience: {
      targetAll: { type: Boolean, default: false },
      targetRoles: { type: [String], default: [] },
    },
    nextRunAt: Date,
    lockedUntil: Date,
    activeRunId: String,
    runningRunId: String,
    lastRunAt: Date,
    lastRunStatus: { type: String, enum: ["success", "error", "partial"] },
    lastRunSummary: {
      sent: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

export const WhatsAppSchedule =
  mongoose.models.WhatsAppSchedule ||
  mongoose.model<IWhatsAppSchedule>("WhatsAppSchedule", WhatsAppScheduleSchema);

export default WhatsAppSchedule;
