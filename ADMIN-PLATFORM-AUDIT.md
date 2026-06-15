# MPLOYEDIN — Admin Full Platform Lifecycle Audit

**Audit type:** Live admin-perspective audit (Playwright-driven) + targeted code verification
**Environment:** Production build, `http://localhost:3100`
**Auditor account:** `admin@mployedin.com` (role `admin`, "Super Admin")
**Date:** 2026-06-15
**Scope:** ~80 admin pages, modals, workflows, reports, settings, permission screens, approval flows, system management
**Method:** Logged in as Admin; navigated every admin section; opened modals; created/exercised live records (AUDIT-prefixed where data was written); probed APIs for security; verified root causes in source where bugs were found. Cross-role security tested from a live employer session.

> Test data note: A live employer (`FinTech Wave`) was moved Unverified → Verified to exercise the verification workflow (reversible). No destructive actions (deletes, force role changes on real users) were executed. Two write attempts (Create User, AI report) failed due to product bugs, so no orphan records were created.

---

## 1. Executive Summary

Mployedin's admin surface is **unusually broad and visually mature** for a recruitment marketplace. It ships an action-oriented dashboard, a granular 24-resource × 7-action RBAC matrix, employer verification, job moderation, a full finance suite (commissions, invoices, subscriptions, targets, tax compliance), bilingual CMS, broadcast communications, AI analytics, GDPR tooling, audit logs with IP/geo, impersonation, system-health monitoring, bulk import, and webhooks. **Server-side authorization is genuinely strong** — every cross-role and privilege-escalation probe from an employer session was rejected with `403`.

However, the platform is **NOT production-ready as-is**. Two **CRITICAL functional defects** break core daily admin operations, both caused by the *same systemic pattern* — **frontend/backend enum drift** (the UI sends an enum value the backend Zod schema rejects):

1. **Create User is completely broken** — the form submits `permissionMode: "role_default"`, but the API only accepts `"default" | "custom"` → `HTTP 400`. Admins cannot create users through the UI.
2. **Admin AI Analytics is completely broken** — every one-click report sends `scope: "admin"`, but the API only accepts `"market" | "platform"` → `HTTP 400`. No AI report can run.

Both are small fixes but high blast-radius, and their shared root cause strongly implies **other unverified enum mismatches exist** across the codebase. There are also numerous trust/consistency issues: KPI counts disagree across pages, several routes are exact duplicates, internal developer tools are exposed in the production admin nav, employer verification requires zero documents, and there is no enforced pre-publication job moderation.

**Production Readiness Score: 58 / 100** → **NO-GO** until P0 items are fixed (estimated small effort, high impact).

---

## 2. Platform Walkthrough

| Area | Route(s) | State observed |
|------|----------|----------------|
| Dashboard | `/en/admin` | KPIs (270 users, 48 active jobs, 35 apps, 8 interviews), Quick Actions, Recent Activity, Platform Insights (Critical/Attention + Fix Now), Hiring Funnel, Jobs-vs-Apps trend, Users-by-Role |
| Users | `/en/admin/users` | 270 users, search/role/status filters, Export, Create User, bulk-select, inline role change, Manage permissions, Deactivate |
| Employers | `/en/admin/employers` | Verify, Edit, Deactivate, Delete permanently, Switch-to-workspace; verification modal with document review |
| Job Seekers | `/en/admin/job-seekers` | AI semantic search, Index AI, Download CVs, Export |
| Agents / Super Agents | `/en/admin/agents`, `/super-agents` | 10 agents, 4 super-agents, Add flows |
| Jobs | `/en/admin/jobs` | 59 jobs, Post/Approve/Reject/Edit/Delete, card layout |
| Approvals | `/en/admin/approvals` | "Platform Jobs Overview" queue |
| Applications / Interviews / Placements | `/en/admin/applications`, `/interviews`, `/placements` | 35 apps (avg AI score 70%), 8 interviews, 1 placement; AI Insights |
| Finance | `/en/admin/commissions`, `/commissions-report`, `/invoices`, `/subscription-plans`, `/subscriptions`, `/subscription-dashboard` | Commission engine, enterprise invoices w/ tax compliance, plan tiers, 36 active subs, 211,795 AED all-time revenue |
| Territory / Referrals / Targets | `/territory`, `/referral-links`, `/targets`, `/target-management`, `/target-report` | Territory empty; 7 referral links/14 regs; target profiles = 0 |
| CMS | `/en/admin/cms/*` | Blogs 0, FAQs 0, Testimonials 0, Videos 0, Banners 1, Static pages 4, Contact inbox 0; bilingual editors |
| Communications | `/messages`, `/communications` | DM + support tickets; broadcast center w/ audience targeting & templates |
| Analytics / Reports | `/analytics`, `/reports` | AI prompt library + custom query; funnel/demand/workload reporting |
| System | `/audit-logs`, `/audit`, `/activity-timeline`, `/gdpr`, `/impersonate`, `/system-health`, `/settings`, `/settings/notifications`, `/bulk-import`, `/webhooks`, `/workflow-templates`, `/matching-weight-templates` | 1,069 audit entries (IP+geo); GDPR requests/consent/retention; live system health; CSV import wizard; notification cron center |
| Master data | `/job-attributes/*`, `/location-data/*` | Bilingual industries/skills/etc.; countries w/ phone+currency |
| Other | `/exhibitions`, `/exhibitions/analytics`, `/resources`, `/poster-templates`, `/design-system`, `/tasks` | Exhibition ops; resource center; design-system + dev task board (internal) |

---

## 3. UX Findings

- **Generic validation errors.** The Create User modal returned only "Validation failed" while the API actually provided field-level `details`. Field-level errors are not surfaced/highlighted. (MED)
- **Loading shows "0" instead of skeletons.** Users page header flashes "0 total users" and the table briefly renders empty rows before data loads. (LOW)
- **Cross-page metric inconsistency.** Active jobs reported as 48 (dashboard), "ACTIVE 8" (jobs page tile), 62 (reports), 59 (jobs total); applications 35 vs "APPLICANTS 5" on jobs page; placements 0 (funnel) vs 1 (placements page). Admins cannot trust headline numbers. (MED)
- **Duplicate header render** on Activity Timeline (title/subtitle appear twice). (LOW)
- **Broken chart/asset on Subscriptions page** — console `404` + Recharts `width(-1)/height(-1)` warnings. (LOW)
- **Strong positives:** action-first dashboard with "Fix Now" CTAs, consistent workspace shell, bilingual EN/AR content editors, dark mode, global search (⌘K), AI prompt library.

---

## 4. Functional Gaps

- **No enforced pre-publication job moderation.** Jobs are `Active` by default; there is no `Pending`/`Under Review` status in the live data (0 pending). Approve/Reject is reactive only → low marketplace integrity control. (HIGH)
- **Employer verification requires no evidence.** "Verify Employer" succeeds with "No documents uploaded yet" — no document/checklist gating. (MED, fraud risk)
- **Territory management unused.** "No territories yet" → lead routing for the agent ecosystem is unconfigured; targets show 0 profiles. (MED)
- **Duplicate routes.** `/admin/audit` ≡ `/admin/audit-logs`; `/admin/targets` ≡ `/admin/target-management`. Maintenance + IA confusion. (LOW)
- **Internal dev tools exposed in production admin.** `/admin/design-system` and `/admin/tasks` ("development progress tracker", 0 of 0 tasks). (LOW)
- **Empty public content.** Blogs/FAQs/Testimonials/Videos all 0 records — public site trust/SEO surfaces are unpopulated. (MED)
- **No bulk actions on employers/jobs** beyond user-level bulk (users page has bulk select; employer/job moderation is per-row only). (MED at scale)

---

## 5. Security Findings

**Overall: strong server-side enforcement.** Live probes from an authenticated **employer** session (`sarah@techcorp.test`, role `employer`) on `http://localhost:3000`:

| Probe | Result |
|-------|--------|
| `GET /api/admin/users` | `403 Forbidden — insufficient permissions` ✅ |
| `GET /api/admin/audit-logs` | `403` ✅ |
| `GET /api/admin/settings` | `403` ✅ |
| `POST /api/admin/users` (create an admin) | `403` ✅ |
| `PATCH /api/admin/users` (self-escalate `role: admin`) | `403` ✅ |
| `POST /api/admin/impersonate` | `403` ✅ |

No IDOR, privilege escalation, or cross-role mutation succeeded at the admin boundary. Audit logging captures actor, action, resource, **IP address, and country** (1,069 entries, read-only).

**Residual concerns:**
- **Custom-permission admins not fully constrained.** `PHASE-2-SECURITY-AUDIT.md` documents that the admin user route uses `withAuth` without a `resource/action` guard, so a `permissionMode: "custom"` admin is not restricted by their custom matrix on that route. Combined with the enum-drift bug (below), the custom-permission path is effectively untested/unreliable. (HIGH — verify)
- **Impersonation** is correctly admin-gated; confirm every impersonation start/stop writes an audit-log entry and that impersonated sessions are visibly bandedand time-boxed. (MED — verify)
- CSRF: state-changing probes were rejected at the role layer before CSRF could be evaluated; the app uses `csrfFetch` elsewhere — confirm CSRF tokens are enforced on all admin mutations. (verify)

---

## 6. Revenue Risks

- **"Revenue this month = 0 AED"** on the Subscription Dashboard despite 36 active subscriptions and 211,795 AED all-time. Either monthly/MRR revenue is not computed, or all subscriptions are annual with no monthly recognition. Either way, admins have **no monthly revenue visibility**. (HIGH)
- **No revenue/MRR KPI on the main dashboard** — a marketplace operator's primary metric is absent from the landing view. (MED)
- **Currency mismatch.** Settings default currency is **INR (₹)** while revenue, plans, and invoices are denominated in **AED**. New billing artifacts could be created in the wrong currency. (MED, revenue leakage / billing correctness)
- **AI "Revenue & commission summary" report is broken** (see Bug #2) — finance leadership cannot self-serve revenue analytics. (HIGH)
- Targets/quota system shows **0 profiles** — agent revenue accountability is not operationalized. (MED)

---

## 7. Compliance Findings

- **GDPR tooling present** (data subject requests, consent logs, retention policies) but **0 requests** — unproven end-to-end; confirm export/erasure actually fulfills. (MED — verify)
- **Employer verification has no document trail requirement** — KYC/AML weakness for a cross-border (Gulf) recruitment marketplace. (MED)
- **Static legal pages exist** (Privacy, Terms, Cookie, GDPR) — good baseline. (OK)
- **Audit log captures IP + country** — supports compliance investigations. (OK)
- Confirm data residency and that audit logs are immutable/retained per policy. (verify)

---

## 8. AI Findings

- **CRITICAL: Admin AI Analytics is non-functional** (Bug #2). Every one-click prompt (`Platform growth`, `Top performing agents`, `Revenue & commission summary`, etc.) returns `400` because the page sends `scope: "admin"` while the validator accepts only `"market" | "platform"`.
- **AI surfaces that appear functional:** application AI match scoring (avg 70% shown), job-seeker semantic search ("Index AI"), AI Insights buttons, AI CV. These were observed but not deep-tested for accuracy.
- **Explainability/bias not assessable** while the primary AI analytics endpoint is down. Once fixed, evaluate: score provenance, prompt-injection hardening on the free-text custom query, and guardrails against hallucinated financial figures. (P1)

---

## 9. Scalability Findings (1k / 10k / 100k users)

- **Per-row-only moderation** (employers, jobs) does not scale — at 10k+ employers, verification and job approval need **bulk actions, queues, and SLAs**. (HIGH at scale)
- **No automation/rules engine** for verification, fraud scoring, or job moderation — all manual. Admin workload grows linearly with volume. (HIGH at scale)
- **Metric inconsistency + client-side counting** (jobs page counts statuses from the loaded page, not the platform) implies some aggregates are computed client-side; will mislead at scale. (MED)
- **Pagination present** (10/page) but no evidence of server-side cursor pagination or indexed search on large tables; verify query plans for `users`, `audit-logs` (1k+ already), `applications`. (MED — verify)
- **Polling pages** (jobs never reached network-idle) — confirm no expensive polling that multiplies load at scale. (LOW)
- **Positives:** system-health monitoring, webhooks for accounting offload, bulk CSV import, and a real audit pipeline are scalability-friendly foundations.

---

## 10. Competitive Analysis

| Capability | Mployedin | LinkedIn Recruiter / Indeed / Naukri / Foundit | Greenhouse / Lever / Workday |
|------------|-----------|-----------------------------------------------|------------------------------|
| Granular RBAC matrix | ✅ 24×7 (best-in-class breadth) | Partial | ✅ |
| Employer verification / KYC | ⚠️ no document gating | ✅ | ✅ |
| Job moderation queue + SLA | ❌ reactive only | ✅ | ✅ (approval chains) |
| Bulk ops at scale | ⚠️ users only | ✅ | ✅ |
| Commission/agent ecosystem | ✅ (rare, differentiator) | ❌ | ❌ |
| Subscription/billing + tax | ✅ | ✅ | ✅ |
| AI analytics (NL queries) | ⚠️ built but broken | Partial | Partial |
| Audit logs + impersonation | ✅ (IP/geo) | ✅ | ✅ |
| GDPR self-serve | ✅ tooling, ⚠️ unproven | ✅ | ✅ |
| Workflow/automation engine | ⚠️ templates only, no rules | ✅ | ✅ (strong) |
| Reporting trust/consistency | ❌ counts disagree | ✅ | ✅ |

**Differentiators:** agent/super-agent commission ecosystem, exhibition operations, bilingual EN/AR, granular RBAC.
**Gaps vs enterprise:** rules/automation engine, moderation queues with SLAs, trustworthy unified reporting, KYC depth, bulk operations.

---

## 11. Critical Issues (P0)

### C-1 — Create User is broken (enum drift on `permissionMode`)
- **Severity:** Critical
- **Business impact:** Admins cannot onboard any user (agent, employer, staff) via the UI. Core operation blocked.
- **Reproduction:** `/en/admin/users` → Create User → fill name/email/password → Create.
- **Expected:** User created (default permissions).
- **Actual:** `HTTP 400` `{"error":"Validation failed","details":[{"path":"permissionMode","message":"Invalid option: expected one of \"default\"|\"custom\""}]}`. UI shows only "Validation failed".
- **Root cause:** `src/lib/validators/admin.ts` `PERMISSION_MODES = ["default","custom"]` vs `src/types/user.ts` `PermissionMode = "role_default" | "custom"`; `src/components/shared/PermissionEditor.tsx:111` emits `onChange("role_default", {})`. Form posts `permissionMode: "role_default"` → rejected.
- **Recommended fix:** Align enums. Make the validator authoritative to the model: `PERMISSION_MODES = ["role_default","custom"]` in `admin.ts` (matches `User.ts`, `auth-helpers` default, and `usePermissions.ts`). Also surface `details` field errors in the modal.
- **URL:** `/en/admin/users`, `POST /api/admin/users`

### C-2 — Admin AI Analytics is broken (enum drift on `scope`)
- **Severity:** Critical
- **Business impact:** No admin can run any AI report (growth, agent performance, revenue/commission, employer activity, geo). Headline feature unusable.
- **Reproduction:** `/en/admin/analytics` → click any prompt card (e.g., "Top performing agents").
- **Expected:** AI report generated.
- **Actual:** `HTTP 400` `{"error":"Validation failed","details":[{"path":"scope","message":"Invalid option: expected one of \"market\"|\"platform\""}]}`. Request payload: `{"query":"...","scope":"admin"}`.
- **Root cause:** `src/app/[locale]/(dashboard)/admin/analytics/page.tsx:119` sends `scope: "admin"`; `src/lib/validators/ai.ts:20` `scope: z.enum(["market","platform"]).optional()`.
- **Recommended fix:** Send `scope: "platform"` (or omit) from the admin page, or add `"admin"` to the enum and handle it server-side.
- **URL:** `/en/admin/analytics`, `POST /api/ai/report`

### C-3 — No enforced pre-publication job moderation
- **Severity:** Critical (marketplace integrity)
- **Business impact:** Spam/fraudulent/non-compliant jobs go live immediately; brand and legal exposure.
- **Reproduction:** `/en/admin/jobs` → all jobs are `Active`/`Draft`; no `Pending`/`Under Review` state exists; 0 jobs awaiting approval.
- **Expected:** Employer/agent jobs enter a moderation queue before public listing (at least for new/unverified employers).
- **Actual:** Jobs publish by default; Approve/Reject is reactive only.
- **Recommended fix:** Introduce a `pending_review` status + gated publication for new/unverified employers; wire `/admin/approvals` to it with bulk actions and SLA timers.
- **URL:** `/en/admin/jobs`, `/en/admin/approvals`

### C-4 — No monthly/MRR revenue visibility
- **Severity:** Critical (financial operations)
- **Business impact:** Operator cannot see current revenue; "Revenue this month = 0 AED" with 36 active subs. Decision-making blind.
- **Reproduction:** `/en/admin/subscription-dashboard`.
- **Expected:** MRR, this-month revenue, churn, expansion.
- **Actual:** All-time 211,795 AED; this-month 0 AED; 0 expired/0 cancelled.
- **Recommended fix:** Implement monthly revenue recognition/MRR computation; add revenue KPI to main dashboard; verify subscription billing cycles.
- **URL:** `/en/admin/subscription-dashboard`, `/en/admin`

---

## 12. Medium Issues (P1)

- **M-1 — Cross-page metric inconsistency.** Active jobs 48 vs 8 vs 62; applications 35 vs 5; placements 0 vs 1. *Fix:* single source of truth for aggregates; server-computed counts. URLs: `/admin`, `/admin/jobs`, `/admin/reports`.
- **M-2 — Employer verification requires no documents.** *Fix:* require uploaded doc(s) + checklist before "Verify Employer" enables. URL: `/admin/employers`.
- **M-3 — Custom-permission admin route not guarded** (`PHASE-2-SECURITY-AUDIT.md`). *Fix:* add `resource/action` guard; add tests; fix after C-1 so the path is exercisable. URL: `POST/PATCH /api/admin/users`.
- **M-4 — Currency default mismatch (INR vs AED).** *Fix:* default to AED (or platform currency); validate invoice/plan currency consistency. URL: `/admin/settings`.
- **M-5 — Empty public content (blogs/FAQs/testimonials/videos = 0).** *Fix:* seed content; CMS is functional. URL: `/admin/cms/*`.
- **M-6 — Territory/targets unconfigured (0 territories, 0 target profiles).** *Fix:* onboarding/setup wizard; without it the agent ecosystem analytics are empty. URLs: `/admin/territory`, `/admin/targets`.
- **M-7 — GDPR fulfillment unproven.** *Fix:* end-to-end test export/erasure. URL: `/admin/gdpr`.
- **M-8 — No bulk moderation for employers/jobs.** *Fix:* add bulk verify/approve/reject. URLs: `/admin/employers`, `/admin/jobs`.
- **M-9 — Generic validation error UX.** *Fix:* render API `details` as field errors across admin modals.
- **M-10 — Systemic enum-drift risk.** *Fix:* audit all `z.enum` schemas vs client literals (C-1 and C-2 share this cause); add a shared enum source + contract tests.

---

## 13. Low Issues (P2)

- **L-1 — Duplicate routes:** `/admin/audit` ≡ `/admin/audit-logs`; `/admin/targets` ≡ `/admin/target-management`. *Fix:* redirect one to the other.
- **L-2 — Internal dev tools in prod admin:** `/admin/design-system`, `/admin/tasks`. *Fix:* gate behind a dev/feature flag.
- **L-3 — Activity Timeline duplicate header render.**
- **L-4 — Subscriptions page console `404` + Recharts size warnings.**
- **L-5 — "0 total users" loading flash** (use skeletons).
- **L-6 — Dashboard "Unknown" role rows** (3 users with null/invalid role) — data-quality cleanup + schema constraint.
- **L-7 — Font preload warnings** (`woff2 preloaded but not used`) across pages.

---

## 14. Production Readiness Score

| Dimension | Weight | Score | Notes |
|-----------|--------|-------|-------|
| Core admin functionality | 25 | 11/25 | Create User + AI analytics broken |
| Security & access control | 20 | 17/20 | Strong server-side authz; custom-perm path to verify |
| Revenue & finance ops | 15 | 7/15 | Rich suite but no MRR/monthly visibility, currency mismatch |
| Data integrity & reporting trust | 15 | 7/15 | Counts disagree across pages |
| Marketplace integrity & moderation | 10 | 4/10 | No pre-publication gating; weak KYC |
| Scalability & automation | 10 | 5/10 | Manual, per-row ops; good monitoring foundation |
| UX & polish | 5 | 4/5 | Mature shell, minor flaws |
| Compliance | — | included above | GDPR tooling present, unproven |

**Total: 58 / 100**

---

## 15. GO / NO-GO Recommendation

**NO-GO** for production launch in current state.

The blockers are **few, small, and high-impact**: two enum-drift one-liners (C-1, C-2) restore the two most important admin workflows; C-3/C-4 are required for a trustworthy marketplace and finance operation. Given the strong security posture and breadth already built, the platform can reach **GO** quickly once the P0 set is fixed and the metric-consistency (M-1) and verification (M-2) items are addressed.

---

## 16. P0 / P1 / P2 Roadmap

### P0 — Launch blockers (fix immediately)
1. **C-1** Fix `permissionMode` enum drift → restore Create User; surface field errors.
2. **C-2** Fix `scope` enum drift → restore Admin AI Analytics.
3. **C-3** Add pre-publication job moderation queue + gated publishing for unverified employers.
4. **C-4** Implement MRR/monthly revenue; add revenue KPI to dashboard; verify billing cycles.
5. **M-10** Sweep all `z.enum` vs client payloads to find remaining enum mismatches (same class as C-1/C-2).

### P1 — Pre-scale (next)
6. **M-1** Single source of truth for KPIs across dashboard/jobs/reports.
7. **M-2** Require documents/checklist for employer verification (KYC).
8. **M-3** Add `resource/action` guard to admin user routes; tests for custom-permission admins.
9. **M-4** Fix default currency; enforce currency consistency on invoices/plans.
10. **M-7 / M-8 / M-6 / M-5** GDPR E2E test; bulk moderation; territory/target setup; seed public content.
11. AI accuracy/explainability + prompt-injection hardening review once C-2 is fixed.

### P2 — Polish & hygiene
12. **L-1** De-duplicate routes (redirects).
13. **L-2** Gate dev tools (`design-system`, `tasks`) behind a flag.
14. **L-3..L-7** Timeline header, subscriptions chart `404`, loading skeletons, "Unknown" role cleanup + schema constraint, font preload cleanup.

---

### Coverage log (live-exercised)
Dashboard; Users (+Create User modal & RBAC matrix); Employers (+verification modal, live verify); Job Seekers; Agents; Super Agents; Jobs (+statuses); Approvals; Applications; Interviews; Placements; Commissions; Commission Report; Invoices; Subscription Plans; Subscriptions; Subscription Dashboard; Territory; Referral Links; Targets; Target Management; Target Report; CMS Overview + Blogs/Banners/FAQs (+Add modal)/Testimonials/Videos/Static Pages/Contact Inbox; Messages; Communications; Analytics (+live AI report attempt); Reports; Audit Logs; Audit; Activity Timeline; GDPR; Impersonate; System Health; Settings; Settings/Notifications; Bulk Import; Resources; Webhooks; Workflow Templates; Matching Weight Templates; Job Attributes (Industries); Location Data (Countries); Poster Templates; Design System; Tasks; Exhibitions; Exhibition Analytics. Security: 6 cross-role API probes from a live employer session.
