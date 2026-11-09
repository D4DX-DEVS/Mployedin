import {
  MPLOYEDIN_BRAND_KIT,
  brandKitSchema,
  contrastRatio,
  readableTextOn,
  resolveBrandKit,
} from "@/lib/brand/brandKit";
import { buildBrandPosterData, defaultHeadline, posterRequirements } from "@/lib/poster/brandPosterContent";

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
    expect(data.location).toBe("Dubai, UAE");
    expect(data.details).toEqual(["Full time · Hybrid", "AED 14,000–18,000/month"]);
    expect(data.cta).toBe("Scan & apply now");
    expect(data.applyLabel).toBe("Apply now");
    expect(data.contact).toBeUndefined();
  });

  it("lists the employer's written requirements first, at most four", () => {
    const data = buildBrandPosterData(
      { ...job, qualifications: ["  Bachelor's degree. ", "3 years in audit", "IFRS", "Arabic", "Excel"], requirements: { experienceMin: 3, experienceMax: 5 } },
      { look: "bold" },
    );
    expect(data.requirementsTitle).toBe("Requirements");
    expect(data.requirements).toEqual(["Bachelor's degree", "3 years in audit", "IFRS", "Arabic"]);
  });

  it("fills requirements from experience, education, skills and languages, never the 0-year default", () => {
    expect(posterRequirements({ requirements: { experienceMin: 0, experienceMax: 10 } })).toEqual([]);
    expect(
      posterRequirements({
        qualifications: ["Valid UAE licence"],
        requirements: { experienceMin: 2, experienceMax: 4, education: "bachelors", skills: ["Excel", "SAP", "IFRS", "VAT", "Tally"], languages: ["English"] },
      }),
    ).toEqual(["Valid UAE licence", "2–4 years of experience", "Education: Bachelors", "Skills: Excel, SAP, IFRS, VAT"]);
    expect(posterRequirements({ qualifications: ["x".repeat(200)] })[0]).toHaveLength(90);
    expect(posterRequirements({ qualifications: ["English"], qualificationsAr: ["العربية"] }, "ar")).toEqual(["العربية"]);
  });

  it("prints Mployedin's contact line and the posted date", () => {
    const data = buildBrandPosterData(
      { ...job, createdAt: "2026-10-27T10:00:00Z" },
      { look: "bold", contact: { email: "support@mployedin.com", phone: "" } },
    );
    expect(data.contact).toEqual({ label: "For enquiries", email: "support@mployedin.com", phone: undefined });
    expect(data.posted).toBe("Posted: 27 Oct 2026");
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
