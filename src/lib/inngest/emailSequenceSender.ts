/**
 * Email Sequence Sender — Inngest Cron Function
 *
 * Runs hourly. For every active email sequence that has at least one due,
 * active recipient, sends the recipient's next step e-mail, then advances the
 * recipient to the following step (scheduling it `delayDays` later) or marks
 * them complete when the sequence is exhausted.
 *
 * Idempotency: each recipient is persisted immediately after a successful send
 * (its `nextSendAt` moves forward), so an Inngest retry re-fetches and skips
 * recipients that were already advanced — no double-sends.
 */

import { inngest } from "./client";
import { connectDB } from "@/lib/db/mongoose";
import EmailSequence, {
  type IEmailSequence,
  type IEmailSequenceStep,
  type ISequenceRecipient,
} from "@/models/EmailSequence";
import { sendEmail } from "@/lib/communications/email";
import { isCronEnabled, updateCronRunStatus } from "@/models/SystemConfig";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SEQUENCES_PER_RUN = 100;
const MAX_SENDS_PER_RUN = 500;

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Replace {{name}} / {{firstName}} tokens with the recipient's details. */
function applyTokens(text: string, name: string): string {
  const safeName = (name || "").trim();
  const firstName = safeName.split(/\s+/)[0] || safeName;
  return text
    .replace(/\{\{\s*name\s*\}\}/gi, safeName)
    .replace(/\{\{\s*firstName\s*\}\}/gi, firstName);
}

/** Render an employer-authored plain-text body into a safe, branded HTML email. */
function renderBody(rawBody: string, recipientName: string): string {
  const withTokens = applyTokens(rawBody, recipientName);
  const safe = escapeHtml(withTokens).replace(/\r?\n/g, "<br/>");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;">${safe}</div>`;
}

export const emailSequenceSenderCron = inngest.createFunction(
  {
    id: "email-sequence-sender",
    name: "Email Sequence Sender",
    retries: 2,
    concurrency: { limit: 3 },
    triggers: [{ cron: "0 * * * *" }], // hourly
  },
  async ({ step }: { step: any }) => {
    await step.run("connect-db", () => connectDB());

    const enabled = await step.run("check-enabled", () => isCronEnabled("emailSequenceSender"));
    if (!enabled) {
      await step.run("log-skipped", () =>
        updateCronRunStatus("emailSequenceSender", "success", "Skipped — disabled by admin"),
      );
      return { skipped: true, reason: "disabled by admin" };
    }

    const now = new Date();
    let sent = 0;
    let completed = 0;
    let processed = 0;

    // Fetched OUTSIDE step.run so the documents stay hydrated for .save().
    const sequences = (await EmailSequence.find({
      status: "active",
      recipients: { $elemMatch: { status: "active", nextSendAt: { $lte: now } } },
    }).limit(MAX_SEQUENCES_PER_RUN)) as IEmailSequence[];

    for (const sequence of sequences) {
      if (sent >= MAX_SENDS_PER_RUN) break;
      processed++;

      const orderedSteps = [...sequence.steps].sort(
        (a: IEmailSequenceStep, b: IEmailSequenceStep) => a.order - b.order,
      );
      let dirty = false;

      for (const recipient of sequence.recipients) {
        if (sent >= MAX_SENDS_PER_RUN) break;
        if (recipient.status !== "active") continue;
        if (!recipient.nextSendAt || recipient.nextSendAt.getTime() > now.getTime()) continue;

        // Recipient already past the last step → mark complete.
        if (recipient.currentStep >= orderedSteps.length) {
          recipient.status = "completed";
          recipient.nextSendAt = undefined;
          dirty = true;
          completed++;
          continue;
        }
        // Defensive: a recipient with no e-mail can never be delivered.
        if (!recipient.email) {
          recipient.status = "bounced";
          dirty = true;
          continue;
        }

        const stepDef = orderedSteps[recipient.currentStep];
        const subject = applyTokens(stepDef.subject || "", recipient.name) || sequence.name;
        const html = renderBody(stepDef.body || "", recipient.name);

        try {
          await sendEmail({
            to: recipient.email,
            subject,
            html,
            replyTo: sequence.fromEmail || undefined,
            senderName: sequence.fromName || undefined,
            employerId: sequence.employerId.toString(),
            source: "email-sequence",
            category: "marketing",
          });
        } catch (err) {
          // Leave nextSendAt unchanged so the step retries on the next run.
          console.error(`[email-sequence] send failed seq=${sequence._id} to=${recipient.email}:`, err);
          continue;
        }

        recipient.currentStep += 1;
        recipient.lastSentAt = now;
        sequence.totalSent += 1;
        sent++;

        if (recipient.currentStep >= orderedSteps.length) {
          recipient.status = "completed";
          recipient.nextSendAt = undefined;
          completed++;
        } else {
          const nextStep = orderedSteps[recipient.currentStep];
          recipient.nextSendAt = new Date(now.getTime() + (nextStep.delayDays || 0) * DAY_MS);
        }

        // Persist immediately so retries don't re-send this recipient.
        await sequence.save();
        dirty = false;
      }

      // Auto-complete the sequence once no recipient is still active.
      if (
        sequence.recipients.length > 0 &&
        sequence.recipients.every((r: ISequenceRecipient) => r.status !== "active")
      ) {
        sequence.status = "completed";
        dirty = true;
      }

      if (dirty) await sequence.save();
    }

    await step.run("log-success", () =>
      updateCronRunStatus(
        "emailSequenceSender",
        "success",
        `Processed ${processed} sequences, sent ${sent}, completed ${completed}`,
      ),
    );

    return { processed, sent, completed };
  },
);
