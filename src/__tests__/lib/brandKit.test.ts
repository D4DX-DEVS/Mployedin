import {
  MPLOYEDIN_BRAND_KIT,
  brandKitSchema,
  contrastRatio,
  readableTextOn,
  resolveBrandKit,
} from "@/lib/brand/brandKit";
import { buildBrandPosterData, defaultHeadline } from "@/lib/poster/brandPosterContent";

describe("brand kit", () => {
  it("fills every missing part from the Mployedin kit", () => {
    expect(resolveBrandKit(null)).toEqual(MPLOYEDIN_BRAND_KIT);
    expect(resolveBrandKit({ primary: "#112233", font: undefined, logoUrl: "" })).toEqual({
      ...MPLOYEDIN_BRAND_KIT,
      primary: "#112233",
    });
  });

  it("ignores a stored font or tone this version no longer offers", () => {
    const kit = resolveBrandKit({ font: "comic" as never, tone: "sarcastic" as never });
    expect(kit.font).toBe(MPLOYEDIN_BRAND_KIT.font);
    expect(kit.tone).toBe(MPLOYEDIN_BRAND_KIT.tone);
  });

  it("accepts a full kit and rejects bad colours, fonts and logo addresses", () => {
    expect(brandKitSchema.safeParse(MPLOYEDIN_BRAND_KIT).success).toBe(true);
    expect(brandKitSchema.safeParse({ ...MPLOYEDIN_BRAND_KIT, primary: "red" }).success).toBe(false);
    expect(brandKitSchema.safeParse({ ...MPLOYEDIN_BRAND_KIT, font: "wingdings" }).success).toBe(false);
    expect(brandKitSchema.safeParse({ ...MPLOYEDIN_BRAND_KIT, logoUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(brandKitSchema.safeParse({ ...MPLOYEDIN_BRAND_KIT, logoUrl: "http://plain.example/logo.png" }).success).toBe(false);
    expect(brandKitSchema.safeParse({ ...MPLOYEDIN_BRAND_KIT, extra: 1 }).success).toBe(false);
  });

  it("picks the text colour that reads best on a background", () => {
    expect(readableTextOn("#0247cf")).toBe("#ffffff");
    expect(readableTextOn("#fff7d6")).toBe("#111827");
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0);
  });
});

describe("poster text from a job", () => {
  const job = {
    title: "Senior Accountant",
    companyName: "Acme",
    location: { city: "Dubai", country: "UAE" },
    employmentType: "full_time",
    workMode: "hybrid",
    salary: { min: 14000, max: 18000, currency: "AED", period: "monthly" },
  };

  it("builds the headline, details and call to action", () => {
    const data = buildBrandPosterData(job, { look: "bold" });
    expect(data.headline).toBe("We're hiring");
    expect(data.details).toEqual(["Dubai, UAE", "Full time · Hybrid", "AED 14,000–18,000/month"]);
    expect(data.cta).toBe("Scan to apply");
  });

  it("leaves the salary off when the job hides it", () => {
    const data = buildBrandPosterData({ ...job, showSalary: false }, { look: "clean" });
    expect(data.details.some((d) => d.includes("AED"))).toBe(false);
  });

  it("uses an edited headline and Arabic copy when asked", () => {
    expect(buildBrandPosterData(job, { look: "urgent", headline: "Start Monday" }).headline).toBe("Start Monday");
    expect(defaultHeadline("urgent", "ar")).toBe("توظيف عاجل");
  });
});
