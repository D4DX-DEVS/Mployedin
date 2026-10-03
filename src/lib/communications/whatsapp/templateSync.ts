import logger from "@/lib/logger";
import WhatsAppTemplate from "@/models/WhatsAppTemplate";
import { listTemplates, type MetaTemplate, type MetaTemplateComponent } from "./cloudApi";

const PARAM_RE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** Body text plus how many parameters it takes (positional `{{1}}` or named `{{first_name}}`). */
export function describeBody(components?: MetaTemplateComponent[]): {
  bodyText: string;
  bodyParamCount: number;
  bodyParamNames: string[];
  headerFormat?: string;
} {
  const body = components?.find((c) => c.type?.toUpperCase() === "BODY");
  const header = components?.find((c) => c.type?.toUpperCase() === "HEADER");
  const bodyText = body?.text ?? "";
  const names = [...bodyText.matchAll(PARAM_RE)].map((m) => m[1]);
  const positional = names.length > 0 && names.every((n) => /^\d+$/.test(n));
  const unique = [...new Set(names)];
  return {
    bodyText,
    bodyParamCount: positional ? Math.max(...unique.map(Number)) : unique.length,
    bodyParamNames: positional ? [] : unique,
    headerFormat: header?.format,
  };
}

/** Meta spells "no rejection reason" as `NONE` (template list and status webhook alike). */
export function rejectionReason(raw?: string): string | undefined {
  return raw && raw.toUpperCase() !== "NONE" ? raw : undefined;
}

/**
 * The update for one template. A field Meta does not report is unset rather than
 * left out: Mongoose drops `undefined` from a `$set`, which would leave a stale
 * `rejectedReason` on a template that was rejected, then approved.
 */
function toUpdate(t: MetaTemplate) {
  const body = describeBody(t.components);
  const $set: Record<string, unknown> = {
    name: t.name,
    language: t.language,
    category: t.category,
    status: t.status,
    bodyText: body.bodyText,
    bodyParamCount: body.bodyParamCount,
    bodyParamNames: body.bodyParamNames,
    components: t.components ?? [],
    lastSyncedAt: new Date(),
  };
  const $unset: Record<string, ""> = {};
  const optional = {
    headerFormat: body.headerFormat,
    qualityScore: t.quality_score?.score,
    rejectedReason: rejectionReason(t.rejected_reason),
  };
  for (const [field, value] of Object.entries(optional)) {
    if (value === undefined) $unset[field] = "";
    else $set[field] = value;
  }
  return Object.keys($unset).length > 0 ? { $set, $unset } : { $set };
}

/**
 * Pull every template from the WABA and mirror it. Rows Meta no longer lists
 * are marked DELETED (kept for log history), never removed. The one exception
 * is a row that a re-created template has taken over: the unique (name, language)
 * index allows a single row per pair, so the old row (same pair, another Meta id)
 * is replaced by the new one.
 *
 * An empty list retires nothing: a WABA with every template deleted is far less
 * likely than a wrong WHATSAPP_BUSINESS_ACCOUNT_ID or a glitch, and retiring
 * would switch off every automation's template at once.
 */
export async function syncTemplatesFromMeta(): Promise<{ total: number; upserted: number; retired: number }> {
  const templates = await listTemplates();
  if (templates.length === 0) {
    logger.warn("[whatsapp] template sync: Meta listed no templates, so none were retired");
    return { total: 0, upserted: 0, retired: 0 };
  }
  await WhatsAppTemplate.deleteMany({
    $or: templates.map((t) => ({ name: t.name, language: t.language, metaId: { $ne: t.id } })),
  });
  await WhatsAppTemplate.bulkWrite(
    templates.map((t) => ({
      updateOne: { filter: { metaId: t.id }, update: toUpdate(t), upsert: true },
    })),
    { ordered: false },
  );
  const retired = await WhatsAppTemplate.updateMany(
    { metaId: { $nin: templates.map((t) => t.id) }, status: { $ne: "DELETED" } },
    { $set: { status: "DELETED" } },
  );
  return { total: templates.length, upserted: templates.length, retired: retired.modifiedCount ?? 0 };
}
