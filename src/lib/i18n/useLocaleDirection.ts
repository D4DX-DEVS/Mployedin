"use client";

import { useLocale } from "next-intl";

export type TextDirection = "ltr" | "rtl";

/**
 * The page's text direction, for Radix primitives. Without a `dir` prop (or a
 * DirectionProvider, which this app does not have) Tabs, DropdownMenu and
 * Select assume LTR: they stamp dir="ltr" on their root or content, so on the
 * Arabic site rows laid out left-to-right, arrow keys ran backwards and switch
 * thumbs slid outside their tracks.
 */
export function useLocaleDirection(): TextDirection {
  return useLocale() === "ar" ? "rtl" : "ltr";
}
