/**
 * @jest-environment node
 *
 * Who an employer may start a conversation with (owner decision 2026-10-06,
 * QA EMP-001): applicants to its jobs, the agent looking after it (account or
 * job) and admins. Nobody else.
 */
const EMP_USER = "651000000000000000000f01";
const EMP_ID = "651000000000000000000e01";
const ACCOUNT_AGENT = "651000000000000000000a01";
const JOB_AGENT = "651000000000000000000a02";
const LINKED_AGENT = "651000000000000000000a03";
const SEEKER = "651000000000000000000d01";
const SEEKER_USER = "651000000000000000000d11";

let employerDoc: Record<string, unknown> | null;
let applicationExists: unknown;
let seekerDoc: Record<string, unknown> | null;
let agentDoc: Record<string, unknown> | null;

const chain = (value: unknown) => {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.lean = async () => value;
  return c;
};

const mockAgentFind = jest.fn();
const mockJobDistinct = jest.fn();
const mockAppDistinct = jest.fn();
const mockSeekerFind = jest.fn();

jest.mock("@/models/Employer", () => {
  const model = { findOne: jest.fn(() => chain(employerDoc)) };
  return { __esModule: true, Employer: model, default: model };
});
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    distinct: (...a: unknown[]) => mockAppDistinct(...a),
    exists: jest.fn(async () => applicationExists),
  },
}));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    find: (...a: unknown[]) => mockSeekerFind(...a),
    findOne: jest.fn(() => chain(seekerDoc)),
  },
}));
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    find: (...a: unknown[]) => mockAgentFind(...a),
    findOne: jest.fn(() => chain(agentDoc)),
  },
}));
jest.mock("@/models/Job", () => ({ __esModule: true, default: { distinct: (...a: unknown[]) => mockJobDistinct(...a) } }));

import { canEmployerStartConversation, getEmployerContactUserIds } from "@/lib/dm/employerContacts";

beforeEach(() => {
  jest.clearAllMocks();
  employerDoc = { _id: EMP_ID, agentId: ACCOUNT_AGENT };
  applicationExists = { _id: "app1" };
  seekerDoc = { _id: SEEKER };
  agentDoc = null;
  mockAgentFind.mockImplementation((q: { _id?: unknown }) =>
    chain(q._id ? [{ userId: "651000000000000000000b01" }, { userId: "651000000000000000000b02" }] : [{ _id: LINKED_AGENT }]));
  mockJobDistinct.mockResolvedValue([JOB_AGENT]);
  mockAppDistinct.mockResolvedValue([SEEKER]);
  mockSeekerFind.mockImplementation(() => chain([{ userId: SEEKER_USER }]));
});

describe("canEmployerStartConversation", () => {
  it("allows any admin (the support team)", async () => {
    expect(await canEmployerStartConversation(EMP_USER, { _id: "x", role: "admin" })).toBe(true);
  });

  it("allows a job seeker who applied to one of the employer's jobs", async () => {
    expect(await canEmployerStartConversation(EMP_USER, { _id: SEEKER_USER, role: "job_seeker" })).toBe(true);
  });

  it("refuses a job seeker who never applied", async () => {
    applicationExists = null;
    expect(await canEmployerStartConversation(EMP_USER, { _id: SEEKER_USER, role: "job_seeker" })).toBe(false);
  });

  it.each([
    ["the account agent", ACCOUNT_AGENT],
    ["the agent on one of its jobs", JOB_AGENT],
    ["an agent holding it in assignedEmployerIds", LINKED_AGENT],
  ])("allows %s", async (_label, agentId) => {
    agentDoc = { _id: agentId };
    expect(await canEmployerStartConversation(EMP_USER, { _id: "u", role: "agent" })).toBe(true);
  });

  it("refuses an agent with no link to the employer", async () => {
    agentDoc = { _id: "651000000000000000000a99" };
    expect(await canEmployerStartConversation(EMP_USER, { _id: "u", role: "agent" })).toBe(false);
  });

  it.each(["super_agent", "employer"])("refuses role %s", async (role) => {
    expect(await canEmployerStartConversation(EMP_USER, { _id: "u", role })).toBe(false);
  });

  it("refuses everything when the caller has no employer profile", async () => {
    employerDoc = null;
    expect(await canEmployerStartConversation(EMP_USER, { _id: SEEKER_USER, role: "job_seeker" })).toBe(false);
  });
});

describe("getEmployerContactUserIds", () => {
  it("returns applicant and agent user ids, de-duplicated", async () => {
    mockSeekerFind.mockImplementation(() => chain([{ userId: SEEKER_USER }, { userId: SEEKER_USER }]));
    const ids = (await getEmployerContactUserIds(EMP_USER)).map(String);
    expect(ids).toEqual([SEEKER_USER, "651000000000000000000b01", "651000000000000000000b02"]);
    const agentQuery = mockAgentFind.mock.calls.find((c) => c[0]._id)?.[0];
    expect(agentQuery._id.$in.sort()).toEqual([ACCOUNT_AGENT, JOB_AGENT, LINKED_AGENT].sort());
  });

  it("returns nothing without an employer profile", async () => {
    employerDoc = null;
    expect(await getEmployerContactUserIds(EMP_USER)).toEqual([]);
  });
});
