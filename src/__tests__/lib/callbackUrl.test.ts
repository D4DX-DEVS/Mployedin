import { safeCallbackPath, withCallback, CALLBACK_PARAM } from "@/lib/routing/callbackUrl";

describe("callbackUrl", () => {
  describe("safeCallbackPath", () => {
    const locale = "en";

    describe("accepts valid paths", () => {
      it("accepts /en/jobs/abc123", () => {
        const result = safeCallbackPath("/en/jobs/abc123", locale);
        expect(result).toBe("/en/jobs/abc123");
      });

      it("accepts /en/jobs/abc with search and hash", () => {
        const result = safeCallbackPath("/en/jobs/abc?x=1#y", locale);
        expect(result).toBe("/en/jobs/abc?x=1#y");
      });

      it("accepts /en/applications with trailing slash", () => {
        const result = safeCallbackPath("/en/applications/", locale);
        expect(result).toBe("/en/applications/");
      });

      it("accepts complex paths with multiple segments", () => {
        const result = safeCallbackPath("/en/jobs/123/apply?step=1#review", locale);
        expect(result).toBe("/en/jobs/123/apply?step=1#review");
      });
    });

    describe("rejects invalid inputs", () => {
      it("rejects null", () => {
        const result = safeCallbackPath(null, locale);
        expect(result).toBeNull();
      });

      it("rejects undefined", () => {
        const result = safeCallbackPath(undefined, locale);
        expect(result).toBeNull();
      });

      it("rejects empty string", () => {
        const result = safeCallbackPath("", locale);
        expect(result).toBeNull();
      });

      it("rejects paths with wrong locale", () => {
        const result = safeCallbackPath("/ar/jobs/abc123", locale);
        expect(result).toBeNull();
      });

      it("rejects absolute URLs to another origin", () => {
        const result = safeCallbackPath("https://evil.com/en/jobs/1", locale);
        expect(result).toBeNull();
      });

      it("rejects protocol-relative URLs", () => {
        const result = safeCallbackPath("//evil.com/en/jobs/1", locale);
        expect(result).toBeNull();
      });

      it("rejects backslash tricks", () => {
        const result = safeCallbackPath("/\\evil.com", locale);
        expect(result).toBeNull();
      });

      it("rejects /api/* paths", () => {
        const result = safeCallbackPath("/en/api/jobs/1", locale);
        expect(result).toBeNull();
      });

      it("rejects paths not starting with /${locale}/", () => {
        const result = safeCallbackPath("/jobs/123", locale);
        expect(result).toBeNull();
      });

      // Regression: the /api/ block used to be a plain string-prefix check, so a
      // dot-segment slipped past it and `new URL()` in the consumer normalised
      // "/en/../api/x" back down to "/api/x" — the destination this guard exists
      // to forbid. Each of these must be refused, and must also still resolve
      // outside /en/ once normalised, which is what makes them dangerous.
      it.each([
        "/en/../api/internal",
        "/en/x/../../api/internal?y=1",
        "/en/./../api/internal",
        "/en/jobs/../../api/internal",
      ])("rejects dot-segment traversal: %s", (candidate) => {
        expect(safeCallbackPath(candidate, locale)).toBeNull();
        // Prove the input really would have escaped had it been let through.
        expect(new URL(candidate, "http://example.test").pathname).toBe("/api/internal");
      });

      it("rejects malformed strings that would throw in new URL", () => {
        const result = safeCallbackPath("ht!tp://[invalid", locale);
        expect(result).toBeNull();
      });
    });

    describe("locale variants", () => {
      it("accepts /ar/jobs/abc123 when locale is ar", () => {
        const result = safeCallbackPath("/ar/jobs/abc123", "ar");
        expect(result).toBe("/ar/jobs/abc123");
      });

      it("rejects /en/jobs/abc123 when locale is ar", () => {
        const result = safeCallbackPath("/en/jobs/abc123", "ar");
        expect(result).toBeNull();
      });
    });
  });

  describe("withCallback", () => {
    it("appends callback with ? when path has no query", () => {
      const result = withCallback("/api/auth/post-login-redirect", "/en/jobs/abc");
      expect(result).toBe(`/api/auth/post-login-redirect?${CALLBACK_PARAM}=%2Fen%2Fjobs%2Fabc`);
    });

    it("appends callback with & when path has existing query", () => {
      const result = withCallback("/api/auth/post-login-redirect?foo=bar", "/en/jobs/abc");
      expect(result).toBe(`/api/auth/post-login-redirect?foo=bar&${CALLBACK_PARAM}=%2Fen%2Fjobs%2Fabc`);
    });

    it("returns path unchanged when callback is null", () => {
      const result = withCallback("/api/auth/post-login-redirect", null);
      expect(result).toBe("/api/auth/post-login-redirect");
    });

    it("returns path unchanged when callback is undefined", () => {
      const result = withCallback("/api/auth/post-login-redirect", undefined);
      expect(result).toBe("/api/auth/post-login-redirect");
    });

    it("returns path unchanged when callback is empty string", () => {
      const result = withCallback("/api/auth/post-login-redirect", "");
      expect(result).toBe("/api/auth/post-login-redirect");
    });

    it("encodes special characters in callback", () => {
      const result = withCallback("/api/auth/post-login-redirect", "/en/jobs/abc?x=1&y=2");
      // Verify it's properly encoded (/ becomes %2F, ? becomes %3F, & becomes %26)
      expect(result).toMatch(/callbackUrl=%2Fen%2Fjobs%2Fabc%3Fx%3D1%26y%3D2/);
    });

    it("round-trips through decodeURIComponent", () => {
      const callback = "/en/jobs/abc?x=1#y";
      const withQuery = withCallback("/api/auth/post-login-redirect", callback);
      // Extract the encoded value
      const match = withQuery.match(/callbackUrl=([^&]+)/);
      expect(match).toBeTruthy();
      if (match) {
        const decoded = decodeURIComponent(match[1]);
        expect(decoded).toBe(callback);
      }
    });
  });

  describe("CALLBACK_PARAM constant", () => {
    it("exports CALLBACK_PARAM as callbackUrl", () => {
      expect(CALLBACK_PARAM).toBe("callbackUrl");
    });
  });
});
