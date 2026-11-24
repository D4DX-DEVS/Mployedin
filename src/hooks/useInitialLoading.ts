"use client";

import { useState } from "react";

/**
 * True only while a list loads for the first time. Later refetches (a search,
 * a filter, the next page) keep the rows already on screen and swap them when
 * the new ones arrive, instead of blanking the list into a skeleton on every
 * keystroke.
 */
export function useInitialLoading(loading: boolean): boolean {
  const [loadedOnce, setLoadedOnce] = useState(false);
  // Set during render (React's "storing information from previous renders"
  // pattern) so the first frame after loading ends already shows the rows.
  if (!loading && !loadedOnce) setLoadedOnce(true);
  return loading && !loadedOnce;
}
