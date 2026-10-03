/**
 * Meta WhatsApp Cloud API configuration. Env-only by decision (spec §1):
 * the keys are never stored in Mongo or returned by an API.
 *
 *   WHATSAPP_ACCESS_TOKEN          System User token (or the 24 h test token)
 *   WHATSAPP_PHONE_NUMBER_ID       Phone number ID (numeric), not the number
 *   WHATSAPP_BUSINESS_ACCOUNT_ID   WABA id — template sync only
 *   WHATSAPP_APP_SECRET            App secret — webhook signatures
 *   WHATSAPP_WEBHOOK_VERIFY_TOKEN  Our own random string, pasted into Meta
 *   WHATSAPP_GRAPH_API_VERSION     optional, default v24.0
 */

export interface WhatsAppEnv {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string | null;
  appSecret: string;
  webhookVerifyToken: string;
  apiVersion: string;
}

const DEFAULT_API_VERSION = "v24.0";

/** Raw read, every call — tests toggle env between cases. Empty string when unset. */
export function readWhatsAppEnv() {
  const s = (k: string) => process.env[k]?.trim() ?? "";
  return {
    accessToken: s("WHATSAPP_ACCESS_TOKEN"),
    phoneNumberId: s("WHATSAPP_PHONE_NUMBER_ID"),
    businessAccountId: s("WHATSAPP_BUSINESS_ACCOUNT_ID"),
    appSecret: s("WHATSAPP_APP_SECRET"),
    webhookVerifyToken: s("WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
    apiVersion: s("WHATSAPP_GRAPH_API_VERSION") || DEFAULT_API_VERSION,
  };
}

export function isWhatsAppEnabled(): boolean {
  const e = readWhatsAppEnv();
  return Boolean(e.accessToken && e.phoneNumberId && e.appSecret && e.webhookVerifyToken);
}

export function whatsAppMode(): "live" | "mock" {
  return isWhatsAppEnabled() ? "live" : "mock";
}

/** Config for a live call. Throws in mock mode — callers check `isWhatsAppEnabled()` first. */
export function getWhatsAppEnv(): WhatsAppEnv {
  if (!isWhatsAppEnabled()) throw new Error("WhatsApp is not configured (WHATSAPP_* env vars)");
  const e = readWhatsAppEnv();
  return { ...e, businessAccountId: e.businessAccountId || null };
}
