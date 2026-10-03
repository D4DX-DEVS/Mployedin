import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import { whatsAppConfigUpdateSchema } from "@/lib/validators/whatsapp";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import logger from "@/lib/logger";
import SystemConfig, { readWhatsAppSettings, type WhatsAppSettings } from "@/models/SystemConfig";
import { AUTOMATION_KEYS } from "@/lib/communications/whatsapp/automationDefaults";
import { whatsAppMode } from "@/lib/communications/whatsapp/config";

interface AuthCtx { userId: string; role: string; locale: string }

/**
 * GET /api/admin/whatsapp/config — master switch, daily cap, automations.
 * 503 when the config cannot be read: the senders' fail-closed defaults are not
 * what the admin chose, and an editor that loaded them would save them back.
 */
async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await connectDB();
  let config: WhatsAppSettings;
  try {
    config = await readWhatsAppSettings();
  } catch (err) {
    logger.warn({ err }, "[whatsapp] config unreadable: the admin editor gets 503");
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  return NextResponse.json({ config, mode: whatsAppMode() });
}

/**
 * PATCH /api/admin/whatsapp/config — partial update. The switch and the cap are
 * dotted paths. An automation is written as one whole { enabled, templateName,
 * params } object at its key, with the request merged over its current effective
 * value: a leaf $set on a key the document never stored would create a subdocument
 * without templateName. The merge base is read with `readWhatsAppSettings`, which
 * throws: if it cannot be read, nothing is written and the answer is 503, because
 * the senders' fail-closed defaults would be merged over what the admin saved.
 */
async function patchHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await connectDB();
  const body = await validateBody(req, whatsAppConfigUpdateSchema);

  const $set: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") $set["whatsapp.enabled"] = body.enabled;
  if (typeof body.dailyCapPerUser === "number") $set["whatsapp.dailyCapPerUser"] = body.dailyCapPerUser;

  let current: WhatsAppSettings | undefined;
  for (const key of AUTOMATION_KEYS) {
    const auto = body.automations?.[key];
    if (!auto || (auto.enabled === undefined && auto.templateName === undefined && auto.params === undefined)) continue;
    if (!current) {
      try {
        current = await readWhatsAppSettings();
      } catch (err) {
        logger.warn({ err }, "[whatsapp] config unreadable: the save is refused, nothing written");
        return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
      }
    }
    const base = current.automations[key];
    const merged = {
      enabled: auto.enabled ?? base.enabled,
      templateName: auto.templateName ?? base.templateName,
      // An explicit [] is a template with no body variables; only an absent list inherits.
      params: [...(auto.params ?? base.params)],
    };
    // Meta rejects an empty body parameter, so an enabled automation with one would fail every send (the editor blocks it too).
    if (merged.enabled && merged.params.some((p) => p.trim() === "")) {
      return NextResponse.json({ error: "An enabled automation cannot have an empty parameter" }, { status: 400 });
    }
    $set[`whatsapp.automations.${key}`] = merged;
  }
  if (Object.keys($set).length === 0) return NextResponse.json({ error: "No valid updates provided" }, { status: 400 });
  $set.updatedBy = ctx.userId;

  await SystemConfig.findOneAndUpdate({ key: "notification_system" }, { $set }, { upsert: true, returnDocument: "after" });
  await logActivity({ ...actorFromCtx(ctx), action: "admin.whatsapp.config.update", resource: "notifications", changes: { after: $set }, req });
  // The save has happened, so a failed read-back is not a failed save. The answer then has no `config`
  // (never the fail-closed defaults); the page keeps what it sent.
  let config: WhatsAppSettings | undefined;
  try {
    config = await readWhatsAppSettings();
  } catch (err) {
    logger.warn({ err }, "[whatsapp] config saved but could not be read back");
  }
  return NextResponse.json({ ...(config ? { config } : {}), mode: whatsAppMode() });
}

export const GET = withAuth(getHandler, { resource: "notifications", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "notifications", action: "update" });
