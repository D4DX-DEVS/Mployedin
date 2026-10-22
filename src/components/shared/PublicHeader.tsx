"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { rememberLocaleChoice } from "@/lib/consent/rememberLocale";
import { roleHomePath } from "@/lib/auth/roleHome";
import { usePendingReferral } from "@/lib/referrals/pendingReferral";
import { registerHrefFor } from "@/lib/referrals/url";

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
  // A job an agent shared opens with ?ref=; the code is held in memory (never a
  // cookie) and carried to sign-up in the link.
  const registerHref = registerHrefFor(locale, usePendingReferral());

  const navLinks = [
    { href: `/${locale}/jobs`, label: tNav("jobs") },
    { href: `/${locale}/companies`, label: tLanding("companies") },
    { href: `/${locale}/employer-register`, label: tLanding("forEmployers") },
    { href: `/${locale}/blog`, label: tLanding("blog") },
  ];
  const mobileMenuId = "public-mobile-navigation";
  // A real link (the URL switches the language, with or without JavaScript); the
  // click also remembers the choice in NEXT_LOCALE while preferences are allowed.
  const otherLocale = locale === "en" ? "ar" : "en";
  const rememberOtherLocale = () => {
    rememberLocaleChoice(otherLocale);
  };

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Link href={`/${locale}`} className="flex items-center">
          <Image src="/logo.png" alt="Mployedin" width={100} height={34} className="h-auto w-[118px] object-contain" style={{ height: "auto" }} priority />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6">
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
          <Link href={`/${otherLocale}`} onClick={rememberOtherLocale}>
            <Button variant="ghost" size="sm">
              {locale === "en" ? "العربية" : "English"}
            </Button>
          </Link>
          {dashboardHref ? (
            <Link href={dashboardHref}>
              <Button size="sm">
                {tNav("dashboard")}
              </Button>
            </Link>
          ) : (
            <>
              <Link href={`/${locale}/login`}>
                <Button variant="ghost" size="sm">
                  {tAuth("login")}
                </Button>
              </Link>
              <Link href={registerHref}>
                <Button size="sm">
                  {tLanding("getStartedBtn")}
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile Menu Button */}
        <div className="flex items-center gap-2 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? tNav("a11yCloseMenu") : tNav("a11yOpenMenu")}
            aria-expanded={mobileOpen}
            aria-controls={mobileMenuId}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div id={mobileMenuId} className="border-t md:hidden">
          <nav className="container mx-auto flex flex-col gap-2 px-4 py-4">
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
              className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent"
              onClick={() => {
                rememberOtherLocale();
                setMobileOpen(false);
              }}
            >
              {locale === "en" ? "العربية" : "English"}
            </Link>
            {dashboardHref ? (
              <Link href={dashboardHref} className="w-full" onClick={() => setMobileOpen(false)}>
                <Button size="sm" className="w-full">
                  {tNav("dashboard")}
                </Button>
              </Link>
            ) : (
              <div className="flex gap-2">
                <Link href={`/${locale}/login`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full">
                    {tAuth("login")}
                  </Button>
                </Link>
                <Link href={registerHref} className="flex-1">
                  <Button size="sm" className="w-full">
                    {tLanding("getStartedBtn")}
                  </Button>
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
