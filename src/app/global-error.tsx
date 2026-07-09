"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/observability/report-error";

const STRINGS = {
  en: {
    title: "Something went wrong",
    message: "An unexpected error occurred. Please try again.",
    errorIdLabel: "Error ID:",
    button: "Try Again"
  },
  ar: {
    title: "حدث خطأ ما",
    message: "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.",
    errorIdLabel: "معرف الخطأ:",
    button: "حاول مرة أخرى"
  }
};

function getLocale(): string {
  if (typeof document !== "undefined") {
    const cookie = document.cookie.split("; ").find(c => c.startsWith("NEXT_LOCALE="));
    if (cookie) {
      return cookie.split("=")[1];
    }
    if (navigator.language.startsWith("ar")) {
      return "ar";
    }
  }
  return "en";
}

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

  const locale = getLocale();
  const isArabic = locale.startsWith("ar");
  const strings = STRINGS[locale as keyof typeof STRINGS] || STRINGS.en;

  return (
    <html lang={locale} dir={isArabic ? "rtl" : "ltr"}>
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
        <div style={{ textAlign: isArabic ? "right" : "center", maxWidth: 420, padding: "0 24px" }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>
            {strings.title}
          </h2>
          <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 16 }}>
            {strings.message}
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
              {strings.errorIdLabel} {error.digest}
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
            {strings.button}
          </button>
        </div>
      </body>
    </html>
  );
}
