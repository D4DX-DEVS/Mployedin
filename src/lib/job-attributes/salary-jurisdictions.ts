/**
 * Jurisdictions that require salary transparency / disclosure in job postings.
 * Sources: US state laws (CO, NY, CA, WA, IL...) + EU Pay Transparency Directive.
 */
export const SALARY_DISCLOSURE_JURISDICTIONS = [
  // US States — full name and abbreviation
  "Colorado", "CO",
  "New York", "NY",
  "California", "CA",
  "Washington", "WA",
  "Illinois", "IL",
  "Massachusetts", "MA",
  "New Jersey", "NJ",
  "Maryland", "MD",
  "Connecticut", "CT",
  "Nevada", "NV",
  "Rhode Island", "RI",
  "Hawaii", "HI",
  "Minnesota", "MN",
  "Vermont", "VT",
  // EU member states (covered by EU Pay Transparency Directive)
  "Germany",
  "France",
  "Netherlands",
  "Belgium",
  "Sweden",
  "Denmark",
  "Norway",
  "Finland",
  "Austria",
  "Ireland",
  "Portugal",
  "Spain",
  "Italy",
  "Poland",
  "EU",
  "Europe",
  "European Union",
  // UK (Equality Act gender pay gap obligations)
  "United Kingdom",
  "UK",
] as const;

/**
 * Returns true if the given location string includes a jurisdiction that
 * requires salary disclosure in job postings.
 */
export function requiresSalaryDisclosure(location: string): boolean {
  if (!location) return false;
  const loc = location.toLowerCase();
  return SALARY_DISCLOSURE_JURISDICTIONS.some((j) =>
    loc.includes(j.toLowerCase())
  );
}
