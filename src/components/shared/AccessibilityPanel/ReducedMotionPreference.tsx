"use client";

import { MotionConfig } from "framer-motion";
import { useA11yPreferences } from "@/lib/a11y/usePreferences";

/**
 * framer-motion animates from JavaScript, so the CSS that honours the panel's
 * "Reduce motion" cannot reach it. This tells it directly; left off, it still
 * follows the operating system's setting.
 */
export function ReducedMotionPreference({ children }: { children: React.ReactNode }) {
  const { prefs } = useA11yPreferences();
  return <MotionConfig reducedMotion={prefs.reduceMotion ? "always" : "user"}>{children}</MotionConfig>;
}
