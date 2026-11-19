"use client";

import { useEffect, useState } from "react";

export interface EmployerOnboardingState {
  employerSelfRegistrationEnabled: boolean;
  employerInviteLinksEnabled: boolean;
  superAgentCanCreateEmployers: boolean;
  agentCanCreateEmployers: boolean;
}

/** Until the answer arrives, treat public sign-up as closed so its links never flash in. */
const CLOSED: EmployerOnboardingState = {
  employerSelfRegistrationEnabled: false,
  employerInviteLinksEnabled: true,
  superAgentCanCreateEmployers: true,
  agentCanCreateEmployers: true,
};

const STALE_MS = 60_000;
let cached: { value: EmployerOnboardingState; at: number } | null = null;
let inflight: Promise<EmployerOnboardingState> | null = null;

function load(): Promise<EmployerOnboardingState> {
  if (cached && Date.now() - cached.at < STALE_MS) return Promise.resolve(cached.value);
  // No fetch (very old browser, or a test environment): stay on the safe defaults.
  if (typeof fetch !== "function") return Promise.resolve(CLOSED);
  if (!inflight) {
    inflight = fetch("/api/public/employer-onboarding")
      .then((res) => (res.ok ? (res.json() as Promise<EmployerOnboardingState>) : CLOSED))
      .catch(() => CLOSED)
      .then((value) => {
        const next: EmployerOnboardingState = {
          employerSelfRegistrationEnabled: value.employerSelfRegistrationEnabled === true,
          employerInviteLinksEnabled: value.employerInviteLinksEnabled !== false,
          superAgentCanCreateEmployers: value.superAgentCanCreateEmployers !== false,
          agentCanCreateEmployers: value.agentCanCreateEmployers !== false,
        };
        cached = { value: next, at: Date.now() };
        return next;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * Admin → Settings → Employer onboarding switches, for client components.
 * Works on public pages (no react-query provider there). One shared request per minute.
 */
export function useEmployerOnboarding(): EmployerOnboardingState & { loaded: boolean } {
  const [state, setState] = useState<EmployerOnboardingState>(cached?.value ?? CLOSED);
  const [loaded, setLoaded] = useState<boolean>(cached !== null);
  useEffect(() => {
    let alive = true;
    load().then((value) => {
      if (!alive) return;
      setState(value);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  return { ...state, loaded };
}

/** Shorthand: may the public see "Register as employer" links? */
export function useEmployerSignupOpen(): boolean {
  return useEmployerOnboarding().employerSelfRegistrationEnabled;
}

/**
 * May the signed-in user add employers (Add employer, lead → employer account)?
 * Admins always; super agents and agents per the admin switches. True while
 * loading so working screens don't flicker; the API refuses if it is off.
 */
export function useCanCreateEmployers(role: string | undefined): boolean {
  const flags = useEmployerOnboarding();
  if (role === "super_agent") return flags.superAgentCanCreateEmployers;
  if (role === "agent") return flags.agentCanCreateEmployers;
  return true;
}
