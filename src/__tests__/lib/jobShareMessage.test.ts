import { buildJobShareMessage, shareSalaryFigure } from "@/lib/jobs/shareMessage";

describe("buildJobShareMessage", () => {
  it("puts the headline first, the details next and the link last", () => {
    expect(
      buildJobShareMessage({
        headline: "We're hiring: Pharmacist",
        company: "d4dx",
        location: "Doha, Qatar",
        salary: "QAR 9,000",
        type: "Full-time · On-site",
        skills: "Skills: Dispensing, Inventory",
        apply: "Apply here: https://x/en/jobs/1",
      }),
    ).toBe("We're hiring: Pharmacist\nd4dx\nDoha, Qatar\nQAR 9,000\nFull-time · On-site\nSkills: Dispensing, Inventory\n\nApply here: https://x/en/jobs/1");
  });

  it("drops empty details", () => {
    expect(buildJobShareMessage({ headline: "Hiring: Driver", company: " ", location: undefined, apply: "Apply: u" }))
      .toBe("Hiring: Driver\n\nApply: u");
  });
});

describe("shareSalaryFigure", () => {
  it("shows one figure when min equals max", () => {
    expect(shareSalaryFigure({ min: 9000, max: 9000, currency: "QAR" }, "en")).toBe("QAR 9,000");
  });
  it("shows a range", () => {
    expect(shareSalaryFigure({ min: 4000, max: 6000, currency: "AED" }, "en")).toBe("AED 4,000 – 6,000");
  });
  it("keeps the figure of a negotiable salary (the caller adds the word)", () => {
    expect(shareSalaryFigure({ min: 800, max: 800, currency: "KWD", isNegotiable: true }, "en")).toBe("KWD 800");
  });
  it("is undefined when blank", () => {
    expect(shareSalaryFigure({ min: 0, max: 0, currency: "KWD" }, "en")).toBeUndefined();
    expect(shareSalaryFigure(undefined, "en")).toBeUndefined();
  });
});
