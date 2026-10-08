"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { roleHomePath } from "@/lib/auth/roleHome";
import { AccessibilityButton } from "@/components/shared/a11y/AccessibilityButton";

interface PublicHeaderProps {
  locale: string;
}

export default function PublicHeader({ locale }: PublicHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const tNav = useTranslations("nav");
  const tLanding = useTranslations("landing");
  const tAuth = useTranslations("auth");
  // A signed-in visitor gets a way back to their dashboard instead of Login /
  // Get Started. No session is seeded from the server, so the first render is
  // "loading" on both sides and hydration matches.
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const dashboardHref = role ? roleHomePath(locale, role) : null;

  const navLinks = [
    { href: `/${locale}/jobs`, label: tNav("jobs") },
    { href: `/${locale}/companies`, label: tLanding("companies") },
    { href: `/${locale}/employer-register`, label: tLanding("forEmployers") },
    { href: `/${locale}/blog`, label: tLanding("blog") },
  ];
  const mobileMenuId = "public-mobile-navigation";
  // The switcher's label is in the *other* language — mark it up so screen
  // readers pronounce it correctly (WCAG 3.1.2 Language of Parts).
  const otherLocale = locale === "en" ? "ar" : "en";
  const otherLocaleLabel = locale === "en" ? "العربية" : "English";
  const iconButtonClass =
    "inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Link href={`/${locale}`} className="flex items-center">
          <Image src="/logo.png" alt="Mployedin" width={100} height={34} className="h-auto w-[118px] object-contain" style={{ height: "auto" }} priority />
        </Link>

        {/* Desktop Nav */}
        <nav aria-label={tNav("a11yMainNav")} className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href || pathname.startsWith(`${link.href}/`) ? "page" : undefined}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Auth & Language */}
        <div className="hidden md:flex items-center gap-3">
          <AccessibilityButton variant="icon" className={iconButtonClass} />
          <Button asChild variant="ghost" size="sm">
            <Link href={`/${otherLocale}`} hrefLang={otherLocale} lang={otherLocale}>
              {otherLocaleLabel}
            </Link>
          </Button>
          {dashboardHref ? (
            <Button asChild size="sm">
              <Link href={dashboardHref}>{tNav("dashboard")}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/${locale}/login`}>{tAuth("login")}</Link>
              </Button>
              <Button asChild size="sm">
                <Link href={`/${locale}/register`}>{tLanding("getStartedBtn")}</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile Menu Button */}
        <div className="flex items-center gap-2 md:hidden">
          <AccessibilityButton variant="icon" className={iconButtonClass} />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? tNav("a11yCloseMenu") : tNav("a11yOpenMenu")}
            aria-expanded={mobileOpen}
            aria-controls={mobileMenuId}
          >
            {mobileOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div id={mobileMenuId} className="border-t md:hidden">
          <nav aria-label={tNav("a11yMainNav")} className="container mx-auto flex flex-col gap-2 px-4 py-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname === link.href || pathname.startsWith(`${link.href}/`) ? "page" : undefined}
                className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <hr className="my-2" />
            <Link
              href={`/${otherLocale}`}
              hrefLang={otherLocale}
              lang={otherLocale}
              className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent"
              onClick={() => setMobileOpen(false)}
            >
              {otherLocaleLabel}
            </Link>
            {dashboardHref ? (
              <Button asChild size="sm" className="w-full">
                <Link href={dashboardHref} onClick={() => setMobileOpen(false)}>
                  {tNav("dashboard")}
                </Link>
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm" className="flex-1">
                  <Link href={`/${locale}/login`}>{tAuth("login")}</Link>
                </Button>
                <Button asChild size="sm" className="flex-1">
                  <Link href={`/${locale}/register`}>{tLanding("getStartedBtn")}</Link>
                </Button>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
