/**
 * @jest-environment node
 *
 * The lead workspace labels its enums (contact methods, hiring ranges, lost
 * reasons, Move dialog fields) through static key maps rather than
 * `t(\`prefix${value}\`)`. This pins that every value has a map entry and every
 * entry exists in both locales, so a new enum value fails here instead of
 * crashing an agent's card with MISSING_MESSAGE.
 */
import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";
import {
  CONTACT_METHODS, HIRING_RANGES, LOST_REASONS, STAGE_REQUIRED_FIELDS,
} from "@/lib/leads/stageRules";
import {
  CONTACT_METHOD_KEYS, HIRING_RANGE_KEYS, LOST_REASON_KEYS, STAGE_FIELD_KEYS,
} from "@/app/[locale]/(dashboard)/agent/leads/_components/leadShared";

const namespaces = { en: en.agentLeads as Record<string, unknown>, ar: ar.agentLeads as Record<string, unknown> };

const cases: [string, readonly string[], Record<string, string>][] = [
  ["contact methods", CONTACT_METHODS, CONTACT_METHOD_KEYS],
  ["hiring ranges", HIRING_RANGES, HIRING_RANGE_KEYS],
  ["lost reasons", LOST_REASONS, LOST_REASON_KEYS],
  ["stage fields", [...new Set(Object.values(STAGE_REQUIRED_FIELDS).flat())], STAGE_FIELD_KEYS],
];

describe.each(cases)("%s", (_name, values, keyMap) => {
  it("has a label key for every value", () => {
    expect(values.filter((value) => !keyMap[value])).toEqual([]);
  });

  it.each(["en", "ar"] as const)("every label exists in %s", (locale) => {
    const missing = values.map((value) => keyMap[value]).filter((key) => typeof namespaces[locale][key] !== "string");
    expect(missing).toEqual([]);
  });
});
