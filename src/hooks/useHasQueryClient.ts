"use client";

import { useContext } from "react";
import { QueryClientContext } from "@tanstack/react-query";

/**
 * True when a TanStack QueryClientProvider is mounted above the caller.
 * Shared form primitives (country / currency / dial-code selects) use it to
 * fall back to their static option lists when rendered outside the dashboard
 * providers instead of throwing from useQuery.
 */
export function useHasQueryClient(): boolean {
  return useContext(QueryClientContext) != null;
}
