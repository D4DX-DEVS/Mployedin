/**
 * @jest-environment node
 */
import { enforceDailyAiQuota } from "@/lib/ai/dailyQuota";
import { getAiCaller, runWithAiCaller, tagAiEmployer, withAiContext } from "@/lib/ai/usageContext";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn() }));
jest.mock("@/models/AiDailyUsage", () => ({ __esModule: true, default: {} }));

describe("caller binding for routes that read their own session", () => {
  const prev = process.env.AI_DAILY_LIMIT;
  beforeAll(() => {
    // Limit 0 disables the quota, so the check returns without touching the database.
    process.env.AI_DAILY_LIMIT = "0";
    process.env.AI_DAILY_LIMIT_PRIVILEGED = "0";
  });
  afterAll(() => {
    if (prev === undefined) delete process.env.AI_DAILY_LIMIT;
    else process.env.AI_DAILY_LIMIT = prev;
    delete process.env.AI_DAILY_LIMIT_PRIVILEGED;
  });

  const agentRoute = withAiContext(async () => {
    await enforceDailyAiQuota("user-1", "agent", "/api/ai/job-extract");
    await new Promise((r) => setTimeout(r, 5));
    tagAiEmployer("emp-9");
    await Promise.resolve();
    return getAiCaller();
  });
  const employerRoute = withAiContext(async () => {
    await enforceDailyAiQuota("user-2", "employer", "/api/ai/cv-extract");
    await new Promise((r) => setTimeout(r, 1));
    return getAiCaller();
  });

  test("each request sees only its own caller, across awaits and overlapping requests", async () => {
    const [a, b] = await Promise.all([agentRoute(), employerRoute()]);
    expect(a).toMatchObject({ userId: "user-1", role: "agent", feature: "job_assistant", employerId: "emp-9", onBehalf: true });
    expect(b).toMatchObject({ userId: "user-2", role: "employer", feature: "cv_reading", employerUserId: "user-2" });
    expect(b?.employerId).toBeUndefined();
  });

  test("nothing leaks into the code that called the route", async () => {
    await agentRoute();
    expect(getAiCaller()).toBeUndefined();
  });

  test("outside a wrapped request the quota check records nothing", async () => {
    await enforceDailyAiQuota("user-3", "agent", "/api/ai/chat");
    expect(getAiCaller()).toBeUndefined();
  });

  test("a caller already set by withAuth is kept", async () => {
    const seen = await runWithAiCaller({ userId: "staff", role: "admin", employerId: "emp-1", onBehalf: true }, async () => {
      await enforceDailyAiQuota("employer-user", "employer", "/api/ai/chat");
      return getAiCaller();
    });
    expect(seen).toMatchObject({ userId: "staff", role: "admin", employerId: "emp-1" });
  });
});
