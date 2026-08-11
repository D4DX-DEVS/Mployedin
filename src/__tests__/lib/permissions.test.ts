/**
 * @jest-environment node
 */
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

    it("should have access to reports", () => {
      expect(canAccess("admin", "reports", "read")).toBe(true);
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

    it("should NOT be able to manage reports", () => {
      expect(canAccess("employer", "reports", "read")).toBe(false);
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

    // These back UI actions that shipped without the matching permission and
    // therefore 403'd: the Trash button on the leads page, and edit/delete of the
    // agent's own exhibition request. Ownership is enforced in the route handlers.
    it("should be able to delete its own leads", () => {
      expect(canAccess("agent", "leads", "delete")).toBe(true);
    });

    it("should be able to edit and delete its own exhibition requests", () => {
      expect(canAccess("agent", "exhibitions", "update")).toBe(true);
      expect(canAccess("agent", "exhibitions", "delete")).toBe(true);
    });
  });

  describe("Super Agent role", () => {
    it("should be able to manage commissions", () => {
      expect(canAccess("super_agent", "commissions", "read")).toBe(true);
      expect(canAccess("super_agent", "commissions", "approve")).toBe(true);
    });

    it("should be able to read agents", () => {
      expect(canAccess("super_agent", "agents", "read")).toBe(true);
    });

    // PATCH /api/exhibitions/[id] guards on exhibitions:update, and that route is
    // the only implementation of the super-agent review/approve flow — without this
    // the whole approval workflow 403'd.
    it("should be able to review exhibition requests", () => {
      expect(canAccess("super_agent", "exhibitions", "update")).toBe(true);
      expect(canAccess("super_agent", "exhibitions", "approve")).toBe(true);
    });

    it("should NOT be able to impersonate users", () => {
      expect(canAccess("super_agent", "users", "impersonate")).toBe(false);
    });
  });

  describe("Subscriptions resource", () => {
    it("admin should have full subscriptions access", () => {
      expect(canAccess("admin", "subscriptions", "read")).toBe(true);
      expect(canAccess("admin", "subscriptions", "create")).toBe(true);
      expect(canAccess("admin", "subscriptions", "update")).toBe(true);
      expect(canAccess("admin", "subscriptions", "delete")).toBe(true);
    });

    it("super_agent should have subscriptions CRUD", () => {
      expect(canAccess("super_agent", "subscriptions", "read")).toBe(true);
      expect(canAccess("super_agent", "subscriptions", "create")).toBe(true);
      expect(canAccess("super_agent", "subscriptions", "update")).toBe(true);
    });

    it("agent should be able to read and create subscriptions", () => {
      expect(canAccess("agent", "subscriptions", "read")).toBe(true);
      expect(canAccess("agent", "subscriptions", "create")).toBe(true);
    });

    it("employer should only read own subscription", () => {
      expect(canAccess("employer", "subscriptions", "read")).toBe(true);
      expect(canAccess("employer", "subscriptions", "create")).toBe(false);
      expect(canAccess("employer", "subscriptions", "update")).toBe(false);
      expect(canAccess("employer", "subscriptions", "delete")).toBe(false);
    });

    it("job_seeker should only read own subscription", () => {
      expect(canAccess("job_seeker", "subscriptions", "read")).toBe(true);
      expect(canAccess("job_seeker", "subscriptions", "create")).toBe(false);
      expect(canAccess("job_seeker", "subscriptions", "update")).toBe(false);
    });
  });
});
