/**
 * @jest-environment node
 *
 * Employer email sequences are marketing (PECR reg 22): a step goes only to an
 * active account with marketing turned on and not unsubscribed from everything.
 * Anyone else is marked "no_consent" and never mailed; sent steps carry an
 * unsubscribe link and the List-Unsubscribe header (via userId).
 */
const sendEmail = jest.fn(async (..._a: unknown[]) => ({ messageId: "m" }));

function query<T>(value: T) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "sort", "limit"]) q[m] = () => q;
  q.lean = () => Promise.resolve(value);
  return q;
}

const users = [
  { _id: "u-opted", email: "opted@mail.com" },
  { _id: "u-off", email: "off@mail.com" },
];
const userFind = jest.fn((..._a: unknown[]) => query(users));
const prefDistinct = jest.fn(async (..._a: unknown[]) => ["u-opted"]);

jest.mock("@/lib/inngest/client", () => ({
  inngest: { createFunction: (config: unknown, handler: unknown) => ({ config, handler }) },
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn(async () => undefined) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock("@/lib/communications/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
jest.mock("@/models/SystemConfig", () => ({
  isCronEnabled: jest.fn(async () => true),
  updateCronRunStatus: jest.fn(async () => undefined),
}));
jest.mock("@/models/User", () => ({ __esModule: true, default: { find: (...a: unknown[]) => userFind(...a) } }));
jest.mock("@/models/NotificationPreference", () => ({
  __esModule: true,
  default: { distinct: (...a: unknown[]) => prefDistinct(...a) },
}));

const past = new Date(Date.now() - 60_000);
const recipient = (email: string) => ({ email, name: "Sam Lee", currentStep: 0, status: "active", nextSendAt: past });

let sequence: Record<string, unknown> & { recipients: ReturnType<typeof recipient>[]; save: jest.Mock };
jest.mock("@/models/EmailSequence", () => ({
  __esModule: true,
  default: { find: () => ({ limit: async () => [sequence] }) },
}));

const step = { run: async (_id: string, fn: () => unknown) => fn() };

async function runCron() {
  const { emailSequenceSenderCron } = await import("@/lib/inngest/emailSequenceSender");
  const { handler } = emailSequenceSenderCron as unknown as { handler: (a: { step: typeof step }) => Promise<Record<string, unknown>> };
  return handler({ step });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = "test-secret";
  sequence = {
    _id: "seq1",
    name: "Welcome",
    status: "active",
    employerId: { toString: () => "emp1" },
    fromName: "Acme",
    fromEmail: "hr@acme.com",
    totalSent: 0,
    steps: [
      { order: 1, subject: "Hi {{firstName}}", body: "Hello", delayDays: 0 },
      { order: 2, subject: "Again", body: "Hello again", delayDays: 3 },
    ],
    recipients: [recipient("Opted@Mail.com"), recipient("off@mail.com"), recipient("stranger@mail.com")],
    save: jest.fn(async () => undefined),
  };
});

describe("email sequence sender — marketing consent", () => {
  it("mails only the opted-in account and marks everyone else no_consent", async () => {
    const result = await runCron();

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: "Opted@Mail.com", userId: "u-opted", category: "marketing" });
    expect(sequence.recipients.map((r) => r.status)).toEqual(["active", "no_consent", "no_consent"]);
    expect(sequence.recipients[1].nextSendAt).toBeUndefined();
    expect(result).toMatchObject({ sent: 1, withheld: 2 });
  });

  it("asks only for active accounts and the marketing opt-in", async () => {
    await runCron();

    expect(userFind.mock.calls[0][0]).toEqual({
      email: { $in: ["opted@mail.com", "off@mail.com", "stranger@mail.com"] },
      isActive: true,
    });
    expect(prefDistinct.mock.calls[0][1]).toMatchObject({
      "categories.marketing.enabled": true,
      unsubscribedAll: { $ne: true },
    });
  });

  it("puts a working marketing unsubscribe link in the email", async () => {
    await runCron();

    const html = (sendEmail.mock.calls[0][0] as { html: string }).html;
    const href = /href="([^"]+)"/.exec(html)?.[1] ?? "";
    expect(href).toContain("/api/unsubscribe?token=");
    const jwt = await import("jsonwebtoken");
    const token = decodeURIComponent(new URL(href.replace(/&amp;/g, "&")).searchParams.get("token") ?? "");
    expect(jwt.verify(token, "test-secret")).toMatchObject({ userId: "u-opted", category: "marketing" });
  });

  it("stops a sequence when the recipient turned marketing off since the last step", async () => {
    prefDistinct.mockResolvedValueOnce([]);
    sequence.recipients = [{ ...recipient("opted@mail.com"), currentStep: 1 }];

    await runCron();

    expect(sendEmail).not.toHaveBeenCalled();
    expect(sequence.recipients[0].status).toBe("no_consent");
    expect(sequence.status).toBe("completed");
  });
});
