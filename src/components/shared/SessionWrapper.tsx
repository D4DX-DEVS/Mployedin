"use client";

import { SessionProvider } from "next-auth/react";
import { IdleTimeoutGuard } from "./IdleTimeoutGuard";

// next-auth's client calls `new BroadcastChannel("next-auth")` with no try/catch.
// Firefox with cookies blocked throws SecurityError from that constructor, which
// crashed the whole site for a visitor who had made a privacy choice. Probe it
// once, here and before next-auth runs; if it throws, remove it so next-auth
// falls back to its own no-op stand-in. Signing in is a different matter (it
// needs cookies, and the login page says so).
if (typeof globalThis !== "undefined" && typeof globalThis.BroadcastChannel === "function") {
  try {
    new globalThis.BroadcastChannel("next-auth").close();
  } catch {
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = undefined;
  }
}

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
