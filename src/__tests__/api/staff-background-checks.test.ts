/**
 * @jest-environment node
 *
 * GET /api/background-checks — client report 2026-09-30 (#16): agents who work
 * with an employer see that employer's background checks and their status.
 * Read-only; the employer's team still runs the checks. Scoped like every
 * other employer resource (getScopedEmployerIds — [] means nothing), and it
 * never returns the referees' contact details, their feedback or the
 * employer's internal notes.
 */
import { NextRequest } from "next/server";

const EMP_A = "651000000000000000000a01";
let mockCtx = { userId: "651000000000000000000009", role: "agent", locale: "en" };
const mockScope = jest.fn();
const mockFind = jest.fn();
const mockCount = jest.fn();

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    (req: NextRequest) => handler(req, mockCtx),
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getScopedEmployerIds: (...a: unknown[]) => mockScope(...a) }));

function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["populate", "select", "sort", "skip", "limit"]) q[m] = jest.fn(() => q);
  q.lean = jest.fn().mockResolvedValue(result);
  return q;
}
jest.mock("@/models/BackgroundCheck", () => ({
  __esModule: true,
  default: { find: (...a: unknown[]) => mockFind(...a), countDocuments: (...a: unknown[]) => mockCount(...a) },
}));

const stored = {
  _id: "c1",
  status: "in_progress",
  outcome: "pending",
  checkType: "both",
  requestedAt: "2026-09-29T10:00:00.000Z",
  applicationId: "app1",
  jobSeekerId: { fullName: "", userId: { name: "Asha Menon" } },
  jobId: { title: "Accountant" },
  employerId: { companyName: "Acme" },
  references: [
    { name: "R One", email: "r1@example.com", phone: "+971500000000", status: "responded", feedback: "Great" },
    { name: "R Two", email: "r2@example.com", status: "requested" },
  ],
  backgroundNotes: "internal",
  backgroundResults: "internal result",
};

async function get(qs = "") {
  const { GET } = await import("@/app/api/background-checks/route");
  return GET(new NextRequest(`http://localhost/api/background-checks${qs}`), {} as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCtx = { userId: "651000000000000000000009", role: "agent", locale: "en" };
  mockScope.mockResolvedValue([EMP_A]);
  mockFind.mockImplementation(() => query([stored]));
  mockCount.mockResolvedValue(1);
});

it("lists the checks of employers the agent works with, and nothing else", async () => {
  const res = await get();
  expect(res.status).toBe(200);
  expect(mockFind.mock.calls[0][0]).toEqual({ employerId: { $in: [EMP_A] } });
  const body = await res.json();
  expect(body.total).toBe(1);
  expect(body.items[0]).toEqual({
    _id: "c1",
    status: "in_progress",
    outcome: "pending",
    checkType: "both",
    requestedAt: "2026-09-29T10:00:00.000Z",
    applicationId: "app1",
    candidateName: "Asha Menon",
    jobTitle: "Accountant",
    companyName: "Acme",
    references: { total: 2, responded: 1, declined: 0 },
  });
});

it("never returns referee contacts, feedback or the employer's notes", async () => {
  const text = JSON.stringify(await (await get()).json());
  for (const secret of ["r1@example.com", "+971500000000", "Great", "internal"]) expect(text).not.toContain(secret);
});

it("sees nothing, and queries nothing, with an empty scope", async () => {
  mockScope.mockResolvedValue([]);
  const body = await (await get()).json();
  expect(body).toMatchObject({ items: [], total: 0 });
  expect(mockFind).not.toHaveBeenCalled();
});

it("filters by a known status only", async () => {
  await get("?status=completed");
  expect(mockFind.mock.calls[0][0]).toEqual({ employerId: { $in: [EMP_A] }, status: "completed" });
  mockFind.mockClear();
  await get("?status=%24ne");
  expect(mockFind.mock.calls[0][0]).toEqual({ employerId: { $in: [EMP_A] } });
});

it("is for agents, super agents and admins only", async () => {
  for (const role of ["employer", "job_seeker"]) {
    mockCtx = { ...mockCtx, role };
    expect((await get()).status).toBe(403);
  }
  mockCtx = { ...mockCtx, role: "super_agent" };
  expect((await get()).status).toBe(200);
});
