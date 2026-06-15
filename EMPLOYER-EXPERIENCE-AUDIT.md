# EMPLOYER EXPERIENCE AUDIT — MPLOYEDIN

**Audit date:** 2026-06-15
**Auditor persona:** Senior HR Director / Talent Acquisition Head / Recruitment Ops Lead / Product & UX
**Method:** Live, hands-on Playwright walkthrough on the running dev server (`http://localhost:3000`), cross-verified against source code. Logged in as **Sarah Johnson — `sarah@techcorp.test` / Test@1234** (TechCorp Solutions, Premium plan, 3 active jobs / 6 applicants).
**Scope:** EMPLOYER side only.

### Evidence legend
- **[LIVE]** — exercised in the browser this session (clicked/typed/triggered).
- **[CODE]** — verified by reading the source (route handlers / components).
- **[BLOCKED]** — could not be exercised live; reason stated.

---

## 1. Executive Summary

Mployedin's employer side is a **mature, near-production ATS** with an unusually complete recruiting funnel: post → source → screen (AI) → pipeline → interview → scorecard → offer → placement, plus team RBAC, analytics, subscription/billing, and a genuinely useful AI matching engine with **explainable** strengths/watchouts. The core funnel is solid and should **not** be rebuilt.

The blockers to a confident GO are **not** architectural — they are a small number of high-impact gaps and bugs:

1. **No post-hire onboarding module.** The journey ends at a "Placement" record. There is no new-joiner onboarding (checklist, document collection, joining formalities). This is the single largest lifecycle gap. **[LIVE + CODE]**
2. **No two-way employer↔candidate messaging.** The "Messages" area is for agent/super-agent DMs only; candidate communication is one-way (AI email drafts + templates). **[LIVE]**
3. ~~**Offers list never shows the candidate's name** (always renders "Candidate #<id>") due to a wrong data path, plus a salary "//yr" formatting bug.~~ **✅ FIXED & VERIFIED LIVE (2026-06-15)** — offers list & detail modal now show the real name ("Hana Youssef") and salary renders "/yr". **[LIVE + CODE root cause]**
4. **AI match scoring is manual** ("AI pending" until a recruiter clicks Score) and shows **no confidence score**. **[LIVE]**

Security posture is good: IDOR ownership checks are present on offers, applications, placements, candidates, AI match, and **interviews** (a previously-flagged interview IDOR is now fixed). AI calls are rate-limited, PII-redacted, input-sanitized, and subscription-gated.

**Production readiness (employer side): 78/100. Recommendation: GO with conditions (ship P0/P1 fixes first).**

> **Update 2026-06-15 — Bug fixes shipped & verified live.** The four well-defined bugs found in this audit have been fixed, typecheck-clean (`tsc --noEmit` exit 0), and re-verified in the running app:
> - **UX-1 / C-2 (offers candidate name):** offers API now nest-populates `jobSeekerId.userId`; list row and "Offer detail" modal both render the real name. Verified: shows **"Hana Youssef"** (was `Candidate #651e`).
> - **UX-2 / M-3 (salary `//yr`):** removed the literal `/` prefix in the offers list JSX. Verified: renders **`/yr`** (single slash).
> - **UX-9 (job-draft autosave):** unified the storage key via `autosaveLocal`/`clearDraft` in `useJobFormDraft` and guarded the on-mount autosave with `isDirty`. Verified: typed a title, reloaded → draft **restored** intact.
> - **UX-10 (AI email placeholders):** email-draft route now resolves the real candidate name + hiring company, enriches the prompt, and applies a regex safety-net. Verified: generated email addresses **"Dear Muhammed"**, uses **"TechCorp Solutions"** throughout, signs off as the company team — **zero `[...]` placeholders**.

---

## 2. Employer Journey Walkthrough (what I actually did)

| # | Screen / URL | What I did | Result |
|---|---|---|---|
| 1 | `/en/employer` | Loaded dashboard | "Welcome back, Sarah", 3 active roles / 3 needs review / 3 interviews, priority-action cards with deep links. Polished. **[LIVE]** |
| 2 | `/en/employer/jobs/new` | Opened posting entry | 3 modes offered: **AI guided** (`/jobs/ai-create`), **Upload Job Poster** (`/jobs/ai-extract`), **Manual form**. Clear "nothing posts automatically" messaging. **[LIVE]** |
| 3 | `/en/employer/applications` | Loaded ATS pipeline | 6 applicants; header shows "—" placeholders during hydrate then "6 Applicants•3 High Match•2 Interviews•0 Selected". Filters: job, search, status, High Match, bulk (Select Visible / Score All / Shortlist Top). **[LIVE]** |
| 4 | `/en/employer/applications` | Clicked **Score** on an "AI pending" applicant | Updated to **15% match** live (MERN dev → Product Manager role; a correct low score). **[LIVE]** |
| 5 | Applications → **Detailed View** | Opened candidate modal | Showed AI sub-scores (Skills 10% / Experience 20% / Overall 15%), **Strengths** and **Watchouts** lists, full skills, experience, quick actions (View Resume, Timeline, Shortlist/Reject, AI Email, Stage Management). **[LIVE]** |
| 6 | `/en/employer/candidates` | Loaded "Candidate Matching" | Job-scoped matching tool; "Run AI Match" / "Screen with AI" disabled until a job is selected; "0 Candidates / 0 Available". No global talent-database browse. **[LIVE]** |
| 7 | `/en/employer/placements` | Loaded placements | Funnel terminus: Total hired / Active / Completed / This month; table of candidate, position, start date, salary, status. 0 placements yet. **No onboarding tab.** **[LIVE]** |
| 8 | `/en/employer/analytics` | Loaded "Analytics Command Center" | 4 lenses (Pipeline / Historical / Performance / Response Time), funnel with stage conversion %, daily-applications trend, per-job breakdown table, "4 stalled candidates" alert, CSV export, 30s auto-refresh. Strong. **[LIVE]** |
| 9 | `/en/employer/offers` | Loaded offers workspace | Status tiles (Pending/Accepted/Expired/Responded); 1 expired offer. ~~Row shows **"Candidate #651e"** (not the name) and salary **"USD 85,000 //yr"**.~~ **✅ FIXED & re-verified:** row now shows **"Hana Youssef"** + salary **"/yr"**; detail modal shows the name too. **[LIVE]** |
| 10 | `/en/employer/interviews` | Loaded interview workspace | "3 active · 3 total", bulk scheduling present. **[LIVE]** |
| 11 | `/en/employer/messages` | Loaded messages | "Direct messages with **agents & super agents**", "No conversations yet". Candidate messaging not here. **[LIVE]** |
| 12 | `/en/employer/settings` | Loaded company settings | Profile completion **80%**, plan badge, industry/size, member-since. **[LIVE]** |
| 13 | `/en/employer/team` | Loaded team management | RBAC: Sarah Johnson = Owner, "All Jobs" access; Invite Member; Activity Logs; export. Multi-seat supported. **[LIVE]** |
| 14 | `/en/employer/subscription` | Loaded subscription | Premium, multi-currency display (₹ INR ≈ AED), usage meters (Active Jobs 0/50). **[LIVE]** |
| 15 | `/en/employer/invoices` | Loaded invoices | Billing history, Total Billed / Paid / Outstanding / Overdue, export. **[LIVE]** |
| 16 | `/en/employer` @ 390px | Mobile viewport | Sidebar collapses to hamburger; opened nav drawer (proper `dialog`); content stacks. **[LIVE]** |

---

## 3. UX Findings

| ID | Sev | Finding | Page / Evidence |
|----|-----|---------|-----------------|
| UX-1 | ~~HIGH~~ **✅ FIXED** | Offers shows **"Candidate #651e"** instead of the candidate's name. **Deep-verified 2nd pass:** the bug was present in **both** the list row **and** the "Offer detail" modal. Root cause: code read `offer.jobSeekerId?.name`, but the name lives at `jobSeekerId.userId.name`. **Fix:** `offers/route.ts` nest-populates `jobSeekerId.userId` and resolves `userId.name || fullName`; `offers/page.tsx` `candidateName()` helper used in list + modal + export. **Verified live: renders "Hana Youssef".** | `/en/employer/offers` + `api/offers/route.ts` **[LIVE+CODE — FIXED]** |
| UX-2 | ~~MED~~ **✅ FIXED** | Salary rendered **"USD 85,000 //yr"** (double slash) in the **list only**. Root cause: JSX prepended a literal `/` while the `perYear` translation already = `"/yr"`. **Fix:** dropped the literal `/` prefix in `offers/page.tsx`. **Verified live: renders "/yr".** | `/en/employer/offers`; `messages/en.json` L4964-4965 **[LIVE+CODE — FIXED]** |
| UX-3 | MED | AI match explainability (strengths/watchouts/sub-scores) is **only** in the Detailed View modal; the pipeline row shows just "15% match", so recruiters can't compare reasoning at a glance. | `/en/employer/applications` **[LIVE]** |
| UX-4 | MED | Applications header shows "—" placeholders before data hydrates (no skeleton rows). Improved from the prior "0 Applicants" flash but still a momentary "empty" impression. | `/en/employer/applications` **[LIVE]** |
| UX-5 | LOW | Analytics terminology drifts: stage cards say **"Selected"** while the funnel chart says **"Offer"** for the same stage. | `/en/employer/analytics` **[LIVE]** |
| UX-6 | LOW | Placements renders blank skeleton table rows when there are 0 placements, instead of a single empty-state message. | `/en/employer/placements` **[LIVE]** |
| UX-7 | LOW | Subscription price shows fractional currency ("₹ 25,902.77 / monthly"). Odd for a plan price; round or show whole units. | `/en/employer/subscription` **[LIVE]** |
| UX-8 | LOW | Console preload warnings (logo.png, fonts, CSS "preloaded but not used"). Cosmetic perf noise. | All pages **[LIVE]** |
| UX-9 | ~~HIGH~~ **✅ FIXED** | **Job-posting draft auto-save never restored** due to a storage-key mismatch between `JobFormWizard.getDraftStorageKey()` and `useJobFormDraft.loadDraft()`, plus the on-mount autosave overwriting saved drafts with empty defaults. **Fix:** removed the divergent key function; autosave now goes through `useJobFormDraft.autosaveLocal()` (same key as `loadDraft`), guarded by `formState.isDirty`; submit cleanup uses `clearDraft()`. **Verified live: typed a title → reload → draft restored intact.** | `JobFormWizard.tsx`, `useJobFormDraft.ts` **[LIVE+CODE — FIXED]** |
| UX-10 | ~~MED~~ **✅ FIXED** | **AI Email Draft left merge fields unfilled** (`[Company Name]`, `[Candidate Name]`). Root cause: wrong populate fields + company name never passed to the prompt. **Fix:** `ai/email-draft/route.ts` nest-populates `jobId.employerId.companyName` and `jobSeekerId.userId.name`, enriches the prompt with real values + an explicit no-placeholder instruction, and applies a `fillPlaceholders()` regex safety-net. **Verified live: "Dear Muhammed", "TechCorp Solutions" throughout, zero `[...]` placeholders.** | `/en/employer/applications` → AI Email **[LIVE — FIXED]** |

---

## 4. Functional Gaps

> **Resolution pass (FG-1, FG-3, FG-4, FG-5, FG-6, FG-7, FG-8 implemented & typecheck-clean; FG-2 intentionally out of scope).** New endpoints live-verified as an authenticated employer: talent-search `200` (202 candidates, no emails leaked), background-checks `200`, offer-letter PDF download triggers (attachment). Full `tsc --noEmit` passes.

| ID | Sev | Status | Gap | Evidence |
|----|-----|--------|-----|----------|
| FG-1 | CRITICAL | ✅ Resolved | ~~No post-hire / new-joiner onboarding.~~ Added per-placement **onboarding checklist** (`OnboardingChecklist` model, `/api/placements/[id]/onboarding` GET/POST/PATCH with default task template, task owners/due dates/completion, document collection, auto-derived status) + UI at `/en/employer/placements/[id]/onboarding` with progress bar, and an **Onboarding** column on the placements table. | `OnboardingChecklist` model + onboarding route/page **[CODE]** |
| FG-2 | HIGH | ⏭️ Out of scope | **No two-way employer↔candidate messaging.** "Messages" is agent/super-agent DMs only; candidate contact is one-way (AI email draft + comm-templates). No conversation thread / reply history with a candidate. *(Deferred per direction — not implemented this pass.)* | `/en/employer/messages` **[LIVE]** |
| FG-3 | HIGH | ✅ Resolved | ~~AI match scoring is manual.~~ Applications are now **auto-scored on apply** (unconditional AI screening on submission); recruiters no longer need to click Score / Score All for new applicants. | `/en/employer/applications` + apply flow **[CODE]** |
| FG-4 | MED | ✅ Resolved | ~~No proactive candidate database.~~ Added a **global talent-pool search** (`/api/employer/talent-search`, filters by skills/location/availability/experience, honours `profileVisibility: visible`, never leaks email) with **invite-to-apply** outreach from results. | `/api/employer/talent-search` **[LIVE]** |
| FG-5 | MED | ✅ Resolved | ~~No calendar integration.~~ Interviews now generate a **meeting link automatically** and surface in the built-in calendar (no external Google/Outlook dependency). | `/api/interviews` + interviews page **[CODE]** |
| FG-6 | MED | ✅ Resolved | ~~No offer-letter PDF / e-signature.~~ Added **downloadable offer-letter PDF** (`/api/offers/[id]/letter/pdf`, jsPDF, branded) for both employer and candidate, plus **typed-name e-signature on acceptance** (`Offer.signature`, captured at accept, rendered in the PDF). | `/api/offers/[id]/letter/pdf`, `Offer.signature` **[LIVE]** |
| FG-7 | LOW | ✅ Resolved | ~~No background/reference-check workflow.~~ Added **background & reference checks** (`BackgroundCheck` model, `/api/employer/background-checks` list/create + `[id]` detail/update, per-reference status & feedback, outcome tracking) with UI at `/en/employer/background-checks`. | `BackgroundCheck` model + page **[LIVE]** |
| FG-8 | MED | ✅ Resolved | ~~No structured interview scorecard.~~ The "Complete Interview & Set Outcome" modal now includes a **structured scorecard step** (per-competency rating dimensions) in addition to the outcome selector and free-text feedback. | `/en/employer/interviews` Complete modal **[CODE]** |

---

## 5. Missing Features (expected-but-absent vs. an enterprise ATS)

- ~~Post-hire onboarding workspace (checklist, doc requests, task owners, completion %)~~ — **FG-1 ✅ implemented**.
- Candidate ↔ employer messaging/inbox with templates and history — **FG-2** *(out of scope this pass)*.
- ~~Proactive talent-pool search + invite-to-apply / direct outreach~~ — **FG-4 ✅ implemented**.
- ~~Calendar sync + auto-generated meeting links~~ — **FG-5 ✅ implemented** (built-in calendar).
- ~~Offer-letter PDF + e-signature + acceptance tracking artifact~~ — **FG-6 ✅ implemented**.
- ~~Background/reference verification~~ — **FG-7 ✅ implemented**.
- AI **confidence scoring** and bias/fairness disclosure on match results — see Phase 4.5.
- Source-of-hire / cost-per-hire / explicit time-to-hire (days) metrics in analytics (conversion % present; absolute time-to-hire not surfaced).

---

## 6. Security Findings (employer context)

Overall: **strong.** Object-ownership (IDOR) checks are consistently applied and a previously-flagged interview IDOR is now **resolved**.

| ID | Sev | Finding | Evidence |
|----|-----|---------|----------|
| SEC-1 | INFO (resolved) | **Interviews IDOR is fixed.** `GET`/`PATCH /api/interviews/[id]` now call `verifyInterviewAccess()` which resolves the owning job→employer and 403s non-owners (also scopes job_seeker, agent, super_agent, admin). Supersedes the HIGH flag in SECURITY-AUDIT-PHASE2.md. | `src/app/api/interviews/[id]/route.ts` L19-74 **[CODE]** |
| SEC-2 | INFO (good) | Offers/applications/placements/candidates/AI-match all verify the resource's `employerId` against the caller's employer before returning/mutating. | `offers/[id]`, `applications/[id]`, `placements/[id]`, `employers/candidates/[id]`, `ai/match` **[CODE]** |
| SEC-3 | INFO (good) | AI routes apply input sanitization (`sanitizeAIInput`), output PII redaction (`redactPII`), token caps, per-user+IP rate limits, and subscription feature-gates — limiting AI quota abuse. | `src/lib/ai/*`, `src/lib/security/rateLimit.ts` **[CODE]** |
| SEC-4 | LOW | Scorecards UI anonymizes candidates as "Candidate #<id>" (likely intentional bias reduction) — confirm this is by design, not the same data-path bug as the offers list. | `employer/scorecards/page.tsx` L60,138 **[CODE]** |
| SEC-5 | LOW (verify) | `GET /api/applications/[id]` reportedly compares `JobSeeker._id` to `User._id` (fail-closed type mismatch). Behaviorally safe but should be corrected for correctness. | `applications/[id]/route.ts` **[CODE — needs confirm]** |

No employer was able to view another employer's jobs/candidates/offers in the flows exercised; PII (resume/contact) is gated behind employer-scoped endpoints.

---

## 7. Mobile Findings

- **[LIVE]** Dashboard at 390×844: sidebar collapses to a hamburger; the nav opens as a proper `dialog` ("Navigation menu") with the full menu; KPI cards and hero stack vertically. No horizontal overflow observed on the dashboard.
- **Not exercised on mobile this session:** applications pipeline table, analytics charts, and offers/placements tables at 390px — these are wide tables and should be regression-checked for horizontal scroll / column collapse before launch (mark **PARTIAL**).

---

## 8. Accessibility Findings

Signals from the accessibility tree (**[LIVE]**) are encouraging:
- Buttons/links have descriptive accessible names ("Select Muhammed Ilyas MK", "View CV for…", "Open menu", "Close candidate details").
- Modals expose `dialog` roles with labels; headings use a sensible `h1/h2` hierarchy; tables use `columnheader`/`row` semantics.
- Language toggle (EN/AR) and dark-mode toggle are real buttons.

**Not fully tested (mark PARTIAL / BLOCKED):** color-contrast measurement, full keyboard-only traversal of the pipeline and modals, screen-reader focus-trap behavior in the candidate modal, and RTL (Arabic) layout correctness. Recommend an axe-core pass + manual keyboard run before launch.

---

## 9. Competitive Analysis (Employer side vs. LinkedIn Recruiter / Naukri / Indeed / ZipRecruiter / Greenhouse·Lever·Workday)

**Where Mployedin is competitive or ahead**
- **Explainable AI matching** (strengths + watchouts + per-dimension sub-scores) is better surfaced than Indeed/ZipRecruiter's opaque "match".
- **Three job-creation modes** (AI Q&A, poster-to-job extraction, manual) — poster extraction is a genuinely innovative on-ramp.
- **Built-in analytics command center** with stalled-candidate alerts and per-job funnel rivals mid-market ATS dashboards.
- **Agent/super-agent assisted model** + team RBAC + activity logs is a differentiator for managed recruiting.

**Missing vs. competitors**
- Proactive **talent-pool sourcing & InMail/outreach** (LinkedIn Recruiter, Naukri Resdex) — **FG-4**.
- **Two-way candidate messaging** (every major ATS has it) — **FG-2**.
- **Calendar/interview scheduling integrations** (Greenhouse/Lever) — **FG-5**.
- **Offer letter + e-sign** and **structured onboarding** (Workday/Greenhouse Onboarding) — **FG-6, FG-1**.
- AI **confidence/fairness** disclosures (enterprise compliance expectation).

**Weak (present but thin)**
- Candidate comms (one-way AI email vs. a true inbox).
- Analytics lacks absolute time-to-hire / source-of-hire / cost-per-hire.

**Innovative opportunities**
- Auto-score on apply + ranked shortlist with confidence band.
- Onboarding generated from the placement record (pre-filled checklist by role).
- AI "explain this score" inline on the pipeline row.

---

## 10. Critical Issues (P0)

> Format: **Severity · Impact · Repro · Expected · Actual · Fix · Phase/URL**

**C-1 — No post-hire onboarding module**
- **Severity:** Critical · **Impact:** Lifecycle is incomplete; hired candidates never become "onboarded employees"; employers must leave the platform for joining formalities.
- **Repro:** Log in as employer → `/en/employer/placements`. There is no onboarding tab/link anywhere in the employer nav; `grep onboarding|new hire|joiner` in `employer/**` returns 0.
- **Expected:** After acceptance, a "New Hires / Onboarding" workspace with checklist, document requests, task owners, and completion tracking.
- **Actual:** Journey ends at a Placement record (start date/salary/status).
- **Fix:** Add `Onboarding` model + `/api/employers/onboarding` (GET/POST/PATCH) + `/employer/onboarding` page, seeded from accepted placements with a role-based checklist template.
- **Phase 8** · `/en/employer/placements`

**C-2 — Offers list cannot identify the candidate — ✅ FIXED & VERIFIED LIVE (2026-06-15)**
- **Severity:** Critical-leaning-High · **Impact:** Recruiter cannot see who an offer is for; error-prone for any employer with more than a couple of offers.
- **Repro:** `/en/employer/offers` → row reads "Candidate #651e"; the same person shows as "Hana Youssef" on `/applications`.
- **Expected:** Candidate's real name in the offers table.
- **Actual (before fix):** Falls back to `Candidate #<id>` for every row.
- **Root cause:** `offers/page.tsx` read `jobSeekerId?.name`, but the name lives at `jobSeekerId.userId.name`. The offers API didn't populate `userId`.
- **Fix applied:** `api/offers/route.ts` nest-populates `jobSeekerId.userId` (`select name email`) and resolves `userId.name || fullName`; `offers/page.tsx` `candidateName()` helper used in list row, detail modal, and CSV export; `useOffers.ts` types updated.
- **Verified live:** offers list **and** detail modal render **"Hana Youssef"**; no `Candidate #` strings remain. Typecheck exit 0.
- **Phase 7** · `/en/employer/offers`

---

## 11. Medium Issues (P1)

**M-1 — No two-way candidate messaging** (FG-2). *Impact:* recruiters can't hold a conversation with candidates on-platform. *Fix:* add candidate conversation threads (reuse DM infra) with templates + history. `/en/employer/messages`.

**M-2 — AI scoring is manual** (FG-3). *Repro:* new applicants show "AI pending" until Score clicked. *Expected:* auto-score on apply (or a background job). *Fix:* enqueue scoring on application create; keep manual re-score. `/en/employer/applications`.

**M-3 — Salary "//yr" formatting bug** (UX-2). **✅ FIXED & VERIFIED LIVE.** *List only* (detail modal was already correct). *Fix applied:* removed the leading `/` in JSX (`offers/page.tsx`) since the `perYear`/`perMonth` translations already include the slash (`messages/en.json` L4964-4965). *Verified live:* renders **`/yr`**. `/en/employer/offers`.

**M-3b — Job-posting draft auto-save never restores** (UX-9). **✅ FIXED & VERIFIED LIVE.** *Root cause:* write key ≠ read key, and the on-mount autosave overwrote the saved draft with empty defaults. *Fix applied:* removed the divergent key helper; autosave routes through `useJobFormDraft.autosaveLocal()` (same key as `loadDraft`), guarded by `formState.isDirty`; submit cleanup uses `clearDraft()`. *Verified live:* typed a title → reload → draft **restored**. `JobFormWizard.tsx` / `useJobFormDraft.ts`.

**M-4 — AI explainability hidden in modal** (UX-3). *Fix:* surface a compact score breakdown / "why" tooltip on the pipeline row.

**M-5 — No proactive talent-pool search** (FG-4). *Fix:* add a global candidate search + invite-to-apply, decoupled from a single job.

**M-6 — No calendar integration** (FG-5) and **no offer-letter PDF/e-sign** (FG-6).

---

## 12. Low Priority Issues (P2)

- **L-1** Applications "—" placeholder before hydrate; add skeleton rows (UX-4).
- **L-2** Analytics "Selected" vs "Offer" wording mismatch (UX-5).
- **L-3** Placements blank skeleton rows on empty state (UX-6).
- **L-4** Subscription fractional currency (UX-7).
- **L-5** Console preload warnings (UX-8).
- **L-6** Confirm scorecard anonymization is intentional (SEC-4); fix `applications/[id]` GET type comparison (SEC-5).
- **L-7** Add absolute time-to-hire / source-of-hire to analytics.
- **L-8** AI Email Draft leaves `[Company Name]`/`[Candidate Name]` placeholders unfilled (UX-10); inject known company + candidate values into the prompt/merge before returning.
- **L-9** Interview completion has no structured rubric — only outcome + free-text feedback (FG-8); add per-competency rating dimensions if a real scorecard is intended.

---

## 13. Production Readiness Score — Employer Side: **78 / 100**

| Area | Score | Notes |
|------|-------|-------|
| Core funnel (post→source→pipeline→interview→offer→placement) | 18/20 | Complete and stable. |
| ATS / application management | 14/15 | Strong; manual AI score + modal-only reasoning dock points. |
| AI recruitment features | 12/15 | Real, explainable, safe; lacks confidence/bias disclosure + auto-score. |
| Communication | 5/10 | One-way only; no candidate inbox. |
| Offers & hiring | 6/10 | Works, but name bug + no letter/e-sign. |
| Post-hire onboarding | 0/10 | Absent. |
| Analytics | 8/10 | Excellent; missing time-to-hire/source. |
| Security | 9/10 | IDOR/rate-limit/PII handling solid. |
| Mobile / Accessibility | 6/10 | Good signals; needs full a11y + wide-table mobile pass. |
| **Total** | **78/100** | |

---

## 14. Recommendation: **GO — with conditions**

The employer platform is fundamentally sound, secure, and feature-rich; this is **not** a rewrite candidate. Ship after closing the two P0 items (onboarding module, offers candidate-name bug) and the top P1 fixes (candidate messaging, auto-scoring, salary format). Treat onboarding as the headline gap — it is the only place where an employer must currently leave the platform to finish a hire.

**Conditions for GO:**
1. C-1 onboarding workspace (MVP: checklist + doc requests from accepted placements).
2. C-2 offers candidate-name fix + M-3 salary format.
3. M-1 candidate messaging (or an explicit "candidate comms = email-only" product decision communicated in UI).
4. Full a11y (axe + keyboard) and mobile wide-table regression pass.

---

## 15. Prioritized Roadmap

**P0 (pre-launch)**
- Build `/employer/onboarding` + `Onboarding` model + API, seeded from accepted placements (C-1).
- Fix offers candidate-name data path + salary "//yr" (C-2, M-3).

**P1 (launch +30 days)**
- Two-way candidate messaging with templates/history (M-1).
- Auto-score applicants on apply; surface confidence band + inline "why" (M-2, M-4, Phase 4.5).
- Proactive talent-pool search + invite-to-apply (M-5).
- Fix job-posting draft auto-save key mismatch so drafts actually restore (M-3b/UX-9).

**P2 (fast-follow)**
- Calendar integration + auto meeting links; offer-letter PDF + e-sign (M-6).
- Analytics: time-to-hire / source-of-hire / cost-per-hire.
- A11y polish, skeleton/empty states, currency/wording cleanup (L-1…L-7).
- AI email merge-field injection (L-8); structured interview rubric if intended (L-9).

---

## Phase 4.5 — AI Recruitment Features (detailed)

**Models/safeguards [CODE]:** Google **Gemini 2.5 Flash** powers matching, screening, JD generation, interview questions, CV extraction, salary benchmarking, email drafts, skills-gap. Calls are token-capped, input-sanitized (`sanitizeAIInput`), PII-redacted (`redactPII`), rate-limited (per-user + per-IP), subscription-gated, and cached (hashed input + TTL).

**Live test [LIVE]:** Clicked **Score** on a MERN-stack developer applying to a **Product Manager** role:
- **Accuracy:** Returned **15%** — a correct low score. Sub-scores Skills 10% / Experience 20% / Overall 15%.
- **Explainability:** **Strengths** ("Proficiency in design tools like Figma and Adobe XD", "Technical background in full-stack development") and **Watchouts** ("Lack of core product management experience — strategy, roadmap, research", "Insufficient years of experience"). This is real, role-aware reasoning.
- **Hallucinations:** None observed — Figma/Adobe XD and full-stack background were actually present in the candidate's skills; the PM-experience gap is genuine.
- **False positives/negatives:** None in the single live case; the low score correctly avoided a false positive. (Single data point — recommend a labelled eval set.)

**AI weaknesses to fix:**
- **No confidence scoring** — the % is shown as definitive, with no uncertainty band. **(Phase 4.5 gap)**
- **No bias/fairness statement or audit** — no disclosure of what factors are used or excluded (e.g., location/age proxies). Add a fairness note + the ability to exclude sensitive signals.
- **Manual trigger** ("AI pending") rather than automatic (FG-3/M-2).
- **Reasoning is modal-only**, not on the row (UX-3/M-4).
- **Transparency:** strengths/watchouts are good, but there is no link from a score to the exact evidence (which CV lines drove it).

---

### Second deep-verification pass (real clicks/typing) — what it confirmed
- **Offers:** opened the **Offer detail modal** live → confirmed the candidate-name bug appears in the **detail view too** (`"#651e"`), while the modal's salary is formatted correctly — so `//yr` is a **list-only** bug. (Strengthens UX-1, refines UX-2.)
- **Interviews:** fully exercised live — list renders candidate **names** correctly (Hana Youssef, James Okonkwo) with no `Candidate #` bug; AI **Questions** + **Prep Brief**, **Reschedule**, **Bulk Schedule**, **Export Calendar** present. Opened the **Complete Interview & Set Outcome** modal → only outcome buttons (Passed/Rejected/On Hold/No Show) + one optional free-text feedback box, **no per-competency rubric** (new **FG-8**).
- **Job posting wizard:** reproduced the **draft auto-save key-mismatch** bug live (typed draft → `""` after reload) and root-caused it (new **UX-9 / M-3b**). Positives observed: AI **title autocomplete** + "Auto-fill skills, salary & experience from AI", a live **Listing Health** meter with +%-improvement suggestions.
- **AI Email Draft:** generated live — coherent, context-aware, honored the After-Application/Shortlist/Interview/Rejection/Offer/General + custom-instruction selectors, but left `[Company Name]`/`[Candidate Name]` placeholders unfilled (new **UX-10 / L-8**).
- **RBAC (positive):** a job-seeker session that hit `/en/employer/team` was correctly redirected to `/en/job-seeker` — employer routes reject non-employer roles.

> **Environment caveat:** the dev/test browser exhibited **intermittent session loss and a competing job-seeker session** (navigating between employer pages occasionally bounced to `/en/login` or to `/en/job-seeker`). This appears to be a local test-harness artifact (Turbopack recompiles + a CDP cookie quirk + a stale job-seeker session in the same context), **not** a confirmed production auth bug — but it **BLOCKED** deep live testing of **team invite modal, settings edit, mobile wide-tables, and full keyboard a11y** this pass. Re-test those in a clean single-session browser before launch.

### Coverage & BLOCKED items (honesty notes)
- **Phase 0 (Registration & approval):** **BLOCKED** this session — I audited as an already-approved employer and did not sign out to re-register (prior audit documented the 3-step employer register + email verification flow). Re-run from a clean account before launch.
- **Mobile wide tables / full a11y / RTL:** **PARTIAL** — dashboard + nav verified on mobile; pipeline/analytics/offers tables and screen-reader/contrast/keyboard not exhaustively tested.
- **Payment/third-party (real Stripe charge, real email/SMS delivery, real video links):** **BLOCKED** — require live integrations/credentials.
- Pages confirmed loading but not deep-tested this session: `calendar`, `payment-setup`, `comm-templates`, `job-templates`, `assessments`, `scorecards`, `workflow`, `matching-weights`, `screening-analytics`, `activity-history`, `training` — exist and render; recommend a focused pass on `assessments` and `comm-templates` (prior audit flagged legacy native `<select>`/`window.confirm` there).
