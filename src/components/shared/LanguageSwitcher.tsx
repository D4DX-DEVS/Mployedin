"use client";

import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "next-intl";

const LOCALES = [
  { code: "en", label: "EN", flag: "🇬🇧", dir: "ltr" },
  { code: "ar", label: "AR", flag: "🇦🇪", dir: "rtl" },
] as const;

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const switchLocale = (newLocale: string) => {
    if (newLocale === locale) return;
    // Replace the locale segment in the current path
    const segments = pathname.split("/");
    segments[1] = newLocale;
    const newPath = segments.join("/");

    // Persist locale preference to user profile (fire-and-forget)
    fetch("/api/users/locale", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: newLocale }),
    }).catch(() => {/* ignore – preference will still work via URL */ });

    // Set a cookie so middleware/server components can pick up the preference
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000;SameSite=Lax`;

    router.push(newPath);
    router.refresh();
  };

  return (
    <div className="flex p-0.5 bg-muted/40 hover:bg-muted/60 rounded-lg border border-border/40 transition-colors items-center h-9">
      {LOCALES.map((l) => {
        const isActive = locale === l.code;
        return (
          <button
            key={l.code}
            onClick={() => switchLocale(l.code)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-semibold transition-all duration-200 ${isActive
                ? "bg-background text-foreground shadow-sm ring-1 ring-black/5 dark:ring-white/10"
                : "text-muted-foreground hover:text-foreground"
              }`}
            aria-label={`Switch to ${l.code === "en" ? "English" : "Arabic"}`}
          >
            <span className="text-base leading-none">{l.flag}</span>
            <span className="tracking-wide hidden sm:inline-block">{l.label}</span>
          </button>
        );
      })}
    </div>
  );
}
