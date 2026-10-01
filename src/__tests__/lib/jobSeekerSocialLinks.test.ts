/**
 * @jest-environment node
 *
 * "CV: changed the template, Add to Profile says We couldn't save" (client
 * report, 2026-10-01). The seeker's profile held `{ label: "LinkedIn", url:
 * "LinkedIn" }` — the CV reader stored the clickable text of a PDF link as its
 * address. The builder loaded it and sent it back on every save, and the
 * profile validator rejected the whole save over that one link.
 */
import { jobSeekerProfileUpdateSchema } from "@/lib/validators/job-seekers";
import { isLinkedInProfileUrl } from "@/lib/security/linkedin-url";
import { toLinkUrl, toLinkedInProfileUrl, cleanSocialLinks } from "@/lib/jobSeeker/socialLinks";

describe("toLinkUrl", () => {
  it.each([
    ["https://github.com/risha", "https://github.com/risha"],
    ["github.com/risha", "https://github.com/risha"],
    ["www.behance.net/risha", "https://www.behance.net/risha"],
    ["  http://risha.dev  ", "http://risha.dev/"],
  ])("keeps %p as %p", (raw, expected) => {
    expect(toLinkUrl(raw)).toBe(expected);
  });

  it.each(["LinkedIn", "Portfolio", "", "   ", "javascript:alert(1)", "mailto:a@b.co", "ftp://files.example.com", undefined, null, 42])(
    "rejects %p, which is not a web address",
    (raw) => {
      expect(toLinkUrl(raw)).toBeNull();
    },
  );
});

describe("toLinkedInProfileUrl", () => {
  it.each([
    ["https://www.linkedin.com/in/risha-kv", "https://www.linkedin.com/in/risha-kv"],
    ["https://in.linkedin.com/in/risha-kv", "https://www.linkedin.com/in/risha-kv"],
    ["linkedin.com/in/risha-kv/", "https://www.linkedin.com/in/risha-kv"],
    ["http://www.linkedin.com/in/risha-kv?originalSubdomain=in", "https://www.linkedin.com/in/risha-kv"],
  ])("turns %p into the profile address the profile accepts", (raw, expected) => {
    const url = toLinkedInProfileUrl(raw);
    expect(url).toBe(expected);
    expect(isLinkedInProfileUrl(url as string)).toBe(true);
  });

  it.each(["LinkedIn", "https://www.linkedin.com/company/acme", "https://linkedin.com.evil.io/in/x", "https://example.com/in/x", ""])(
    "rejects %p",
    (raw) => {
      expect(toLinkedInProfileUrl(raw)).toBeNull();
    },
  );
});

describe("cleanSocialLinks", () => {
  it("drops link text that is not an address and fixes the rest", () => {
    const cleaned = cleanSocialLinks([
      { label: "LinkedIn", url: "LinkedIn" },
      { label: "GitHub", url: "github.com/risha" },
      { label: "linkedin", url: "in.linkedin.com/in/risha-kv" },
      { label: "Portfolio", url: "https://github.com/risha" },
      { label: "", url: "risha.dev" },
      { url: "Website" },
    ]);
    expect(cleaned).toEqual([
      { label: "GitHub", url: "https://github.com/risha" },
      { label: "linkedin", url: "https://www.linkedin.com/in/risha-kv" },
      { label: "Link", url: "https://risha.dev/" },
    ]);
  });

  it("produces links the profile save accepts", () => {
    const socialLinks = cleanSocialLinks([
      { label: "LinkedIn", url: "LinkedIn" },
      { label: "LinkedIn", url: "https://www.linkedin.com/company/acme" },
      { label: "Behance", url: "behance.net/risha" },
    ]);
    expect(jobSeekerProfileUpdateSchema.safeParse({ socialLinks }).success).toBe(true);
  });

  it("treats a missing list as no links", () => {
    expect(cleanSocialLinks(undefined)).toEqual([]);
    expect(cleanSocialLinks("LinkedIn")).toEqual([]);
  });
});
