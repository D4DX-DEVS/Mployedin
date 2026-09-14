import { buildPublicJobUrl } from "@/components/shared/ShareJob";

describe("buildPublicJobUrl", () => {
  const originalEnv = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = originalEnv;
  });

  describe("locale and job ID", () => {
    it("returns a URL containing /en/jobs/<id> for locale 'en'", () => {
      const url = buildPublicJobUrl("en", "job123", "https://example.com");
      expect(url).toContain("/en/jobs/job123");
    });

    it("returns a URL containing /ar/jobs/<id> for locale 'ar'", () => {
      const url = buildPublicJobUrl("ar", "job456", "https://example.com");
      expect(url).toContain("/ar/jobs/job456");
    });
  });

  describe("never contains /job-seeker/ (regression guard)", () => {
    it("does not contain /job-seeker/ path segment in the URL", () => {
      const url = buildPublicJobUrl("en", "job789", "https://example.com");
      // CRITICAL: The old URL was /{locale}/job-seeker/jobs/{id} which required auth.
      // The new URL MUST be /{locale}/jobs/{id} (no /job-seeker/).
      // A stranger clicking the shared link should land on the public job page.
      expect(url).not.toContain("/job-seeker/");
    });
  });

  describe("base URL handling", () => {
    it("uses provided origin parameter when given", () => {
      const url = buildPublicJobUrl("en", "job1", "https://custom.com");
      expect(url).toBe("https://custom.com/en/jobs/job1");
    });

    it("returns the correct URL with origin parameter", () => {
      const url = buildPublicJobUrl("en", "job123", "https://mployedin.com");
      expect(url).toBe("https://mployedin.com/en/jobs/job123");
    });

    it("returns the correct URL with origin parameter and Arabic locale", () => {
      const url = buildPublicJobUrl("ar", "job456", "https://mployedin.com");
      expect(url).toBe("https://mployedin.com/ar/jobs/job456");
    });
  });

  describe("returns absolute URL", () => {
    it("always returns a URL starting with a protocol", () => {
      const url = buildPublicJobUrl("en", "job1", "https://example.com");
      expect(url).toMatch(/^https?:\/\//);
    });

    it("includes domain after protocol", () => {
      const url = buildPublicJobUrl("en", "job1", "https://example.com");
      expect(url).toMatch(/^https?:\/\/[^/]+/);
    });

    it("has a valid absolute URL structure", () => {
      const url = buildPublicJobUrl("en", "job1", "https://example.com");
      // Should not be a relative path
      expect(url).not.toMatch(/^\/[a-z]/);
      // Should have protocol://domain/path
      expect(url).toMatch(/^https?:\/\/[^/]+\/[a-z]/);
    });
  });

  describe("URL format", () => {
    it("returns well-formed URL for en locale", () => {
      const url = buildPublicJobUrl("en", "abc123", "https://mployedin.com");
      expect(url).toBe("https://mployedin.com/en/jobs/abc123");
    });

    it("returns well-formed URL for ar locale", () => {
      const url = buildPublicJobUrl("ar", "xyz789", "https://mployedin.com");
      expect(url).toBe("https://mployedin.com/ar/jobs/xyz789");
    });

    it("handles job IDs with special characters", () => {
      const url = buildPublicJobUrl("en", "job-with-dash_and_underscore", "https://example.com");
      expect(url).toBe("https://example.com/en/jobs/job-with-dash_and_underscore");
    });

    it("constructs URL correctly with different domains", () => {
      const url1 = buildPublicJobUrl("en", "job1", "https://app.example.com");
      expect(url1).toBe("https://app.example.com/en/jobs/job1");

      const url2 = buildPublicJobUrl("en", "job1", "https://example.co.uk");
      expect(url2).toBe("https://example.co.uk/en/jobs/job1");
    });
  });
});
