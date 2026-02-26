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
    // Replace the locale segment in the current path
    const segments = pathname.split("/");
    segments[1] = newLocale;
    router.push(segments.join("/"));
  };

  return (
    <div className="flex items-center gap-1 rounded-lg border p-1">
      {LOCALES.map((l) => (
        <button
          key={l.code}
          onClick={() => switchLocale(l.code)}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
            locale === l.code
              ? "bg-primary text-white"
              : "text-muted-foreground hover:bg-muted/60"
          }`}
          aria-label={`Switch to ${l.code === "en" ? "English" : "Arabic"}`}
        >
          <span>{l.flag}</span>
          <span>{l.label}</span>
        </button>
      ))}
    </div>
  );
}
