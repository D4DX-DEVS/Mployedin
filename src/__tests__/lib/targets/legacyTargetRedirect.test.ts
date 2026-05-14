import { getLegacyTargetRedirectPath } from "@/lib/targets/legacyTargetRedirect";

describe("getLegacyTargetRedirectPath", () => {
  it("redirects legacy admin targets to target management", () => {
    expect(getLegacyTargetRedirectPath("en", "admin")).toBe("/en/admin/target-management");
  });

  it("preserves query parameters", () => {
    expect(
      getLegacyTargetRedirectPath("en", "super-agent", {
        year: "2026",
        status: "active",
        search: "north team",
      })
    ).toBe("/en/super-agent/target-management?year=2026&status=active&search=north+team");
  });

  it("preserves repeated query parameters", () => {
    expect(getLegacyTargetRedirectPath("ar", "agent", { stage: ["behind", "at_risk"] })).toBe(
      "/ar/agent/target-management?stage=behind&stage=at_risk"
    );
  });
});