/**
 * Owner, 2026-10-15: a completed request still behaved like one under review
 * (priority picker, Edit details, Add files). Once completed, rejected or
 * archived it is a finished record. Event photos are the agent's alone.
 */
jest.mock("@/lib/storage/spaces", () => ({ getPresignedUrl: jest.fn() }));

import { CLOSED_STATUSES, isClosedStatus } from "@/lib/exhibitions/transitions";
import { canManageAttachments } from "@/lib/exhibitions/attachments";

const request = (status: string) => ({ agentId: { toString: () => "agent-1" }, status });

describe("closed requests", () => {
  it("treats completed, rejected and archived as closed", () => {
    expect([...CLOSED_STATUSES].sort()).toEqual(["archived", "completed", "rejected"]);
    expect(isClosedStatus("active")).toBe(false);
    expect(isClosedStatus("submitted")).toBe(false);
  });

  it("lets the admin change event files only while the request is open", () => {
    expect(canManageAttachments("admin", "admin-1", request("under_review"), "event")).toBe(true);
    expect(canManageAttachments("admin", "admin-1", request("active"), "event")).toBe(true);
    for (const status of CLOSED_STATUSES) {
      expect(canManageAttachments("admin", "admin-1", request(status), "event")).toBe(false);
    }
  });

  it("leaves event photos to the agent: the admin only sees them", () => {
    for (const status of ["active", "completed", "archived"]) {
      expect(canManageAttachments("admin", "admin-1", request(status), "completion")).toBe(false);
    }
  });

  it("keeps the agent's own rules", () => {
    expect(canManageAttachments("agent", "agent-1", request("draft"), "event")).toBe(true);
    expect(canManageAttachments("agent", "agent-1", request("completed"), "completion")).toBe(true);
    expect(canManageAttachments("agent", "agent-2", request("completed"), "completion")).toBe(false);
    expect(canManageAttachments("super_agent", "sa-1", request("active"), "completion")).toBe(false);
  });
});
