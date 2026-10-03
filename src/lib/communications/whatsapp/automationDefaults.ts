/**
 * Which transactional notifications may go out on WhatsApp, and the template
 * each one uses by default. Pure data: SystemConfig imports this for schema
 * defaults, so it must not import models.
 */
export const AUTOMATION_KEYS = [
  "applicationReceived",
  "applicationStatus",
  "interviewInvite",
  "interviewScheduled",
  "interviewReminder",
  "offerUpdate",
  "commissionPaid",
] as const;

export type AutomationKey = (typeof AUTOMATION_KEYS)[number];

export interface AutomationConfig {
  enabled: boolean;
  templateName: string;
  /** Body parameter values; tokens are resolved per recipient (tokens.ts). */
  params: string[];
}

/**
 * {{1}} = first name, {{2}} = the localized notification sentence. Frozen:
 * every default shares it, so anything that needs a mutable list copies it.
 */
export const DEFAULT_AUTOMATION_PARAMS: readonly string[] = Object.freeze(["{{firstName}}", "{{message}}"]);

export const AUTOMATION_DEFAULTS: Record<AutomationKey, Omit<AutomationConfig, "params"> & { params: readonly string[]; types: readonly string[] }> = {
  applicationReceived: { enabled: true, templateName: "mployedin_application_received", params: DEFAULT_AUTOMATION_PARAMS, types: ["application_received"] },
  applicationStatus: { enabled: true, templateName: "mployedin_application_status", params: DEFAULT_AUTOMATION_PARAMS, types: ["application_status_update", "application_update"] },
  interviewInvite: { enabled: true, templateName: "mployedin_interview_invite", params: DEFAULT_AUTOMATION_PARAMS, types: ["application_invite"] },
  interviewScheduled: { enabled: true, templateName: "mployedin_interview_scheduled", params: DEFAULT_AUTOMATION_PARAMS, types: ["interview_scheduled", "interview_update"] },
  interviewReminder: { enabled: true, templateName: "mployedin_interview_reminder", params: DEFAULT_AUTOMATION_PARAMS, types: ["interview_reminder"] },
  offerUpdate: { enabled: true, templateName: "mployedin_offer_update", params: DEFAULT_AUTOMATION_PARAMS, types: ["offer_update"] },
  commissionPaid: { enabled: true, templateName: "mployedin_commission_paid", params: DEFAULT_AUTOMATION_PARAMS, types: ["payment"] },
};

export function automationForType(type: string): AutomationKey | null {
  for (const key of AUTOMATION_KEYS) {
    if (AUTOMATION_DEFAULTS[key].types.includes(type)) return key;
  }
  return null;
}

/** Meta template languages we maintain. Anything but Arabic gets English. */
export function resolveTemplateLanguage(locale?: string | null): "en" | "ar" {
  return locale === "ar" ? "ar" : "en";
}

export function defaultAutomation(key: AutomationKey): AutomationConfig {
  const d = AUTOMATION_DEFAULTS[key];
  return { enabled: d.enabled, templateName: d.templateName, params: [...d.params] };
}
