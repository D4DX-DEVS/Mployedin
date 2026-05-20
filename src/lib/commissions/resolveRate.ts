/**
 * Commission rate resolver — applies country-based overrides from SystemSettings.
 *
 * Priority:
 * 1. Role-specific country override (agentRate / superAgentRate) if set
 * 2. Generic country override (rate) as fallback
 * 3. Agent/SuperAgent's own configured rate (final fallback)
 */

import { connectDB } from "@/lib/db/mongoose";
import SystemSettings from "@/models/SystemSettings";

export interface ResolvedRate {
  rate: number;
  source: "country_override" | "agent_default" | "super_agent_default";
  /** Country code if override applied */
  countryCode?: string;
}

type CommissionRole = "agent" | "super_agent";

interface CachedOverride {
  countryCode: string;
  rate: number;
  agentRate?: number;
  superAgentRate?: number;
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

  const override = await findCountryOverride(employerCountry, "agent");
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

  const override = await findCountryOverride(employerCountry, "super_agent");
  if (override !== null) {
    return { rate: override, source: "country_override", countryCode: employerCountry };
  }

  return { rate: superAgentRate, source: "super_agent_default" };
}

/** Cache TTL: 10s — short to reduce stale-rate window in serverless environments */
let cachedOverrides: CachedOverride[] | null = null;
let cacheExpiry = 0;

async function findCountryOverride(countryCode: string, role: CommissionRole): Promise<number | null> {
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

  const normalized = countryCode.trim().toUpperCase();
  const match = cachedOverrides!.find(
    (o) => o.countryCode.trim().toUpperCase() === normalized,
  );
  if (!match) return null;

  // Role-specific rate takes priority over generic rate
  if (role === "agent" && match.agentRate != null) return match.agentRate;
  if (role === "super_agent" && match.superAgentRate != null) return match.superAgentRate;
  return match.rate;
}

/** Clear the override cache — useful in tests or after admin updates settings */
export function clearCommissionOverrideCache(): void {
  cachedOverrides = null;
  cacheExpiry = 0;
}
