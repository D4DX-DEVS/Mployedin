"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { Button } from "@/components/ui/button";

interface PublicHeaderProps {
  locale: string;
}

export default function PublicHeader({ locale }: PublicHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const tNav = useTranslations("nav");
  const tLanding = useTranslations("landing");
  const tAuth = useTranslations("auth");

  const navLinks = [
    { href: `/${locale}`, label: tNav("home") },
    { href: `/${locale}/blog`, label: tLanding("blog") },
    { href: `/${locale}/faq`, label: tLanding("faqTitle") },
    { href: `/${locale}/contact`, label: tLanding("contactTitle") },
  ];

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Link href={`/${locale}`} className="flex items-center">
          <Image src="/logo.png" alt="Mployedin" width={160} height={40} className="h-10 w-auto object-contain" style={{ width: "auto" }} priority />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Auth & Language */}
        <div className="hidden md:flex items-center gap-3">
          <ThemeToggle />
          <Link href={locale === "en" ? "/ar" : "/en"}>
            <Button variant="ghost" size="sm">
              {locale === "en" ? "العربية" : "English"}
            </Button>
          </Link>
          <Link href={`/${locale}/login`}>
            <Button variant="ghost" size="sm">
              {tAuth("login")}
            </Button>
          </Link>
          <Link href={`/${locale}/register`}>
            <Button size="sm">
              {tLanding("getStartedBtn")}
            </Button>
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="border-t md:hidden">
          <nav className="container mx-auto flex flex-col gap-2 px-4 py-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <hr className="my-2" />
            <Link
              href={locale === "en" ? "/ar" : "/en"}
              className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent"
              onClick={() => setMobileOpen(false)}
            >
              {locale === "en" ? "العربية" : "English"}
            </Link>
            <div className="flex gap-2">
              <Link href={`/${locale}/login`} className="flex-1">
                <Button variant="outline" size="sm" className="w-full">
                  {tAuth("login")}
                </Button>
              </Link>
              <Link href={`/${locale}/register`} className="flex-1">
                <Button size="sm" className="w-full">
                  {tLanding("getStartedBtn")}
                </Button>
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
