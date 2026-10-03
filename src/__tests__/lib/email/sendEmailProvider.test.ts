/**
 * @jest-environment node
 */
const sendMail = jest.fn().mockResolvedValue({ messageId: "<ses-1@eu-west-1.amazonses.com>" });
const resolveTransport = jest.fn();
jest.mock("@/lib/communications/email/resolveTransport", () => ({ resolveTransport: (...a: unknown[]) => resolveTransport(...a) }));
const logEmailDelivery = jest.fn().mockResolvedValue(undefined);
jest.mock("@/models/EmailLog", () => ({ __esModule: true, logEmailDelivery: (...a: unknown[]) => logEmailDelivery(...a), default: {} }));

import { sendEmail } from "@/lib/communications/email/send";

describe("sendEmail with the SES provider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sendMail.mockResolvedValue({ messageId: "<ses-1@eu-west-1.amazonses.com>" });
    resolveTransport.mockResolvedValue({ transporter: { sendMail }, fromEmail: "ses@mployedin.com", fromName: "MPLOYEDIN Team", provider: "ses", sesConfigurationSet: "mployedin" });
  });

  it("stamps the configuration set, uses the SES from name and logs the provider", async () => {
    await sendEmail({ to: "person@gmail.com", subject: "Hi", html: "<p>Hi</p>", source: "test", category: "system" });
    const opts = sendMail.mock.calls[0][0];
    expect(opts.from).toBe("MPLOYEDIN Team <ses@mployedin.com>");
    expect(opts.ses).toEqual({ ConfigurationSetName: "mployedin" });
    expect(logEmailDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: "sent", metadata: { provider: "ses" } }));
  });

  it("omits the ses option for SMTP and keeps the payload sender name", async () => {
    resolveTransport.mockResolvedValue({ transporter: { sendMail }, fromEmail: "smtp@mployedin.com", provider: "smtp" });
    await sendEmail({ to: "person@gmail.com", subject: "Hi", html: "<p>Hi</p>", senderName: "Acme" });
    const opts = sendMail.mock.calls[0][0];
    expect(opts.from).toBe("Acme <smtp@mployedin.com>");
    expect(opts.ses).toBeUndefined();
    expect(logEmailDelivery).toHaveBeenCalledWith(expect.objectContaining({ metadata: { provider: "smtp" } }));
  });

  it("falls back to MPLOYEDIN when neither the payload nor the provider gives a name", async () => {
    resolveTransport.mockResolvedValue({ transporter: { sendMail }, fromEmail: "smtp@mployedin.com", provider: "smtp" });
    await sendEmail({ to: "person@gmail.com", subject: "Hi", html: "<p>Hi</p>" });
    expect(sendMail.mock.calls[0][0].from).toBe("MPLOYEDIN <smtp@mployedin.com>");
  });

  it("lets the payload sender name win over the SES from name", async () => {
    await sendEmail({ to: "person@gmail.com", subject: "Hi", html: "<p>Hi</p>", senderName: "Acme" });
    expect(sendMail.mock.calls[0][0].from).toBe("Acme <ses@mployedin.com>");
  });

  it("omits the ses option on SES when no configuration set is configured", async () => {
    resolveTransport.mockResolvedValue({ transporter: { sendMail }, fromEmail: "ses@mployedin.com", provider: "ses" });
    await sendEmail({ to: "person@gmail.com", subject: "Hi", html: "<p>Hi</p>" });
    expect(sendMail.mock.calls[0][0].ses).toBeUndefined();
  });

  it("logs the provider on a failed send too, and rethrows", async () => {
    sendMail.mockRejectedValueOnce(new Error("MessageRejected"));
    await expect(sendEmail({ to: "person@gmail.com", subject: "Hi", html: "<p>Hi</p>" })).rejects.toThrow("MessageRejected");
    expect(logEmailDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", errorMessage: "MessageRejected", metadata: { provider: "ses" } }));
  });

  it("does not resolve a transport for a reserved test domain and logs no provider", async () => {
    await expect(sendEmail({ to: "qa@seed.example", subject: "Hi", html: "<p>Hi</p>" })).rejects.toThrow(/reserved test domain/);
    expect(resolveTransport).not.toHaveBeenCalled();
    expect(logEmailDelivery.mock.calls[0][0]).not.toHaveProperty("metadata");
  });
});
