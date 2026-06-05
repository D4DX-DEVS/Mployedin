"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/observability/report-error";

/**
 * Root-level error boundary (Next.js App Router convention).
 *
 * Catches errors thrown in the root layout that the segment-level error.tsx
 * boundaries cannot handle. Must render its own <html>/<body> because it
 * replaces the root layout when active.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { source: "global-error", digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          background: "#0a0a0a",
          color: "#fafafa",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420, padding: "0 24px" }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 16 }}>
            An unexpected error occurred. Please try again.
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: 12,
                opacity: 0.5,
                fontFamily: "monospace",
                marginBottom: 16,
              }}
            >
              Error ID: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 500,
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              background: "#fafafa",
              color: "#0a0a0a",
            }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
