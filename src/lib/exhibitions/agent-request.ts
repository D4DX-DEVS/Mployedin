import { currencyForCountry } from "@/lib/currency";

export interface AgentExhibitionFormState {
  eventName: string;
  eventCategory: string;
  eventLocation: string;
  venue: string;
  country: string;
  countryCode: string;
  eventStartDate: string;
  eventEndDate: string;
  organizerName: string;
  organizerContact: string;
  participationTypes: string[];
  participationDetails: string;
  objectives: string[];
  estimatedBudget: string;
  budgetCurrency: string;
  description: string;
  expectedLeads: string;
  requiredResources: string[];
  priority: string;
}

export interface ExhibitionRequestTemplate {
  id: string;
  name: string;
  description: string;
  values: Partial<AgentExhibitionFormState>;
}

export interface ExhibitionRequestLike {
  eventName: string;
  eventCategory?: string;
  eventLocation?: string;
  venue?: string;
  country?: string;
  eventStartDate?: string;
  eventEndDate?: string;
  organizerName?: string;
  organizerContact?: string;
  participationTypes?: string[];
  participationDetails?: string;
  objectives?: string[];
  estimatedBudget?: number;
  budgetCurrency?: string;
  description?: string;
  expectedLeads?: number;
  requiredResources?: string[];
  priority?: string;
}

export const EMPTY_AGENT_EXHIBITION_FORM: AgentExhibitionFormState = {
  eventName: "",
  eventCategory: "career_fair",
  eventLocation: "",
  venue: "",
  country: "",
  countryCode: "",
  eventStartDate: "",
  eventEndDate: "",
  organizerName: "",
  organizerContact: "",
  participationTypes: [],
  participationDetails: "",
  objectives: [],
  estimatedBudget: "",
  budgetCurrency: "USD",
  description: "",
  expectedLeads: "",
  requiredResources: [],
  priority: "medium",
};

export const AGENT_EXHIBITION_TEMPLATES: ExhibitionRequestTemplate[] = [
  {
    id: "career_fair",
    name: "Career Fair",
    description: "Balanced hiring setup for high-volume candidate outreach.",
    values: {
      eventCategory: "career_fair",
      participationTypes: ["stall", "recruitment_desk"],
      objectives: ["candidate_sourcing", "direct_hiring"],
      requiredResources: ["brochures", "candidate_forms", "business_cards"],
      priority: "medium",
    },
  },
  {
    id: "standee_promotion",
    name: "Standee Promotion",
    description: "Lightweight employer-branding setup for awareness campaigns.",
    values: {
      eventCategory: "employer_branding",
      participationTypes: ["standee", "flyers"],
      objectives: ["brand_awareness", "lead_generation"],
      requiredResources: ["standee", "flyers", "branding_banners"],
      priority: "low",
    },
  },
  {
    id: "recruitment_stall",
    name: "Recruitment Stall",
    description: "Hiring-focused presence with stronger on-ground recruitment coverage.",
    values: {
      eventCategory: "recruitment_expo",
      participationTypes: ["stall", "recruitment_desk", "booth"],
      objectives: ["candidate_sourcing", "employer_acquisition"],
      requiredResources: ["brochures", "candidate_forms", "presentation_deck"],
      priority: "high",
    },
  },
  {
    id: "branding_package",
    name: "Branding Package",
    description: "Premium sponsorship-led presence for regional brand visibility.",
    values: {
      eventCategory: "employer_branding",
      participationTypes: ["branding_package", "sponsorship"],
      objectives: ["brand_awareness", "market_expansion"],
      requiredResources: ["branding_banners", "video_assets", "presentation_deck"],
      priority: "medium",
    },
  },
];

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  UAE: "AE",
  "UNITED ARAB EMIRATES": "AE",
  INDIA: "IN",
  "SAUDI ARABIA": "SA",
  KSA: "SA",
  QATAR: "QA",
  KUWAIT: "KW",
  BAHRAIN: "BH",
  OMAN: "OM",
  UK: "GB",
  "UNITED KINGDOM": "GB",
  USA: "US",
  US: "US",
  "UNITED STATES": "US",
  EUROPE: "EU",
  GERMANY: "DE",
  FRANCE: "FR",
  PAKISTAN: "PK",
  EGYPT: "EG",
  CANADA: "CA",
  AUSTRALIA: "AU",
  SINGAPORE: "SG",
};

function isMeaningfulValue(value: string | string[] | undefined): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return Boolean(value && value.trim().length > 0);
}

export function resolveCountryCode(country: string | undefined): string {
  if (!country) {
    return "";
  }

  const normalizedCountry = country.trim().toUpperCase();

  if (normalizedCountry.length === 2) {
    return normalizedCountry;
  }

  return COUNTRY_NAME_TO_CODE[normalizedCountry] ?? "";
}

export function getCountryCurrencyCode(country: string | undefined, countryCode?: string): string {
  const resolvedCountryCode = (countryCode || resolveCountryCode(country)).trim().toUpperCase();

  if (!resolvedCountryCode) {
    return EMPTY_AGENT_EXHIBITION_FORM.budgetCurrency;
  }

  return currencyForCountry(resolvedCountryCode).code;
}

export function hasManualCurrencyOverride(country: string | undefined, budgetCurrency: string, countryCode?: string): boolean {
  const defaultCurrency = getCountryCurrencyCode(country, countryCode);
  return Boolean(country && budgetCurrency && budgetCurrency !== defaultCurrency);
}

export function applyExhibitionTemplate(
  currentForm: AgentExhibitionFormState,
  template: ExhibitionRequestTemplate,
): AgentExhibitionFormState {
  return {
    ...currentForm,
    ...template.values,
    participationTypes: [...(template.values.participationTypes ?? currentForm.participationTypes)],
    objectives: [...(template.values.objectives ?? currentForm.objectives)],
    requiredResources: [...(template.values.requiredResources ?? currentForm.requiredResources)],
    description: isMeaningfulValue(currentForm.description)
      ? currentForm.description
      : template.values.description ?? currentForm.description,
    eventName: currentForm.eventName,
    eventLocation: currentForm.eventLocation,
    venue: currentForm.venue,
    country: currentForm.country,
    countryCode: currentForm.countryCode,
    eventStartDate: currentForm.eventStartDate,
    eventEndDate: currentForm.eventEndDate,
    organizerName: currentForm.organizerName,
    organizerContact: currentForm.organizerContact,
    estimatedBudget: currentForm.estimatedBudget,
    budgetCurrency: currentForm.budgetCurrency,
    expectedLeads: currentForm.expectedLeads,
  };
}

export function createDuplicatedExhibitionForm(item: ExhibitionRequestLike): AgentExhibitionFormState {
  const countryCode = resolveCountryCode(item.country);

  return {
    ...EMPTY_AGENT_EXHIBITION_FORM,
    eventName: `Copy of ${item.eventName}`,
    eventCategory: item.eventCategory ?? EMPTY_AGENT_EXHIBITION_FORM.eventCategory,
    eventLocation: item.eventLocation ?? "",
    venue: item.venue ?? "",
    country: item.country ?? "",
    countryCode,
    organizerName: item.organizerName ?? "",
    organizerContact: item.organizerContact ?? "",
    participationTypes: [...(item.participationTypes ?? [])],
    participationDetails: item.participationDetails ?? "",
    objectives: [...(item.objectives ?? [])],
    estimatedBudget: item.estimatedBudget?.toString() ?? "",
    budgetCurrency: item.budgetCurrency ?? getCountryCurrencyCode(item.country, countryCode),
    description: item.description ?? "",
    expectedLeads: item.expectedLeads?.toString() ?? "",
    requiredResources: [...(item.requiredResources ?? [])],
    priority: item.priority ?? EMPTY_AGENT_EXHIBITION_FORM.priority,
  };
}