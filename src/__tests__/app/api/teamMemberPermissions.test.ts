/**
 * @jest-environment node
 */
/**
 * How a colleague's granted functions are written.
 *
 * The rule that matters: the stored `permissions` object is always recomputed
 * from roles plus the employer's manual ticks, and never copied from the
 * request body. Before this, the member-update route merged whatever
 * `permissions` object it was handed, and a role change left stale permissions
 * behind. Both routes are checked because they are edited separately and drift.
 */
import fs from "fs";
import path from "path";
import { teamInviteSchema, teamUpdateSchema } from "@/lib/validators/team";
import { COMPANY_FUNCTIONS } from "@/models/CompanyUser";

const read = (...segments: string[]) =>
  fs.readFileSync(path.join(process.cwd(), ...segments), "utf8");

const INVITE_ROUTE = read("src", "app", "api", "employers", "team", "route.ts");
const UPDATE_ROUTE = read("src", "app", "api", "employers", "team", "[id]", "route.ts");

describe("team validators", () => {
  it("accepts overrides naming real functions", () => {
    const parsed = teamInviteSchema.safeParse({
      email: "colleague@example.com",
      companyRoles: ["hiring_manager"],
      permissionOverrides: { canRunScreening: true, canSendOffers: false },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an override naming a function that does not exist", () => {
    const parsed = teamInviteSchema.safeParse({
      email: "colleague@example.com",
      companyRoles: ["hiring_manager"],
      permissionOverrides: { canDeleteEverything: true },
    });
    expect(parsed.success).toBe(false);
  });

  it("no longer accepts a permissions object written straight from the client", () => {
    const parsed = teamUpdateSchema.safeParse({
      companyRoles: ["viewer"],
      permissions: { canManageTeam: true },
    });
    // zod strips unknown keys rather than failing, so the assertion is that the
    // value never survives into the parsed output.
    expect(parsed.success).toBe(true);
    expect(parsed.success && "permissions" in parsed.data).toBe(false);
  });

  it("lets the update route change the whole roles array, not just one role", () => {
    const parsed = teamUpdateSchema.safeParse({ companyRoles: ["accounting", "viewer"] });
    expect(parsed.success).toBe(true);
  });

  it("covers every grantable function", () => {
    for (const flag of COMPANY_FUNCTIONS) {
      const parsed = teamInviteSchema.safeParse({
        email: "colleague@example.com",
        companyRoles: ["viewer"],
        permissionOverrides: { [flag]: true },
      });
      expect({ flag, ok: parsed.success }).toEqual({ flag, ok: true });
    }
  });
});

describe("team routes compute permissions rather than trusting the request", () => {
  it("the invite route computes them", () => {
    expect(INVITE_ROUTE).toContain("computeEffectivePermissions");
  });

  it("the update route computes them", () => {
    expect(UPDATE_ROUTE).toContain("computeEffectivePermissions");
  });

  it("neither route merges a client-supplied permissions object", () => {
    for (const [name, src] of [
      ["invite", INVITE_ROUTE],
      ["update", UPDATE_ROUTE],
    ] as const) {
      expect({ route: name, merges: /\.\.\.\s*(body\.)?permissions\b/.test(src) }).toEqual({
        route: name,
        merges: false,
      });
    }
  });

  it("re-inviting a deactivated colleague recomputes their permissions", () => {
    // Roles can differ from last time, so carrying the old object over would
    // silently keep access the new roles never granted.
    const reactivateBlock = INVITE_ROUTE.slice(
      INVITE_ROUTE.indexOf('existing.status = "pending"'),
      INVITE_ROUTE.indexOf("await existing.save()")
    );
    expect(reactivateBlock).toContain("computeEffectivePermissions");
  });
});

describe("the owner is never editable", () => {
  it("the update route refuses to touch the owner", () => {
    expect(UPDATE_ROUTE).toContain('target.companyRole === "owner"');
  });

  it("the invite route refuses to create another owner", () => {
    expect(INVITE_ROUTE).toContain("Cannot invite as owner");
  });
});
