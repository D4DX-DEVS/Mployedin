# SEO Implementation Plan — mployedin.vercel.app

Audit date: 2026-04-15
SEO Health Score at start: **32/100**

---

## Status Legend
- [ ] Pending
- [x] Done
- [!] Skipped (reason noted)

---

## Critical Fixes

- [x] **Middleware matcher** — Added `robots\.txt|sitemap\.xml|llms\.txt` exclusion in `src/proxy.ts:204`
- [x] **public/robots.txt** — Created with crawler directives + sitemap reference
- [x] **public/llms.txt** — Created with AI crawler consent + public page index
- [x] **sitemap.ts BASE_URL** — Fixed fallback from `mployedin.com` → `mployedin.vercel.app` in `src/app/sitemap.ts:5`

## High Priority

- [x] **Canonical + hreflang + OG tags** — Added to `src/app/[locale]/layout.tsx` metadata
- [x] **Unique page metadata** — Added `generateMetadata` to:
  - `src/app/[locale]/(public)/page.tsx` (landing page)
  - `src/app/[locale]/(public)/blog/layout.tsx` (new file)
  - `src/app/[locale]/(public)/contact/layout.tsx` (new file)
  - `src/app/[locale]/(public)/faq/layout.tsx` (new file)
  - `src/app/[locale]/(public)/privacy/layout.tsx` (new file)
  - `src/app/[locale]/(public)/cookies/layout.tsx` (new file)
  - `src/app/[locale]/(public)/jobs/page.tsx` — already had metadata ✓
- [x] **JSON-LD structured data** — Organization + WebSite + SoftwareApplication schema added to `src/app/[locale]/(public)/layout.tsx`

## Medium Priority (future)

- [ ] Convert `"use client"` public pages (blog, faq, contact) to SSR/ISR for AI crawler visibility
- [ ] Create real marketing landing page at `/en` before login redirect
- [ ] Add `og:image` PNG (1200×630) to `/public/og-image.png`
- [ ] Add `JobPosting` schema to individual job pages

## Low Priority (future)

- [x] Set `NEXT_PUBLIC_APP_URL` in Vercel environment variables ✓
- [ ] Configure custom domain (`mployedin.com`) in Vercel dashboard
- [ ] Switch root 307 redirect → 301 permanent
- [ ] Build external brand signals (YouTube, LinkedIn, Reddit)
- [ ] Add Cache-Control headers for public pages

---

## Files Changed (no logic touched)

| File | Type | What changed |
|------|------|-------------|
| `src/proxy.ts` | Edit | 1-line: added SEO files to matcher exclusion |
| `src/app/sitemap.ts` | Edit | 1-line: fixed BASE_URL fallback |
| `src/app/[locale]/layout.tsx` | Edit | Extended metadata object (head tags only) |
| `src/app/[locale]/(public)/page.tsx` | Edit | Added `generateMetadata` export |
| `src/app/[locale]/(public)/layout.tsx` | Edit | Added JSON-LD structured data |
| `src/app/[locale]/(public)/blog/layout.tsx` | Create | Metadata-only server layout |
| `src/app/[locale]/(public)/contact/layout.tsx` | Create | Metadata-only server layout |
| `src/app/[locale]/(public)/faq/layout.tsx` | Create | Metadata-only server layout |
| `src/app/[locale]/(public)/privacy/layout.tsx` | Create | Metadata-only server layout |
| `src/app/[locale]/(public)/cookies/layout.tsx` | Create | Metadata-only server layout |
| `public/robots.txt` | Create | New file |
| `public/llms.txt` | Create | New file |
