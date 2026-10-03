import WhatsAppTemplate from "@/models/WhatsAppTemplate";
import type { WhatsAppSettings } from "@/models/SystemConfig";
import { whatsAppMode } from "./config";
import { AUTOMATION_DEFAULTS, DEFAULT_AUTOMATION_PARAMS, automationForType, resolveTemplateLanguage, type AutomationKey } from "./automationDefaults";

export interface AutomationBinding {
  key: AutomationKey;
  templateName: string;
  language: string;
  params: string[];
}

/**
 * Which approved template a notification type should use for this user, or
 * null when the type has no automation, the admin turned it off, or Meta has
 * not approved the template in any language we send.
 *
 * A template is always looked up by (name, language), never by _id: the sync
 * can delete and re-create rows, so an _id reference would dangle.
 */
export async function resolveAutomationBinding(type: string, locale: string | undefined | null, settings: WhatsAppSettings): Promise<AutomationBinding | null> {
  const key = automationForType(type);
  if (!key) return null;
  const auto = settings.automations?.[key] ?? AUTOMATION_DEFAULTS[key];
  if (!auto.enabled || !auto.templateName) return null;

  const preferred = resolveTemplateLanguage(locale);
  // A copy either way: the stored array and the frozen default must stay untouched.
  // Only an absent list takes the defaults: an explicit [] is a template with no body variables.
  const params = [...(Array.isArray(auto.params) ? auto.params : DEFAULT_AUTOMATION_PARAMS)];

  // Mock mode has no synced templates; pretend the preferred language exists so
  // dev and tests still produce "mock" log rows end to end.
  if (whatsAppMode() === "mock") return { key, templateName: auto.templateName, language: preferred, params };

  const order = [...new Set([preferred, "en", "en_US"])];
  const rows = (await WhatsAppTemplate.find({ name: auto.templateName, status: "APPROVED", language: { $in: order } })
    .select("language")
    .lean()) as Array<{ language: string }>;
  if (rows.length === 0) return null;
  const language = rows.map((r) => r.language).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
  return { key, templateName: auto.templateName, language, params };
}
