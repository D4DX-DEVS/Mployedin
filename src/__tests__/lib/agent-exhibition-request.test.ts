/**
 * @jest-environment node
 */
import {
  AGENT_EXHIBITION_TEMPLATES,
  EMPTY_AGENT_EXHIBITION_FORM,
  applyExhibitionTemplate,
  createDuplicatedExhibitionForm,
  getCountryCurrencyCode,
  hasManualCurrencyOverride,
} from "@/lib/exhibitions/agent-request";

describe("getCountryCurrencyCode", () => {
  test("maps UAE to AED", () => {
    expect(getCountryCurrencyCode("UAE")).toBe("AED");
  });

  test("maps India to INR", () => {
    expect(getCountryCurrencyCode("India")).toBe("INR");
  });

  test("falls back to USD when the country is unknown", () => {
    expect(getCountryCurrencyCode("Unknownland")).toBe("USD");
  });
});

describe("hasManualCurrencyOverride", () => {
  test("returns false when the budget currency matches the country default", () => {
    expect(hasManualCurrencyOverride("UAE", "AED")).toBe(false);
  });

  test("returns true when the budget currency differs from the country default", () => {
    expect(hasManualCurrencyOverride("UAE", "USD")).toBe(true);
  });
});

describe("applyExhibitionTemplate", () => {
  test("fills planning fields from the selected template", () => {
    const template = AGENT_EXHIBITION_TEMPLATES.find((item) => item.id === "career_fair");
    expect(template).toBeDefined();

    const result = applyExhibitionTemplate(EMPTY_AGENT_EXHIBITION_FORM, template!);
    expect(result.eventCategory).toBe("career_fair");
    expect(result.participationTypes).toEqual(["stall", "recruitment_desk"]);
    expect(result.objectives).toEqual(["candidate_sourcing", "direct_hiring"]);
    expect(result.requiredResources).toEqual(["brochures", "candidate_forms", "business_cards"]);
  });

  test("preserves event-specific values already entered by the agent", () => {
    const template = AGENT_EXHIBITION_TEMPLATES.find((item) => item.id === "branding_package");
    expect(template).toBeDefined();

    const result = applyExhibitionTemplate(
      {
        ...EMPTY_AGENT_EXHIBITION_FORM,
        eventName: "Dubai Hiring Week",
        country: "United Arab Emirates",
        countryCode: "AE",
        eventLocation: "Dubai",
      },
      template!,
    );

    expect(result.eventName).toBe("Dubai Hiring Week");
    expect(result.country).toBe("United Arab Emirates");
    expect(result.eventLocation).toBe("Dubai");
    expect(result.participationTypes).toEqual(["branding_package", "sponsorship"]);
  });
});

describe("createDuplicatedExhibitionForm", () => {
  test("copies reusable fields and clears the dates", () => {
    const result = createDuplicatedExhibitionForm({
      eventName: "Dubai Career Expo 2026",
      eventCategory: "career_fair",
      eventLocation: "Dubai",
      venue: "World Trade Centre",
      country: "UAE",
      eventStartDate: "2026-06-15",
      eventEndDate: "2026-06-18",
      participationTypes: ["stall"],
      objectives: ["candidate_sourcing"],
      requiredResources: ["brochures"],
      estimatedBudget: 12000,
      budgetCurrency: "AED",
      description: "Hiring campaign",
      expectedLeads: 300,
      priority: "high",
    });

    expect(result.eventName).toBe("Copy of Dubai Career Expo 2026");
    expect(result.eventStartDate).toBe("");
    expect(result.eventEndDate).toBe("");
    expect(result.countryCode).toBe("AE");
    expect(result.participationTypes).toEqual(["stall"]);
    expect(result.estimatedBudget).toBe("12000");
    expect(result.description).toBe("Hiring campaign");
  });
});