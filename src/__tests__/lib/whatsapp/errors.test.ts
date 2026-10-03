import { classifyWhatsAppError, WhatsAppApiError } from "@/lib/communications/whatsapp/errors";

describe("classifyWhatsAppError", () => {
  it.each([
    [131047, "outside_window", false],
    [131026, "undeliverable", false],
    [131049, "marketing_limit", false],
    [131050, "user_opted_out_marketing", false],
    [130429, "rate_limited", true],
    [131056, "rate_limited", true],
    [80007, "rate_limited", true],
    [132000, "template_error", false],
    [132001, "template_error", false],
    [132015, "template_error", false],
    [133010, "phone_not_registered", false],
    [190, "auth", false],
    [368, "account_restricted", false],
    [131031, "account_restricted", false],
  ])("maps %s to %s", (code, kind, retryable) => {
    expect(classifyWhatsAppError(code as number)).toEqual({ kind, retryable });
  });
  it("treats unknown 5xx as retryable and unknown 4xx as final", () => {
    expect(classifyWhatsAppError(undefined, 503)).toEqual({ kind: "unknown", retryable: true });
    expect(classifyWhatsAppError(99999, 400)).toEqual({ kind: "unknown", retryable: false });
  });
});

describe("WhatsAppApiError", () => {
  it("exposes the classification", () => {
    const err = new WhatsAppApiError({ code: 131047, message: "Re-engagement message", httpStatus: 400, fbtraceId: "abc" });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("WhatsAppApiError");
    expect(err.kind).toBe("outside_window");
    expect(err.retryable).toBe(false);
    expect(err.fbtraceId).toBe("abc");
  });

  describe("redacts credentials at construction, so no log line or caller sees them", () => {
    const TOKEN = "EAAGm0PX4ZCpsBAKZCtestTOKENvalue1234567890";
    let saved: string | undefined;
    beforeEach(() => {
      saved = process.env.WHATSAPP_ACCESS_TOKEN;
      process.env.WHATSAPP_ACCESS_TOKEN = TOKEN;
    });
    afterEach(() => {
      if (saved === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
      else process.env.WHATSAPP_ACCESS_TOKEN = saved;
    });

    it("blanks an EAA… access token in the message and the details", () => {
      const err = new WhatsAppApiError({
        code: 190,
        message: `Malformed access token ${TOKEN}`,
        httpStatus: 401,
        details: `token ${TOKEN} expired; Bearer ${TOKEN}`,
      });
      expect(err.message).not.toContain(TOKEN);
      expect(err.message).toContain("[redacted]");
      expect(err.details).not.toContain(TOKEN);
      expect(err.kind).toBe("auth");
    });

    it("leaves a message without secrets, and absent details, as they were", () => {
      const err = new WhatsAppApiError({ code: 131047, message: "Re-engagement message", httpStatus: 400 });
      expect(err.message).toBe("Re-engagement message");
      expect(err.details).toBeUndefined();
    });
  });
});
