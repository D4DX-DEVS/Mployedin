/**
 * @jest-environment node
 *
 * GET /api/dm pages the Messages list (keyset on lastMessageAt + _id) and
 * searches it on the server; GET /api/dm/unread-count totals the badge.
 */
import { NextRequest } from "next/server";

const ME = "651000000000000000000a01";
const mockCtx = { userId: ME, role: "employer", locale: "en" };

const mockFind = jest.fn();
const mockAggregate = jest.fn();
let rows: unknown[] = [];

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    (req: NextRequest) => handler(req, mockCtx),
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/realtime", () => ({ triggerRealtimeEvent: jest.fn() }));
jest.mock("@/lib/audit/log", () => ({ actorFromCtx: jest.fn(), logActivity: jest.fn() }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn() } }));
jest.mock("@/lib/dm/employerContacts", () => ({ canEmployerStartConversation: jest.fn() }));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentTeamAgentUserIds: jest.fn() }));
jest.mock("@/lib/dm/liveAvatars", () => ({ applyLiveAvatars: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/models/User", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/Employer", () => ({ __esModule: true, default: {}, Employer: {} }));
jest.mock("@/models/Conversation", () => ({
  __esModule: true,
  default: {
    find: (...a: unknown[]) => {
      mockFind(...a);
      const c: Record<string, unknown> = {};
      c.sort = () => c;
      c.limit = (n: number) => { c._limit = n; return c; };
      c.lean = async () => rows.slice(0, c._limit as number);
      return c;
    },
    aggregate: (...a: unknown[]) => mockAggregate(...a),
  },
}));

function conv(id: string, at: string | null) {
  return { _id: id, lastMessageAt: at ? new Date(at) : undefined, participantDetails: [] };
}

async function list(qs = "") {
  const { GET } = await import("@/app/api/dm/route");
  const res = await GET(new NextRequest(`http://localhost/api/dm${qs}`), {} as never);
  return res.json();
}

beforeEach(() => {
  mockFind.mockClear();
  mockAggregate.mockReset();
  rows = [];
});

it("returns one page and a cursor for the next when more exist", async () => {
  rows = [
    conv("651000000000000000000c03", "2026-10-03T00:00:00Z"),
    conv("651000000000000000000c02", "2026-10-02T00:00:00Z"),
    conv("651000000000000000000c01", "2026-10-01T00:00:00Z"),
  ];
  const body = await list("?limit=2");
  expect(body.conversations).toHaveLength(2);
  expect(body.nextCursor).toBe(`${new Date("2026-10-02T00:00:00Z").getTime()}_651000000000000000000c02`);
});

it("has no next cursor on the last page", async () => {
  rows = [conv("651000000000000000000c01", "2026-10-01T00:00:00Z")];
  const body = await list("?limit=2");
  expect(body.nextCursor).toBeNull();
});

it("marks a cursor for a conversation with no messages as 'none'", async () => {
  rows = [conv("651000000000000000000c02", null), conv("651000000000000000000c01", null)];
  const body = await list("?limit=1");
  expect(body.nextCursor).toBe("none_651000000000000000000c02");
});

it("continues after the cursor, keeping message-less conversations last", async () => {
  const at = new Date("2026-10-02T00:00:00Z").getTime();
  await list(`?cursor=${at}_651000000000000000000c02`);
  const and = (mockFind.mock.calls[0][0] as { $and: Record<string, unknown>[] }).$and;
  const keyset = and.find((c) => "$or" in c) as { $or: Record<string, unknown>[] };
  expect(keyset.$or).toEqual(expect.arrayContaining([
    { lastMessageAt: { $lt: new Date(at) } },
    { lastMessageAt: null },
  ]));
});

it("caps the page size at 50", async () => {
  rows = Array.from({ length: 60 }, (_, i) => conv(`6510000000000000000${String(100 + i).padStart(5, "0")}`, null));
  const body = await list("?limit=500");
  expect(body.conversations).toHaveLength(50);
});

it("searches the other participant, with the term escaped", async () => {
  await list("?search=a.b");
  const and = (mockFind.mock.calls[0][0] as { $and: Record<string, unknown>[] }).$and;
  const match = and.find((c) => "participantDetails" in c) as {
    participantDetails: { $elemMatch: { $or: { name: RegExp }[] } };
  };
  const rx = match.participantDetails.$elemMatch.$or[0].name;
  expect(rx.test("a.b")).toBe(true);
  expect(rx.test("axb")).toBe(false);
});

it("ignores a malformed cursor", async () => {
  await list("?cursor=garbage");
  const and = (mockFind.mock.calls[0][0] as { $and: Record<string, unknown>[] }).$and;
  expect(and).toHaveLength(2);
});

it("totals unread messages across every conversation", async () => {
  mockAggregate.mockResolvedValue([{ total: 7 }]);
  const { GET } = await import("@/app/api/dm/unread-count/route");
  const res = await GET(new NextRequest("http://localhost/api/dm/unread-count"), {} as never);
  expect(await res.json()).toEqual({ total: 7 });
  const group = mockAggregate.mock.calls[0][0][1].$group;
  expect(group.total.$sum.$ifNull[0]).toBe(`$unreadCounts.${ME}`);
});

it("reports zero unread when the user has no conversations", async () => {
  mockAggregate.mockResolvedValue([]);
  const { GET } = await import("@/app/api/dm/unread-count/route");
  const res = await GET(new NextRequest("http://localhost/api/dm/unread-count"), {} as never);
  expect(await res.json()).toEqual({ total: 0 });
});
