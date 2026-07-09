/**
 * Admin Broadcast Sender — Inngest event function.
 *
 * A platform broadcast (targetAll) can reach 100k+ users. Fanning that out
 * inline in the request handler blows the serverless timeout and memory, and a
 * single `insertMany`/`sendEmail` loop over every user is exactly the kind of
 * work that must not live on the request path. This function is triggered by the
 * "admin/broadcast" event and streams recipients in `_id`-cursor batches — each
 * batch is its own durable Inngest step, so the job survives restarts and never
 * holds all recipients in memory at once.
 */

import { inngest } from "./client";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import Notification from "@/models/Notification";
import { sendEmail } from "@/lib/communications/email";
import logger from "@/lib/logger";
import type { AdminBroadcastEvent } from "./events";

// 50 recipients per batch: sequential batches keep concurrent email sends
// bounded (≤50 in flight) so we don't trip the email provider's rate limit.
// ponytail: add Inngest `throttle` if the provider needs a hard per-second cap.
const BATCH_SIZE = 50;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function broadcastHtml(title: string, message: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff;border-radius:8px;border:1px solid #e5e7eb;">
    <div style="background:#0a2a6e;padding:20px 24px;border-radius:6px 6px 0 0;text-align:center;margin-bottom:24px;">
      <h1 style="color:#fff;margin:0;font-size:20px;letter-spacing:1px;">MPLOYEDIN</h1>
    </div>
    <h2 style="color:#0a2a6e;margin:0 0 16px;">${esc(title)}</h2>
    <p style="color:#374151;font-size:15px;line-height:1.6;white-space:pre-wrap;">${esc(message)}</p>
  </div>`;
}

export const adminBroadcastSender = inngest.createFunction(
  { id: "admin-broadcast-sender", name: "Admin Broadcast Sender", retries: 2, concurrency: { limit: 3 } },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async ({ event, step }: { event: AdminBroadcastEvent; step: any }) => {
    const { title, message, targetRoles, targetAll, channels } = event.data;

    await step.run("connect-db", () => connectDB());

    const baseQuery: Record<string, unknown> = { isActive: true };
    if (!targetAll && targetRoles && targetRoles.length > 0) {
      baseQuery.role = targetRoles.length === 1 ? targetRoles[0] : { $in: targetRoles };
    }
    const needsEmail = channels.includes("email");
    const needsInApp = channels.includes("in_app");
    const html = needsEmail ? broadcastHtml(title, message) : "";

    let lastId: string | null = null;
    let batchIndex = 0;
    let totalInApp = 0;
    let totalEmail = 0;

    // Cursor over users by ascending _id so no single step ever loads the whole
    // recipient set. Each batch is a durable step; the loop replays deterministically.
    for (;;) {
      const result = await step.run(`batch-${batchIndex}`, async () => {
        const q = { ...baseQuery, ...(lastId ? { _id: { $gt: lastId } } : {}) };
        const users = (await User.find(q)
          .sort({ _id: 1 })
          .limit(BATCH_SIZE)
          .select(`_id${needsEmail ? " email name" : ""}`)
          .lean()) as Array<{ _id: unknown; email?: string; name?: string }>;

        if (!users.length) return { done: true as const };

        if (needsInApp) {
          await Notification.insertMany(
            users.map((u) => ({
              userId: u._id,
              type: "system",
              title,
              body: message,
              channels,
              isSent: true,
              sentAt: new Date(),
            })),
            { ordered: false },
          );
        }

        let emailSent = 0;
        if (needsEmail) {
          const settled = await Promise.allSettled(
            users
              .filter((u) => u.email)
              .map((u) =>
                sendEmail({
                  to: u.email as string,
                  subject: title,
                  html,
                  userId: String(u._id),
                  source: "broadcast",
                  category: "system",
                }),
              ),
          );
          emailSent = settled.filter((r) => r.status === "fulfilled").length;
        }

        return {
          done: false as const,
          lastId: String(users[users.length - 1]._id),
          inApp: needsInApp ? users.length : 0,
          emailSent,
        };
      });

      if (result.done) break;
      lastId = result.lastId;
      totalInApp += result.inApp;
      totalEmail += result.emailSent;
      batchIndex += 1;
    }

    logger.info({ totalInApp, totalEmail, batches: batchIndex }, "[admin-broadcast] delivery complete");
    return { totalInApp, totalEmail, batches: batchIndex };
  },
);
