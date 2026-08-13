/**
 * @jest-environment node
 *
 * Regression tests for admin-form "Validation failed" bugs:
 * CrudModal/admin forms submit "" for blank optional fields and null to unassign —
 * schemas must accept those shapes.
 */
import { employerAdminCreateSchema, employerAdminUpdateSchema } from "@/lib/validators/employers";
import { agentUpdateSchema } from "@/lib/validators/admin";
import { jobSeekerAdminUpdateSchema } from "@/lib/validators/job-seekers";

describe("employer admin schemas accept blank optional fields", () => {
  it("create: empty phone/industry/location pass", () => {
    const r = employerAdminCreateSchema.safeParse({
      name: "Test Contact",
      email: "emp@example.com",
      password: "Str0ng!Passw0rd",
      companyName: "Acme",
      industry: "",
      location: "",
      phone: "",
    });
    expect(r.success).toBe(true);
  });

  it("create: short password fails validation", () => {
    const r = employerAdminCreateSchema.safeParse({
      name: "Test Contact",
      email: "emp@example.com",
      password: "Short1!Abc",
      companyName: "Acme",
      industry: "",
      location: "",
      phone: "",
    });
    // Throw rather than expect(false) so TS narrows the safeParse union and
    // r.error is known to exist below.
    if (r.success) throw new Error("expected a short password to fail validation");
    expect(r.error.issues.some((issue) => issue.path.includes("password"))).toBe(true);
  });

  it("update: empty phone passes", () => {
    const r = employerAdminUpdateSchema.safeParse({ name: "X Y", phone: "" });
    expect(r.success).toBe(true);
  });
});

describe("agentUpdateSchema", () => {
  it("accepts superAgentId: null (unassign)", () => {
    const r = agentUpdateSchema.safeParse({
      userId: "a".repeat(24),
      name: "Agent Name",
      email: "agent@example.com",
      isActive: true,
      superAgentId: null,
      commissionRate: 0,
      assignedCityIds: [],
      assignedStateIds: [],
    });
    expect(r.success).toBe(true);
  });
});

describe("jobSeekerAdminUpdateSchema", () => {
  it("accepts isActive boolean (reactivate)", () => {
    const r = jobSeekerAdminUpdateSchema.safeParse({ isActive: true });
    expect(r.success).toBe(true);
  });
});
