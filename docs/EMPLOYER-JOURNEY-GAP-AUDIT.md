# Employer Journey — End-to-End Gap Audit

**Date:** 2026-06-15
**Method:** Live walkthrough logged in as a real employer account (`sarah@techcorp.test` / company *TechCorp Solutions*, 6 jobs / 6 applications) on the running dev server, combined with codebase review of `src/app/[locale]/(dashboard)/employer/**`.
**Perspective:** A 10-year-old company that wants to run its *entire* hiring lifecycle — from employer onboarding → requirement gathering → hiring → onboarding the new joiner — through this portal.
**Goal:** Identify gaps and shortcomings. **No code was changed.** This is an audit/clarity document only.

---

## 1. The intended employer lifecycle vs. what exists

| # | Lifecycle stage | Portal coverage | Status |
|---|-----------------|-----------------|--------|
| 1 | Employer registration & company onboarding | `(auth)/employer-register` (3-step), email verification, auto plan assignment, setup guide | ✅ Solid |
| 2 | Company profile / verification / trust | `employer/settings`, verification levels + document upload | ✅ Solid |
| 3 | Requirement gathering (define vacancy) | `jobs/new` → AI guided (typing **and voice**), `jobs/ai-extract` (upload poster → AI extract), manual wizard, `job-templates`, `matching-weights` | ✅ Strong |
| 4 | Publishing & job management | `employer/jobs` (filter, clone, pause, export, stats) | ✅ Solid |
| 5 | Sourcing & candidate pool | `employer/candidates` (AI match, bulk screen) | ✅ Solid |
| 6 | Application screening / pipeline | `employer/applications` (stages, AI match, bulk, notes, export), `screening-analytics`, `assessments` | ✅ Solid (see UX gaps) |
| 7 | Interviewing | `employer/interviews`, `interviews/bulk`, `calendar`, `scorecards` | ✅ Present (see UX gaps) |
| 8 | Offers | `employer/offers` (pending/accepted/expired/withdrawn) | ✅ Present |
| 9 | Placement (hire confirmed) | `employer/placements` (start date, salary, visa, status active/completed/terminated) | ✅ Present — **but this is where the journey ends** |
| 10 | **Post-hire / new-joiner onboarding** | — | ❌ **MISSING (core gap)** |
| 11 | Communication | `employer/messages` (DM), `comm-templates` (rejection/invite/follow-up/offer) | ✅ Solid |
| 12 | Billing & subscription | `employer/subscription`, `invoices`, `payment-setup` (Stripe/Tap) | ✅ Solid |
| 13 | Team & permissions | `employer/team` (owner/admin/hiring-manager/accounting/finance/viewer) | ✅ Solid |
| 14 | Analytics & audit | `employer/analytics`, `activity-history`, `team/activity-logs` | ✅ Solid |

**Bottom line:** The recruitment funnel (register → job → screen → interview → offer → placement) is **complete and well-built**. The journey **stops at the placement record**. Everything *after the candidate is hired* — actually onboarding the new employee — does not exist.

---

## 2. Gaps by priority

### 🔴 P0 — Critical (the core requirement is missing)

**G1. No post-hire / new-joiner onboarding module.**
The employer asked for "complete A-to-Z, up to onboarding the joined people." Today the lifecycle ends at `placements` — a record with `startDate`, `salary`, `visaStatus`, and a `status` of active/completed/terminated. There is **no**:
- New-hire onboarding checklist / task list
- Pre-boarding (collect documents/info before the start date)
- First-day / first-week workflow
- Document collection & e-signature (contract, ID, bank, visa papers)
- Equipment / system-access provisioning tracking
- Probation-period tracking & checkpoints
- New-joiner self-service / welcome portal
- Onboarding completion / status reporting

*Evidence:* code search for `onboarding|new hire|preboard|first day|joiner` across `employer/**` returns **zero** matches; the `placements` table columns end at `Status`.

**G2. The `training` page is mislabeled as post-hire onboarding but isn't.**
`employer/training` is a **generic staff-training tracker** (suggested links to CIPD / LinkedIn Learning / Coursera). It is not tied to a specific new hire, a start date, or an onboarding checklist. It does not fill the G1 gap and may mislead users into thinking onboarding exists.

> **What "done" looks like for the core ask:** a new lifecycle stage after Placement, e.g. `employer/onboarding` (or "New Hires"), where each accepted placement generates a configurable onboarding checklist, document requests, task owners, and a completion status — closing the loop from "offer accepted" to "employee productive."

---

### 🟠 P1 — High (functional / trust-damaging UX)

**G3. Empty-state flash before data hydrates.**
On first client-side navigation to `employer/applications`, the page rendered **"6 Applicants" as "0 Applicants" / "Showing 0–0 of 0"** with no loading skeleton, then populated only after the data fetch completed (confirmed on reload). For a 10-year employer with live pipelines, a "0 candidates" flash reads as data loss. Add a loading state / skeleton and avoid rendering the empty "0 of 0" terminal state while fetching. *(Likely affects other list pages — offers showed "Loading..." which is the better pattern.)*

**G4. AI match scoring is not automatic.**
Several real applicants show **"AI pending"** instead of a match %; scoring requires a manual "Score" / "Score All" click. For an employer expecting AI-driven shortlisting out of the box, unscored candidates undermine the core value prop. Auto-trigger scoring on application receipt (or clearly surface why it's pending).

**G5. Legacy native dropdowns & native dialogs (pre-existing, still partially open).**
Per the prior UX audit (`employer-pages-ux-production-audit.md`), several pages still use native `<select>` / `window.confirm` instead of the project's Radix `Select` + `useConfirm`: `interviews` (cancel confirm + 4 selects), `interviews/bulk`, `assessments`, `comm-templates`, `analytics`, `screening-analytics`. The Offers and Applications filters also render as raw comboboxes. These break styling/RTL consistency.

---

### 🟡 P2 — Medium (polish / professionalism)

**G6. Developer-facing meta copy leaking into the employer UI.**
Customer-facing pages contain internal/marketing rationale aimed at developers, not employers. Examples seen live:
- Placements: *"The placement API currently supports status filtering, so these segmented controls map directly to the backend without inventing extra reporting logic."*
- Dashboard: *"…so the dashboard stays useful instead of decorative."*

These should be replaced with plain, user-oriented copy (or removed). They look unfinished to a paying employer.

**G7. i18n / RTL gaps (Arabic).**
Per the prior audit, multiple employer pages still contain hardcoded English strings and constant arrays (e.g. `jobs/[id]/edit` category/salary/employment constants, `analytics`, `screening-analytics`, `activity-history`). For a GCC-facing product (Arabic + RTL), these break the Arabic experience.

**G8. "Training" naming/IA.** Either repurpose `training` into the new-hire onboarding flow (G1) or rename it clearly (e.g. "Staff Training") so it isn't confused with onboarding.

---

### 🟢 P3 — Minor / nice-to-have

- **G9.** Interview module: no visible video-interview link/recording capability; calendar integration depth unclear.
- **G10.** `matching-weights` and `workflow` (custom stages) exist but their effect on the live pipeline wasn't surfaced during the walkthrough — verify they're wired end-to-end.
- **G11.** Assessments: unclear whether built-in or external; no vendor integration surfaced.

---

## 3. What is solid — do **not** rebuild

The following are production-quality and should be preserved as-is: employer registration/verification, dashboard (priority actions + funnel + quality signal), AI/voice/poster job creation, candidate pool & AI matching, application pipeline, interviews + scorecards, offers, placements tracking, messaging + comm-templates, subscription/invoices/payment-setup, team RBAC, analytics, activity logs, EN/AR scaffolding.

The recruitment funnel itself does **not** need a rewrite. The clarity outcome is: **add the missing post-placement onboarding stage (G1/G2) and tighten the UX trust issues (G3–G6).**

---

## 4. Recommended next step (clarity, not a teardown)

1. **Build the post-hire onboarding stage (G1)** — the single biggest gap vs. the "A-to-Z up to joining" requirement. New route `employer/onboarding` (New Hires) sourced from accepted placements, with checklist + document requests + task owners + completion status.
2. **Fix the trust-level UX (G3, G4, G6)** — loading states, auto AI-scoring, remove developer meta copy.
3. **Finish the open UX-audit items (G5, G7)** — Radix selects/dialogs + Arabic/RTL strings.

> Scope guardrail: items 2–3 are localized fixes; only item 1 is net-new feature work. None require breaking the existing funnel.
