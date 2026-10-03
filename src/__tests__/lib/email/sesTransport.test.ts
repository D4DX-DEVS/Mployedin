/**
 * @jest-environment node
 */
const createTransport = jest.fn((..._a: unknown[]) => ({ kind: "ses-transporter" }));
jest.mock("nodemailer", () => ({ __esModule: true, default: { createTransport: (...a: unknown[]) => createTransport(...a) } }));
// The factory builds the mocks itself: the imports below run before this file's consts, so a
// factory that closes over a top-level const would hit its temporal dead zone.
jest.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: jest.fn().mockImplementation((opts) => ({ opts })),
  SendEmailCommand: jest.fn(),
}));

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { createSesTransporter, isSesConfigComplete, sesEnvConfig } from "@/lib/communications/email/transports/ses";

const config = { region: "eu-west-1", accessKeyId: "AKIA1", secretAccessKey: "s3cr3t", fromEmail: "noreply@mployedin.com", fromName: "MPLOYEDIN", configurationSet: "mployedin" };

describe("SES transport", () => {
  beforeEach(() => { createTransport.mockClear(); (SESv2Client as unknown as jest.Mock).mockClear(); });

  it("builds a nodemailer SES transporter over a SESv2 client and caches it", () => {
    const a = createSesTransporter(config);
    const b = createSesTransporter({ ...config, fromName: "Other" });
    expect(a).toBe(b);
    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(SESv2Client).toHaveBeenCalledWith({ region: "eu-west-1", credentials: { accessKeyId: "AKIA1", secretAccessKey: "s3cr3t" } });
    const opts = createTransport.mock.calls[0][0] as { SES: { sesClient: unknown; SendEmailCommand: unknown } };
    expect(opts.SES.SendEmailCommand).toBe(SendEmailCommand);
    expect(opts.SES.sesClient).toEqual({ opts: { region: "eu-west-1", credentials: { accessKeyId: "AKIA1", secretAccessKey: "s3cr3t" } } });
  });

  it("makes a new transporter when the secret is rotated", () => {
    const a = createSesTransporter({ ...config, accessKeyId: "AKIA-ROT" });
    const b = createSesTransporter({ ...config, accessKeyId: "AKIA-ROT", secretAccessKey: "rotated" });
    expect(a).not.toBe(b);
    expect(createTransport).toHaveBeenCalledTimes(2);
  });

  it("requires region, key id, secret and from address", () => {
    expect(isSesConfigComplete(config)).toBe(true);
    expect(isSesConfigComplete({ ...config, secretAccessKey: "" })).toBe(false);
    expect(isSesConfigComplete(null)).toBe(false);
  });

  it("reads SES_* env only when complete", () => {
    process.env.SES_REGION = "us-east-1";
    process.env.SES_ACCESS_KEY_ID = "AKIA2";
    process.env.SES_SECRET_ACCESS_KEY = "";
    process.env.SES_FROM_EMAIL = "noreply@mployedin.com";
    expect(sesEnvConfig()).toBeNull();
    process.env.SES_SECRET_ACCESS_KEY = "x";
    expect(sesEnvConfig()).toEqual({ region: "us-east-1", accessKeyId: "AKIA2", secretAccessKey: "x", fromEmail: "noreply@mployedin.com", fromName: undefined, configurationSet: undefined });
  });
});
