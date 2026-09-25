import { sameOriginPath } from "@/components/shared/Copilot/links";

const ORIGIN = "https://mployedin.com";

describe("sameOriginPath", () => {
  it("keeps an in-app path, query and hash", () => {
    expect(sameOriginPath("/en/job-seeker/jobs/6a22?tab=apply#top", ORIGIN)).toBe("/en/job-seeker/jobs/6a22?tab=apply#top");
  });

  it.each([
    ["protocol-relative", "//evil.com/en"],
    ["backslash the browser reads as a slash", "/\\evil.com"],
    ["slash-backslash-slash", "/\\/evil.com"],
    ["tab the URL parser strips", "/\t/evil.com"],
    ["absolute URL", "https://evil.com/en"],
    ["script URL", "javascript:alert(1)"],
    ["relative without a leading slash", "en/jobs"],
  ])("rejects a %s href", (_label, href) => {
    expect(sameOriginPath(href, ORIGIN)).toBeNull();
  });

  it("rejects a missing href", () => {
    expect(sameOriginPath(undefined, ORIGIN)).toBeNull();
  });
});
