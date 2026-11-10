import { roleFromPathname } from "@/components/shared/Copilot/suggestionRole";

describe("roleFromPathname", () => {
  it("reads the role from the area segment, not from words later in the path", () => {
    // Each of these used to match the wrong role because the whole path was
    // searched: "/admin/job-seekers" contains "/job-seeker".
    expect(roleFromPathname("/en/admin/job-seekers")).toBe("admin");
    expect(roleFromPathname("/en/admin/employers")).toBe("admin");
    expect(roleFromPathname("/en/admin/agents")).toBe("admin");
    expect(roleFromPathname("/en/agent/job-seekers")).toBe("agent");
    expect(roleFromPathname("/en/super-agent/employers")).toBe("superAgent");
    expect(roleFromPathname("/en/employer/candidates")).toBe("employer");
  });

  it("handles each role's home and paths with or without a locale", () => {
    expect(roleFromPathname("/en/job-seeker")).toBe("jobSeeker");
    expect(roleFromPathname("/ar/super-agent")).toBe("superAgent");
    expect(roleFromPathname("/admin/users")).toBe("admin");
    expect(roleFromPathname("/agent")).toBe("agent");
  });

  it("falls back to default outside the role areas", () => {
    expect(roleFromPathname("/en/notifications")).toBe("default");
    expect(roleFromPathname("/en")).toBe("default");
    expect(roleFromPathname("")).toBe("default");
  });
});
