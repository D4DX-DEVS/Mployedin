/**
 * Commission rate resolver — applies country-based overrides from SystemSettings.
 *
 * Priority:
 * 1. Role-specific country override (agentRate / superAgentRate) if set
 * 2. Generic country override (rate) as fallback
 * 3. Agent/SuperAgent's own configured rate (final fallback)
 *
 * Rules are keyed by ISO code ("SA"); employers store their country however it
 * was entered ("SA", "Saudi Arabia", "KSA"). Every spelling of the same country
 * matches the rule.
 */

import { connectDB } from "@/lib/db/mongoose";
import { countryKey } from "@/lib/i18n/locations";
import SystemSettings from "@/models/SystemSettings";

export interface ResolvedRate {
  rate: number;
  source: "country_override" | "agent_default" | "super_agent_default";
  /** The matching rule's ISO code, if an override applied */
  countryCode?: string;
}

type CommissionRole = "agent" | "super_agent";

interface CachedOverride {
  countryCode: string;
  rate: number;
  agentRate?: number;
  superAgentRate?: number;
}

interface CountryOverrideMatch {
  rate: number;
  countryCode: string;
}

/**
 * Resolve the effective commission rate for an agent, considering employer's country.
 */
export async function resolveCommissionRate(
  agentRate: number,
  employerCountry?: string | null,
): Promise<ResolvedRate> {
  if (!employerCountry?.trim()) {
    return { rate: agentRate, source: "agent_default" };
  }

  const override = await findCountryOverride(employerCountry, "agent");
  if (override !== null) {
    return { rate: override.rate, source: "country_override", countryCode: override.countryCode };
  }

  return { rate: agentRate, source: "agent_default" };
}

/**
 * Resolve the effective override rate for a super-agent, considering employer's country.
 */
export async function resolveOverrideRate(
  superAgentRate: number,
  employerCountry?: string | null,
): Promise<ResolvedRate> {
  if (!employerCountry?.trim()) {
    return { rate: superAgentRate, source: "super_agent_default" };
  }

  const override = await findCountryOverride(employerCountry, "super_agent");
  if (override !== null) {
    return { rate: override.rate, source: "country_override", countryCode: override.countryCode };
  }

  return { rate: superAgentRate, source: "super_agent_default" };
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/** English name of an ISO region code ("ZA" → "South Africa"), or null if unknown. */
function regionName(code: string): string | null {
  try {
    const name = regionNames.of(code);
    return name && name.toUpperCase() !== code ? name : null;
  } catch {
    return null;
  }
}

/**
 * Does a stored employer country name the rule's ISO code? countryKey() folds
 * the aliases it knows ("KSA", "u.a.e") onto the code; the English region name
 * covers every other country ("South Africa" for "ZA").
 */
function countryMatchesCode(employerKey: string, ruleCode: string): boolean {
  if (employerKey === countryKey(ruleCode)) return true;
  const name = regionName(ruleCode);
  return name !== null && employerKey === countryKey(name);
}

/** Cache TTL: 10s — short to reduce stale-rate window in serverless environments */
let cachedOverrides: CachedOverride[] | null = null;
let cacheExpiry = 0;

async function findCountryOverride(employerCountry: string, role: CommissionRole): Promise<CountryOverrideMatch | null> {
  const now = Date.now();
  if (!cachedOverrides || now > cacheExpiry) {
    try {
      await connectDB();
      const settings = await SystemSettings.findOne().select("commissionOverrides").lean();
      cachedOverrides = settings?.commissionOverrides ?? [];
      cacheExpiry = now + 10_000;
    } catch {
      // On DB failure, use existing cache if available; otherwise return null (fallback to profile rate)
      if (!cachedOverrides) return null;
    }
  }

  const employerKey = countryKey(employerCountry);
  if (!employerKey) return null;
  const match = cachedOverrides!.find(
    (o) => countryMatchesCode(employerKey, o.countryCode.trim().toUpperCase()),
  );
  if (!match) return null;

  const countryCode = match.countryCode.trim().toUpperCase();
  // Role-specific rate takes priority over generic rate
  if (role === "agent" && match.agentRate != null) return { rate: match.agentRate, countryCode };
  if (role === "super_agent" && match.superAgentRate != null) return { rate: match.superAgentRate, countryCode };
  return { rate: match.rate, countryCode };
}

/** Clear the override cache — useful in tests or after admin updates settings */
export function clearCommissionOverrideCache(): void {
  cachedOverrides = null;
  cacheExpiry = 0;
}
