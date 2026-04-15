"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useRef, useState } from "react";

const LOCALES = [
  { code: "en", label: "EN", flag: "/flags/gb.svg", dir: "ltr" },
  { code: "ar", label: "AR", flag: "/flags/ae.svg", dir: "rtl" },
] as const;

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [pendingLocale, setPendingLocale] = useState<string | null>(null);
  const switching = useRef(false);

  const displayLocale = pendingLocale ?? locale;
  const activeIndex = LOCALES.findIndex((l) => l.code === displayLocale);

  const switchLocale = (newLocale: string) => {
    if (newLocale === locale || switching.current) return;
    switching.current = true;

    // Animate the pill first
    setPendingLocale(newLocale);

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

    // Wait for the slide animation to finish, then navigate
    setTimeout(() => {
      router.push(newPath);
      router.refresh();
    }, 320);
  };

  return (
    <div
      dir="ltr"
      className="relative flex h-9 w-[152px] items-center rounded-full border border-primary/15 bg-card p-[3px]"
    >
      {/* Sliding toggle indicator */}
      <div
        className="absolute top-[3px] bottom-[3px] w-[calc(50%-3px)] rounded-full shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{
          backgroundColor: "hsl(var(--accent))",
          transform: activeIndex === 0 ? "translateX(0)" : "translateX(100%)",
          left: "3px",
        }}
      />
      {LOCALES.map((l) => {
        const isActive = displayLocale === l.code;
        return (
          <button
            key={l.code}
            onClick={() => switchLocale(l.code)}
            className={`relative z-10 flex items-center justify-center gap-1.5 w-1/2 py-1 rounded-full text-[13px] font-medium cursor-pointer select-none transition-colors duration-200 ${
              isActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-label={`Switch to ${l.code === "en" ? "English" : "Arabic"}`}
          >
            <Image src={l.flag} alt="" width={16} height={12} className="rounded-[2px]" style={{ width: "16px", height: "12px" }} unoptimized />
            <span className="tracking-wide hidden sm:inline-block">{l.label}</span>
          </button>
        );
      })}
    </div>
  );
}
