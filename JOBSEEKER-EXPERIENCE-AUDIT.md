# MPLOYEDIN — Job Seeker Full Lifecycle Audit

**Audit type:** Live, hands-on (Playwright-driven) audit from the Job Seeker perspective
**Date:** 2026-06-15
**Environment:** `http://localhost:3000` (Next.js dev server)
**Audited as:** `jobseeker@mployedin.com` — *Muhammed Ilyas MK* (role `job_seeker`, onboarded, 14 existing applications, 95% profile completeness)
**Method:** Real browser interaction — logged in, navigated every accessible job-seeker page, submitted live applications, walked the Easy-Apply flow end-to-end, triggered notifications, tested filters, probed APIs for access-control, and validated mobile + RTL + accessibility.

> **Auth note (environment):** Chrome's password manager repeatedly autofilled saved *employer* credentials and auto-submitted the login form, re-authenticating the session as an employer. Authentication was therefore performed via the NextAuth API (`/api/auth/csrf` → `POST /api/auth/callback/credentials`). Separately, `/en/register` was continuously redirected to `/en/login` by background navigation, so the **live registration submit is BLOCKED**; Phase 1 registration is documented from the rendered UI plus source (`src/app/[locale]/(auth)/register/page.tsx`).

---

## 1. Executive Summary

The Job Seeker side of Mployedin is **feature-rich, visually polished, and largely production-ready** at the UX level. It offers AI-matched job discovery, a 3-step Easy Apply, a strong CV Builder with AI extraction, application tracking with status filters, full Arabic RTL localization, and an excellent mobile layout with a bottom tab bar. The seeded account demonstrates a working end-to-end pipeline (apply → notification → tracking).

However, the audit surfaced **one launch-blocking security defect**: any logged-in job seeker can enumerate **all 204 candidate profiles** — including names, emails, phone numbers and salary expectations — through `GET /api/job-seekers`, which lacks a role guard. This is a P0 IDOR / broken-access-control issue and a GDPR exposure.

Beyond that, a **systemic data-binding bug** causes the employer/company name to render as a literal placeholder ("Company", "at the company", "at the employer") across the application detail page, the feedback page, and notifications. The biggest **functional gap vs. competitors** is the absence of direct employer↔candidate messaging — the "Messages" tab is in fact an admin support-ticket desk.

**Verdict:** Strong product, **NO-GO until the P0 IDOR is fixed** (a small, localized change). With that fix and the company-name binding corrected, the job-seeker side is launch-ready.

**Production Readiness (job-seeker side only): 72 / 100.**

---

## 2. Job Seeker Journey Walkthrough (screen by screen)

| # | Screen / URL | What I did | Result |
|---|--------------|-----------|--------|
| 1 | `/en/login`, `/en/register` | Inspected forms, social login, validation rules (source) | Email+password+confirm, agree-to-terms, Google/Apple/LinkedIn. Register → email-verification page |
| 2 | `/en/job-seeker` (Dashboard) | Loaded dashboard | AI matches, stats (5 matches, 14 applications, 0 saved, 0 interviews, 0 views), recommended jobs w/ match %, priority actions, profile 95%, AI daily insights |
| 3 | `/en/job-seeker/profile` | Opened profile builder | AI CV extractor, summary, skills, sections; "CV uploaded" |
| 4 | `/en/job-seeker/cv` | Opened CV Builder | AI Editor / Templates / Formatting tabs, photo, summary (516/1000), AI import |
| 5 | `/en/job-seeker/preferences` | Reviewed | AI Match Setup 100%, roles, locations, salary, job type |
| 6 | `/en/job-seeker/experience`, `/skills`, `/portfolio`, `/documents` | Reviewed | Work history, AI Skills Coach + gap analysis, projects, doc upload (PDF/DOCX/JPG/PNG/WEBP ≤10MB) |
| 7 | `/en/job-seeker/jobs` | Searched & filtered | 27 jobs, live AI matches, sort (Best/Latest/Salary), Easy Apply / Save / Hide; typing "DevOps" correctly filtered to "DevOps Engineer" |
| 8 | `/en/job-seeker/jobs/[id]` | Opened job detail | Verified employer, salary, profile insights (2/5 skills matched), requirements, quick apply |
| 9 | Easy Apply modal | **Submitted 2 live applications** (TechPark UI/UX Designer 95%, Full Stack Developer d4dx 89%) | 3 steps: Resume → Confirm skills → Review & submit → "Application sent!" confirmation. Notification generated |
| 10 | `/en/job-seeker/applications` | Reviewed tracking + withdraw | 15 total, filters (Applied/Shortlisted/Interview/Selected/Offer/Hired/Rejected), Withdraw (with "Confirm Withdrawal" step), Rate experience |
| 11 | `/en/job-seeker/applications/[id]` & `/feedback` | Opened detail + feedback | Status timeline Applied→Withdrawn, documents; feedback ratings (Communication/Process/Timeliness, recommend Y/N) |
| 12 | `/en/job-seeker/messages` | Opened | **Support-ticket desk to admin** — not employer messaging |
| 13 | `/interviews`, `/offers`, `/calendar`, `/profile-views`, `/saved-searches`, `/companies`, `/subscription`, `/profile-boost`, `/courses`, `/referral`, `/settings` | Swept all | All render; `companies` empty; `subscription` free-tier no self-upgrade |
| 14 | Mobile (390×844) | Re-ran dashboard + jobs | No horizontal overflow; bottom tab nav (Home/Jobs/Applications/Support/Profile), AI FAB |
| 15 | `/ar/job-seeker` | Switched to Arabic | Full RTL (`dir=rtl`), Arabic translation + Arabic-Indic numerals |
| 16 | APIs | Access-control probes | `/api/job-seekers` 200 (❌), `/api/job-seekers/[id]` 403 (✓), `/api/admin/users` 403 (✓), `/api/employers/candidates` 403 (✓) |

---

## 3. UX Findings

**Strengths**
- Dashboard is genuinely useful: ranked AI matches, real stats, "already applied" list, priority actions, profile-strength meter (95%), AI daily insights, quick access.
- Easy Apply is a clean, low-friction 3-step flow with a match-score reassurance and a clear "Application sent!" confirmation.
- CV Builder (AI editor + templates + formatting + AI import) is above the bar for a regional portal.
- Application tracking is well structured with status filters and inline Withdraw / Rate-experience.
- Excellent Arabic RTL and mobile experience.

**Weaknesses** (detailed in Issues sections)
- Company name renders as a placeholder in multiple candidate-facing surfaces.
- Auth screens use employer-centric marketing copy ("Elevate your hiring pipeline") on the job-seeker login/register.
- Jobs list never shows an "Applied" state; it relies on dropping applied jobs from recommendations.
- Application detail page is sparse (no link back to the job, no salary, minimal timeline).

---

## 4. Functional Gaps

1. **No direct employer↔candidate messaging.** The "Messages"/"Support" tab (`/job-seeker/messages`) is an admin support-ticket system only. Candidates cannot converse with recruiters.
2. **Companies directory is empty** (`Showing 0–0 of 0`) although jobs exist from TechPark Solutions, d4dx, and TechCorp Solutions — the company explore feature returns nothing.
3. **No self-serve subscription upgrade** — job seekers see "Contact your administrator to unlock…". No checkout path.
4. **Duplicate-application feedback is implicit** — the jobs list keeps showing "Easy Apply" after applying; protection is only "applied jobs leave the recommendations list".
5. **Interviews / Offers / advanced statuses unverifiable from this side** — require an employer to schedule/send (see BLOCKED).

---

## 5. Missing Features (expected on a modern portal)

- In-app candidate↔recruiter messaging / chat.
- Multiple tailored resume versions per application (only single CV selection at apply time).
- "Applied" badge + apply-date on the job card and job detail page.
- Salary insights / "how you compare" on job detail (a salary-explorer exists publicly but isn't surfaced in apply context).
- Interview self-scheduling with time-slot picker on the candidate side (settings hint at "Instant Interview Booking" but no live interview to test).
- Job-application analytics for the seeker (response rate, average time-to-response).
- Report/flag a job posting from the job detail page (not present in the candidate detail view).
- Resume/portfolio public share link with privacy controls.

---

## 6. Security Findings

### 🔴 P0 — IDOR / Broken Access Control: candidate PII enumeration
- **Severity:** Critical · **Impact:** GDPR/PII breach — any authenticated job seeker can dump all candidates.
- **Reproduction:**
  1. Log in as a job seeker.
  2. `fetch('/api/job-seekers?limit=5')` from the browser console (or any tool with the session cookie).
- **Expected:** `403 Forbidden` (this endpoint is documented as agent/admin scope).
- **Actual:** `200 OK` returning `total: 204` candidates with `userId.name`, `userId.email`, `phone`, `currentSalary`, `preferredSalary`, skills, experience, etc.
- **Evidence:** Emails returned included `jahfar@gmail.com`, `rameramz31@gmail.com`, `rupaniyusuf@gmail.com`, `lukmanaliziya@gmail.com`, `mohammadmuzaffar923@gmail.com`.
- **Root cause:** [src/app/api/job-seekers/route.ts](src/app/api/job-seekers/route.ts#L9) wraps the handler with `withAuth(handler)` **with no guard object**. `withAuth` without a `{ resource, action }` guard performs authentication only — every authenticated role passes. The handler then special-cases `agent` scoping but has no rejection path for `job_seeker`.
- **Inconsistency:** `GET /api/job-seekers/[id]` (single) correctly returns `403`, proving the list route is the outlier.
- **Recommended fix:** Restrict the list route to privileged roles, e.g. add an explicit guard at the top of the handler:
  ```ts
  if (!["admin", "super_agent", "agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  ```
  or pass the proper RBAC guard to `withAuth(handler, { resource: "job_seekers", action: "read" })`. Add a regression test asserting `job_seeker` → 403.

### 🟠 Medium — Resume/document storage on public CDN
- **Severity:** Medium · **Impact:** Potential unauthenticated PII (resume) access if the bucket is public.
- **Detail:** `GET /api/job-seeker/documents` returns direct CDN URLs like `https://d4dx-storage.blr1.cdn.digitaloceanspaces.com/Mployedin/documents/<uuid>.pdf`. URLs use unguessable UUIDs, but rely on obscurity rather than access control.
- **Status:** Public accessibility could not be confirmed from the browser because the app's CSP `connect-src` correctly blocks the CDN origin (a good control). **Needs server-side verification.**
- **Recommended fix:** Serve documents via short-lived **signed URLs** from a private bucket, or proxy through an authorized app route.

### ✅ Positive security observations
- `GET /api/job-seekers/[id]` → 403, `/api/admin/users` → 403, `/api/employers/candidates` → 403 (correct denials).
- Strong **Content-Security-Policy** with a tight `connect-src` allowlist.
- Email verification is enforced after registration (redirect to `/verify-email`).
- No candidate could read another candidate's *individual* profile or application via the by-ID endpoints.

> Note (Phase 14, mass-assignment / quota): not exhaustively exploited per scope; recommend a targeted check that `/api/job-seeker/profile` PATCH cannot set `role`, `userId`, `agentId`, `isProfileBoosted`, or quota fields.

---

## 7. Mobile Findings

- **No horizontal overflow** at 390×844 on dashboard (`scrollWidth 384`) or jobs page.
- Clean **bottom tab navigation** (Home · Jobs · Applications · Support · Profile) with active-state highlighting.
- Notification bell (badge "4"), language toggle (EN/AR), dark-mode toggle and an **AI Assistant FAB** all present and reachable on mobile.
- Job cards, search box, and "Refine preferences" stack cleanly.
- **Verdict:** Mobile is a strength. No P0/P1 mobile issues found.

---

## 8. Accessibility Findings

| Severity | Finding |
|---|---|
| Medium | ~5 **icon-only buttons lack an accessible name** (no text / `aria-label`) on the profile page — opaque to screen readers. |
| Medium | The **Withdraw confirmation is not a `role="dialog"`/`alertdialog`** (rendered as a plain `div`) — no focus trap / SR announcement. |
| Low | Several `<img>` elements **missing `alt`** and not marked `aria-hidden` (decorative images should be hidden, meaningful ones labelled). |
| ✅ | `html[lang]` set correctly (`en`/`ar`), `dir` flips to `rtl` for Arabic, single `<h1>` per page, visible focus rings present. |

**Recommended:** add `aria-label` to all icon buttons, wrap confirmations in a proper dialog primitive, and audit `alt` text.

---

## 9. Competitive Analysis (vs LinkedIn · Indeed · Naukri · Foundit · Glassdoor · ZipRecruiter)

| Capability | Mployedin | Market standard | Gap |
|---|---|---|---|
| AI job matching + match score | ✅ Strong | Partial (LinkedIn/ZipRecruiter) | **Ahead** |
| One-/few-click apply | ✅ 3-step Easy Apply | ✅ | Parity |
| Resume builder + AI extraction | ✅ | Partial | **Ahead** |
| Application tracking + statuses | ✅ | ✅ | Parity |
| Direct recruiter messaging | ❌ (support tickets only) | ✅ (all majors) | **Behind** |
| Company pages + reviews/ratings | ❌ (directory empty, no reviews) | ✅ (Glassdoor/Indeed) | **Behind** |
| Salary insights in-context | ⚠️ public page only | ✅ | Behind |
| Saved searches + alerts | ✅ | ✅ | Parity |
| Profile-view insights | ✅ | ✅ (LinkedIn) | Parity |
| Referral program | ✅ | ⚠️ rare | **Ahead** |
| RTL / Arabic localization | ✅ Full | ⚠️ varies | **Ahead** (Gulf focus) |
| Mobile experience | ✅ Strong | ✅ | Parity |

**Innovative opportunities:** AI Skills Coach + gap analysis, AI daily insights, and referral rewards are differentiators. Closing the **messaging** and **company pages/reviews** gaps would make the candidate side fully competitive.

---

## 10. Critical Issues (P0)

| ID | Issue | Phase | Location |
|---|---|---|---|
| C1 | **IDOR — any job seeker can enumerate all 204 candidates' PII** via `GET /api/job-seekers` (200 instead of 403). | 14 | [src/app/api/job-seekers/route.ts](src/app/api/job-seekers/route.ts#L9) |

*Reproduction / fix:* see §6. **This is the sole launch blocker.**

---

## 11. Medium Issues (P1)

| ID | Issue | Phase | Where |
|---|---|---|---|
| M1 | **Company/employer name not interpolated** — renders as literal "Company" (application detail), "at the company" (feedback), "at the employer" (notification body). Systemic across ≥3 surfaces. | 7,8,10 | `/job-seeker/applications/[id]`, `/applications/[id]/feedback`, `/api/notifications` |
| M2 | **No employer↔candidate messaging**; "Messages" tab is an admin support desk. | 8 | `/job-seeker/messages` |
| M3 | **Companies directory empty** despite active employers. | 4 | `/job-seeker/companies` |
| M4 | **Weak password policy** — only length ≥ 8 enforced client-side, no complexity. | 1 | `register/page.tsx` `handleSubmit` |
| M5 | **Resumes on public-CDN UUID URLs** — move to signed/private URLs (verify bucket ACL). | 3,14 | `/api/job-seeker/documents` |
| M6 | **Icon-only buttons & withdraw confirm lack a11y semantics.** | 13 | profile, applications |
| M7 | **No self-serve subscription upgrade** for job seekers. | 11 | `/job-seeker/subscription` |

**For each:** Severity = Medium; Impact = professionalism / conversion / a11y / security-hardening; Expected = correct name shown / direct messaging / populated list / enforced complexity / private docs / labelled controls / self-upgrade; Actual = as described; Fix = bind employer name from populated company doc; add messaging or relabel tab to "Support"; fix companies query/seed; enforce server+client password complexity; signed URLs; add `aria-label`/dialog roles; add billing checkout.

---

## 12. Low Priority Issues (P2)

| ID | Issue | Phase | Where |
|---|---|---|---|
| L1 | Auth pages use employer-centric copy ("Elevate your hiring pipeline") on the job-seeker login/register. | 1 | `(auth)` layout |
| L2 | Jobs list never shows an "Applied" badge on already-applied roles. | 6 | `/job-seeker/jobs` |
| L3 | Internal seed tag `seed-demo-2026-06` leaks into job-detail "search terms". | 5 | `/job-seeker/jobs/[id]` |
| L4 | Application detail page is sparse — no link to the job posting, no salary, minimal timeline. | 7 | `/job-seeker/applications/[id]` |
| L5 | No mobile OTP / phone verification on signup. | 1 | registration |
| L6 | Font preload warning (`woff2` preloaded but unused) on most pages. | 12 | global |

---

## 13. Production Readiness Score — Job Seeker side: **72 / 100**

| Dimension | Score | Notes |
|---|---|---|
| Functionality & workflows | 17/20 | Apply, track, profile, CV, search all work end-to-end |
| UX / UI polish | 16/18 | Strong; minor placeholder & copy issues |
| Security | 7/20 | One P0 IDOR + public-CDN docs heavily penalize |
| Mobile | 9/10 | Excellent |
| Accessibility | 6/10 | Icon-button labels & dialog semantics |
| Localization (RTL/Arabic) | 9/10 | Full RTL, localized numerals |
| Competitive completeness | 8/12 | Missing messaging & company reviews |

---

## 14. Recommendation — **NO-GO (conditional)**

**Do not launch the job-seeker side until C1 (the `/api/job-seekers` IDOR) is fixed.** It is a critical, easily-exploited PII/GDPR exposure, but the fix is small and localized (add a role guard + regression test). Once C1 is remediated and M1 (company-name binding) is corrected, the job-seeker experience is **GO** — it is otherwise feature-complete, polished, mobile-strong, and fully localized, and in several areas (AI matching, CV builder, RTL) ahead of regional competitors.

---

## 15. Prioritized Roadmap

### P0 — before launch
- **C1** Add role authorization to `GET /api/job-seekers` (allow admin/super_agent/agent only) + regression test asserting `job_seeker → 403`.

### P1 — launch-week
- **M1** Fix employer/company-name interpolation across application detail, feedback, and notifications.
- **M5** Move resumes/documents to signed/private URLs; verify Spaces bucket ACL.
- **M4** Enforce server-side + client-side password complexity.
- **M2/M3** Decide messaging strategy (build candidate↔recruiter chat or relabel "Messages"→"Support"); fix/populate the Companies directory.
- **M6** Add `aria-label`s to icon buttons; wrap confirmations in a proper dialog primitive.

### P2 — fast-follow
- **M7** Self-serve subscription checkout.
- **L1–L6** Job-seeker-specific auth copy; "Applied" badge on job cards; strip internal seed tags; enrich application detail (link to job, salary, timeline); optional phone OTP; fix font preload.

---

### Coverage & BLOCKED items
- **Exercised:** every accessible job-seeker route, the Easy-Apply modal (all steps + live submit), search/filter, withdraw confirmation, feedback form, notifications, mobile viewport, Arabic RTL, and access-control API probes.
- **BLOCKED (require an employer/agent to advance state):** Phase 9 Interview management (0 interviews), Phase 10 Offers (0 offers), and the Shortlisted/Interview/Selected/Offer/Hired application states. Phase 1 live registration submit was BLOCKED by the local environment (autofill + background redirect) and documented from UI + source instead.
