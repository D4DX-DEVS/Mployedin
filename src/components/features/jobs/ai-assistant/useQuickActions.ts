"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { JobAssistantQuickAction } from "./JobAssistantPanel";
import type { JobAssistantError } from "./useJobAssistant";

const QUICK_KEYS = ["fillMissing", "description", "questions", "wording"] as const;
export type JobAssistantQuickKey = (typeof QUICK_KEYS)[number];

/**
 * The starter prompts a job form offers, in the reader's language.
 * `keys` narrows them to the ones worth offering right now; pass a stable
 * array (a module constant), not a fresh literal each render.
 */
export function useJobAssistantQuickActions(keys: readonly JobAssistantQuickKey[] = QUICK_KEYS): JobAssistantQuickAction[] {
  const t = useTranslations("jobAssistant.quick");
  return useMemo(
    () => keys.map((key) => ({ label: t(`${key}.label`), instruction: t(`${key}.instruction`) })),
    [t, keys],
  );
}

/** Message text for a failed request. */
export function useJobAssistantErrorText(): (e: JobAssistantError) => string {
  const t = useTranslations("jobAssistant.errors");
  return useMemo(() => (e: JobAssistantError) => t(e), [t]);
}
