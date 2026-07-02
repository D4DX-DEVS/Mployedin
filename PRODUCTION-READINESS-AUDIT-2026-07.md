# Production Readiness Audit — Mployedin

**Date:** 2026-07-02
**Scope:** Full codebase (`src/`, ~1,354 TS/TSX files). Six parallel specialist passes: security, API correctness, React/frontend, MongoDB/Mongoose, silent-failure hunt, missing-feature sweep. Plus `tsc` typecheck.
**Excluded (already documented):** Role/access-control matrix — see [ACCESS-CONTROL-FINDINGS.md](ACCESS-CONTROL-FINDINGS.md) and [ACCESS-CONTROL-MAP.md](ACCESS-CONTROL-MAP.md). Payment integration is known-pending; only mapped, not counted against readiness.

---

## Fixes Applied — 2026-07-02

Verification after fixes: **`tsc` 0 errors · security tests 41/41 · full suite 578 pass** (27 failures are pre-existing, in tests for untouched code — Mongoose query-chain mocks missing `.sort()`/`.select()`, not regressions).

**Done:**
- **P0-2** rate-limit fail-closed: added `failClosed` option; wired `failClosed:true` into all auth routes (login/register/OTP/forgot/reset/resend/verify); Redis failure now denies instead of silently falling to bypassable in-memory. (`rateLimit.ts` + 7 auth routes)
- **P0-3** silent notifications: replaced empty `.catch(()=>{})` with structured `logger.error/warn` across applications, jobs/apply, commissions, leads/convert, email-change, interviews/respond, cron notifiers, webhookDispatcher, notifications/trigger. Non-blocking but now visible.
- **P1-6** SMTP decrypt failure now logged (was silent plaintext fallback).
- **P1-7** crons (`subscription-expiry`, `invoice-overdue`, `offer-expiry`) now log + return HTTP 500 on partial failure so the platform sees/retries.
- **P1-9** added compound indexes: Jobs `(employerId,status)` & `(agentId,status,createdAt)`, Offers `(status,expiresAt)`.
- **P2** pagination `parseInt(x,10)` + NaN/bounds guards (commission-payouts, commissions, email-logs, companies); `Math.ceil(total/limit)` guarded; SavedJob E11000→409; `unsubscribe` JWT `?? ""` removed + `algorithms:["HS256"]`; cron replay window 300→120s; verify-email enumeration closed; impersonate rate-limited; reCAPTCHA via URLSearchParams; encryption key lazy-validated to 32 bytes.
- **Frontend:** `RecommendedJobs` mutation now checks `r.ok`; `InvoiceDetailView` hydration `Date` deferred; `InvoiceBuilder` line items keyed by stable `id`; `InterviewBookingModal` surfaces load errors; `RecruitmentAssistant` keys fixed.
- **Infra:** `/api/health` liveness endpoint; `eslint.config.mjs` (was no lint gate); boot-time env validation warns on missing `UPSTASH_*`; `ReferralLink.registrations` capped 5000, `Agent.activityLog` capped 200; redundant `ReferralLink.code` index removed.
- **Cleanup:** removed regenerable artifacts (`bash.exe.stackdump`, temp typecheck/lint logs).

**Deferred (need your decision — cost/scope/provider choices, not mechanical):**
- **P0-1 Sentry** — the client `reportError` helper already auto-forwards to Sentry if present; it just needs `npm i @sentry/nextjs` + init + `NEXT_PUBLIC_SENTRY_DSN` (a paid-provider decision, so not auto-installed).
- **P1-8 denormalized arrays** (`Job.applicantIds`, `JobSeeker.applicationIds`) — removing them is a 19-file refactor touching hooks/pages/tests; left in place (16 MB doc ≈ 1.4M refs/job, not a near-term blocker). The genuinely-unbounded ones (`registrations`, `activityLog`) were capped.
- **P1-10 cascade delete** on Job removal — needs a decision on soft-delete vs cleanup job.
- **P3** ~50 undocumented env vars, ~148 `console.*`→logger migration, ~42 `<img>`→`next/image`, 30 untracked one-off root scripts (`_*.js`/`_*.mjs` — your i18n/migration work; delete when you're sure).
- Note: two audit "findings" were stale — `uploadLarge` **already** validated files and presigned TTL was **already** 600s; no change needed there.

---

## Verdict

**Not production-ready yet, but close.** No data-loss or auth-bypass defects found in the audited (non-access-control) surface. Blockers are operational: no error monitoring wired, distributed rate-limiting can silently degrade, and a cluster of fire-and-forget notification/email calls that fail invisibly. TypeScript compiles clean (0 errors). Fix the P0/P1 list below before launch; P2/P3 can follow.

### Corrections to raw agent output (verified by hand)

Three findings were **overstated** by the automated passes. Corrected here so you don't chase ghosts:

| Raw claim | Reality (verified) | Real severity |
|---|---|---|
| "`.env` with live secrets committed to git — CRITICAL, rewrite history" | **Never committed.** `git log --all -- .env` is empty across 165 commits; `.gitignore:35` has `.env*`. Secrets live only in the working tree. | P3 (hygiene) — no history rewrite needed |
| "`unsubscribe` JWT missing `algorithms` → alg-confusion, CRITICAL" | Secret is **symmetric HS256**; alg-confusion (RS→HS) not exploitable, and `jsonwebtoken` v9 rejects `alg:none` when a secret is passed. Real issue is only the `?? ""` empty-string fallback. | P2 |
| "SavedJob race → duplicate saves, data integrity" | Unique index **exists** (`SavedJob.ts:23`). No dupes possible. Real bug: find-then-create throws uncaught `E11000` → 500 instead of 409. | P2 (bad error handling) |

---

## P0 — Blockers (fix before launch)

### 1. No error monitoring in production
`src/lib/observability/report-error.ts` is scaffolding only — errors go to `console` (line ~37). Sentry never installed/initialized. With 148 `console.*` calls scattered across API + client code, you have **no way to see production failures**.
**Fix:** `npm i @sentry/nextjs`, set `NEXT_PUBLIC_SENTRY_DSN`, init in `instrumentation.ts`. Route the report-error helper to Sentry.

### 2. Distributed rate limiting silently degrades to per-instance
`src/lib/security/rateLimit.ts:135-151` — on Upstash Redis error/timeout it falls through to an **in-memory** store. On serverless each instance has its own counter, so auth/OTP/password-reset limits become bypassable by spreading load, and reset on cold start. Fails *open*, silently.
**Fix:** Fail **closed** on Redis error for auth-class endpoints (login, OTP, password-reset, register). Allow in-memory fallback only for non-critical routes, and emit an alert metric when it happens. Confirm `UPSTASH_REDIS_REST_URL` / `_TOKEN` are set in prod.

### 3. Critical notifications fire-and-forget with empty `.catch()`
Widespread `notify(...).catch(() => {})` / `inngest.send(...).catch(() => {})` on user-facing milestones. User sees "success" but the email/event never fires and nothing is logged. Highest-impact instances:

| File:line | What's lost |
|---|---|
| `src/app/api/applications/route.ts:636` | Applicant "application received" email |
| `src/app/api/applications/route.ts:655` | AI-screening Inngest event → application stuck "pending", never scored |
| `src/app/api/applications/[id]/route.ts:214-218` | Interview-invite / offer / rejection emails to candidate |
| `src/app/api/jobs/[id]/apply/route.ts:145,166,187,198,212,223` | 6× apply-flow notifications |
| `src/lib/communications/email.ts:199,212` | Email delivery-log writes (audit trail) |
| `src/app/api/commissions/[id]/route.ts:134,140,156,162` | Commission approval/payment notices (financial) |

**Fix:** Replace empty catches with structured `logger.error({ err, ctx })`. For anything that must arrive (applicant/candidate milestone emails, AI scoring), send through Inngest with retries rather than fire-and-forget.

---

## P1 — High (fix before or immediately after launch)

### 4. Large-file upload path skips all validation
`src/lib/storage/spaces.ts` `uploadLarge()` (~161-200) has **no** magic-byte / MIME / size check and **no** malware scan — only `uploadFile()` validates. Any route streaming large files trusts `ContentType` blindly.
**Fix:** Validate first chunk (magic bytes) + enforce size ceiling + run `scanForMalware()` before/around the streamed upload, same as `uploadFile()`.

### 5. Presigned download URLs are broad and long-lived
`spaces.ts:276-289` — default TTL 3600s, no caller binding, no size/MIME scoping. A leaked CV/document URL is replayable for an hour.
**Fix:** Drop TTL to 5–10 min for sensitive docs (CVs, IDs); bind to the requesting user; validate via `HeadObjectCommand` where feasible.

### 6. SMTP password can persist in plaintext
`src/lib/communications/email.ts:~48-150` — employer SMTP password path does `try { password = decrypt(password) } catch { /* already plain */ }`, then uses plaintext if decrypt fails. Silent-fail masks unencrypted storage; no audit log on credential change.
**Fix:** Enforce encrypt-on-save; throw (don't swallow) on decrypt failure; add audit log for SMTP credential changes.

### 7. Cron/subscription/invoice jobs return 200 on partial failure
- `src/app/api/cron/subscription-expiry/route.ts:156-161` — collects errors, continues, returns 200. Failed renewals → user keeps paid plan but loses access; revenue tracking drifts.
- `src/app/api/cron/invoice-overdue/route.ts:51,76` — same pattern; invoices silently not marked overdue.
- `src/app/api/cron/offer-expiry/route.ts:47-67` — `notify(...).catch(()=>{})` inside the loop; offers expire, users never told.
**Fix:** Track failure count; return non-2xx (or a structured `{errors}` with alert) when failures exceed a threshold; dead-letter for manual replay.

### 8. Three unbounded arrays that grow forever
| Field | File | Growth |
|---|---|---|
| `Job.applicantIds` | `src/models/Job.ts:116` | every applicant, `$addToSet` per application |
| `JobSeeker.applicationIds` | `src/models/JobSeeker.ts:165` | every application |
| `ReferralLink.registrations` | `src/models/ReferralLink.ts:54` | every referral signup |
Plus `Agent.activityLog` (no rotation). Risk: 16 MB document ceiling, write amplification, replication lag at scale.
**Fix:** Drop the denormalized `applicantIds`/`applicationIds` — query the `Application` collection (already indexed). Move `ReferralLink.registrations` to its own collection or cap it. Rotate `activityLog` (keep last N).

### 9. Missing compound indexes on hot paths
Add to `src/lib/db/indexes.ts`:
```js
// Jobs
{ key: { employerId: 1, status: 1 } },
{ key: { agentId: 1, status: 1, createdAt: -1 } },
// Offers (cron scans full collection today)
{ key: { status: 1, expiresAt: 1 } },
// Agents
{ key: { isActive: 1 } },
```
Without these, employer/agent job lists and the offer-expiry cron do collection scans (10–100× slower as data grows).

### 10. No cascade / orphan handling on delete
Deleting a Job leaves `Application` docs pointing at a missing `jobId`. Confirm every hard-delete either soft-deletes or cleans dependents.

### 11. Frontend save/mutation swallows API errors
`src/components/features/job-seeker/dashboard/RecommendedJobs.tsx:138` — `fetch(...).then(r => r.json())` with no `r.ok` check; a 4xx/5xx parses as success, save silently no-ops with no toast. Pattern repeats in several `useMutation` calls lacking `onError`.
**Fix:** Check `r.ok`, reject with server error, surface a toast. Audit mutations for missing `onError`.

---

## P2 — Medium

- **`parseInt` without radix** (pagination): `commission-payouts/route.ts:136-137`, `commissions/route.ts:24-25`, `admin/email-logs`, `companies` and others. Input `"010"` → 8. Add `, 10`.
- **`pages: Math.ceil(total/limit)`** with no `limit>0` guard → `Infinity`/`NaN` on bad input (`admin/audit-logs/route.ts:50`).
- **SavedJob find-then-create** → uncaught `E11000` → 500 not 409 (`saved-jobs/route.ts:58-71`). Catch code 11000, return 409.
- **Hydration mismatch — `new Date()` in `useState`**: `InvoiceDetailView.tsx:145`, `GoogleCalendar.tsx:945-946`. Defer to `useEffect`.
- **`key={i}` on dynamic/reorderable lists** → wrong-row state after add/delete/reorder: `InvoiceBuilder.tsx:1644` (line items), `RecruitmentAssistant/index.tsx:785` (chat) & `:1123` (errors). Use stable IDs.
- **`unsubscribe` JWT hardening**: `unsubscribe/route.ts:7` drop `?? ""` (throw if unset); add `{ algorithms: ["HS256"] }` at verify (defense-in-depth).
- **No rate limit on `/api/admin/impersonate`** — add per-admin cap.
- **reCAPTCHA secret in POST body** (`contact/route.ts:34`) can land in request logs.
- **Cron replay window 5 min** (`cron-auth.ts:40`) — tighten to ~60s, consider nonce.
- **Malware-scan error matched by string** not `instanceof` (`spaces.ts`) — fragile; a rename disables detection.
- **N+1 population** 3+ levels deep (`jobs/route.ts:199-207`, Job→Agent→User→SuperAgent→User) — `.lean()` helps; profile on large result sets.
- **Frontend fetches swallowing to empty/null**: `InterviewBookingModal.tsx:107` (→ empty jobs, looks broken), `EasyApplyFlowDialog.tsx:113`, exchange-rate hooks, super-agent settings saves (`super-agent/settings/page.tsx` 6× empty catch → settings silently don't persist).

---

## P3 — Low / polish

- **`.env` hygiene**: not in git (verified) but holds real live secrets in the working tree. If those are production creds, move to a secrets manager and rotate on any laptop/backup exposure. No git-history rewrite needed.
- **148 `console.*` in non-test code** (worst: `ai/chat/route.ts`, `ai/speech-to-text/route.ts`, `employer/applications/page.tsx` — client). Replace with `pino` logger; strip from client bundles.
- **No ESLint config** — `npx eslint` fails (no `eslint.config.js`); `next lint` removed in Next 16. There's no lint gate at all. Add a flat config so CI can catch regressions.
- **~42 native `<img>`** vs 15 `next/image` — migrate hot pages for LCP.
- **No `/api/health`** liveness/readiness endpoint (only `admin/system-health`). Add for orchestration.
- **~50 undocumented env vars** used in code but absent from `.env.example` (e.g. `AI_DAILY_LIMIT`, `CRON_SELF_URL`, `DO_SPACES_*`, `DXING_*`, `MONGODB_MAX_POOL_SIZE`, `MALWARE_SCAN_*`, `SONIOX_API_KEY`). Document + add fail-fast validation in `instrumentation.ts` for the critical ones.
- **Email verification enumeration** (`verify-email/route.ts:76-86`) — "already verified" vs "bad code" leaks account existence. Return a generic message.
- **`ENCRYPTION_KEY` unvalidated** — assert 32 bytes (64 hex) at boot.
- **Redundant index** on `ReferralLink.code` (schema `unique` + explicit).
- **Open TODOs**: `agent-register/route.ts:94` (verification email not sent), `security/headers.ts:37` (drop `unsafe-inline`), `Sidebar.test.tsx:38`.

---

## Known-pending (not counted — you already know)

- **Payments/subscriptions stubbed**: `src/lib/payments/stripe.ts` & `razorpay.ts` throw "not yet configured"; `subscriptions/checkout/route.ts:68-78` returns 503. UI messages the gap. Wire a gateway + webhook verification when ready.
- **Auto-apply disabled**: `cron/autoapply/route.ts:19-21` early-returns 503; UI tab commented out; Inngest fn unregistered (`inngest/route.ts:15`).

---

## What's already solid

Security headers (CSP w/ nonce, HSTS, X-Frame DENY, nosniff, Permissions-Policy) · Zod validation across routes · magic-byte validation on `uploadFile` · CSRF protection · password-reset token hashing · TOTP 2FA + recovery codes · impersonation audit logging · sensitive fields `select:false` + encrypted · serverless-safe Mongoose connection cache · TTL indexes (EmailLog 90d, sessions) · soft-delete on Job · text search index · robots.txt + dynamic sitemap · **`tsc` clean (0 errors)**.

---

## Suggested fix order

1. **Wire Sentry** (P0-1) — you're blind until this lands.
2. **Fail-closed auth rate limiting** (P0-2).
3. **Kill empty `.catch()` on milestone notifications/emails** → log + route must-deliver through Inngest (P0-3).
4. **Upload validation on `uploadLarge` + tighten presigned URLs** (P1-4/5).
5. **Cron partial-failure reporting** (P1-7).
6. **Add the 4 compound indexes + start removing unbounded arrays** (P1-8/9).
7. **Frontend error surfacing + hydration `Date` + `key={i}` fixes** (P1-11, P2).
8. **P2/P3 cleanup**: parseInt radix, ESLint config, env docs + boot validation, console→logger.

*Line numbers are from the 2026-07-02 tree; re-grep before editing.*
