/**
 * @jest-environment node
 *
 * Inngest re-invokes a function once per step and hands back the results of
 * the steps it has already run instead of running them again. A counter bumped
 * *inside* a step therefore only counts the steps executed in the last
 * invocation: on 2026-10-27 the profile-completion run reported `sent: 3`
 * while it had sent 25 reminders. The count has to come from what each step
 * returned.
 *
 * `replay` below drives a handler the way Inngest does: one new step per
 * invocation, memoized results on every later one.
 */
const sendEmail = jest.fn(async (..._a: unknown[]) => ({ messageId: "m" }));

/** A Mongoose-style query: chainable, resolved by `.lean()`. */
function query<T>(value: T) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "populate", "sort", "limit"]) q[m] = () => q;
  q.lean = () => Promise.resolve(value);
  return q;
}

const seekers = [
  { userId: "u1", profileCompleteness: 30 },
  { userId: "u2", profileCompleteness: 30 },
  { userId: "u3", profileCompleteness: 30 },
];
const users: Record<string, { _id: string; name: string; email: string; locale: string; lastLogin?: Date }> = {
  u1: { _id: "u1", name: "A", email: "a@mail.test", locale: "en" },
  u2: { _id: "u2", name: "B", email: "b@mail.test", locale: "en" },
  u3: { _id: "u3", name: "C", email: "c@mail.test", locale: "ar" },
};

jest.mock("@/lib/inngest/client", () => ({
  inngest: { createFunction: (config: unknown, handler: unknown) => ({ config, handler }) },
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn(async () => undefined) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    find: () => query(Object.values(users)),
    findById: (id: string) => query(users[id] ?? null),
  },
}));
jest.mock("@/models/Job", () => ({ __esModule: true, default: { find: () => query([{ id: "j1" }]) } }));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    find: () => query(seekers),
    findOne: () => query({ userId: "u?" }),
    updateOne: jest.fn(async () => undefined),
  },
}));
jest.mock("@/models/NotificationPreference", () => ({
  __esModule: true,
  default: { find: () => query([]), updateOne: jest.fn(async () => undefined) },
}));
jest.mock("@/lib/matchScore", () => ({ profileSignalCount: () => 5, MIN_PROFILE_SIGNALS: 2, SEEKER_MATCH_FIELDS: "" }));
jest.mock("@/lib/matching/recommend", () => ({
  recommendJobsFor: jest.fn(async () => ({ jobs: [{ title: "Site Engineer", company: "Beta", score: 88 }] })),
  toCandidateJob: (j: unknown) => j,
  JOB_MATCH_FIELDS: "",
}));
jest.mock("@/lib/matching/skillVectors", () => ({ prepareSkillVectors: jest.fn(async () => ({})) }));
jest.mock("@/lib/effectiveSeekerProfile", () => ({ effectiveSeekerProfile: jest.fn(async () => ({})) }));
jest.mock("@/lib/communications/email", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
  isUndeliverableAddress: () => false,
}));
jest.mock("@/lib/communications/emailLayout", () => ({
  emailHeader: () => "",
  emailProgressBar: () => "",
  emailFooter: () => "",
}));
jest.mock("@/lib/jobSeeker/profileCompleteness", () => ({
  profileCompleteness: () => ({ score: 30, missing: [], done: [], total: 10 }),
}));
jest.mock("@/models/SystemConfig", () => ({
  isCronEnabled: async () => true,
  updateCronRunStatus: jest.fn(async () => undefined),
  resolveMatchThreshold: async () => 80,
  isAiRerankEnabled: async () => false,
}));
jest.mock("@/lib/matching/jevVerdictStore", () => ({ mongoJevVerdictStore: {} }));

import { profileCompletionCron, reEngagementCron } from "@/lib/inngest/reEngagement";

type Handler = (ctx: { step: { run: (id: string, fn: () => unknown) => Promise<unknown> } }) => Promise<unknown>;

/**
 * Run a handler under Inngest's execution model: each invocation replays the
 * memoized steps, executes at most one new step, and stops there. The run's
 * result is what the final invocation — the one with every step memoized —
 * returns.
 */
async function replay(handler: Handler): Promise<unknown> {
  const memo = new Map<string, unknown>();
  for (let invocation = 0; invocation < 500; invocation++) {
    let stepTaken = false;
    let markTaken!: () => void;
    const tookStep = new Promise<void>((resolve) => (markTaken = resolve));
    const step = {
      run: async (id: string, fn: () => unknown) => {
        if (memo.has(id)) return memo.get(id);
        if (stepTaken) return new Promise(() => {}); // later steps wait for the next invocation
        stepTaken = true;
        const value = await fn();
        memo.set(id, value === undefined ? null : value); // step output is JSON
        markTaken();
        return new Promise(() => {}); // this invocation ends after one new step
      },
    };
    const outcome = await Promise.race([
      handler({ step }).then((result) => ({ result })),
      tookStep.then(() => null),
    ]);
    if (outcome) return outcome.result;
  }
  throw new Error("handler never finished");
}

const handlerOf = (fn: unknown) => (fn as { handler: Handler }).handler;

beforeEach(() => jest.clearAllMocks());

describe("reminder crons count what they actually sent", () => {
  it("profile completion reports every reminder it sent", async () => {
    const result = (await replay(handlerOf(profileCompletionCron))) as { processed: number; sent: number };
    expect(sendEmail).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ processed: 3, sent: 3 });
  });

  it("re-engagement reports every email it sent", async () => {
    const result = (await replay(handlerOf(reEngagementCron))) as { processed: number; sent: number };
    expect(sendEmail).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ processed: 3, sent: 3 });
  });

  it("does not count a seeker who was skipped", async () => {
    const original = users.u2;
    delete (users as Record<string, unknown>).u2; // no user record → no email
    try {
      const result = (await replay(handlerOf(profileCompletionCron))) as { sent: number };
      expect(sendEmail).toHaveBeenCalledTimes(2);
      expect(result.sent).toBe(2);
    } finally {
      users.u2 = original;
    }
  });
});
