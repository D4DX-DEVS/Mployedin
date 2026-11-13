import { canonicalIndustry, canonicalIndustryCounts, rawIndustryValuesFor } from "@/lib/jobseekers/industryCanonical";
import { INDUSTRY_KEY_TO_INDUSTRIES } from "@/lib/jobseekers/industryClassifier";

/** The admin Industries master as it stood on 2026-11-13 (58 names). */
const MASTER = [
  "Accounting/Taxation", "Advertising/PR", "Agriculture/Fertilizer/Pesticide", "Apparel/Clothing",
  "Architecture/Interior Design", "Arts / Entertainment", "AutoMobile", "Aviation", "Banking/Financial Services",
  "BPO", "Broadcasting", "Chemicals", "Construction/Engineering/Cement", "Consultancy", "Consumer Goods/FMCG",
  "Defense/Military", "Distribution & Logistics", "E-Commerce/Online", "Education/Training", "Electrical/Electronics",
  "Energy/Oil & Gas", "Engineering", "Environment", "Event Management", "Fashion", "Fertilizers/Pesticides",
  "Food & Beverages", "Freight Forwarding", "Government/Semi-Government", "Healthcare/Hospitals",
  "Hospitality/Hotels/Restaurants", "Human Resources/Recruitment", "Import/Export", "Information Technology",
  "Insurance", "Investment Banking", "Legal", "Manufacturing", "Marine/Shipping", "Media/Communications",
  "Mining/Metals", "NGO/Social Services", "Packaging", "Paper & Board", "Pharmaceuticals", "Power/Energy",
  "Printing/Publishing", "Real Estate/Property", "Retail", "Security", "Sports/Fitness", "Telecom/ISP",
  "Textiles/Garments", "Tobacco", "Tourism/Travel", "Trading", "Transportation", "Waste Management",
];

describe("classifier vocabulary (rollout rows 14/17)", () => {
  it("only ever stores names that exist in the Industries master", () => {
    for (const name of Object.values(INDUSTRY_KEY_TO_INDUSTRIES)) expect(MASTER).toContain(name);
  });
});

describe("canonicalIndustry", () => {
  it("keeps a master name, whatever its case or spacing", () => {
    expect(canonicalIndustry("Accounting/Taxation", MASTER)).toBe("Accounting/Taxation");
    expect(canonicalIndustry("  information technology ", MASTER)).toBe("Information Technology");
    expect(canonicalIndustry("Arts/Entertainment", MASTER)).toBe("Arts / Entertainment");
  });

  it("folds CV-extracted wording onto the master name it means", () => {
    expect(canonicalIndustry("Construction/Cement/Metals", MASTER)).toBe("Construction/Engineering/Cement");
    expect(canonicalIndustry("Healthcare/Hospital/Medical", MASTER)).toBe("Healthcare/Hospitals");
    expect(canonicalIndustry("IT Services & Consulting", MASTER)).toBe("Information Technology");
  });

  it("leaves text it cannot place unclassified rather than guessing", () => {
    expect(canonicalIndustry("Coordinator", MASTER)).toBeNull();
    expect(canonicalIndustry("", MASTER)).toBeNull();
    expect(canonicalIndustry(null, MASTER)).toBeNull();
  });
});

describe("canonicalIndustryCounts", () => {
  it("adds up variants under one master name, drops unplaceable ones, biggest first", () => {
    const rows = [
      { industry: "Information Technology", count: 111 },
      { industry: "IT Services & Consulting", count: 5 },
      { industry: "Accounting/Taxation", count: 186 },
      { industry: "Coordinator", count: 1 },
      { industry: null, count: 900 },
    ];
    expect(canonicalIndustryCounts(rows, MASTER)).toEqual([
      { industry: "Accounting/Taxation", count: 186 },
      { industry: "Information Technology", count: 116 },
    ]);
  });
});

describe("rawIndustryValuesFor", () => {
  it("lists every stored spelling that means the chosen industry, the name itself included", () => {
    const stored = ["Information Technology", "IT Services & Consulting", "Accounting/Taxation", "Coordinator"];
    expect(rawIndustryValuesFor("Information Technology", stored, MASTER).sort()).toEqual(
      ["IT Services & Consulting", "Information Technology"].sort(),
    );
  });
});
