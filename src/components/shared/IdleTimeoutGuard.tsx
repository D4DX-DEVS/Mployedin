"use client";

import { useSession } from "next-auth/react";
import { useCallback, useState } from "react";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";

/**
 * Silent component that activates idle timeout monitoring
 * when a user is authenticated. Shows a warning toast 5 minutes
 * before auto-logout.
 */
export function IdleTimeoutGuard() {
  const { status } = useSession();
  const [showWarning, setShowWarning] = useState(false);

  const handleWarning = useCallback((remainingMs: number) => {
    setShowWarning(true);
    // Auto-dismiss after remaining time (signOut will fire regardless)
    setTimeout(() => setShowWarning(false), remainingMs);
  }, []);

  // Only run idle detection for authenticated users
  useIdleTimeout({
    timeout: 60 * 60 * 1000, // 1 hour inactivity
    enabled: status === "authenticated",
    onWarning: handleWarning,
    warningThreshold: 5 * 60 * 1000, // Warn 5 minutes before
  });

  if (!showWarning) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-4 right-4 z-[9999] max-w-sm rounded-lg border border-yellow-300 bg-yellow-50 p-4 shadow-lg"
    >
      <p className="text-sm font-medium text-yellow-800">
        You will be logged out in 5 minutes due to inactivity.
      </p>
      <p className="mt-1 text-xs text-yellow-600">
        Move your mouse or press any key to stay logged in.
      </p>
    </div>
  );
}
