"use client";

// Force static prerendering. The PWA service worker precaches this page, and a
// dynamically-rendered response carries `Cache-Control: no-store`, which the
// Cache Storage API refuses to store — that stalls Serwist's install step and
// the SW never activates. Static rendering keeps the response cacheable.
export const dynamic = "force-static";

const STRINGS = {
  en: {
    title: "You're Offline",
    description: "It looks like you've lost your internet connection. Please check your network settings and try again.",
    button: "Try Again"
  },
  ar: {
    title: "أنت غير متصل",
    description: "يبدو أنك فقدت اتصالك بالإنترنت. يرجى التحقق من إعدادات الشبكة والمحاولة مرة أخرى.",
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

export default function OfflinePage() {
  const locale = getLocale();
  const isArabic = locale.startsWith("ar");
  const strings = STRINGS[locale as keyof typeof STRINGS] || STRINGS.en;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center" dir={isArabic ? "rtl" : "ltr"}>
      <div className="mx-auto max-w-md space-y-6">
        {/* Offline icon */}
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-muted">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted-foreground"
          >
            <line x1="2" x2="22" y1="2" y2="22" />
            <path d="M8.5 16.5a5 5 0 0 1 7 0" />
            <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
            <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
            <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
            <path d="M5 12.859a10 10 0 0 1 5.17-2.69" />
            <line x1="12" x2="12.01" y1="20" y2="20" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {strings.title}
        </h1>

        <p className="text-muted-foreground">
          {strings.description}
        </p>

        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {strings.button}
        </button>
      </div>
    </div>
  );
}
