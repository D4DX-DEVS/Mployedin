/**
 * @jest-environment node
 *
 * Client feedback (2026-10-12): "no option to view the super agent of an
 * agent". The agent's super agent was only shown read-only in Settings, as
 * name and email. The dashboard now names them, with ways to reach them.
 */
const SA_ID = "650000000000000000000b01";
const SA_USER = "650000000000000000000b02";

let superAgentDoc: Record<string, unknown> | null;
let userDoc: Record<string, unknown> | null;
const lean = (value: () => unknown) => ({ select: () => ({ lean: async () => value() }) });
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: { findById: jest.fn(() => lean(() => superAgentDoc)) } }));
jest.mock("@/models/User", () => ({ __esModule: true, default: { findById: jest.fn(() => lean(() => userDoc)) } }));

import { loadSuperAgentContact } from "@/lib/agents/superAgentContact";

beforeEach(() => {
  superAgentDoc = { _id: SA_ID, userId: SA_USER, roleArchivedAt: null };
  userDoc = { _id: SA_USER, name: "Sara Khan", email: "sara@example.com", phone: "+971501234567" };
});

describe("loadSuperAgentContact", () => {
  it("returns who the super agent is and how to reach them", async () => {
    expect(await loadSuperAgentContact(SA_ID)).toEqual({
      userId: SA_USER,
      name: "Sara Khan",
      email: "sara@example.com",
      phone: "+971501234567",
    });
  });

  it("is null for an agent with no super agent", async () => {
    expect(await loadSuperAgentContact(null)).toBeNull();
  });

  it("is null once the super agent's role was archived", async () => {
    superAgentDoc = { ...superAgentDoc, roleArchivedAt: new Date() };
    expect(await loadSuperAgentContact(SA_ID)).toBeNull();
  });

  it("leaves the phone empty when none is on file", async () => {
    userDoc = { ...userDoc, phone: undefined };
    expect((await loadSuperAgentContact(SA_ID))?.phone).toBe("");
  });
});
