import {
  checkAdvert,
  checkExperienceCap,
  checkWording,
  SCREENING_QUESTION_RULES,
} from "@/lib/compliance/inclusiveWording";

describe("inclusiveWording — advert prose", () => {
  it("flags an age-limited advert", () => {
    const findings = checkAdvert({
      title: "Sales Assistant",
      description: "Looking for a young, energetic candidate under 30 years old.",
    });
    expect(findings.map((f) => f.characteristic)).toContain("age");
    expect(findings.some((f) => f.suggestionKey === "ageLimit")).toBe(true);
  });

  it("flags gendered job titles and gendered requirements", () => {
    const findings = checkAdvert({ title: "Salesman wanted", description: "Males only." });
    const keys = findings.map((f) => f.suggestionKey);
    expect(keys).toContain("genderedJobTitle");
    expect(keys).toContain("genderedRequirement");
  });

  it("flags native-speaker and physical-ability requirements", () => {
    const findings = checkAdvert({
      description: "Must be a native English speaker and able-bodied.",
    });
    const keys = findings.map((f) => f.suggestionKey);
    expect(keys).toContain("nativeSpeaker");
    expect(keys).toContain("physicalRequirement");
  });

  it("passes a neutral advert clean", () => {
    const findings = checkAdvert({
      title: "Retail Assistant",
      description:
        "You will serve customers, restock shelves and handle payments. " +
        "We welcome applications from everyone and make reasonable adjustments on request.",
      qualifications: ["Comfortable using a till system", "Clear written and spoken English"],
    });
    expect(findings).toEqual([]);
  });

  it("is stateless across calls despite /g regexes", () => {
    const advert = { description: "We want a young team member." };
    const first = checkAdvert(advert);
    const second = checkAdvert(advert);
    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
  });

  it("returns nothing for empty input", () => {
    expect(checkWording("")).toEqual([]);
    expect(checkWording("   ")).toEqual([]);
  });
});

describe("inclusiveWording — screening questions", () => {
  const ask = (q: string) => checkWording(q, SCREENING_QUESTION_RULES);

  it.each([
    ["What is your date of birth?", "age"],
    ["Are you married?", "marriage_civil_partnership"],
    ["Are you pregnant or planning a family?", "pregnancy_maternity"],
    ["Do you have any disabilities?", "disability"],
    ["What is your nationality?", "race"],
    ["What is your religion?", "religion_belief"],
    ["What is your gender?", "sex"],
  ])("flags %s", (question, characteristic) => {
    expect(ask(question).map((f) => f.characteristic)).toContain(characteristic);
  });

  it("leaves a job-related question alone", () => {
    expect(ask("How many years have you used TypeScript in production?")).toEqual([]);
    expect(ask("Do you hold a valid UK driving licence?")).toEqual([]);
  });
});

describe("checkExperienceCap", () => {
  it("flags a tight cap that proxies for age", () => {
    expect(checkExperienceCap(0, 2)).toBe(true);
    expect(checkExperienceCap(1, 3)).toBe(true);
  });

  it("ignores an open-ended or wide band", () => {
    expect(checkExperienceCap(0, 0)).toBe(false);
    expect(checkExperienceCap(3, 10)).toBe(false);
    expect(checkExperienceCap(0, 5)).toBe(false);
  });
});
