/**
 * @jest-environment node
 *
 * Agents post jobs the employer's way — AI creator, form, template, document —
 * for an employer assigned to them. Two small rules carry that: who an agent
 * may post for (server), and which employer a shared creation page is posting
 * for (client, from the URL).
 */
const findOne = jest.fn();
jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { findOne: (...a: unknown[]) => findOne(...a) },
}));

import { agentPostingFor } from "@/lib/jobs/agentPosting";
import { jobPostingTarget } from "@/components/features/jobs/jobPostingTarget";

const ASSIGNED = "64a000000000000000000003";
const AREA_ONLY = "64a000000000000000000004";

function agentRow(row: unknown) {
  findOne.mockReturnValue({ select: () => ({ lean: async () => row }) });
}

describe("agentPostingFor", () => {
  beforeEach(() => findOne.mockReset());

  it("allows an assigned employer and returns the agent's id for the job's agentId", async () => {
    agentRow({ _id: "agent1", assignedEmployerIds: [ASSIGNED] });
    await expect(agentPostingFor("user1", ASSIGNED)).resolves.toBe("agent1");
    expect(findOne).toHaveBeenCalledWith({ userId: "user1" });
  });

  it("refuses an employer the agent can only see through their area", async () => {
    agentRow({ _id: "agent1", assignedEmployerIds: [ASSIGNED] });
    await expect(agentPostingFor("user1", AREA_ONLY)).resolves.toBeNull();
  });

  it("refuses a missing or malformed employer id without a lookup", async () => {
    for (const bad of [null, undefined, "", "abc", "64a00000000000000000000z"]) {
      await expect(agentPostingFor("user1", bad)).resolves.toBeNull();
    }
    expect(findOne).not.toHaveBeenCalled();
  });

  it("refuses a user with no agent profile", async () => {
    agentRow(null);
    await expect(agentPostingFor("user1", ASSIGNED)).resolves.toBeNull();
  });
});

describe("jobPostingTarget", () => {
  it("leaves the employer's pages exactly as they were", () => {
    const target = jobPostingTarget("/en/employer/jobs/ai-create", "en", ASSIGNED);
    expect(target).toMatchObject({ role: "employer", jobsHref: "/en/employer/jobs", employerId: undefined });
    expect(target.withEmployer("/en/employer/jobs/new?mode=manual")).toBe("/en/employer/jobs/new?mode=manual");
  });

  it("carries the agent's employer from page to page", () => {
    const target = jobPostingTarget("/ar/agent/jobs/ai-extract", "ar", ASSIGNED);
    expect(target).toMatchObject({ role: "agent", jobsHref: "/ar/agent/jobs", employerId: ASSIGNED });
    expect(target.withEmployer("/ar/agent/jobs/new?mode=manual&prefill=ai")).toBe(
      `/ar/agent/jobs/new?mode=manual&prefill=ai&employer=${ASSIGNED}`,
    );
    expect(target.withEmployer("/ar/agent/jobs")).toBe(`/ar/agent/jobs?employer=${ASSIGNED}`);
  });

  it("ignores a malformed employer id rather than forwarding it", () => {
    const target = jobPostingTarget("/en/agent/jobs/ai-create", "en", "<script>");
    expect(target.employerId).toBeUndefined();
    expect(target.withEmployer("/en/agent/jobs")).toBe("/en/agent/jobs");
  });
});
