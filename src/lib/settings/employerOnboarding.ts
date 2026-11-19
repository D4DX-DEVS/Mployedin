/**
 * Employer onboarding switches (Admin → Settings → Employer onboarding).
 *
 * Four platform settings decide who may bring a new employer onto the platform:
 * - employerSelfRegistrationEnabled: anyone, via the public /employer-register page (default OFF)
 * - employerInviteLinksEnabled: agent / super-agent employer invite links (?ref=) (default ON)
 * - superAgentCanCreateEmployers / agentCanCreateEmployers: direct "Add employer" (default ON)
 * Admins are never gated.
 *
 * Read through a short in-process cache (same pattern as the subscription
 * enforcement flag). On a DB error, public self-registration fails CLOSED (it is
 * off by default anyway) while the hierarchy switches fail OPEN so agents keep
 * working through a blip. `clearEmployerOnboardingCache()` runs on save.
 */
import connectDB from "@/lib/db/mongoose";
import SystemSettings from "@/models/SystemSettings";

export interface EmployerOnboardingFlags {
  employerSelfRegistrationEnabled: boolean;
  employerInviteLinksEnabled: boolean;
  superAgentCanCreateEmployers: boolean;
  agentCanCreateEmployers: boolean;
}

export const EMPLOYER_ONBOARDING_KEYS = [
  "employerSelfRegistrationEnabled",
  "employerInviteLinksEnabled",
  "superAgentCanCreateEmployers",
  "agentCanCreateEmployers",
] as const satisfies readonly (keyof EmployerOnboardingFlags)[];

export const EMPLOYER_ONBOARDING_DEFAULTS: EmployerOnboardingFlags = {
  employerSelfRegistrationEnabled: false,
  employerInviteLinksEnabled: true,
  superAgentCanCreateEmployers: true,
  agentCanCreateEmployers: true,
};

const CACHE_TTL_MS = 60_000;

let cached: EmployerOnboardingFlags | null = null;
let cachedAt = 0;
let inflight: Promise<EmployerOnboardingFlags> | null = null;

async function loadFromDb(): Promise<EmployerOnboardingFlags> {
  try {
    await connectDB();
    const doc = await SystemSettings.findOne()
      .select(EMPLOYER_ONBOARDING_KEYS.join(" "))
      .lean<Partial<EmployerOnboardingFlags>>();
    cached = {
      employerSelfRegistrationEnabled:
        doc?.employerSelfRegistrationEnabled ?? EMPLOYER_ONBOARDING_DEFAULTS.employerSelfRegistrationEnabled,
      employerInviteLinksEnabled: doc?.employerInviteLinksEnabled ?? EMPLOYER_ONBOARDING_DEFAULTS.employerInviteLinksEnabled,
      superAgentCanCreateEmployers:
        doc?.superAgentCanCreateEmployers ?? EMPLOYER_ONBOARDING_DEFAULTS.superAgentCanCreateEmployers,
      agentCanCreateEmployers: doc?.agentCanCreateEmployers ?? EMPLOYER_ONBOARDING_DEFAULTS.agentCanCreateEmployers,
    };
  } catch {
    // Fail closed for the public door, open for the hierarchy.
    cached = { ...EMPLOYER_ONBOARDING_DEFAULTS, employerSelfRegistrationEnabled: false };
  }
  cachedAt = Date.now();
  return cached;
}

/** Current employer onboarding switches (cached up to 60 s). */
export async function getEmployerOnboardingFlags(): Promise<EmployerOnboardingFlags> {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;
  if (!inflight) {
    inflight = loadFromDb().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** May this role add an employer directly? Admin always; SA/agent per switch; others never decided here. */
export async function canRoleCreateEmployers(role: string): Promise<boolean> {
  if (role === "super_agent") return (await getEmployerOnboardingFlags()).superAgentCanCreateEmployers;
  if (role === "agent") return (await getEmployerOnboardingFlags()).agentCanCreateEmployers;
  return true;
}

/** Invalidate the cache (call after the settings are saved). */
export function clearEmployerOnboardingCache(): void {
  cached = null;
  cachedAt = 0;
  inflight = null;
}
