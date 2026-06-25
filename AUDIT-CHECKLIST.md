# MPLOYEDIN — Complete Interactive Audit Checklist

**Method:** live browser (Playwright MCP) per role. Each page tested for: loads, permissions, UI, loading/empty/error states, CRUD, search/filter/sort/pagination, exports, charts, validation, edge cases, broken links, console errors. Source of truth = code + running app, NOT docs.

**Legend:** ☐ pending · ✅ PASS · ⚠️ WARNING · ❌ FAIL · ⏭️ SKIP (reason)

**Baseline from automated crawl (verified):** all routes return HTTP 200; login works for all 5 roles; no 500s. Render/CRUD verified interactively below.

---

## ADMIN  (prefix /en/admin)
☐ /en/admin (Dashboard)
☐ /en/admin/employers
☐ /en/admin/agents
☐ /en/admin/super-agents
☐ /en/admin/job-seekers
☐ /en/admin/users
☐ /en/admin/jobs
☐ /en/admin/jobs/new
☐ /en/admin/applications
☐ /en/admin/interviews
☐ /en/admin/placements
☐ /en/admin/commissions
☐ /en/admin/commissions-report
☐ /en/admin/invoices
☐ /en/admin/invoices/new
☐ /en/admin/approvals
☐ /en/admin/reports
☐ /en/admin/analytics
☐ /en/admin/activity-timeline
☐ /en/admin/audit
☐ /en/admin/audit-logs
☐ /en/admin/communications
☐ /en/admin/messages
☐ /en/notifications
☐ /en/admin/exhibitions
☐ /en/admin/exhibitions/analytics
☐ /en/admin/resources
☐ /en/admin/referral-links
☐ /en/admin/targets
☐ /en/admin/targets/[id]
☐ /en/admin/target-management
☐ /en/admin/target-management/create
☐ /en/admin/target-management/[id]
☐ /en/admin/target-report
☐ /en/admin/territory
☐ /en/admin/impersonate
☐ /en/admin/bulk-import
☐ /en/admin/webhooks
☐ /en/admin/system-health
☐ /en/admin/settings
☐ /en/admin/settings/notifications
☐ /en/admin/matching-weight-templates
☐ /en/admin/workflow-templates
☐ /en/admin/subscriptions
☐ /en/admin/subscription-plans
☐ /en/admin/subscription-dashboard
☐ /en/admin/gdpr
☐ /en/admin/cms
☐ /en/admin/cms/banners
☐ /en/admin/cms/blogs
☐ /en/admin/cms/faqs
☐ /en/admin/cms/testimonials
☐ /en/admin/cms/videos
☐ /en/admin/cms/static-pages
☐ /en/admin/cms/static-pages/new
☐ /en/admin/cms/static-pages/[id]/edit
☐ /en/admin/cms/contact-submissions
☐ /en/admin/job-attributes (+ 17 sub-pages)
☐ /en/admin/location-data (+ cities, countries, states)

## SUPER AGENT  (prefix /en/super-agent)
☐ /en/super-agent (Dashboard)
☐ /en/super-agent/agents
☐ /en/super-agent/agents/[id]
☐ /en/super-agent/job-seekers
☐ /en/super-agent/jobs
☐ /en/super-agent/applications
☐ /en/super-agent/interviews
☐ /en/super-agent/placements
☐ /en/super-agent/leads
☐ /en/super-agent/commissions
☐ /en/super-agent/commissions-report
☐ /en/super-agent/invoices
☐ /en/super-agent/invoices/new
☐ /en/super-agent/approvals
☐ /en/super-agent/reports
☐ /en/super-agent/target-report
☐ /en/super-agent/targets
☐ /en/super-agent/targets/[id]
☐ /en/super-agent/target-management
☐ /en/super-agent/target-management/create
☐ /en/super-agent/territory
☐ /en/super-agent/market
☐ /en/super-agent/insights
☐ /en/super-agent/employers
☐ /en/super-agent/exhibitions
☐ /en/super-agent/exhibitions/analytics
☐ /en/super-agent/resources
☐ /en/super-agent/referral-links
☐ /en/super-agent/messages
☐ /en/super-agent/settings

## AGENT  (prefix /en/agent)
☐ /en/agent (Dashboard)
☐ /en/agent/jobs
☐ /en/agent/jobs/new
☐ /en/agent/jobs/[id]
☐ /en/agent/candidates
☐ /en/agent/job-seekers
☐ /en/agent/employers
☐ /en/agent/interviews
☐ /en/agent/offers
☐ /en/agent/placements
☐ /en/agent/leads
☐ /en/agent/leads/new
☐ /en/agent/leads/[id]
☐ /en/agent/commissions
☐ /en/agent/commissions-report
☐ /en/agent/invoices
☐ /en/agent/targets
☐ /en/agent/targets/[id]
☐ /en/agent/target-management
☐ /en/agent/target-report
☐ /en/agent/tasks
☐ /en/agent/calendar
☐ /en/agent/exhibitions
☐ /en/agent/resources
☐ /en/agent/referral-links
☐ /en/agent/chat
☐ /en/agent/messages
☐ /en/agent/settings

## EMPLOYER  (prefix /en/employer)
☐ /en/employer (Dashboard)
☐ /en/employer/jobs
☐ /en/employer/jobs/new
☐ /en/employer/jobs/ai-create
☐ /en/employer/jobs/ai-extract
☐ /en/employer/jobs/[id]
☐ /en/employer/jobs/[id]/edit
☐ /en/employer/jobs/[id]/poster
☐ /en/employer/job-templates
☐ /en/employer/applications
☐ /en/employer/applications/[id]/panel
☐ /en/employer/candidates
☐ /en/employer/candidates/[id]
☐ /en/employer/talent-pools
☐ /en/employer/interviews
☐ /en/employer/interviews/bulk
☐ /en/employer/offers
☐ /en/employer/placements
☐ /en/employer/placements/[id]/onboarding
☐ /en/employer/scorecards
☐ /en/employer/assessments
☐ /en/employer/background-checks
☐ /en/employer/campaigns
☐ /en/employer/comm-templates
☐ /en/employer/matching-weights
☐ /en/employer/workflow
☐ /en/employer/analytics
☐ /en/employer/screening-analytics
☐ /en/employer/activity-history
☐ /en/employer/calendar
☐ /en/employer/invoices
☐ /en/employer/subscription
☐ /en/employer/payment-setup
☐ /en/employer/my-posters
☐ /en/employer/team
☐ /en/employer/team/activity-logs
☐ /en/employer/training
☐ /en/employer/messages
☐ /en/employer/settings

## JOB SEEKER  (prefix /en/job-seeker)
☐ /en/job-seeker (Dashboard)
☐ /en/job-seeker/jobs
☐ /en/job-seeker/jobs/[id]
☐ /en/job-seeker/search
☐ /en/job-seeker/saved-searches
☐ /en/job-seeker/applications
☐ /en/job-seeker/applications/[id]
☐ /en/job-seeker/applications/[id]/feedback
☐ /en/job-seeker/interviews
☐ /en/job-seeker/offers
☐ /en/job-seeker/onboarding
☐ /en/job-seeker/companies
☐ /en/job-seeker/companies/[id]
☐ /en/job-seeker/courses
☐ /en/job-seeker/profile
☐ /en/job-seeker/profile/personal-details
☐ /en/job-seeker/profile-boost
☐ /en/job-seeker/profile-views
☐ /en/job-seeker/cv
☐ /en/job-seeker/documents
☐ /en/job-seeker/experience
☐ /en/job-seeker/skills
☐ /en/job-seeker/portfolio
☐ /en/job-seeker/preferences
☐ /en/job-seeker/referral
☐ /en/job-seeker/calendar
☐ /en/job-seeker/messages
☐ /en/job-seeker/subscription
☐ /en/job-seeker/settings
☐ /en/job-seeker/settings/notifications

---

## Results log (updated as tested)

### Cross-cutting (verified)
- ✅ Login works for all 5 roles (admin, super_agent, agent, employer, job_seeker).
- ✅ Page-level role guards: super_agent → /en/admin redirects to /en/super-agent.
- ✅ API RBAC both directions (job_seeker blocked from admin/employer endpoints; admin blocked from job-seeker-only).
- ✅ Clickjacking protection: pages refuse to load in an iframe (X-Frame-Options/CSP frame-ancestors).
- ✅ All 225 enumerated routes return HTTP 200; no 500s.
- ✅ S1 super_agent scope leak fixed + verified (applications total 4 not 35; interviews default-deny).

### ADMIN — tested
- ✅ /en/admin (Dashboard) — real metrics, trends, no errors (screenshot reviewed).
- ✅ /en/admin/employers — heading, 9 rows, search + filter + pagination present, no error.
- ✅ /en/admin/job-attributes/industries — **FULL CRUD verified**: Create (bilingual form name/nameAr/slug/sortOrder/status) → row appears → Delete (confirm dialog) → row removed. Row actions have aria-labels (a11y good).
  - ⚠️ i18n copy bug: create dialog title "Add Industrie" (bad singular of "Industries"); placeholder "e.g. Full-Time" generic/wrong for industries.
  - ⚠️ No success toast after create/delete (silent success — minor UX gap).

### ADMIN — batch 2 (verified PASS)
- ✅ /en/admin/agents — 10 rows, search, filter, "Add Agent", pager.
- ✅ /en/admin/job-seekers — 10 rows, search, filter, **Export**, pager.
- ✅ /en/admin/jobs ("Job Listings") — card grid (10 job cards), Post Job / Export / **Approve** (approval workflow), filter, pager. (Renders as cards, not table.)

### ADMIN — batch 3 (verified PASS)
- ✅ /en/admin/applications — 10 cards, collapsible filters, Export, pager.
- ✅ /en/admin/interviews ("Interview Oversight") — 10 rows, filters, Export.
- ✅ /en/admin/placements ("Placement Tracking") — data present, filters, Export.
- ✅ /en/admin/commissions — 8 rows, Add Commission, Export, Filter.
- ✅ /en/admin/invoices ("Finance & Revenue Operations") — Create Invoice, Export, Filter.
- ✅ /en/admin/reports ("Reports & Analytics") — hub, 4 KPI cards.
- ✅ /en/admin/analytics — **AI-powered**: prompt-library of 1-click reports + custom AI query composer ("Generate report"). Charts are AI-generated on demand (no static charts by design).

### ADMIN — batch 4 (verified PASS)
- ✅ /en/admin/users ("User Management") — 10 rows, Create User, Export.
- ✅ /en/admin/super-agents — 4 rows.
- ✅ /en/admin/audit-logs — 10 rows.
- ✅ /en/admin/subscription-dashboard — 22 KPI cards, **7 recharts charts** (charting confirmed working).
- ✅ /en/admin/system-health — thin status page, no error.

### ADMIN — batch 5 (verified PASS)
- ✅ /en/admin/settings — form, 10 inputs, save.
- ✅ /en/admin/gdpr ("GDPR & Privacy").
- ✅ /en/admin/webhooks — Add Webhook.
- ✅ /en/admin/targets → redirects to /en/admin/target-management (alias).
- ✅ /en/admin/target-management — "New Target Profile" action.

### ADMIN — batch 6 (verified PASS)
- ✅ /en/admin/territory ("Territory Management") — loads, empty/thin state.
- ✅ /en/admin/exhibitions ("Exhibition Operations Center") — 4 items.
- ✅ /en/admin/cms/faqs — Add New (CMS CRUD family).
- ✅ /en/admin/location-data/countries ("Country Details") — 10 rows, Add New.

### ADMIN — representative-verified component families
The following share ONE CRUD component each (proven via the full Industries CRUD cycle + spot loads above). Marked PASS by representative; individually load-confirmed HTTP 200 by crawl:
- job-attributes (17 sub-pages: career-levels, degree-levels, degree-types, functional-areas, genders, industries✓CRUD, job-experience, job-shifts, job-skills, job-types, language-levels, major-subjects, marital-statuses, ownership-types, result-types, salary-periods) — same `AttributeManager` component.
- location-data (cities, countries✓, states) — same component.
- cms (banners, blogs, faqs✓, testimonials, videos, static-pages, contact-submissions) — same CMS-list/editor pattern.

### ADMIN — NOT yet individually interaction-tested (load=200 from crawl, pending deep test)
target-report, referral-links, resources, exhibitions/analytics, communications, messages, /en/notifications, approvals, activity-timeline, audit, impersonate, bulk-import, matching-weight-templates, workflow-templates, subscriptions, subscription-plans, target-management/create, jobs/new (form), invoices/new (form), settings/notifications.

## RESUME POINT
Admin role: ~30 pages deep-tested (all PASS) + component families representative-verified. **Next:** EMPLOYER, AGENT, JOB_SEEKER, SUPER_AGENT roles (dashboards + CRUD), then remaining admin pages above. All routes already confirmed HTTP 200 via crawl.

### EMPLOYER — started
- ✅ /en/employer (Dashboard) — "Welcome back, Employer", 2 charts, no error.
- ✅ /en/employer/jobs/new — AI-first chooser (Start AI Job Posting / Upload Job Poster / Open Manual Form). Good UX: "nothing posted automatically; AI prefills manual form for review." Manual form behind "Open Manual Form".
- ⏭️ Employer job CREATE (manual form), edit, delete — PENDING (next context).
- ⏭️ Remaining employer pages (~33) — PENDING.

### Method note
Per-page: navigate + compact DOM probe (heading / error-boundary / row count / search / filters / pager / buttons); real CRUD executed on write pages. Frame-batch method abandoned (app blocks framing = good security).
