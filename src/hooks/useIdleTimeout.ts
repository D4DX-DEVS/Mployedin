"use client";

import { useCallback, useEffect, useRef } from "react";
import { signOut } from "next-auth/react";

const ACTIVITY_EVENTS = [
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "pointermove",
] as const;

const STORAGE_KEY = "mployedin_last_activity";

interface UseIdleTimeoutOptions {
  /** Timeout in milliseconds before auto-logout. Default: 60 minutes */
  timeout?: number;
  /** Check interval in milliseconds. Default: 30 seconds */
  checkInterval?: number;
  /** Whether the hook is enabled. Default: true */
  enabled?: boolean;
  /** Callback to run before sign-out (e.g., show warning) */
  onWarning?: (remainingMs: number) => void;
  /** Warning threshold in ms before logout. Default: 5 minutes */
  warningThreshold?: number;
}

/**
 * Auto-logout hook that tracks user inactivity across tabs.
 * Uses localStorage to sync activity timestamps across browser tabs.
 *
 * - Tracks mouse, keyboard, scroll, and touch events
 * - Syncs across tabs via localStorage
 * - Logs out after `timeout` ms of inactivity (default 1 hour)
 */
export function useIdleTimeout({
  timeout = 60 * 60 * 1000, // 1 hour
  checkInterval = 30_000,   // 30 seconds
  enabled = true,
  onWarning,
  warningThreshold = 5 * 60 * 1000, // 5 minutes
}: UseIdleTimeoutOptions = {}) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warningFiredRef = useRef(false);

  const updateActivity = useCallback(() => {
    const now = Date.now().toString();
    try {
      localStorage.setItem(STORAGE_KEY, now);
    } catch {
      // localStorage quota exceeded or unavailable — ignore
    }
    warningFiredRef.current = false;
  }, []);

  const getLastActivity = useCallback((): number => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? parseInt(stored, 10) : Date.now();
    } catch {
      return Date.now();
    }
  }, []);

  const checkIdle = useCallback(() => {
    const lastActivity = getLastActivity();
    const elapsed = Date.now() - lastActivity;

    if (elapsed >= timeout) {
      // Auto-logout
      signOut({ callbackUrl: "/en/login?reason=idle" });
      return;
    }

    // Warning callback
    const remaining = timeout - elapsed;
    if (remaining <= warningThreshold && !warningFiredRef.current) {
      warningFiredRef.current = true;
      onWarning?.(remaining);
    }
  }, [getLastActivity, timeout, warningThreshold, onWarning]);

  useEffect(() => {
    if (!enabled) return;

    // Set initial activity timestamp
    updateActivity();

    // Throttled activity handler (max once per 10 seconds)
    let lastUpdate = 0;
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastUpdate > 10_000) {
        lastUpdate = now;
        updateActivity();
      }
    };

    // Register activity listeners
    for (const event of ACTIVITY_EVENTS) {
      document.addEventListener(event, handleActivity, { passive: true });
    }

    // Cross-tab sync: listen for storage events from other tabs
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        warningFiredRef.current = false;
      }
    };
    window.addEventListener("storage", handleStorage);

    // Periodic idle check
    timerRef.current = setInterval(checkIdle, checkInterval);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        document.removeEventListener(event, handleActivity);
      }
      window.removeEventListener("storage", handleStorage);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, checkInterval, updateActivity, checkIdle]);
}
