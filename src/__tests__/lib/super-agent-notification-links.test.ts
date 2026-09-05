/**
 * @jest-environment node
 */
/**
 * A super-agent notification has to land on the record it is about.
 *
 * All four of these helpers already carried the entity's id in `metadata`
 * while `link` pointed at the bare list page, so the reader arrived at a table
 * and had to find the row again. One event — an agent submitting an exhibition
 * request for review — produced no notification at all, even though reviewing
 * them is the one approval this role performs alone.
 */
const created: Array<Record<string, unknown>> = [];

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/models/Notification", () => ({
  __esModule: true,
  default: {
    create: jest.fn(async (doc: Record<string, unknown>) => {
      created.push(doc);
      return doc;
    }),
  },
}));

jest.mock("@/lib/inngest/client", () => ({
  inngest: { send: jest.fn().mockResolvedValue(undefined) },
}));

beforeEach(() => {
  created.length = 0;
});

async function trigger() {
  return import("@/lib/notifications/trigger");
}

describe("super-agent notification links", () => {
  it("opens the job itself, not the jobs list", async () => {
    const { notifySuperAgentNewJob } = await trigger();
    await notifySuperAgentNewJob("sa_user", "Acme", "Welder", "job_123");

    expect(created[0].actionUrl).toBe("/super-agent/jobs?job=job_123");
  });

  it("opens the agent's own page when the agent document id is known", async () => {
    const { notifySuperAgentAgentJoined } = await trigger();
    await notifySuperAgentAgentJoined("sa_user", "Sara", "user_9", undefined, "agentdoc_5");

    expect(created[0].actionUrl).toBe("/super-agent/agents/agentdoc_5");
  });

  it("falls back to the roster filtered by name when it is not", async () => {
    const { notifySuperAgentAgentJoined } = await trigger();
    await notifySuperAgentAgentJoined("sa_user", "Sara Ali", "user_9");

    expect(created[0].actionUrl).toBe("/super-agent/agents?search=Sara%20Ali");
  });

  it("pre-filters the employer list to the company that registered", async () => {
    const { notifySuperAgentEmployerRegistered } = await trigger();
    await notifySuperAgentEmployerRegistered("sa_user", "Gulf Steel", "Sara", "emp_1");

    expect(created[0].actionUrl).toBe("/super-agent/employers?search=Gulf%20Steel");
  });

  it("pre-filters the placements list to the placed candidate", async () => {
    const { notifySuperAgentPlacement } = await trigger();
    await notifySuperAgentPlacement("sa_user", "Ravi Kumar", "Welder", "Acme", "pl_1");

    expect(created[0].actionUrl).toBe("/super-agent/placements?search=Ravi%20Kumar");
  });

  it("notifies the reviewer when an agent submits an exhibition request", async () => {
    const { notifySuperAgentExhibitionRequest } = await trigger();
    await notifySuperAgentExhibitionRequest("sa_user", "Sara", "Gulf Careers Expo", "ex_1");

    expect(created[0].type).toBe("exhibition_request");
    expect(created[0].actionUrl).toBe(
      "/super-agent/exhibitions?status=submitted&search=Gulf%20Careers%20Expo"
    );
    // The id has to survive for anything downstream that wants the record.
    expect((created[0].meta as Record<string, unknown>).exhibitionId).toBe("ex_1");
  });

  it("stores links without a locale segment so the reader's own locale wins", async () => {
    const {
      notifySuperAgentNewJob,
      notifySuperAgentEmployerRegistered,
      notifySuperAgentPlacement,
    } = await trigger();

    await notifySuperAgentNewJob("sa_user", "Acme", "Welder", "job_1", "ar");
    await notifySuperAgentEmployerRegistered("sa_user", "Gulf Steel", "Sara", "emp_1", "ar");
    await notifySuperAgentPlacement("sa_user", "Ravi", "Welder", "Acme", "pl_1", "ar");

    for (const doc of created) {
      expect(doc.actionUrl).not.toMatch(/^\/(en|ar)\//);
      expect(doc.actionUrl).toMatch(/^\/super-agent\//);
    }
  });
});
