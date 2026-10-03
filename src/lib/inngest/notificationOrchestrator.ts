/**
 * Notification Orchestrator — Inngest function
 *
 * Central routing layer between business logic and delivery channels.
 * Handles: preference checking, deduplication, channel routing, retries.
 *
 * Flow: emitEvent("notification/instant") → this function →
 *   ├─ Check user NotificationPreference
 *   ├─ Deduplicate (no identical earlier notification within 5 min)
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
import { unsubscribeUrl, notificationSettingsPath } from "@/lib/communications/unsubscribeLink";
import { deliverNotificationWhatsApp } from "@/lib/communications/whatsapp/notificationDelivery";
import { sendPushToUser, isPushEnabled } from "@/lib/push";
import { getSystemConfig, getUserOverride } from "@/models/SystemConfig";
import { localizeActionUrl } from "@/lib/notifications/resolve";
import type { NotificationInstantEvent } from "./events";
import { IntlMessageFormat } from "intl-messageformat";
import enMessages from "../../../messages/en.json";
import arMessages from "../../../messages/ar.json";

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
  async ({ event, step }: {
    event: { data: NotificationInstantEvent["data"] };
    step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> };
  }) => {
    const { userId, type, title, message, link, sendEmail: wantEmail, sendWhatsApp: wantWhatsApp, titleKey, bodyKey, params, notificationId } = event.data;

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

    // 1. Deduplication — skip if an identical notification was written just
    // before this one. notify() writes this run's own row before emitting, so
    // that row (and any later one) is excluded: matching it made every run a
    // "duplicate" from 2026-04-17 until 2026-10-02. Only rows with a smaller _id
    // than ours count, so two identical events are never both dropped: the one
    // whose row has the smaller id finds no earlier twin and is delivered. An
    // ObjectId is ordered by creation time only within one server (across servers
    // only to the second), so in a rare cross-instance race both can be
    // delivered; losing a notification would be worse. Body and link are matched
    // too (a link-less event matches link-less rows only), so two different
    // updates sharing a generic title ("Application Status Updated") are both
    // delivered. Served by the { userId, type, createdAt } index in
    // lib/db/indexes.ts.
    const isDuplicate = await step.run("check-dedup", async () => {
      const recent = await Notification.findOne({
        userId,
        type,
        title,
        body: message,
        actionUrl: link ?? null,
        ...(notificationId ? { _id: { $lt: notificationId } } : {}),
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

    // No phone or WhatsApp consent state here: Inngest stores step output, and the WhatsApp step re-reads both at send time.
    const recipient = await step.run("load-recipient", () =>
      User.findById(userId).select("name email role locale").lean(),
    ) as { name?: string; email?: string; role?: string; locale?: string } | null;
    const localized = localizeNotification({
      locale: recipient?.locale,
      title,
      message,
      titleKey,
      bodyKey,
      params,
    });
    // Email and push links need a locale segment. notify() stores the link
    // without one, and src/proxy.ts reads the first path segment as the locale,
    // so "/job-seeker/interviews" sent a signed-out click into a login redirect
    // loop. localizeActionUrl adds the recipient's locale to a bare path and
    // swaps a leading /en or /ar for it (it returns null for no usable link).
    // Only this delivery link is localized: dedup above matches the stored one.
    const deliveryLink = localizeActionUrl(link, recipient?.locale === "ar" ? "ar" : "en") ?? undefined;

    // 4. Email delivery
    const shouldEmail = wantEmail && categoryPref.channels.includes("email");
    if (shouldEmail) {
      await step.run("send-email", async () => {
        if (!recipient?.email) return;

        await sendEmail({
          to: recipient.email,
          subject: localized.title,
          html: buildNotificationEmailHtml(localized.title, localized.message, deliveryLink, {
            userId,
            category,
            role: recipient.role,
            locale: recipient.locale,
          }),
          userId,
          source: "orchestrator",
          category,
        });
      });
      deliveredChannels.push("email");
    }

    // 5. WhatsApp delivery — approved template outside the 24 h window, free
    // text inside it, otherwise a logged skip (notificationDelivery.ts).
    const shouldWhatsApp = wantWhatsApp && categoryPref.channels.includes("whatsapp");
    if (shouldWhatsApp) {
      const outcome = await step.run("send-whatsapp", () =>
        deliverNotificationWhatsApp({ userId, type, category, recipient, title: localized.title, message: localized.message, params }),
      );
      if (outcome.status === "sent" || outcome.status === "mock") deliveredChannels.push("whatsapp");
    }

    // 6. Web Push delivery — mirrors the in-app notification. Only runs when
    // VAPID keys are configured AND the user's category is enabled (checked above).
    if (isPushEnabled()) {
      await step.run("send-push", () =>
        sendPushToUser(userId, { title: localized.title, body: localized.message, link: deliveryLink })
      );
      deliveredChannels.push("push");
    }

    return { delivered: deliveredChannels, type, userId };
  },
);

function localizeNotification(input: {
  locale?: string;
  title: string;
  message: string;
  titleKey?: string;
  bodyKey?: string;
  params?: Record<string, unknown>;
}): { title: string; message: string } {
  const locale = input.locale === "ar" ? "ar" : "en";
  const messages = locale === "ar" ? arMessages : enMessages;
  const namespace = messages.notificationContent as Record<string, unknown>;
  const format = (key: string | undefined, fallback: string) => {
    const template = key ? namespace[key] : undefined;
    if (typeof template !== "string") return fallback;
    try {
      return String(new IntlMessageFormat(template, locale).format(input.params ?? {}));
    } catch {
      return fallback;
    }
  };
  return {
    title: format(input.titleKey, input.title),
    message: format(input.bodyKey, input.message),
  };
}

/**
 * Build a branded notification email HTML.
 *
 * The unsubscribe link turns off just this notification's category. It used
 * to be `?ref=email` with no token, which the route answers with an error page.
 */
function buildNotificationEmailHtml(
  title: string,
  message: string,
  link: string | undefined,
  recipient: { userId: string; category: string; role?: string; locale?: string },
): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin.com";
  const unsubHref = unsubscribeUrl(baseUrl, recipient.userId, { category: recipient.category, ref: "email" });
  const unsubLink = unsubHref
    ? ` |
          <a href="${unsubHref.replace(/&/g, "&amp;")}" style="color: #6b7280;">Unsubscribe</a>`
    : "";
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
          <a href="${escapeHtml(`${baseUrl}${link}`)}" style="background: #0D6FD8; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">View Details</a>
        </div>` : ""}
      </div>
      <div style="padding: 16px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; background: #f9fafb;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
          You're receiving this because of your notification settings.
          <a href="${baseUrl}${notificationSettingsPath(recipient.role, recipient.locale ?? "en")}" style="color: #6b7280;">Manage preferences</a>${unsubLink}
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
