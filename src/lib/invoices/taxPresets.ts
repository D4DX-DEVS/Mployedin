/**
 * International tax presets for invoice generation.
 *
 * Since the platform company is UK-based, invoicing to different countries
 * requires knowing the applicable tax type and standard rate.
 * UK domestic = 20% VAT, EU = reverse charge, GCC = VAT varies, etc.
 */

export interface TaxPreset {
  countryCode: string;
  country: string;
  taxType: "vat" | "gst" | "reverse_charge" | "none";
  defaultRate: number;
  label: string;
  notes?: string;
}

export const INTERNATIONAL_TAX_PRESETS: TaxPreset[] = [
  // UK (domestic)
  { countryCode: "GB", country: "United Kingdom", taxType: "vat", defaultRate: 20, label: "UK VAT 20%", notes: "Standard UK VAT rate" },

  // GCC countries
  { countryCode: "AE", country: "United Arab Emirates", taxType: "vat", defaultRate: 5, label: "UAE VAT 5%", notes: "UAE standard VAT" },
  { countryCode: "SA", country: "Saudi Arabia", taxType: "vat", defaultRate: 15, label: "KSA VAT 15%", notes: "Saudi Arabia standard VAT" },
  { countryCode: "BH", country: "Bahrain", taxType: "vat", defaultRate: 10, label: "Bahrain VAT 10%", notes: "Bahrain VAT" },
  { countryCode: "OM", country: "Oman", taxType: "vat", defaultRate: 5, label: "Oman VAT 5%", notes: "Oman standard VAT" },
  { countryCode: "QA", country: "Qatar", taxType: "none", defaultRate: 0, label: "Qatar — No VAT", notes: "Qatar has no VAT currently" },
  { countryCode: "KW", country: "Kuwait", taxType: "none", defaultRate: 0, label: "Kuwait — No VAT", notes: "Kuwait has no VAT currently" },

  // India
  { countryCode: "IN", country: "India", taxType: "gst", defaultRate: 18, label: "India GST 18%", notes: "Standard GST rate for services" },

  // EU countries (reverse charge for B2B cross-border)
  { countryCode: "DE", country: "Germany", taxType: "reverse_charge", defaultRate: 0, label: "Germany — Reverse Charge", notes: "EU B2B reverse charge applies" },
  { countryCode: "FR", country: "France", taxType: "reverse_charge", defaultRate: 0, label: "France — Reverse Charge", notes: "EU B2B reverse charge applies" },
  { countryCode: "NL", country: "Netherlands", taxType: "reverse_charge", defaultRate: 0, label: "Netherlands — Reverse Charge", notes: "EU B2B reverse charge applies" },
  { countryCode: "IE", country: "Ireland", taxType: "reverse_charge", defaultRate: 0, label: "Ireland — Reverse Charge", notes: "EU B2B reverse charge applies" },
  { countryCode: "ES", country: "Spain", taxType: "reverse_charge", defaultRate: 0, label: "Spain — Reverse Charge", notes: "EU B2B reverse charge applies" },
  { countryCode: "IT", country: "Italy", taxType: "reverse_charge", defaultRate: 0, label: "Italy — Reverse Charge", notes: "EU B2B reverse charge applies" },
  { countryCode: "PT", country: "Portugal", taxType: "reverse_charge", defaultRate: 0, label: "Portugal — Reverse Charge", notes: "EU B2B reverse charge applies" },
  { countryCode: "BE", country: "Belgium", taxType: "reverse_charge", defaultRate: 0, label: "Belgium — Reverse Charge", notes: "EU B2B reverse charge applies" },
  { countryCode: "AT", country: "Austria", taxType: "reverse_charge", defaultRate: 0, label: "Austria — Reverse Charge", notes: "EU B2B reverse charge applies" },
  { countryCode: "SE", country: "Sweden", taxType: "reverse_charge", defaultRate: 0, label: "Sweden — Reverse Charge", notes: "EU B2B reverse charge applies" },
  { countryCode: "DK", country: "Denmark", taxType: "reverse_charge", defaultRate: 0, label: "Denmark — Reverse Charge", notes: "EU B2B reverse charge applies" },
  { countryCode: "FI", country: "Finland", taxType: "reverse_charge", defaultRate: 0, label: "Finland — Reverse Charge", notes: "EU B2B reverse charge applies" },
  { countryCode: "PL", country: "Poland", taxType: "reverse_charge", defaultRate: 0, label: "Poland — Reverse Charge", notes: "EU B2B reverse charge applies" },

  // Americas
  { countryCode: "US", country: "United States", taxType: "none", defaultRate: 0, label: "USA — No Federal VAT/GST", notes: "No federal VAT; state sales tax varies" },
  { countryCode: "CA", country: "Canada", taxType: "gst", defaultRate: 5, label: "Canada GST 5%", notes: "Federal GST; HST/PST varies by province" },

  // Asia Pacific
  { countryCode: "SG", country: "Singapore", taxType: "gst", defaultRate: 9, label: "Singapore GST 9%", notes: "Singapore GST" },
  { countryCode: "AU", country: "Australia", taxType: "gst", defaultRate: 10, label: "Australia GST 10%", notes: "Australian GST" },
  { countryCode: "MY", country: "Malaysia", taxType: "none", defaultRate: 0, label: "Malaysia — SST regime", notes: "Sales and Service Tax regime" },
  { countryCode: "PH", country: "Philippines", taxType: "vat", defaultRate: 12, label: "Philippines VAT 12%", notes: "Philippine VAT" },
  { countryCode: "PK", country: "Pakistan", taxType: "gst", defaultRate: 18, label: "Pakistan GST 18%", notes: "Pakistan GST" },
  { countryCode: "BD", country: "Bangladesh", taxType: "vat", defaultRate: 15, label: "Bangladesh VAT 15%", notes: "Bangladesh VAT" },
  { countryCode: "LK", country: "Sri Lanka", taxType: "vat", defaultRate: 18, label: "Sri Lanka VAT 18%", notes: "Sri Lanka VAT" },
  { countryCode: "NP", country: "Nepal", taxType: "vat", defaultRate: 13, label: "Nepal VAT 13%", notes: "Nepal VAT" },

  // Africa
  { countryCode: "NG", country: "Nigeria", taxType: "vat", defaultRate: 7.5, label: "Nigeria VAT 7.5%", notes: "Nigerian VAT" },
  { countryCode: "KE", country: "Kenya", taxType: "vat", defaultRate: 16, label: "Kenya VAT 16%", notes: "Kenyan VAT" },
  { countryCode: "ZA", country: "South Africa", taxType: "vat", defaultRate: 15, label: "South Africa VAT 15%", notes: "South African VAT" },
  { countryCode: "EG", country: "Egypt", taxType: "vat", defaultRate: 14, label: "Egypt VAT 14%", notes: "Egyptian VAT" },
];

/**
 * Find tax preset by country code or country name.
 */
export function findTaxPreset(countryInput: string): TaxPreset | undefined {
  const normalized = countryInput.trim().toUpperCase();
  return INTERNATIONAL_TAX_PRESETS.find(
    (t) => t.countryCode.toUpperCase() === normalized ||
           t.country.toUpperCase() === normalized
  );
}

/**
 * Get all presets grouped by region for UI display.
 */
export function getTaxPresetsByRegion() {
  return {
    "United Kingdom": INTERNATIONAL_TAX_PRESETS.filter((t) => t.countryCode === "GB"),
    "GCC": INTERNATIONAL_TAX_PRESETS.filter((t) => ["AE", "SA", "BH", "OM", "QA", "KW"].includes(t.countryCode)),
    "India & South Asia": INTERNATIONAL_TAX_PRESETS.filter((t) => ["IN", "PK", "BD", "LK", "NP"].includes(t.countryCode)),
    "European Union": INTERNATIONAL_TAX_PRESETS.filter((t) => t.taxType === "reverse_charge"),
    "Americas": INTERNATIONAL_TAX_PRESETS.filter((t) => ["US", "CA"].includes(t.countryCode)),
    "Asia Pacific": INTERNATIONAL_TAX_PRESETS.filter((t) => ["SG", "AU", "MY", "PH"].includes(t.countryCode)),
    "Africa": INTERNATIONAL_TAX_PRESETS.filter((t) => ["NG", "KE", "ZA", "EG"].includes(t.countryCode)),
  };
}
