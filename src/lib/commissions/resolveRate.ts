/**
 * Commission rate resolver — applies country-based overrides from SystemSettings.
 *
 * Priority:
 * 1. Country override (from SystemSettings.commissionOverrides) if employer country matches
 * 2. Agent/SuperAgent's own configured rate (fallback)
 */

import { connectDB } from "@/lib/db/mongoose";
import SystemSettings from "@/models/SystemSettings";

export interface ResolvedRate {
  rate: number;
  source: "country_override" | "agent_default" | "super_agent_default";
  /** Country code if override applied */
  countryCode?: string;
}

/**
 * Resolve the effective commission rate for an agent, considering employer's country.
 */
export async function resolveCommissionRate(
  agentRate: number,
  employerCountry?: string | null,
): Promise<ResolvedRate> {
  if (!employerCountry) {
    return { rate: agentRate, source: "agent_default" };
  }

  const override = await findCountryOverride(employerCountry);
  if (override !== null) {
    return { rate: override, source: "country_override", countryCode: employerCountry };
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
  if (!employerCountry) {
    return { rate: superAgentRate, source: "super_agent_default" };
  }

  const override = await findCountryOverride(employerCountry);
  if (override !== null) {
    return { rate: override, source: "country_override", countryCode: employerCountry };
  }

  return { rate: superAgentRate, source: "super_agent_default" };
}

/** Cache TTL: 60s to avoid hitting DB on every invoice */
let cachedOverrides: { countryCode: string; rate: number }[] | null = null;
let cacheExpiry = 0;

async function findCountryOverride(countryCode: string): Promise<number | null> {
  const now = Date.now();
  if (!cachedOverrides || now > cacheExpiry) {
    await connectDB();
    const settings = await SystemSettings.findOne().select("commissionOverrides").lean();
    cachedOverrides = settings?.commissionOverrides ?? [];
    cacheExpiry = now + 60_000; // Cache for 60 seconds
  }

  const normalized = countryCode.trim().toUpperCase();
  const match = cachedOverrides!.find(
    (o) => o.countryCode.trim().toUpperCase() === normalized,
  );
  return match ? match.rate : null;
}

/** Clear the override cache — useful in tests or after admin updates settings */
export function clearCommissionOverrideCache(): void {
  cachedOverrides = null;
  cacheExpiry = 0;
}
