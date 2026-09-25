import { localizeActionUrl } from "@/lib/notifications/resolve";

describe("localizeActionUrl", () => {
  it("should add locale prefix to absolute paths", () => {
    expect(localizeActionUrl("/employer/applications", "en")).toBe("/en/employer/applications");
    expect(localizeActionUrl("/employer/offers", "ar")).toBe("/ar/employer/offers");
  });

  it("should not double-prefix if locale is already present", () => {
    expect(localizeActionUrl("/en/employer/applications", "en")).toBe("/en/employer/applications");
    expect(localizeActionUrl("/ar/employer/applications", "ar")).toBe("/ar/employer/applications");
  });

  it("should strip old locale prefix and apply new one", () => {
    // If a notification was stored with /ar/employer/applications but viewer is en
    expect(localizeActionUrl("/ar/employer/applications", "en")).toBe("/en/employer/applications");
    expect(localizeActionUrl("/en/employer/offers", "ar")).toBe("/ar/employer/offers");
  });

  it("should return null for undefined or empty URLs", () => {
    expect(localizeActionUrl(undefined, "en")).toBeNull();
    expect(localizeActionUrl("", "en")).toBeNull();
  });

  it("should return null for non-absolute URLs", () => {
    expect(localizeActionUrl("employer/applications", "en")).toBeNull();
  });

  it("should pass through http(s) URLs unchanged", () => {
    const url = "https://example.com/page";
    expect(localizeActionUrl(url, "en")).toBeNull();
  });

  it("should handle locale-only paths", () => {
    expect(localizeActionUrl("/en", "ar")).toBe("/ar");
    expect(localizeActionUrl("/ar", "en")).toBe("/en");
  });
});
