"use client";
import { useEffect, useState } from "react";
import { readConsent, CONSENT_EVENT } from "@/lib/consent/client";
import { allowed, type ConsentCategory, type ConsentState } from "@/lib/consent/state";

export function useConsent() {
  const [state, setState] = useState<ConsentState | null>(null);
  useEffect(() => {
    setState(readConsent());
    const on = () => setState(readConsent());
    window.addEventListener(CONSENT_EVENT, on);
    return () => window.removeEventListener(CONSENT_EVENT, on);
  }, []);
  return { state, decided: state !== null, allows: (c: ConsentCategory) => allowed(state, c) };
}
