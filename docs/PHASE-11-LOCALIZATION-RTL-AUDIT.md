# Phase 11 - Localization (i18n) & Arabic RTL Audit

**Date:** 2026-06-04  
**Environment:** Local Next.js dev server at `http://localhost:3000`  
**Locales tested:** English (`/en`) and Arabic (`/ar`)  
**Static route inventory:** 227 locale page files under `src/app/[locale]`  
**Message catalog inventory:** 3,656 English keys and 3,656 Arabic keys

## Executive Summary

The platform has the foundation for Arabic localization: locale-prefixed routing works, `lang`/`dir` are set, Arabic message catalogs have full key parity, the dashboard shell moves the sidebar to the right in RTL, and several employer workflows are mostly localized.

However, the platform is **not ready for Arabic-speaking users in GCC countries**. Large user-facing areas still render English inside `/ar` routes, including public job search, the auth marketing panel, employer registration, admin dashboards, super-agent/agent dashboards, job-seeker dashboards, admin tables, and the job posting wizard. Several public pages are also incorrectly protected by middleware and redirect to login in Arabic.

## Coverage Notes

This audit combined:

- Full static catalog comparison for `messages/en.json` and `messages/ar.json`.
- Full App Router page inventory count across 227 locale pages.
- Hands-on browser testing across public pages, auth pages, admin, super-agent, agent, employer, and job-seeker roles.
- Language switching tests before and after login.
- Permission redirect test for an employer attempting an admin route.
- RTL layout checks for sidebars, tables, filters, forms, pagination, and the job posting flow.

I did not complete a literal click-through of every dynamic ID route and every modal state. During mobile testing, the local dev server became unresponsive on Arabic employer job routes and had to be restarted. The findings below are still enough to block Arabic production readiness.

## Translation Quality Audit

### Catalog Findings

| Check | Result | Risk |
|---|---:|---|
| English keys | 3,656 | - |
| Arabic keys | 3,656 | Good key parity |
| Missing Arabic keys | 0 | Good |
| Extra Arabic keys | 0 | Good |
| Arabic strings with Latin fragments | 162 | Many are ICU placeholders or accepted brands, but several are visible mixed-language defects |
| Identical English/Arabic values | 13 | Some are acceptable placeholders/brands; others should be localized or reviewed |
| Placeholder mismatches | 7 | High risk for runtime formatting bugs or inconsistent counts |
| Arabic expansion risk | 5 catalog strings | Needs UI verification in compact controls |

### High-Impact Translation Findings

| Page | English Text | Arabic Text | Issue | Recommendation |
|---|---|---|---|---|
| `/ar/login`, `/ar/register`, `/ar/forgot-password` | `Elevate your hiring pipeline with a sharper command center.` | English shown | Auth layout marketing panel is hardcoded in `src/app/[locale]/(auth)/layout.tsx`. | Move auth layout copy to `next-intl` and add Arabic copy written for GCC recruiters. |
| `/ar/forgot-password` | `Forgot password?`, `Email address`, `Send reset link`, `Back to sign in` | English shown | Forgot-password page is hardcoded in `src/app/[locale]/(auth)/forgot-password/page.tsx`. | Replace all visible text, placeholders, and button labels with translation keys. |
| `/ar/employer-register` | `Register Your Company`, `Company Details`, `Company Name`, `Select industry` | English shown | Employer registration page is hardcoded and redirects verify email to `/en/verify-email`. | Localize all form labels and route with the active locale. |
| `/ar/jobs` | `Find your next opportunity`, `Search`, `Verified`, `Negotiable`, `yrs` | English shown | Public jobs page hardcodes most visible text in `src/app/[locale]/(public)/jobs/page.tsx`. | Add `publicJobs.*` translations and localize salary/date/status labels. |
| `/ar/companies` | N/A | Redirects to Arabic login | Public companies page is not listed in `PUBLIC_ROUTES`. | Add `/companies` to public route allowlist. |
| `/ar/terms` | N/A | Redirects to Arabic login | Public terms page is not listed in `PUBLIC_ROUTES`. | Add `/terms` to public route allowlist. |
| `/ar/gdpr` | N/A | Redirects to Arabic login | Public GDPR page is not listed in `PUBLIC_ROUTES`. | Add `/gdpr` to public route allowlist. |
| `/ar/salary-explorer` | N/A | Redirects to Arabic login | Public salary explorer page is not listed in `PUBLIC_ROUTES`. | Add `/salary-explorer` to public route allowlist and localize the page. |
| `/ar/agent-register` | N/A | Redirects to Arabic login | Agent registration exists under auth but is not public in middleware. | Add `/agent-register` to public route allowlist or remove the public entry point. |
| `/ar/admin` | `Admin Dashboard`, `Platform overview`, `SYSTEM WATCH`, `TOTAL USERS` | English shown | Admin dashboard shell is RTL but content is hardcoded English. | Add admin dashboard namespace and localize all KPI/card copy. |
| `/ar/admin/users` | `USER`, `ROLE`, `STATUS`, `LOCALE`, `JOINED`, `ACTIONS` | English shown | Table headers and management copy are not localized. | Localize table column definitions and action labels. |
| `/ar/admin/job-attributes/career-levels` | `Career Levels`, `Filter`, `Add New`, `NAME`, `SLUG`, `ORDER` | English shown | Page passes `titleAr` but uses English `title` and English shared table copy. | Make `JobAttributePage` locale-aware and use `titleAr`/translated column labels. |
| `/ar/super-agent/agents` | `Agent Performance`, `Compare output`, `EMAIL`, `Conversions`, `Placements` | English shown | Super-agent operational pages are mostly English. | Localize super-agent dashboard namespaces and table columns. |
| `/ar/agent/invoices` | `My Invoices & Commissions`, `INVOICE #`, `TOTAL`, `PAID`, `BALANCE` | English shown | Agent finance workflow remains English. | Localize invoice tables, finance terminology, and empty states. |
| `/ar/employer/jobs/new` | `Create a Job Posting`, `Start AI Job Posting`, `Upload Job Poster`, `Manual posting` | Mostly English shown | Entry page is partially translated, but still contains hardcoded English. | Complete `employerJobNew` keys and remove hardcoded button text. |
| `/ar/employer/jobs/new?mode=manual` | `Post a New Job`, `Basic Info`, `Salary & Settings`, `Screening Questions` | English shown | Job wizard is hardcoded in `JobFormWizard.tsx`; stepper overflow observed. | Localize the wizard and shorten/adapt Arabic step labels for mobile. |
| `/ar/job-seeker/jobs` | `Browse AI-matched jobs faster.`, `Keep the list relevant.` | English shown | Job-seeker job discovery page is not localized. | Add job-seeker jobs namespace and localize filters/cards/actions. |
| `/ar/job-seeker/applications` | `My Applications`, `Total`, `Active`, `Progress`, `Applied` | English shown | Application workflow remains English. | Use Arabic workflow terms such as `طلباتي`, `نشطة`, `قيد المراجعة`. |
| `/ar/job-seeker/cv` | `CV Builder`, `EXPERIENCE`, `EDUCATION`, `SKILLS` | English shown | CV builder content and section headers are English. | Localize CV builder and use Arabic section names while keeping `CV` as accepted GCC term if desired. |

### Terminology Quality Findings

| English Text | Current Arabic | Issue | Recommendation |
|---|---|---|---|
| Applications | `الطلبات` | Ambiguous; can mean generic requests. | Use `طلبات التقديم` or `طلبات التوظيف` depending on context. |
| Agents | `الوكلاء` | Literal and not natural in recruitment context. | Use `مسؤولو التوظيف`, `مندوبي التوظيف`, or define a product term consistently. |
| Super Agents | `الوكلاء الكبار` | Literal and awkward. | Use `كبار مسؤولي التوظيف` or `المشرفون الإقليميون`. |
| Placements | `التوظيفات` | Understandable but less professional. | Use `التعيينات` or `حالات التعيين`. |
| Filter | `فلتر` | Colloquial/loanword. | Prefer `تصفية` for professional UI. |
| CV Builder | `بناء السيرة الذاتية` | Understandable, but GCC product UX often uses `CV`. | Use `منشئ السيرة الذاتية` or `منشئ CV`. |
| Job Seekers | `الباحثون عن عمل` | Good. | Keep. |
| Leads | `العملاء المحتملون` | Good for B2B sales/employer leads. | Keep, but avoid using it for candidates. |

## RTL Audit

### What Works

- `/ar` pages receive `lang="ar"` and `dir="rtl"` from `src/app/[locale]/layout.tsx`.
- Dashboard sidebars move to the right in Arabic.
- Employer dashboard, employer jobs list, employer candidates, employer team, and employer filters are mostly usable in RTL.
- Pagination in the admin job-attributes table showed Arabic numerals and Arabic labels.
- Date/time picker code contains explicit RTL chevron handling.
- Role-based redirects preserve Arabic locale: employer access to `/ar/admin/users` redirected back to `/ar/employer` with RTL intact.

### Broken or Risky RTL Areas

| Component / Area | Evidence | Issue | Recommendation |
|---|---|---|---|
| Tables | `TableHead` uses `text-left`; admin tables render English uppercase headers. | Headers and cells do not adapt alignment semantically. | Use `text-start`, logical padding, and localized column labels. |
| Search controls | `TableToolbar` places search icon with `left-3` and input padding `pl-9`. | Icon appears on the LTR side in RTL search fields. | Use `start-3`, `ps-9`, `pe-*` logical utilities or `isRtl` class switching. |
| Select menu items | `SelectItem` uses `pl-9 pr-3` and indicator `left-2`. | Checkmark/indicator remains left in RTL. | Use logical start/end placement. |
| Dropdown menu submenus | `ChevronRight`, `ml-auto`, `pl-8`, and left-positioned indicators are fixed LTR. | Submenu arrows and selected indicators are wrong in Arabic. | Flip chevrons and use `ms-auto`, `ps-*`, `start-*`. |
| Dialogs | Close button is `right-4`; header is `sm:text-left`; footer uses `sm:space-x-2`. | Modal close/header/footer alignment is LTR in Arabic. | Use logical positioning, `text-start`, and direction-aware footer ordering. |
| Auth layout | Marketing panel uses `border-r`, English text, and LTR composition. | Arabic auth pages look like English pages wrapped in RTL. | Localize panel and mirror border/visual alignment. |
| Job posting stepper | `Screening Questions` overflow observed. | Long labels overflow compact steps; Arabic will be longer once translated. | Use shorter Arabic labels, wrapping, or vertical/mobile stepper. |
| Finance/admin tables | Overflow observed on admin users, job seekers, interviews, invoices, super-agent invoices. | Wide tables are not optimized for Arabic/mobile. | Add responsive column priority, horizontal scroll affordance, and localized shorter labels. |

## UI Component RTL Validation

| Component | Status | Notes |
|---|---|---|
| Forms | Mixed | Employer jobs filters are mostly Arabic; employer registration, forgot-password, and job wizard are English. |
| Tables | Broken | Admin, super-agent, agent, invoice, and job-attribute tables show English headers and fixed LTR alignment. |
| Cards | Mixed | Employer dashboard cards are mostly localized; admin/super-agent/agent/job-seeker cards are English-heavy. |
| Charts | Mixed | Employer chart labels include English month abbreviations (`Jan`, `Feb`, etc.). |
| Notifications/toasts | Not fully exercised | Message catalog has notification translations, but live toast coverage was not exhaustive. |
| Date pickers | Likely pass | Source includes RTL chevron switching. Needs end-to-end date-picker click verification. |
| Pagination | Mostly pass | Admin job-attributes pagination showed Arabic labels and Arabic numerals. |
| Search | Mixed | Employer search placeholders are Arabic; shared toolbar icon/padding are LTR. |
| Filters | Mixed | Employer filters are Arabic; admin filters often English. |
| Modals | Broken/risky | Dialog primitive uses fixed right close button and LTR header/footer classes; job-template modal text is English. |

## Arabic Content Expansion Audit

Observed expansion/overflow risks:

- `/ar/super-agent/agents`: overflow count 4.
- `/ar/super-agent/invoices`: overflow count 5.
- `/ar/admin/users`, `/ar/admin/job-seekers`, `/ar/admin/interviews`, `/ar/admin/invoices`: overflow observed in table-heavy pages.
- `/ar/employer/jobs/new?mode=manual`: stepper label `Screening Questions` overflowed even before Arabic translation.
- Mobile test of the Arabic employer job form caused the route/server to hang in local dev; direct HTTP requests to employer job routes timed out until the dev server was restarted.

Catalog expansion risks include:

| Key | English | Arabic | Risk |
|---|---|---|---|
| `skillsCoach.title` | `AI Skills Coach` | `مدرب المهارات بالذكاء الاصطناعي` | Long title in compact cards/buttons. |
| `emailDraft.title` | `AI Email Draft` | `مسودة بريد إلكتروني بالذكاء الاصطناعي` | Long modal/tab title. |
| `employerPaymentSetup.gatewayTapRegions` | `GCC / MENA` | `دول الخليج / الشرق الأوسط وشمال أفريقيا` | Very long region label. |
| `employerAiExtract.title` | `AI Job Extractor` | `مستخرج الوظائف بالذكاء الاصطناعي` | Long page/tool title. |

## Language Switching Audit

| Scenario | Result | Notes |
|---|---|---|
| English landing to Arabic landing | Pass | `/en` language link navigates to `/ar`; stable page is Arabic with `dir=rtl`. |
| Arabic refresh | Pass | Arabic route remained `/ar` after refresh. |
| Arabic route navigation | Partial | Locale prefix persists, but many pages still show English content. |
| Login from `/ar/login` | Pass | Super-agent, agent, employer, and job-seeker logins redirected to `/ar/<role>`. |
| Language persists across roles | Partial | URL locale persists, but role dashboards vary from mostly Arabic to mostly English. |
| Permission redirect in Arabic | Pass | Employer attempting `/ar/admin/users` redirected to `/ar/employer`. |
| Flashing or broken route behavior | Risk | Next dev logs showed repeated RSC fetch failures through the CSRF fetch patch; employer job routes eventually hung locally. |

## Cross-Language Consistency Audit

| Feature | English | Arabic | Consistent? | Issue |
|---|---|---|---|---|
| Locale routing | `/en/*` works | `/ar/*` works | Yes | Content often not localized. |
| Public landing | English content | Arabic content | Mostly | Footer keeps English company/address fragments, acceptable if intentional. |
| Public jobs search | Functional | Functional | No | Arabic page uses English headings, placeholders, labels, job metadata. |
| Companies page | Public route expected | Redirects to login | No | Middleware allowlist missing `/companies`. |
| Terms/GDPR/salary explorer | Public route expected | Redirects to login | No | Middleware allowlist missing routes. |
| Auth login | Works | Works | Partial | Core form translated; marketing panel and some buttons stay English. |
| Forgot password | Works | Works | No | Arabic page is English. |
| Employer registration | Works | Works | No | Arabic page is English and routes verify email to `/en`. |
| Admin dashboard | Works | Works | No | Arabic shell only; page content/tables are English. |
| Super-agent dashboard | Works | Works | No | Arabic shell only; page content/tables are English. |
| Agent dashboard | Works | Works | No | Arabic shell only; page content/tables are English. |
| Employer dashboard | Works | Works | Mostly | Main employer areas are localized, with remaining names/month abbreviations. |
| Job-seeker dashboard | Works | Works | No | Many headings/cards/CV/applications remain English. |
| Role permissions | Redirects correctly | Redirects correctly | Yes | Employer forbidden admin route stayed Arabic. |
| Pagination | Works | Works | Mostly | One admin table showed localized pagination; broader table coverage needed. |
| Job posting workflow | Works | Works but English | No | Arabic route shows English entry page and English wizard. |

## Arabic User Experience Audit

**Arabic UX rating:** 4/10

The experience feels inconsistent. A native Arabic-speaking GCC user would see a professional Arabic shell in some places, then immediately hit English-heavy dashboards, form flows, table headers, and job search labels. Employer browsing is the strongest area, while admin, super-agent, agent, job-seeker, public jobs, and auth-support flows are not acceptable for production Arabic users.

Cultural/professional notes:

- Use recruitment-specific Arabic terms instead of literal role translations.
- Keep brand names and common technical acronyms in English where expected, but do not leave full UI sentences in English.
- Prefer formal Gulf-friendly UI Arabic: `تصفية`, `طلبات التقديم`, `التعيينات`, `مسؤولو التوظيف`.
- Review pluralization/count labels for Arabic grammar rather than using English count templates.

## Priority Fixes

1. Add missing public routes to `PUBLIC_ROUTES`: `/companies`, `/terms`, `/gdpr`, `/salary-explorer`, and likely `/agent-register`.
2. Localize all hardcoded English in auth pages and auth layout.
3. Localize `/ar/jobs` and all job metadata labels before public Arabic launch.
4. Localize admin, super-agent, agent, and job-seeker dashboard namespaces and table column definitions.
5. Localize employer job posting entry and `JobFormWizard` completely.
6. Convert shared UI primitives to logical RTL classes: `text-start`, `start-*`, `end-*`, `ps-*`, `pe-*`, `ms-*`, `me-*`.
7. Add Playwright Arabic smoke tests for each role dashboard and major workflow.
8. Add automated checks for hardcoded English in `/ar` snapshots and for document-level horizontal overflow.
9. Review Arabic terminology with a native GCC recruiter or Arabic UX writer.
10. Add runtime tests for ICU placeholder parity and Arabic plural messages.

## Final Localization Scores

| Category | Score | Rationale |
|---|---:|---|
| Translation Quality Score | 46/100 | Catalog key parity is strong, but major rendered pages still show English and several terms need professional review. |
| RTL Compliance Score | 61/100 | Global `dir=rtl` and sidebar placement work, but shared components still use fixed LTR classes. |
| Arabic UX Score | 43/100 | Employer areas are promising; most other roles feel unfinished or mixed-language. |
| Localization Readiness Score | 45/100 | Too many public, auth, dashboard, and workflow blockers remain. |

## GCC Readiness Decision

**Is this platform ready for Arabic-speaking users in GCC countries?**

**No.** The platform should not be launched as Arabic-ready yet. It needs a focused localization remediation pass across hardcoded UI, route guards, RTL component primitives, role dashboards, and Arabic recruitment terminology before it can provide a professional Arabic experience for GCC users.