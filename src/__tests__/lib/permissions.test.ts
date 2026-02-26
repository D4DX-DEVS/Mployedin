import { canAccess } from "@/lib/permissions/matrix";

describe("RBAC Permission Matrix", () => {
  describe("Admin role", () => {
    it("should have full access to users", () => {
      expect(canAccess("admin", "users", "read")).toBe(true);
      expect(canAccess("admin", "users", "create")).toBe(true);
      expect(canAccess("admin", "users", "update")).toBe(true);
      expect(canAccess("admin", "users", "delete")).toBe(true);
      expect(canAccess("admin", "users", "impersonate")).toBe(true);
    });

    it("should have access to audit logs", () => {
      expect(canAccess("admin", "audit_logs", "read")).toBe(true);
    });

    it("should have access to territories", () => {
      expect(canAccess("admin", "territories", "read")).toBe(true);
      expect(canAccess("admin", "territories", "create")).toBe(true);
    });
  });

  describe("Job Seeker role", () => {
    it("should be able to read jobs", () => {
      expect(canAccess("job_seeker", "jobs", "read")).toBe(true);
    });

    it("should be able to create applications", () => {
      expect(canAccess("job_seeker", "applications", "create")).toBe(true);
    });

    it("should NOT be able to impersonate users", () => {
      expect(canAccess("job_seeker", "users", "impersonate")).toBe(false);
    });

    it("should NOT be able to access admin audit logs", () => {
      expect(canAccess("job_seeker", "audit_logs", "read")).toBe(false);
    });
  });

  describe("Employer role", () => {
    it("should be able to create jobs", () => {
      expect(canAccess("employer", "jobs", "create")).toBe(true);
    });

    it("should be able to read applications", () => {
      expect(canAccess("employer", "applications", "read")).toBe(true);
    });

    it("should NOT be able to manage territories", () => {
      expect(canAccess("employer", "territories", "create")).toBe(false);
    });
  });

  describe("Agent role", () => {
    it("should be able to manage leads", () => {
      expect(canAccess("agent", "leads", "create")).toBe(true);
      expect(canAccess("agent", "leads", "read")).toBe(true);
      expect(canAccess("agent", "leads", "update")).toBe(true);
    });

    it("should NOT be able to delete users", () => {
      expect(canAccess("agent", "users", "delete")).toBe(false);
    });
  });

  describe("Super Agent role", () => {
    it("should be able to manage commissions", () => {
      expect(canAccess("super_agent", "commissions", "read")).toBe(true);
      expect(canAccess("super_agent", "commissions", "approve")).toBe(true);
    });

    it("should be able to read territories", () => {
      expect(canAccess("super_agent", "territories", "read")).toBe(true);
    });

    it("should NOT be able to impersonate users", () => {
      expect(canAccess("super_agent", "users", "impersonate")).toBe(false);
    });
  });
});
