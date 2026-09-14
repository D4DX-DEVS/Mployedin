/**
 * @jest-environment node
 *
 * Guard for the tenant-view write gate (withAuth.ts): inside an employer's
 * account BOTH the employer's permission and the ACTOR's own permission must
 * allow the action. A super-agent held jobs:["read","export"], so the employer
 * workspace showed them all three Post-a-job entries (tenant-view nav is built
 * as "employer") and every Publish — and every Save as draft — came back as a
 * bare "Forbidden — insufficient permissions" at the end of the wizard.
 *
 * These assertions are the contract, not an implementation detail: dropping
 * create/update from super_agent again silently restores that dead end.
 */

import { canAccess } from "@/lib/permissions/matrix";
import type { UserRole } from "@/types/user";

/** Mirrors the check withAuth performs for a guarded write inside tenant view. */
function allowedInTenantView(actor: UserRole, resource: "jobs", action: "create" | "update" | "read") {
  return canAccess("employer" as UserRole, resource, action) && canAccess(actor, resource, action);
}

describe("tenant view — job writes by the overseeing role", () => {
  const overseers: UserRole[] = ["admin", "super_agent", "agent"];

  it.each(overseers)("%s can post a job inside an employer they oversee", (actor) => {
    expect(allowedInTenantView(actor, "jobs", "create")).toBe(true);
  });

  it.each(overseers)("%s can edit a job inside an employer they oversee", (actor) => {
    expect(allowedInTenantView(actor, "jobs", "update")).toBe(true);
  });

  it("does not widen a super-agent beyond jobs — they stay read-only on placements", () => {
    expect(canAccess("super_agent" as UserRole, "placements", "update")).toBe(false);
  });

  it("does not hand a super-agent job deletion (tenant view blocks non-admin DELETE anyway)", () => {
    expect(canAccess("super_agent" as UserRole, "jobs", "delete")).toBe(false);
  });

  it("a job seeker is still refused, so the gate is really being evaluated", () => {
    expect(allowedInTenantView("job_seeker" as UserRole, "jobs", "create")).toBe(false);
  });
});
