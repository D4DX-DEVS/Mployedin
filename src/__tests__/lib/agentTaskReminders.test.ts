/**
 * @jest-environment node
 */
/**
 * Daily task reminders: due tomorrow and overdue go to the person doing it
 * (in-app); an overdue given task also goes to whoever gave it, by email too.
 * Each is claimed on the task first, so a second run sends nothing.
 */
export {};

const notify = jest.fn(async (_p: unknown) => undefined);
jest.mock("@/lib/notifications/trigger", () => ({ notify: (p: unknown) => notify(p) }));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: { exists: jest.fn(async () => ({ _id: "sa" })) } }));
jest.mock("@/models/User", () => ({ __esModule: true, default: {} }));

const find = jest.fn();
const updateOne = jest.fn();
jest.mock("@/models/AgentTask", () => ({
  __esModule: true,
  CLOSED_TASK_STATUSES: ["completed", "failed", "cancelled"],
  default: {
    find: (filter: Record<string, unknown>) => ({ select: () => ({ limit: () => ({ lean: async () => find(filter) }) }) }),
    updateOne: (...a: unknown[]) => updateOne(...a),
  },
}));

const mongoose = jest.requireActual("mongoose") as typeof import("mongoose");
const oid = () => new mongoose.Types.ObjectId();
const NOW = new Date("2026-11-17T07:00:00Z");

beforeEach(() => jest.clearAllMocks());

it("reminds each person once and emails only the giver of an overdue task", async () => {
  const agent = oid();
  const giver = oid();
  const personal = { _id: oid(), userId: agent, title: "Call Sara" };
  const givenTask = { _id: oid(), userId: agent, title: "Stock count", assigneeRole: "agent", assignedBy: { userId: giver, role: "super_agent" } };
  find.mockImplementation((filter: Record<string, unknown>) =>
    "remindedAt.dueSoon" in filter ? [personal] : "remindedAt.overdue" in filter ? [givenTask] : [givenTask]);
  updateOne.mockResolvedValue({ modifiedCount: 1 });

  const { runTaskReminders } = await import("@/lib/agentTasks/reminders");
  const out = await runTaskReminders(NOW);
  expect(out).toEqual({ dueSoon: 1, overdue: 1, giverOverdue: 1 });

  const calls = notify.mock.calls.map((c) => c[0] as Record<string, unknown>);
  expect(calls.find((c) => c.titleKey === "taskDueSoonTitle")).toMatchObject({ userId: String(agent), link: "/agent/tasks" });
  expect(calls.find((c) => c.titleKey === "taskOverdueTitle")).toMatchObject({ userId: String(agent), link: "/agent/tasks?tab=given" });
  const giverCall = calls.find((c) => c.titleKey === "taskGiverOverdueTitle")!;
  expect(giverCall).toMatchObject({ userId: String(giver), sendEmail: true, link: "/super-agent/tasks?tab=gave" });
  expect(calls.filter((c) => c.sendEmail)).toHaveLength(1);
});

it("sends nothing when another run already claimed the reminder", async () => {
  find.mockResolvedValue([{ _id: oid(), userId: oid(), title: "x" }]);
  updateOne.mockResolvedValue({ modifiedCount: 0 });
  const { runTaskReminders } = await import("@/lib/agentTasks/reminders");
  const out = await runTaskReminders(NOW);
  expect(out).toEqual({ dueSoon: 0, overdue: 0, giverOverdue: 0 });
  expect(notify).not.toHaveBeenCalled();
});
