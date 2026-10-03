/**
 * @jest-environment node
 */
import { readWhatsAppEnv, isWhatsAppEnabled, whatsAppMode, getWhatsAppEnv } from "@/lib/communications/whatsapp/config";

const KEYS = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_BUSINESS_ACCOUNT_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_WEBHOOK_VERIFY_TOKEN", "WHATSAPP_GRAPH_API_VERSION"];

afterEach(() => { for (const k of KEYS) delete process.env[k]; });

describe("whatsapp env config", () => {
  it("is mock mode with no keys", () => {
    expect(isWhatsAppEnabled()).toBe(false);
    expect(whatsAppMode()).toBe("mock");
    expect(() => getWhatsAppEnv()).toThrow(/not configured/);
  });

  it("is live with the four required keys and defaults the API version", () => {
    process.env.WHATSAPP_ACCESS_TOKEN = "tok";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
    process.env.WHATSAPP_APP_SECRET = "sec";
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify";
    expect(isWhatsAppEnabled()).toBe(true);
    expect(getWhatsAppEnv()).toEqual({
      accessToken: "tok", phoneNumberId: "123", businessAccountId: null, appSecret: "sec", webhookVerifyToken: "verify", apiVersion: "v24.0",
    });
  });

  it("trims values and keeps the WABA id when given", () => {
    process.env.WHATSAPP_ACCESS_TOKEN = " tok ";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
    process.env.WHATSAPP_APP_SECRET = "sec";
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify";
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = "999";
    process.env.WHATSAPP_GRAPH_API_VERSION = "v25.0";
    expect(readWhatsAppEnv().accessToken).toBe("tok");
    expect(getWhatsAppEnv().businessAccountId).toBe("999");
    expect(getWhatsAppEnv().apiVersion).toBe("v25.0");
  });
});
