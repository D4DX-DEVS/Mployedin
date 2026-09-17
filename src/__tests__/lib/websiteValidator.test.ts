import { normalizeWebsiteUrl, isValidWebsiteInput } from "@/lib/validators/website";

describe("normalizeWebsiteUrl", () => {
  it("accepts the scheme-less forms people actually type", () => {
    // The exact input that blocked an employer registration.
    expect(normalizeWebsiteUrl("www.talindia.co")).toEqual({ ok: true, value: "https://www.talindia.co/" });
    expect(normalizeWebsiteUrl("talindia.co")).toEqual({ ok: true, value: "https://talindia.co/" });
    expect(normalizeWebsiteUrl("  www.talindia.co  ")).toEqual({ ok: true, value: "https://www.talindia.co/" });
  });

  it("keeps absolute URLs, their paths and their scheme", () => {
    expect(normalizeWebsiteUrl("https://talindia.co/careers")).toEqual({
      ok: true,
      value: "https://talindia.co/careers",
    });
    expect(normalizeWebsiteUrl("http://talindia.co")).toEqual({ ok: true, value: "http://talindia.co/" });
  });

  it("treats a blank website as valid — the field is optional", () => {
    expect(normalizeWebsiteUrl("")).toEqual({ ok: true, value: "" });
    expect(normalizeWebsiteUrl("   ")).toEqual({ ok: true, value: "" });
    expect(normalizeWebsiteUrl(null)).toEqual({ ok: true, value: "" });
    expect(normalizeWebsiteUrl(undefined)).toEqual({ ok: true, value: "" });
  });

  it("rejects schemes we would never render as a company link", () => {
    expect(normalizeWebsiteUrl("javascript:alert(1)").ok).toBe(false);
    expect(normalizeWebsiteUrl("data:text/html,<script>").ok).toBe(false);
    expect(normalizeWebsiteUrl("ftp://talindia.co").ok).toBe(false);
  });

  it("rejects hostnames that cannot be a real site", () => {
    expect(normalizeWebsiteUrl("talindia").ok).toBe(false);
    expect(normalizeWebsiteUrl("not a website").ok).toBe(false);
    expect(normalizeWebsiteUrl("https://").ok).toBe(false);
    expect(normalizeWebsiteUrl("talindia.c0").ok).toBe(false);
  });

  it("rejects credentials embedded in the URL", () => {
    expect(normalizeWebsiteUrl("https://user:pass@talindia.co").ok).toBe(false);
  });

  it("rejects input past the storage limit", () => {
    expect(normalizeWebsiteUrl(`https://talindia.co/${"a".repeat(2048)}`).ok).toBe(false);
  });

  it("isValidWebsiteInput mirrors the normaliser", () => {
    expect(isValidWebsiteInput("www.talindia.co")).toBe(true);
    expect(isValidWebsiteInput("")).toBe(true);
    expect(isValidWebsiteInput("talindia")).toBe(false);
  });
});
