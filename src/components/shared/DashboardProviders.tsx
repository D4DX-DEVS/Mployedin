"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRef } from "react";
import { Toaster } from "sonner";
import { ResponsiveTables } from "@/components/shared/ResponsiveTables";

// Persist QueryClient across HMR so cached data survives hot reloads
let _persistedClient: QueryClient | null = null;
function getQueryClient() {
  if (!_persistedClient) {
    _persistedClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5 * 60 * 1000, // 5 min default
          gcTime: 10 * 60 * 1000, // 10 min
          retry: 1,
          refetchOnWindowFocus: false,
          refetchOnMount: false,
        },
      },
    });
  }
  return _persistedClient;
}

export function DashboardProviders({ children }: { children: React.ReactNode }) {
  const queryClient = useRef(getQueryClient()).current;

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ResponsiveTables />
      <Toaster position="bottom-right" richColors closeButton />
    </QueryClientProvider>
  );
}
