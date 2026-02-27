"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PublicHeaderProps {
  locale: string;
}

export default function PublicHeader({ locale }: PublicHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAr = locale === "ar";

  const navLinks = [
    { href: `/${locale}`, label: isAr ? "الرئيسية" : "Home" },
    { href: `/${locale}/blog`, label: isAr ? "المدونة" : "Blog" },
    { href: `/${locale}/faq`, label: isAr ? "الأسئلة الشائعة" : "FAQ" },
    { href: `/${locale}/contact`, label: isAr ? "اتصل بنا" : "Contact" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Link href={`/${locale}`} className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">
            M
          </div>
          <span className="text-xl font-bold tracking-tight">MPLOYEDIN</span>
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
          <Link href={locale === "en" ? "/ar" : "/en"}>
            <Button variant="ghost" size="sm">
              {locale === "en" ? "العربية" : "English"}
            </Button>
          </Link>
          <Link href={`/${locale}/login`}>
            <Button variant="ghost" size="sm">
              {isAr ? "تسجيل الدخول" : "Login"}
            </Button>
          </Link>
          <Link href={`/${locale}/register`}>
            <Button size="sm">
              {isAr ? "سجل الآن" : "Get Started"}
            </Button>
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
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
            <div className="flex gap-2">
              <Link href={`/${locale}/login`} className="flex-1">
                <Button variant="outline" size="sm" className="w-full">
                  {isAr ? "تسجيل الدخول" : "Login"}
                </Button>
              </Link>
              <Link href={`/${locale}/register`} className="flex-1">
                <Button size="sm" className="w-full">
                  {isAr ? "سجل الآن" : "Get Started"}
                </Button>
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
