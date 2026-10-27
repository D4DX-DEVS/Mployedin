"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { JobAssistantQuickAction } from "./JobAssistantPanel";
import type { JobAssistantError } from "./useJobAssistant";

const QUICK_KEYS = ["fillMissing", "description", "questions", "wording"] as const;

/** The starter prompts every job form offers, in the reader's language. */
export function useJobAssistantQuickActions(): JobAssistantQuickAction[] {
  const t = useTranslations("jobAssistant.quick");
  return useMemo(
    () => QUICK_KEYS.map((key) => ({ label: t(`${key}.label`), instruction: t(`${key}.instruction`) })),
    [t],
  );
}

/** Message text for a failed request. */
export function useJobAssistantErrorText(): (e: JobAssistantError) => string {
  const t = useTranslations("jobAssistant.errors");
  return useMemo(() => (e: JobAssistantError) => t(e), [t]);
}
