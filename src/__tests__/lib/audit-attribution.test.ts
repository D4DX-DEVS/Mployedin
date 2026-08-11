/**
 * @jest-environment node
 *
 * Regression cover for the tenant-view / impersonation attribution bug (D1).
 *
 * withAuth swaps ctx.userId and ctx.role to the target account so that
 * employer-scoped lookups resolve transparently, and keeps the real human in
 * ctx.tenantView. actorFromCtx previously read only ctx.userId/ctx.role, so an admin
 * working inside an employer's account had their actions recorded as if the employer
 * had performed them — the audit trail credited the wrong party.
 */

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/models/AuditLog", () => ({ __esModule: true, default: { create: jest.fn() } }));

import { actorFromCtx } from "@/lib/audit/log";

const ADMIN_ID = "507f1f77bcf86cd799440001";
const EMPLOYER_USER_ID = "507f1f77bcf86cd799440002";
const EMPLOYER_ID = "507f1f77bcf86cd799440003";

describe("actorFromCtx attribution", () => {
  it("credits the acting user when not inside anyone else's context", () => {
    expect(actorFromCtx({ userId: ADMIN_ID, role: "admin" })).toEqual({
      actorId: ADMIN_ID,
      actorRole: "admin",
    });
  });

  it("credits the real actor, not the employer, during tenant view", () => {
    // Exactly the ctx withAuth:213-221 builds: userId/role are the employer.
    const ctx = {
      userId: EMPLOYER_USER_ID,
      role: "employer",
      tenantView: { actorId: ADMIN_ID, actorRole: "admin", employerId: EMPLOYER_ID },
    };

    expect(actorFromCtx(ctx)).toEqual({
      actorId: ADMIN_ID,
      actorRole: "admin",
      onBehalfOfId: EMPLOYER_USER_ID,
      onBehalfOfRole: "employer",
    });
  });

  it("records the same way for an agent or super-agent in tenant view", () => {
    const agentId = "507f1f77bcf86cd799440004";
    const result = actorFromCtx({
      userId: EMPLOYER_USER_ID,
      role: "employer",
      tenantView: { actorId: agentId, actorRole: "agent", employerId: EMPLOYER_ID },
    });

    expect(result.actorId).toBe(agentId);
    expect(result.actorRole).toBe("agent");
    expect(result.onBehalfOfId).toBe(EMPLOYER_USER_ID);
  });

  it("never leaves the impersonated account as the actor", () => {
    const result = actorFromCtx({
      userId: EMPLOYER_USER_ID,
      role: "employer",
      tenantView: { actorId: ADMIN_ID, actorRole: "admin", employerId: EMPLOYER_ID },
    });

    // The property that matters: whatever else changes, the entry must not read as
    // though the employer did this themselves.
    expect(result.actorId).not.toBe(EMPLOYER_USER_ID);
  });
});
