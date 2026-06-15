# AGENT FULL LIFECYCLE AUDIT — Mployedin

**Audit role:** Senior Recruitment Consultant / Talent Acquisition Specialist / Business Development Recruiter / ATS Power User (10+ yrs)
**Audit target role:** `agent` (individual recruiter). The platform also has `super_agent` (regional manager); this audit covers the individual recruiter seat described by the brief.
**Method:** Browser-first verification against a running build (`http://localhost:3000`, locale `/en`). Every claim below was observed in the live UI and/or confirmed against the route/source. Source reads were used to confirm whether an action exists (POST/PATCH) where modal interactions were flaky.
**Account:** `agent@mployedin.com`
**Seed data observed:** 22 assigned employers, 11 active jobs / 13 posted, 4 applications, 4 leads, 178 job-seeker profiles, 0 interviews, 0 offers, 0 placements, 0 commissions.

---

## 1. Executive Summary

Mployedin's **agent** seat is a polished, bilingual (EN/AR), responsive workspace with a genuinely strong **Business-Development CRM** (lead Kanban), an **employer referral/attribution** system, a **talent-sourcing database**, transparent **commission/target** visibility, and exhibition tooling. As a tool for *winning employer accounts and posting jobs on their behalf*, it is well built.

However, when evaluated against what a **recruiter** actually does day-to-day — screen applicants, move candidates through a pipeline, schedule interviews, extend offers, and record placements — the agent seat is **fundamentally read-only downstream of job posting**. The agent can *view* applications, interviews, offers and placements but **cannot create or advance any of them**. The core recruiting funnel is not operable from the agent UI; progression appears to be driven by the employer/admin side. This collapses the recruiter value proposition and directly throttles revenue, because **commissions are tied to placements the agent cannot record**.

Layered on top are two delivery failures in the "AI-Powered Recruitment" promise: the **AI candidate match score is empty** (every candidate shows "—", High-match KPI = 0), and the **AI report generator returns 403** for agents while dumping a raw JSON error into the page.

**Bottom line:** Strong BD/account-management front half; missing recruiting back half. Not production-ready as a recruiter product until the candidate pipeline is made actionable.

**Production Readiness Score: 52 / 100** — see §14.
**Recommendation: NO-GO** for recruiter-facing GA; conditional GO for a "BD/account-acquisition" pilot. See §15.

---

## 2. Walkthrough (Phase-by-Phase)

| Phase | Area | URL | Verdict |
|---|---|---|---|
| 1 | Onboarding | `/en/agent` (post-login) | Works; no guided onboarding/tour |
| 2 | Dashboard | `/en/agent` | Good KPIs; missing earnings/tasks/today panels |
| 3 | Employer Management | `/en/agent/employers` | Works (cards, onboard, referral); CRM depth gaps |
| 4 | Leads CRM | `/en/agent/leads` | **Strong** (Kanban, board/table, export) |
| 5 | Job Management | `/en/agent/jobs/new`, `/jobs/[id]` | Posts w/ approval; thin form; detail read-only |
| 6 | Candidate Sourcing | `/en/agent/job-seekers` | Good DB; no resume/shortlist/contact/tag |
| 7 | Application Pipeline | `/en/agent/candidates` | **CRITICAL — read-only, no actions** |
| 8 | Interview Mgmt | `/en/agent/interviews` | Track/edit only; **cannot create** |
| 9 | Offers | `/en/agent/offers` | **Read-only** |
| 10 | Placements | `/en/agent/placements` | **Read-only** |
| 11 | Commissions | `/en/agent/commissions` | Transparent ledger; no rate visibility |
| 12 | Referral System | `/en/agent/referral-links` | **Works well** |
| 13 | Calendar | `/en/agent/calendar` | Read-only viz of interviews/follow-ups |
| 14 | Chat & Messaging | `/en/agent/messages`, `/chat` | Works; **no candidate channel** |
| 15 | Reports | `/en/agent/reports`, `/target-report` | **AI report 403**; targets read-only |
| 16 | AI Features | (cross-cutting) | Match empty; reports broken |
| 17 | Mobile | (all) | **Good**, responsive, hamburger nav |
| 18 | Security | (cross-cutting) | **Strong isolation**; PII/info-disclosure notes |
| 19 | Scalability | (analytical) | Pagination OK; read-only pipeline won't scale operations |
| 20 | Competitive | (analytical) | BD tool, not a full ATS seat |

---

## 3. UX Findings

- **U-1 (Medium):** No onboarding/empty-state guidance for a brand-new agent — lands straight on the dashboard with no tour, checklist, or "first steps" (post a job, onboard an employer, create a referral link).
- **U-2 (Medium):** Raw API error JSON `{"error":"Forbidden — insufficient permissions"}` is rendered directly into the Reports page on failure (no friendly/upgrade messaging). Poor error handling and a minor information-disclosure smell.
- **U-3 (Medium):** Dashboard label ambiguity — "Active employers 22" vs funnel "Employers Created 12"; "Active jobs 11" vs "Vacancies Posted 2". Mixed "assigned vs created" semantics without labels to disambiguate.
- **U-4 (Medium):** Employer list mini-KPI cards (Active 10 / Inactive 0 / Industries 2) reflect only the **current page (10 rows)**, not the full 22-account portfolio — Active+Inactive ≠ total, which misleads.
- **U-5 (Low):** Loading states briefly flash "0 employer accounts" / "0 interviews" before data settles, which can read as "empty/broken." (Note: this caused a false-positive during the audit and was retracted after waiting for settle.)
- **U-6 (Low):** Navigation IA — core CRM (Employers, Leads) is buried under a generic "Tools" group; duplicate-looking entries (Commissions + Commission Report, Targets + Target Report) clutter the rail.
- **U-7 (Low):** Currency inconsistency across the product — agent commissions render in **AED**, while the super-agent dashboard shows **₹ (INR)**.

---

## 4. Functional Gaps

- **F-1 (Critical):** No way to **advance an application** (shortlist / reject / move stage) anywhere in the agent UI. See §11 CR-1.
- **F-2 (Critical):** No way to **schedule/create an interview** — the Interviews page edits existing records only. See §11 CR-2.
- **F-3 (Critical):** No way to **create an offer**. Offers page is GET-only. See §11 CR-3.
- **F-4 (Critical):** No way to **record a placement** — Placements page is GET-only; this is the event that drives commission. See §11 CR-4.
- **F-5 (High):** Sourcing is **disconnected from jobs** — from `/job-seekers` you cannot shortlist a candidate to a vacancy, add to a pipeline, view their résumé/CV, tag, bookmark, or contact them. The only row action is "Edit profile."
- **F-6 (High):** No **candidate communication channel** — Messages supports DMs with employers & super-agents only. Combined with F-5, the agent has **no way to reach a candidate** at all.
- **F-7 (Medium):** Job-posting form omits Job-model fields that exist server-side: **vacancies (# openings), work mode (remote/hybrid), benefits, skills/tags, screening questions, visibility, application mode, max applicants, deadline, responsibilities/qualifications.**
- **F-8 (Medium):** No **employer detail/profile page** or **activity/history timeline** — the agent cannot see per-account interaction history, notes, or revenue.
- **F-9 (Low):** No rich-text/AI assist for job descriptions (plain textarea).

---

## 5. Productivity Issues

- **P-1 (High):** Because the pipeline is read-only, an agent managing real volume must rely on the employer to action every candidate — there is **no recruiter workbench** (bulk shortlist, stage moves, saved searches, templates).
- **P-2 (Medium):** Dashboard lacks an **action surface** — no "today's interviews," no "follow-ups due," no "needs attention," no date-range filter. The agent cannot start their day from the dashboard.
- **P-3 (Medium):** No **saved/boolean searches** or **candidate tags/notes** in sourcing → repeat sourcing work every session.
- **P-4 (Medium):** No **email templates / sequences / bulk messaging** → outreach (where it exists) is one-to-one and manual.
- **P-5 (Low):** Duplicate report/target nav entries cost clicks and create "which one do I use?" friction.

---

## 6. Revenue Risks

- **R-1 (Critical):** **Commissions are tied to placements the agent cannot create** (Placements GET-only; Commissions = 0 because Placements = 0). The agent's entire earning mechanism depends on a record they cannot produce. This is a direct revenue blocker and a trust risk (recruiters will not adopt a tool that can't credit their placements).
- **R-2 (High):** No **commission rate/structure visibility** — the agent cannot see what % or basis they earn, nor any **projected/expected commission** from their pipeline. No forecast = no motivation/forecasting.
- **R-3 (Medium):** No **deal value / expected revenue** on leads → BD pipeline cannot be revenue-weighted or prioritized.
- **R-4 (Medium):** No **revenue per employer** on accounts → no view of which accounts are worth investing in.

---

## 7. Security Findings

**Strong (verified):**
- Role isolation: middleware redirects `super_agent` away from `/agent` routes.
- Tenant scoping: agent employer queries are constrained to `Agent.assignedEmployerIds` (`Employer.find({_id:{$in: empIds}})`).
- Authorization on writes: posting a job to an **unassigned** employer returns **403**.
- Approval gating: agent-posted jobs are forced to `approvalStatus: pending` / `status: pending_approval` (no self-publish).
- Financial integrity: commissions and targets are **read-only** to the agent (cannot self-edit earnings).
- Feature gating: `/api/ai/report` enforces a feature gate (returns 403 when not entitled).

**Concerns:**
- **S-1 (Medium):** The agent can view **all 178 job-seeker profiles with full email addresses**, platform-wide, on `/job-seekers`. If this is broader than the agent's legitimate sourcing scope it is a **PII exposure**. Confirm intended scope and consider masking contact details until a candidate is engaged.
- **S-2 (Medium):** `/api/ai/report` computes **platform-wide user counts by role** (admin/agent/super_agent/employer/job_seeker). It is gated today, but the endpoint's payload is admin-grade analytics surfaced from an agent page — a gate regression would leak cross-tenant aggregate data. Scope the report to the agent.
- **S-3 (Low):** Raw API error bodies are surfaced to the UI (information disclosure). Return user-safe messages.

---

## 8. AI Findings

- **AI-1 (High):** **AI candidate match score is not delivering.** On `/candidates`, the Match column shows "—" for every applicant and the "High match (AI ≥ 80%)" KPI is 0. The feature is wired into the UI but produces no values — undermining the "AI-Powered Recruitment" promise at the exact moment it matters (ranking applicants).
- **AI-2 (High):** **AI report generator is broken for agents.** `/reports` advertises agent-centric presets ("Summarize my leads activity," "Top conversion opportunities," "Follow-up priority list," "Monthly performance overview"), but `POST /api/ai/report` returns **403 Forbidden** (feature gate `ai_hiring_reports`). The UI offers no graceful upgrade path and prints the raw error.
- **AI-3 (Medium):** Backend/UX mismatch — `/api/ai/report` returns platform-wide role counts, not the agent-scoped "my leads/placements/commissions" the presets promise.
- **AI-Positive:** Job-seeker profiles expose a "Profile strength %" and the jobs surface references `/api/ai/job-search-filters`; an AI assistant FAB is present across the app. The scaffolding exists — delivery is the gap.

---

## 9. Scalability Findings

- **SC-1 (High, operational):** The read-only pipeline does not scale **operationally** — at 50 jobs / 500 candidates / 50 employers, an agent cannot triage inbound applicants without per-candidate employer round-trips. There is no bulk action, no saved view, no stage automation.
- **SC-2 (Medium):** Sourcing has server-side pagination (178 profiles / 18 pages) and the employer/interview/commission lists paginate — good. But list mini-KPIs are computed **per page**, so portfolio-level numbers will diverge further as data grows (see U-4).
- **SC-3 (Low):** Persistent `logo.png` + `woff2` preload warnings on every page indicate a preload misconfiguration; harmless individually but a polish/perf signal at scale.

---

## 10. Competitive Analysis (vs LinkedIn Recruiter, Naukri/Foundit, Zoho Recruit, Bullhorn)

**Where Mployedin's agent lags:**
- **Pipeline actions** (move stage, shortlist, reject, disposition) — standard in every ATS; **absent** here.
- **Candidate messaging / InMail** and **email templates/sequences** — absent.
- **Résumé viewer/parser** in sourcing, **boolean & saved searches**, **tags/notes/folders** — absent.
- **Self-serve interview scheduling**, **offer management**, **bulk actions** — absent.
- **Job distribution / multi-board posting** — not exposed.
- **Working AI match & AI reports** — present but non-functional.

**Where Mployedin's agent is competitive or differentiated:**
- **BD lead Kanban** (New→Won/Lost, board/table, exhibition-source filter) — closer to **Bullhorn's** BD/CRM strength than to a pure ATS; genuinely good.
- **Employer referral links with attribution & conversion KPIs** — a distinctive account-acquisition loop most ATSs don't offer.
- **Transparent commission ledger** (Pending/Approved/Paid/Disputed) and **target leaderboard gamification**.
- **Exhibition requests/analytics**, **bilingual EN/AR**, **clean responsive mobile UI**.

**Positioning:** Today the agent seat is a **business-development + job-posting tool**, not a full **recruiting/ATS** seat. The gap to a recruiter's baseline expectation is large and centers entirely on the candidate pipeline.

---

## 11. Critical Issues (P0)

### CR-1 — Agent cannot action applications (no pipeline progression)
- **Severity:** Critical
- **Business Impact:** Core recruiter workflow is impossible; agents cannot screen or progress candidates; throttles every downstream revenue event.
- **Reproduction Steps:** Log in as agent → `/en/agent/candidates` (or open a job → "View Candidates"). Observe the applicant table. Click a row; click anywhere on a candidate.
- **Expected Behaviour:** Row opens a candidate/application detail with actions to Shortlist, Reject, Move stage, Schedule interview, Add note.
- **Actual Behaviour:** Rows are not clickable; there is **no Actions column** and **no status controls**. Application status (applied→shortlisted→…→hired) is **display-only**. Job detail (`/agent/jobs/[id]`) is read-only and only links back to the same read-only table.
- **Recommended Fix:** Add an application detail/drawer with status transitions (`PATCH /api/applications/:id`) scoped to the agent's assigned employers; add row actions (shortlist/reject/advance) and bulk actions.
- **Page/URL:** `/en/agent/candidates`, `/en/agent/jobs/[id]`

### CR-2 — Agent cannot schedule/create interviews
- **Severity:** Critical
- **Business Impact:** Interviews are the heart of recruiting throughput; agents cannot initiate them.
- **Reproduction Steps:** `/en/agent/interviews` → look for a "Schedule Interview"/"New" action.
- **Expected Behaviour:** A "Schedule Interview" button that creates an interview tied to a candidate/application and employer.
- **Actual Behaviour:** No create action. The page only **edits existing** interviews (`PATCH /api/interviews/:id`) and shows 0 interviews. No way to ever create the first one.
- **Recommended Fix:** Add interview creation (`POST /api/interviews`) launchable from the application/candidate detail and from the Interviews page; wire it into Calendar.
- **Page/URL:** `/en/agent/interviews`

### CR-3 — Agent cannot create/manage offers
- **Severity:** Critical
- **Business Impact:** No offer stage = broken funnel between interview and placement.
- **Reproduction Steps:** `/en/agent/offers` → look for create/status actions.
- **Expected Behaviour:** Create offer, track status (sent/accepted/declined), tie to candidate + employer.
- **Actual Behaviour:** Page only calls `GET /api/offers`; no create, no status change — pure view.
- **Recommended Fix:** Add offer creation/status management (`POST/PATCH /api/offers`) from the candidate flow.
- **Page/URL:** `/en/agent/offers`

### CR-4 — Agent cannot record placements (and therefore cannot earn)
- **Severity:** Critical
- **Business Impact:** Placement is the commission-triggering event. Commissions = 0 because Placements = 0 and the agent cannot create one. The product cannot pay the agent for the work it's built around.
- **Reproduction Steps:** `/en/agent/placements` → look for "New Placement." Then `/en/agent/commissions` → observe 0 records.
- **Expected Behaviour:** Record a placement (candidate, employer, job, salary, start date, fee) → commission line generated.
- **Actual Behaviour:** Placements page only calls `GET /api/placements`; no create. Commissions ledger is empty as a result.
- **Recommended Fix:** Add placement creation (`POST /api/placements`) at the end of the candidate flow; auto-generate the commission line; surface projected commission.
- **Page/URL:** `/en/agent/placements`, `/en/agent/commissions`

### CR-5 — Agent has no way to contact candidates
- **Severity:** Critical (recruiter blocker)
- **Business Impact:** A recruiter who cannot reach candidates cannot recruit.
- **Reproduction Steps:** `/en/agent/job-seekers` → look for a Contact/Message action (none; only Edit). `/en/agent/messages` → "New Chat" only lists employers & super-agents.
- **Expected Behaviour:** Message/email a candidate from their profile or the application.
- **Actual Behaviour:** No candidate-facing channel anywhere.
- **Recommended Fix:** Allow agent→candidate messaging (and/or templated email) from the job-seeker profile and application detail, with consent/scope controls.
- **Page/URL:** `/en/agent/job-seekers`, `/en/agent/messages`

---

## 12. Medium Issues (P1)

### M-1 — AI match score not populating
- **Severity:** Medium-High · **Impact:** AI value prop undelivered; manual ranking required.
- **Repro:** `/en/agent/candidates` → Match column = "—" for all; "High match" KPI = 0.
- **Expected:** Numeric match % per candidate; High-match KPI > 0 when matches exist.
- **Actual:** Empty for every row.
- **Fix:** Populate/compute match scores in the applications list response; backfill existing applications.
- **URL:** `/en/agent/candidates`

### M-2 — AI report generator returns 403 with raw error
- **Severity:** Medium-High · **Impact:** Advertised feature unusable; poor error UX.
- **Repro:** `/en/agent/reports` → click "This week's activity summary" → "Generate Report."
- **Expected:** A generated, agent-scoped report (or a clear "upgrade to unlock" state).
- **Actual:** `POST /api/ai/report` → **403**; UI prints `{"error":"Forbidden — insufficient permissions"}`.
- **Fix:** Either entitle agents to `ai_hiring_reports` or hide/disable with an upsell; scope the endpoint to agent data; never render raw API JSON.
- **URL:** `/en/agent/reports`

### M-3 — Job-posting form omits key fields
- **Severity:** Medium · **Impact:** Agents post incomplete reqs on behalf of employers.
- **Repro:** `/en/agent/jobs/new` → no inputs for vacancies, work mode, benefits, skills/tags, screening questions, visibility, deadline.
- **Expected:** Expose the Job-model fields the API already supports.
- **Actual:** Minimal form (title/category/location/type/salary/description/requirements).
- **Fix:** Add the missing fields (progressive disclosure / "advanced" section).
- **URL:** `/en/agent/jobs/new`

### M-4 — No approval transparency on job posting
- **Severity:** Medium · **Impact:** Agent doesn't know the job won't go live until approved.
- **Repro:** `/en/agent/jobs/new` → button reads "Post Job"; no "submitted for approval" messaging.
- **Expected:** Indicate the approval step and show pending status afterward.
- **Actual:** Silent — approval is enforced server-side but not communicated.
- **Fix:** Label as "Submit for approval"; show pending state and where it sits.
- **URL:** `/en/agent/jobs/new`

### M-5 — Sourcing disconnected from jobs (no shortlist/résumé/tag)
- **Severity:** Medium · **Impact:** Sourcing cannot feed the pipeline.
- **Repro:** `/en/agent/job-seekers` → only Action is "Edit."
- **Expected:** View résumé/CV, shortlist-to-job, add-to-pipeline, tag, bookmark, contact.
- **Actual:** None of these exist.
- **Fix:** Add a candidate profile view with résumé + "Shortlist to job" + tags/notes.
- **URL:** `/en/agent/job-seekers`

### M-6 — Dashboard lacks earnings & action panels
- **Severity:** Medium · **Impact:** Recruiter can't see money or start their day.
- **Repro:** `/en/agent` → no commission/earnings KPI, no today's interviews/follow-ups/needs-attention, no date filter.
- **Expected:** Earnings KPI + actionable panels + date range.
- **Actual:** Portfolio/jobs/applications/placements KPIs + a funnel only.
- **Fix:** Add earnings KPI, "Action Center" panels, date-range control.
- **URL:** `/en/agent`

### M-7 — Employer list mini-KPIs are page-scoped
- **Severity:** Medium · **Impact:** Misleading portfolio metrics.
- **Repro:** `/en/agent/employers` → Active 10 / Inactive 0 with 22 total accounts.
- **Expected:** Portfolio-wide counts.
- **Actual:** Reflect current page (10 rows) only.
- **Fix:** Compute KPIs server-side across the full set.
- **URL:** `/en/agent/employers`

### M-8 — No commission rate/structure or forecast
- **Severity:** Medium · **Impact:** No earnings transparency/forecasting.
- **Repro:** `/en/agent/commissions` → ledger only; no rate/basis, no projection.
- **Fix:** Show commission scheme + projected earnings from pipeline.
- **URL:** `/en/agent/commissions`

### M-9 — Job-seeker PII exposure scope
- **Severity:** Medium · **Impact:** Possible over-broad PII access.
- **Repro:** `/en/agent/job-seekers` → all 178 emails visible.
- **Fix:** Confirm scope; mask contact details until engagement.
- **URL:** `/en/agent/job-seekers`

---

## 13. Low Issues (P2)

- **L-1:** Currency inconsistency (AED vs ₹ across roles). · `/en/agent/commissions` vs super-agent dashboard.
- **L-2:** No onboarding/empty-state guidance for new agents. · `/en/agent`
- **L-3:** Navigation IA — core CRM under "Tools"; duplicate Commissions/Targets vs their Reports. · sidebar
- **L-4:** Loading flashes "0 …" before data settles. · multiple pages
- **L-5:** `logo.png` + `woff2` preload warnings on every page. · all pages
- **L-6:** Label ambiguity "Active employers 22" vs "Employers Created 12". · `/en/agent`
- **L-7:** No rich-text/AI assist for job descriptions. · `/en/agent/jobs/new`
- **L-8:** Calendar has no add-event/block-time; depends entirely on interviews. · `/en/agent/calendar`
- **L-9:** Leads lack lead score / deal value on cards. · `/en/agent/leads`
- **L-10:** Cross-role mock-data inconsistencies (super-agent: Commissions ₹15,000 with Placements 0; leaderboard placements 7/6/4 vs Total Placements KPI 0). · super-agent dashboard

---

## 14. Production Readiness Score

**52 / 100**

| Dimension | Weight | Score | Notes |
|---|---:|---:|---|
| Core recruiting workflow (pipeline→placement) | 30 | 4/30 | Read-only; the product's main job is not operable |
| BD / Leads / Employer acquisition | 15 | 13/15 | Strong Kanban + referral attribution |
| Job posting | 10 | 6/10 | Works w/ approval; thin form, no transparency |
| Commissions / Targets visibility | 10 | 6/10 | Transparent but no rate/forecast; depends on uncreatable placements |
| AI features delivery | 10 | 2/10 | Match empty; reports 403 |
| Security & access control | 10 | 8/10 | Strong isolation; PII/info-disclosure notes |
| UX / IA / polish | 8 | 5/8 | Clean but IA & label issues |
| Mobile / responsive | 4 | 4/4 | Good |
| Performance / hygiene | 3 | 2/3 | Preload warnings |
| **Total** | **100** | **52** | |

---

## 15. GO / NO-GO Recommendation

**NO-GO for recruiter-facing General Availability.** The agent seat cannot perform the core recruiting lifecycle (screen → interview → offer → placement) and therefore cannot generate the placements its own commission system depends on. Shipping it as a "recruiter" product would damage trust and adoption.

**CONDITIONAL GO** for a limited pilot **positioned as a Business-Development / account-acquisition + job-posting tool** (Leads CRM + Referral Links + Employer onboarding + Job posting), with the candidate pipeline explicitly marked "coming soon." This leverages the genuinely strong half of the product without over-promising recruiting capability.

**GA gate:** Close all P0s (CR-1…CR-5) and AI delivery (M-1, M-2). Re-audit the full lifecycle end-to-end (create application progression → interview → offer → placement → commission) with persistence verification.

---

## 16. Roadmap (P0 / P1 / P2)

### P0 — Must fix before recruiter GA (unblocks core value + revenue)
1. **CR-1** Application pipeline actions (shortlist/reject/advance + bulk) on `/candidates` and application detail.
2. **CR-2** Interview creation/scheduling (`POST /api/interviews`) from candidate flow + Calendar.
3. **CR-3** Offer creation/status management.
4. **CR-4** Placement creation → auto-generate commission line; surface projected commission.
5. **CR-5** Agent→candidate messaging/email from profile + application.
6. **M-1** Populate AI match scores (and backfill).
7. **M-2** Fix AI reports (entitle or upsell; scope to agent; no raw error).

### P1 — High-value, near-term
1. **M-5** Candidate profile w/ résumé viewer + "Shortlist to job" + tags/notes; saved/boolean searches.
2. **M-6** Dashboard earnings KPI + Action Center (today's interviews, follow-ups due, needs attention) + date filter.
3. **M-3 / M-4** Expand job form (vacancies, work mode, screening Qs, deadline, etc.) + approval transparency.
4. **M-8** Commission rate/structure + pipeline-based earnings forecast.
5. **M-7** Portfolio-wide employer KPIs.
6. **M-9 / S-1 / S-2** PII scoping + scope `/api/ai/report` to agent data; user-safe errors.
7. **R-3 / R-4** Deal value on leads; revenue per employer.

### P2 — Polish & scale
1. Email templates/sequences, bulk outreach.
2. Navigation IA cleanup; consolidate duplicate report/target entries.
3. Onboarding/empty-state guidance + first-run checklist.
4. Currency consistency; fix preload warnings; lead score / deal value on Kanban cards.
5. Employer detail/activity timeline; calendar add-event/block-time.

---

*Verification note: All Critical and AI findings were confirmed in the running app and/or against route source (presence/absence of `POST`/`PATCH` handlers and feature gates). The earlier "22 vs 0 employers" alarm was a loading-state artifact and has been retracted; the employer list renders all 22 accounts after settle.*
