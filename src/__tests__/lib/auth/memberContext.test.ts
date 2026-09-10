/**
 * @jest-environment node
 */
import { actorFromCtx } from "@/lib/audit/log";
import { computeEffectivePermissions } from "@/models/CompanyUser";

describe("actorFromCtx with a company member", () => {
  const permissions = computeEffectivePermissions(["hiring_manager"]);

  it("credits the colleague, not the owner", () => {
    const actor = actorFromCtx({
      userId: "ownerUser",
      role: "employer",
      member: {
        actorId: "memberUser",
        companyId: "company1",
        companyRoles: ["hiring_manager"],
        permissions,
        jobAccess: [],
      },
    });
    expect(actor).toEqual({
      actorId: "memberUser",
      actorRole: "employer",
      onBehalfOfId: "ownerUser",
      onBehalfOfRole: "employer",
    });
  });

  it("leaves a plain employer context untouched", () => {
    expect(actorFromCtx({ userId: "ownerUser", role: "employer" })).toEqual({
      actorId: "ownerUser",
      actorRole: "employer",
    });
  });

  it("still prefers tenant view when both are somehow present", () => {
    const actor = actorFromCtx({
      userId: "ownerUser",
      role: "employer",
      tenantView: { actorId: "agentUser", actorRole: "agent", employerId: "company1" },
      member: {
        actorId: "memberUser",
        companyId: "company1",
        companyRoles: ["viewer"],
        permissions,
        jobAccess: [],
      },
    });
    expect(actor.actorId).toBe("agentUser");
  });
});
