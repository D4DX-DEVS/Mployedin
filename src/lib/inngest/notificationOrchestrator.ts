/**
 * Notification Orchestrator — Inngest function
 *
 * Central routing layer between business logic and delivery channels.
 * Handles: preference checking, deduplication, channel routing, retries.
 *
 * Flow: emitEvent("notification/instant") → this function →
 *   ├─ Check user NotificationPreference
 *   ├─ Deduplicate (no same type+userId within 5 min)
 *   ├─ Route to enabled channels
 *   └─ Deliver: Email / WhatsApp / In-app (via existing services)
 */

import { inngest } from "./client";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import Notification from "@/models/Notification";
import {
  getOrCreatePreferences,
  typeToCategory,
} from "@/models/NotificationPreference";
import { sendEmail } from "@/lib/communications/email";
import { sendWhatsApp } from "@/lib/communications/whatsapp";
import { sendPushToUser, isPushEnabled } from "@/lib/push";
import { getSystemConfig, getUserOverride } from "@/models/SystemConfig";
import type { NotificationInstantEvent } from "./events";

const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export const notificationOrchestrator = inngest.createFunction(
  {
    id: "notification-orchestrator",
    name: "Notification Orchestrator",
    retries: 3,
    // Inngest free plan caps account concurrency at 5; higher limits are
    // rejected at sync time ("higher concurrency limits than your plan").
    concurrency: { limit: 5 },
    triggers: [{ event: "notification/instant" }],
  },
  async ({ event, step }: { event: { data: NotificationInstantEvent["data"] }; step: any }) => {
    const { userId, type, title, message, link, sendEmail: wantEmail, sendWhatsApp: wantWhatsApp, metadata } = event.data;

    await connectDB();

    // 0. System-wide maintenance check + user-level admin override
    const systemBlock = await step.run("check-system-config", async () => {
      const config = await getSystemConfig();
      if (config.globalDefaults.maintenanceMode) {
        return { blocked: true, reason: "maintenance mode" };
      }
      const override = await getUserOverride(userId);
      if (override?.action === "force_unsubscribe" || override?.action === "pause_emails") {
        return { blocked: true, reason: `admin override: ${override.action}` };
      }
      return { blocked: false };
    });

    if (systemBlock.blocked) {
      return { skipped: true, reason: systemBlock.reason };
    }

    // 1. Deduplication — skip if identical notification sent recently
    const isDuplicate = await step.run("check-dedup", async () => {
      const recent = await Notification.findOne({
        userId,
        type,
        title,
        createdAt: { $gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
      }).lean();
      return !!recent;
    });

    if (isDuplicate) {
      return { skipped: true, reason: "duplicate within 5 min window" };
    }

    // In-app notification is already created synchronously in notify() (trigger.ts).
    // The orchestrator only handles async delivery: email & whatsapp.

    // 3. Check user preferences
    const prefs = await step.run("load-preferences", () =>
      getOrCreatePreferences(userId).then((p) => p.toObject()),
    );

    if (prefs.unsubscribedAll) {
      return { delivered: ["in_app"], skipped_channels: ["email", "whatsapp"], reason: "unsubscribed" };
    }

    const category = typeToCategory(type);
    const categoryPref = prefs.categories[category];

    if (!categoryPref?.enabled) {
      return { delivered: ["in_app"], skipped_channels: ["email", "whatsapp"], reason: `category ${category} disabled` };
    }

    const deliveredChannels: string[] = ["in_app"];

    // 4. Email delivery
    const shouldEmail = wantEmail && categoryPref.channels.includes("email");
    if (shouldEmail) {
      await step.run("send-email", async () => {
        const user = await User.findById(userId).select("name email").lean();
        if (!user?.email) return;

        await sendEmail({
          to: user.email,
          subject: title,
          html: buildNotificationEmailHtml(title, message, link),
          userId,
          source: "orchestrator",
          category,
        });
      });
      deliveredChannels.push("email");
    }

    // 5. WhatsApp delivery
    const shouldWhatsApp = wantWhatsApp && categoryPref.channels.includes("whatsapp");
    if (shouldWhatsApp) {
      await step.run("send-whatsapp", async () => {
        const user = await User.findById(userId).select("phone").lean();
        const phone = (user as { phone?: string } | null)?.phone;
        if (!phone) return;

        await sendWhatsApp({
          to: phone,
          body: `${title}\n\n${message}`,
        });
      });
      deliveredChannels.push("whatsapp");
    }

    // 6. Web Push delivery — mirrors the in-app notification. Only runs when
    // VAPID keys are configured AND the user's category is enabled (checked above).
    if (isPushEnabled()) {
      await step.run("send-push", () =>
        sendPushToUser(userId, { title, body: message, link })
      );
      deliveredChannels.push("push");
    }

    return { delivered: deliveredChannels, type, userId };
  },
);

/**
 * Build a branded notification email HTML.
 * Includes unsubscribe footer with placeholder for token-based link.
 */
function buildNotificationEmailHtml(
  title: string,
  message: string,
  link?: string,
): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin.com";
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #0D6FD8; padding: 24px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">MPLOYEDIN</h1>
      </div>
      <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
        <h2 style="color: #111827; margin: 0 0 12px;">${escapeHtml(title)}</h2>
        <p style="color: #374151; line-height: 1.6;">${escapeHtml(message)}</p>
        ${link ? `
        <div style="text-align: center; margin: 24px 0;">
          <a href="${baseUrl}${link}" style="background: #0D6FD8; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">View Details</a>
        </div>` : ""}
      </div>
      <div style="padding: 16px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; background: #f9fafb;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
          You're receiving this because of your notification settings.
          <a href="${baseUrl}/en/settings/notifications" style="color: #6b7280;">Manage preferences</a> |
          <a href="${baseUrl}/api/unsubscribe?ref=email" style="color: #6b7280;">Unsubscribe</a>
        </p>
      </div>
    </div>
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
