/**
 * Outbound webhooks must be tenant-scoped.
 *
 * A webhook row carries only `createdBy`. Rows created by an admin are
 * platform webhooks and receive every event; rows created by anyone else
 * belong to that user's employer and may only receive events about that
 * employer. Ownership is derived from `createdBy` at dispatch time, so rows
 * that existed before the fix are scoped too.
 */

const ADMIN_USER = "aaaaaaaaaaaaaaaaaaaaaaa1";
const USER_A = "aaaaaaaaaaaaaaaaaaaaaaa2";
const USER_B = "aaaaaaaaaaaaaaaaaaaaaaa3";
const USER_NO_EMPLOYER = "aaaaaaaaaaaaaaaaaaaaaaa4";
const USER_DELETED = "aaaaaaaaaaaaaaaaaaaaaaa5";
const EMPLOYER_A = "eeeeeeeeeeeeeeeeeeeeeee1";
const EMPLOYER_B = "eeeeeeeeeeeeeeeeeeeeeee2";

interface HookRow {
  _id: string;
  url: string;
  secret: string;
  retryCount: number;
  createdBy: string;
}

let hookRows: HookRow[] = [];

const chain = <T,>(rows: T) => ({
  select: () => ({ lean: () => Promise.resolve(rows) }),
});

const webhookFind = jest.fn((..._args: unknown[]) => chain(hookRows));
const webhookUpdate = jest.fn((..._args: unknown[]) => Promise.resolve(null));
const userFind = jest.fn((..._args: unknown[]) =>
  chain([
    { _id: ADMIN_USER, role: "admin" },
    { _id: USER_A, role: "employer" },
    { _id: USER_B, role: "employer" },
    { _id: USER_NO_EMPLOYER, role: "job_seeker" },
  ]),
);
const employerFind = jest.fn((..._args: unknown[]) =>
  chain([
    { _id: EMPLOYER_A, userId: USER_A },
    { _id: EMPLOYER_B, userId: USER_B },
  ]),
);
const safeFetch = jest.fn((..._args: unknown[]) =>
  Promise.resolve({ ok: true, status: 200, statusText: "OK" }),
);

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/models/Webhook", () => ({
  __esModule: true,
  default: {
    find: (...a: unknown[]) => webhookFind(...a),
    findByIdAndUpdate: (...a: unknown[]) => webhookUpdate(...a),
  },
}));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { find: (...a: unknown[]) => userFind(...a) },
}));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: { find: (...a: unknown[]) => employerFind(...a) },
}));
jest.mock("@/lib/security/ssrf", () => ({
  safeFetch: (...a: unknown[]) => safeFetch(...a),
}));
jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import { deliverWebhookEvent } from "@/lib/integrations/webhookDispatcher";

const hook = (id: string, createdBy: string): HookRow => ({
  _id: id,
  url: `https://hooks.example/${id}`,
  secret: "s",
  retryCount: 0,
  createdBy,
});

const calledUrls = (): string[] => safeFetch.mock.calls.map((c) => String(c[0])).sort();

beforeEach(() => {
  jest.clearAllMocks();
  hookRows = [
    hook("admin", ADMIN_USER),
    hook("empA", USER_A),
    hook("empB", USER_B),
    hook("noEmployer", USER_NO_EMPLOYER),
    hook("deletedUser", USER_DELETED),
  ];
});

describe("webhook dispatch — tenant scope", () => {
  it("does not send employer B's invoice.created to employer A's webhook", async () => {
    await deliverWebhookEvent("invoice.created", { invoiceNumber: "INV-1" }, { employerId: EMPLOYER_B });

    expect(calledUrls()).not.toContain("https://hooks.example/empA");
  });

  it("sends the event to the owning employer and to admin webhooks only", async () => {
    await deliverWebhookEvent("invoice.created", { invoiceNumber: "INV-1" }, { employerId: EMPLOYER_B });

    expect(calledUrls()).toEqual(["https://hooks.example/admin", "https://hooks.example/empB"]);
  });

  it("scopes a legacy row that has only createdBy", async () => {
    // Rows carry no employer field at all — ownership comes from createdBy.
    hookRows = [hook("legacyA", USER_A)];

    await deliverWebhookEvent("invoice.paid", { invoiceNumber: "INV-2" }, { employerId: EMPLOYER_B });
    expect(safeFetch).not.toHaveBeenCalled();

    await deliverWebhookEvent("invoice.paid", { invoiceNumber: "INV-3" }, { employerId: EMPLOYER_A });
    expect(calledUrls()).toEqual(["https://hooks.example/legacyA"]);
  });

  it("accepts the employer id as an ObjectId-like value", async () => {
    await deliverWebhookEvent("invoice.paid", {}, { employerId: { toString: () => EMPLOYER_A } });

    expect(calledUrls()).toEqual(["https://hooks.example/admin", "https://hooks.example/empA"]);
  });

  it("sends an event with no owner to admin webhooks only", async () => {
    await deliverWebhookEvent("commission.paid", { amount: 500 });

    expect(calledUrls()).toEqual(["https://hooks.example/admin"]);
  });

  it("never sends commission events to an employer webhook, even with an employer scope", async () => {
    await deliverWebhookEvent("commission.approved", { amount: 500 }, { employerId: EMPLOYER_A });

    expect(calledUrls()).toEqual(["https://hooks.example/admin"]);
  });

  it("gives nothing to a webhook whose creator has no employer or no longer exists", async () => {
    hookRows = [hook("noEmployer", USER_NO_EMPLOYER), hook("deletedUser", USER_DELETED)];

    await deliverWebhookEvent("invoice.created", {}, { employerId: EMPLOYER_A });

    expect(safeFetch).not.toHaveBeenCalled();
  });

  it("skips the owner lookups when no webhook subscribes to the event", async () => {
    hookRows = [];

    await deliverWebhookEvent("invoice.created", {}, { employerId: EMPLOYER_A });

    expect(userFind).not.toHaveBeenCalled();
    expect(safeFetch).not.toHaveBeenCalled();
  });
});
