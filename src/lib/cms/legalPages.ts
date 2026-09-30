/**
 * The legal pages the public site has a route for. Static Pages in the
 * admin CMS edits exactly these: a page with any other slug had no URL, so
 * "Add New" only ever produced orphans (e.g. "Audit Dynamic Page").
 *
 * `title`/`titleAr` seed a page that is missing from the database; once it
 * exists, the admin's saved title wins.
 */
export const LEGAL_PAGES = [
  { slug: "privacy-policy", path: "/privacy", title: "Privacy Policy", titleAr: "سياسة الخصوصية" },
  { slug: "terms-and-conditions", path: "/terms", title: "Terms & Conditions", titleAr: "الشروط والأحكام" },
  { slug: "cookie-policy", path: "/cookies", title: "Cookie Policy", titleAr: "سياسة ملفات تعريف الارتباط" },
  { slug: "gdpr", path: "/gdpr", title: "GDPR & Data Protection", titleAr: "حماية البيانات (GDPR)" },
  { slug: "accessibility-statement", path: "/accessibility", title: "Accessibility Statement", titleAr: "بيان إمكانية الوصول" },
] as const;

export type LegalPage = (typeof LEGAL_PAGES)[number];
export type LegalPageSlug = LegalPage["slug"];

export const LEGAL_PAGE_SLUGS: LegalPageSlug[] = LEGAL_PAGES.map((page) => page.slug);

export function isLegalPageSlug(slug: string): slug is LegalPageSlug {
  return (LEGAL_PAGE_SLUGS as string[]).includes(slug);
}

export function legalPageBySlug(slug: string): LegalPage | undefined {
  return LEGAL_PAGES.find((page) => page.slug === slug);
}
