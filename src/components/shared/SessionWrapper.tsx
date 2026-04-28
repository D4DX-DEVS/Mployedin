"use client";

import { SessionProvider } from "next-auth/react";
import { IdleTimeoutGuard } from "./IdleTimeoutGuard";

interface SessionWrapperProps {
  children: React.ReactNode;
  /** Disable idle timeout (e.g., for public pages) */
  disableIdleTimeout?: boolean;
}

export function SessionWrapper({ children, disableIdleTimeout }: SessionWrapperProps) {
  return (
    <SessionProvider
      // Re-fetch session every 5 minutes to detect server-side invalidation
      refetchInterval={5 * 60}
      // Re-fetch session when window regains focus
      refetchOnWindowFocus={true}
    >
      {!disableIdleTimeout && <IdleTimeoutGuard />}
      {children}
    </SessionProvider>
  );
}
