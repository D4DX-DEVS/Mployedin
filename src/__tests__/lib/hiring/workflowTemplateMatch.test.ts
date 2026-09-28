import {
  decodeResolutionReason,
  encodeResolutionReason,
  matchDimensions,
  pickWorkflowTemplate,
  titleHasKeyword,
  type MatchableTemplate,
} from "@/lib/hiring/workflowTemplateMatch";

const tpl = (over: Partial<MatchableTemplate> & { _id: string }): MatchableTemplate => ({
  name: over._id,
  scope: "system",
  ...over,
});

describe("matchDimensions", () => {
  it("never auto-matches a template without rules", () => {
    expect(matchDimensions(undefined, { title: "Anything" })).toBeNull();
    expect(matchDimensions({ categories: [], titleKeywords: ["  "] }, { title: "Anything" })).toBeNull();
  });

  it("requires every stated dimension and any value inside one", () => {
    const rules = { categories: ["Retail", "Hospitality"], titleKeywords: ["sales"] };
    expect(matchDimensions(rules, { title: "Senior Sales Manager", category: "retail" })).toEqual(["category", "title"]);
    expect(matchDimensions(rules, { title: "Store Manager", category: "Retail" })).toBeNull();
    expect(matchDimensions(rules, { title: "Sales Lead", category: "Technology" })).toBeNull();
  });

  it("matches title keywords as whole words only", () => {
    expect(titleHasKeyword("Head of Sales (GCC)", "sales")).toBe(true);
    expect(titleHasKeyword("Salesforce Developer", "sales")).toBe(false);
    expect(titleHasKeyword("Business Development Manager", "business development")).toBe(true);
    expect(titleHasKeyword("مدير المبيعات", "المبيعات")).toBe(true);
  });

  it("checks employment type, work mode and seniority", () => {
    expect(matchDimensions({ employmentTypes: ["internship"] }, { employmentType: "internship" })).toEqual(["employmentType"]);
    expect(matchDimensions({ workModes: ["remote"] }, { workMode: "onsite" })).toBeNull();
    expect(matchDimensions({ minExperienceYears: 10 }, { requirements: { experienceMin: 12 } })).toEqual(["experience"]);
    expect(matchDimensions({ minExperienceYears: 10 }, { requirements: { experienceMin: 3 } })).toBeNull();
    expect(matchDimensions({ minExperienceYears: 10 }, {})).toBeNull();
  });
});

describe("pickWorkflowTemplate", () => {
  const job = { title: "Senior Sales Manager", category: "Retail", employmentType: "full_time", requirements: { experienceMin: 12 } };

  it("prefers the employer's own match, then priority, then specificity", () => {
    const templates = [
      tpl({ _id: "sys-sales", match: { titleKeywords: ["sales"] }, priority: 50 }),
      tpl({ _id: "sys-sales-retail", match: { titleKeywords: ["sales"], categories: ["Retail"] }, priority: 50 }),
      tpl({ _id: "sys-exec", match: { minExperienceYears: 10 }, priority: 80 }),
      tpl({ _id: "emp-sales", scope: "employer", match: { titleKeywords: ["sales"] }, priority: 0 }),
    ];
    expect(pickWorkflowTemplate(templates, job).template?._id).toBe("emp-sales");
    const systemOnly = templates.filter((t) => t.scope === "system");
    expect(pickWorkflowTemplate(systemOnly, job).template?._id).toBe("sys-exec");
    const samePriority = systemOnly.filter((t) => t._id !== "sys-exec");
    const pick = pickWorkflowTemplate(samePriority, job);
    expect(pick.template?._id).toBe("sys-sales-retail");
    expect(pick.reason).toEqual({ kind: "matched", dimensions: ["category", "title"] });
  });

  it("ignores archived templates", () => {
    const templates = [tpl({ _id: "old", isActive: false, match: { titleKeywords: ["sales"] } })];
    expect(pickWorkflowTemplate(templates, job)).toEqual({ template: null, reason: { kind: "standard" } });
  });

  it("falls back to the employer default, then the platform default, then the standard pipeline", () => {
    const templates = [
      tpl({ _id: "platform", isDefault: true }),
      tpl({ _id: "chosen" }),
      tpl({ _id: "emp-default", scope: "employer", isDefault: true }),
    ];
    const plain = { title: "Nurse" };
    expect(pickWorkflowTemplate(templates, plain, { employerDefaultTemplateId: "chosen" })).toMatchObject({
      template: { _id: "chosen" },
      reason: { kind: "employer_default" },
    });
    expect(pickWorkflowTemplate(templates, plain).template?._id).toBe("emp-default");
    expect(pickWorkflowTemplate(templates.filter((t) => t.scope === "system"), plain)).toMatchObject({
      template: { _id: "platform" },
      reason: { kind: "platform_default" },
    });
    expect(pickWorkflowTemplate([], plain)).toEqual({ template: null, reason: { kind: "standard" } });
  });

  it("round-trips a stored reason", () => {
    const reason = { kind: "matched" as const, dimensions: ["category" as const, "title" as const] };
    expect(decodeResolutionReason(encodeResolutionReason(reason))).toEqual(reason);
    expect(decodeResolutionReason("platform_default")).toEqual({ kind: "platform_default" });
    expect(decodeResolutionReason("junk")).toBeNull();
  });
});
