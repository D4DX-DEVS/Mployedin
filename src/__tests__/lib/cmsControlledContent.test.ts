import { LEGAL_PAGES, LEGAL_PAGE_SLUGS, isLegalPageSlug, legalPageBySlug } from "@/lib/cms/legalPages";
import { FAQ_CATEGORIES, isFaqCategory } from "@/lib/cms/faqCategories";
import {
  bannerCreateSchema,
  faqCreateSchema,
  faqUpdateSchema,
  staticPageUpdateSchema,
  videoCreateSchema,
} from "@/lib/validators/cms";

describe("legal page registry", () => {
  it("lists exactly the four pages that have a public route", () => {
    expect(LEGAL_PAGE_SLUGS).toEqual(["privacy-policy", "terms-and-conditions", "cookie-policy", "gdpr"]);
    expect(LEGAL_PAGES.map((p) => p.path)).toEqual(["/privacy", "/terms", "/cookies", "/gdpr"]);
  });

  it("rejects a slug with no public route", () => {
    expect(isLegalPageSlug("privacy-policy")).toBe(true);
    expect(isLegalPageSlug("audit-dynamic-page")).toBe(false);
    expect(legalPageBySlug("audit-dynamic-page")).toBeUndefined();
    expect(legalPageBySlug("gdpr")?.path).toBe("/gdpr");
  });
});

describe("FAQ categories", () => {
  it("matches the categories already stored on live FAQs", () => {
    expect(FAQ_CATEGORIES).toEqual(["general", "job_seeker", "employer", "agent", "billing", "privacy"]);
    expect(isFaqCategory("billing")).toBe(true);
    expect(isFaqCategory("Generals")).toBe(false);
  });

  it("rejects a free-text category on create", () => {
    const result = faqCreateSchema.safeParse({ question: "Q", answer: "A", category: "Generals" });
    expect(result.success).toBe(false);
  });

  it("defaults a new FAQ to general", () => {
    const result = faqCreateSchema.parse({ question: "Q", answer: "A" });
    expect(result.category).toBe("general");
  });

  it("leaves category untouched on an update that omits it", () => {
    const result = faqUpdateSchema.parse({ sortOrder: 3 });
    expect(result).not.toHaveProperty("category");
  });
});

describe("static page updates", () => {
  it("drops the slug so an edit can never move a legal page off its route", () => {
    const result = staticPageUpdateSchema.parse({ slug: "moved", title: "Privacy" });
    expect(result).not.toHaveProperty("slug");
    expect(result.title).toBe("Privacy");
  });
});

describe("fields the public site never rendered", () => {
  it("drops a banner's mobile image", () => {
    const result = bannerCreateSchema.parse({ image: "/b.png", imageMobile: "/m.png" });
    expect(result).not.toHaveProperty("imageMobile");
  });

  it("drops a video's thumbnail", () => {
    const result = videoCreateSchema.parse({
      title: "Intro",
      url: "https://www.youtube.com/watch?v=abc",
      thumbnail: "/t.png",
    });
    expect(result).not.toHaveProperty("thumbnail");
  });
});
