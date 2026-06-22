# Security Review — Mployedin

**Date:** 2026-06-22
**Reviewer role:** Senior Developer / Tester / Security Manager
**Scope:** Full Next.js 16 (App Router) + NextAuth v5 + Mongoose/MongoDB application (`d:\Mployedin\mployedin`), 407 API route files.
**Methodology:** Attacker-minded review against the 10-point Backend Security Checklist. Core security primitives read in full; high-risk endpoints (auth, IDOR-prone `[id]` routes, uploads, payments, CMS) sampled and verified at file:line. Dependency audit via `npm audit`. Findings labeled **VERIFIED** (read the code) or **NOT VERIFIED** (infra/ops, can't confirm from source).

---

## 1. Executive Summary

Mployedin has a **mature, security-conscious foundation** that is well above typical "vibe-coded" apps: a centralized `withAuth` RBAC wrapper, bcrypt(12) passwords, per-account lockout + per-IP login throttle, TOTP 2FA with encrypted secrets, JWT sessions with a 5-minute DB re-check (catches deactivation + password change), CSRF double-submit, a nonce-based CSP with HSTS preload, AES-256-GCM field encryption, signed/replay-protected cron auth, magic-byte file validation, and a malware-scan hook. Secrets are not committed and env vars fail-fast at boot.

The residual risk is concentrated in **two areas**:

1. **Object-level authorization gaps (IDOR/BOLA)** on a handful of endpoints that fetch/mutate by `[id]` without an ownership filter. The most serious — `offer-letters/[id]` — lets **any authenticated user read, send, sign, decline, edit, or delete anyone's offer letter**.
2. **The rate limiter is an in-memory `Map`.** On serverless/multi-instance hosting each instance has its own counter, so brute-force, OTP-spam, password-reset-spam, and AI-cost-abuse protections are effectively per-instance and bypassable. Account lockout (DB-backed) still holds, but IP throttling does not.

| Risk posture | Rating |
|---|---|
| Authentication core | **Strong** |
| Object-level authorization (IDOR) | **Needs fixes** (1 high, several medium) |
| Abuse / rate limiting | **Weak in production** (in-memory store) |
| Secret management | **Strong** |
| Input validation / injection | **Good** |
| File upload | **Strong** (AV is config-dependent) |
| Dependencies | **Needs patching** (4 high, 42 moderate) |
| Logging / monitoring | **Good** (no alerting layer) |

**No confirmed critical, unauthenticated, pre-auth RCE/SQLi/secret-leak.** The headline fixes are the `offer-letters` IDOR and moving rate limiting to a shared store (Upstash Redis is already a dependency).

---

## 2. Severity-Ranked Findings

| # | Severity | Category | Finding | Location |
|---|---|---|---|---|
| F1 | **HIGH** | 1. Authorization | `offer-letters/[id]` GET/PATCH/DELETE have **no ownership and no role guard** — any authenticated user can read/send/sign/decline/edit/delete any offer letter | [offer-letters/[id]/route.ts](src/app/api/offer-letters/[id]/route.ts#L13) |
| F2 | **HIGH** | 2. Rate limiting | Rate limiter is in-memory `Map`; ineffective across serverless instances / cold starts — weakens brute-force, OTP/reset spam, and AI-cost protection | [rateLimit.ts](src/lib/security/rateLimit.ts#L16) |
| F3 | **HIGH** | 8. Dependencies | 46 known vulns (4 high: `next-intl`, `nodemailer`, `form-data`, `@grpc/grpc-js`; 42 moderate incl. `dompurify`, `postcss`) | `package.json` |
| F4 | **MED** | 1. Authorization | `placements/[id]` **GET** returns any placement (candidate PII + salary) with no ownership check (PATCH/DELETE are correctly scoped) | [placements/[id]/route.ts](src/app/api/placements/[id]/route.ts#L41) |
| F5 | **MED** | 1. Authorization | `requisitions/[id]` **GET** returns any requisition with no ownership check (PATCH/DELETE scoped) | [requisitions/[id]/route.ts](src/app/api/requisitions/[id]/route.ts#L14) |
| F6 | **MED** | 1. Authorization | `employers/[id]` **GET** returns any employer's `User` doc (name/email/profile) to any authenticated role (PATCH/DELETE scoped) | [employers/[id]/route.ts](src/app/api/employers/[id]/route.ts#L13) |
| F7 | **MED** | 1. Authorization | `assessments/[id]` GET leaks full assessment incl. answer keys to employer/agent roles; POST lets any job seeker submit any assessment (no assignment check) | [assessments/[id]/route.ts](src/app/api/assessments/[id]/route.ts#L19) |
| F8 | **MED** | 1. Authorization | Subscription function-level authz: any `agent` can change/assign **any** user's plan; any `super_agent` can cancel **any** subscription — no "is this user in my scope" check | [subscriptions/change/route.ts](src/app/api/subscriptions/change/route.ts#L28), [subscriptions/[id]/route.ts](src/app/api/subscriptions/[id]/route.ts#L42) |
| F9 | **MED** | 5/8. XSS defense | `blog`, `gdpr`, `cookies` pages render `body` via `dangerouslySetInnerHTML` **without** render-time sanitization (terms/privacy do). Write-time sanitize exists, so latent, not live — but `dompurify` has open bypass advisories | [blog/[slug]/page.tsx](src/app/[locale]/(public)/blog/[slug]/page.tsx#L118) |
| F10 | **MED** | 6/7. AV coverage | Malware scanning is wired in but the real remote scan only runs if `MALWARE_SCAN_URL` is set; otherwise only the EICAR test-string tripwire runs (catches no real malware) | [malware-scan.ts](src/lib/security/malware-scan.ts#L79) |
| F11 | **LOW** | 1. Authorization | `applications/[id]/notes` POST allows any agent (not just assigned) to add notes | [applications/[id]/notes/route.ts](src/app/api/applications/[id]/notes/route.ts#L22) |
| F12 | **LOW** | 6. Database | Inconsistent soft-delete + no schema-level cascade → orphaned records on hard delete | models (see GAP-REPORT C1/C2) |
| F13 | **LOW/INFO** | 5. XSS defense | `testimonials` PATCH stores `quote` unsanitized — **not exploitable** today (rendered as escaped JSX text, not `dangerouslySetInnerHTML`), but fix for defense-in-depth | [testimonials/[id]/route.ts](src/app/api/admin/cms/testimonials/[id]/route.ts#L29) |
| F14 | **INFO** | 9/10. Ops | No circuit breakers on external calls; no alerting/SIEM layer on the existing audit log | — |

---

## 3. Checklist Walkthrough (1–10)

### 1) Broken Authorization — ⚠️ Strong framework, several object-level gaps
**What's good:** Almost all routes use `withAuth(handler, { resource, action })` ([withAuth.ts](src/lib/auth/withAuth.ts#L77)) which enforces authentication + a central RBAC matrix, plus tenant-view re-authorization on every request, write-scoping, and auto-audit. Most `[id]` routes correctly scope DB queries by owner (e.g. `talent-pools`, `saved-searches`, `portfolio`, `agent/tasks`, `leads`, `commissions`, `interviews`, `invoices`, `offers`, `dm` participants, `job-seekers`).

**The gap:** RBAC ("can this *role* do this action") is enforced centrally, but **object ownership ("does this *record* belong to this user") is per-handler** and a few handlers skip it:

- **F1 (HIGH) `offer-letters/[id]`** — `OfferLetter.findById(id)` on GET/PATCH/DELETE with `withAuth(getHandler)` (no resource/action guard). A job seeker or any logged-in user can iterate IDs to read offers, and PATCH branches on `body.action` to `send`/`sign`/`decline`/`edit`/`view` *any* letter:
  ```ts
  // offer-letters/[id]/route.ts
  const letter = await OfferLetter.findById(id);          // no owner filter
  if (body.action === "sign") { letter.status = "signed"; await letter.save(); }
  ```
- **F4/F5/F6** — `placements/[id]`, `requisitions/[id]`, `employers/[id]` GET handlers fetch by id with no owner filter (their PATCH/DELETE *are* scoped — so the helper already exists, it's just not called on GET).
- **F7** — `assessments/[id]` leaks answer keys to non-job-seeker roles and accepts unscoped submissions.
- **F8** — subscription mutation routes gate by role but not by "is this target user in my book of business."

**Rule to enforce:** never trust an id from the client; every fetch/mutate must include the owner in the query (`Model.findOne({ _id: id, <ownerField>: ctx.<owner> })`) or call a `verifyOwnership()` helper *before* returning/mutating — including on **GET**.

### 2) Rate Limiting & Abuse — ⚠️ Correctly placed, wrong backing store
**What's good:** Sensitive endpoints all have limits: login IP throttle 10/5min + per-account lockout 5/15min ([config.ts](src/lib/auth/config.ts#L52)), 2FA guess throttle 8/5min, `forgot-password` 5/5min, `reset-password` 5/5min, `resend-verification` 3/5min, `verify-email` 10/5min, register 10/min, plus per-user+IP dual-key limits on AI/bulk/leads/applications.

**F2 (HIGH):** `rateLimit.ts` uses `const store = new Map()` with a comment "For production: swap with Upstash Redis." On Vercel/serverless each lambda has its own memory, so an attacker spreading requests across instances (or triggering cold starts) bypasses every IP/user limit. The **DB-backed account lockout still works** (it's the real brute-force backstop), but OTP/reset spam, AI cost abuse, and IP throttling are weak. `@upstash/ratelimit` + `@upstash/redis` are **already installed** — wire them into `checkRateLimit`/`checkRateLimitDual`.

### 3) Secret Management — ✅ Strong
- `.env*` is git-ignored ([.gitignore](.gitignore#L30)) and `git ls-files` confirms **no `.env` is tracked**.
- `validateEnv()` fails fast at boot, enforcing `NEXTAUTH_SECRET` ≥ 32 chars and `ENCRYPTION_KEY` = 64 hex ([env.ts](src/lib/env.ts#L18)).
- AES-256-GCM encryption for secrets at rest (2FA secret, LinkedIn token) ([encryption.ts](src/lib/security/encryption.ts)).
- No hardcoded credentials in sampled files; **no secrets written to logs** (grep for `console.log(...password|secret|token...)` returned only "not configured" messages).
- Cron secret never compared non-constant-time.

### 4) JWT & Session Security — ✅ Strong containment
- JWT strategy; access TTL **1h** (default) / **3 days** (remember-me) ([config.ts](src/lib/auth/config.ts#L407)).
- **DB re-check every 5 min** validates `isActive` and `passwordChangedAt` → deactivated users and post-password-change tokens are invalidated within the update window, not at max-age (the W2-1 fix). Logout is effective.
- 2FA TOTP (admin/super_agent), encrypted secret, single-use recovery codes.
- Tenant-view ("impersonation") uses a **signed cookie + live DB session + per-request re-eligibility check**; DELETE restricted to admin; all writes auto-audited ([withAuth.ts](src/lib/auth/withAuth.ts#L120)).
- Session cookie is `sameSite=lax` (v5 default, not overridden) — this is the invariant that makes the CSRF-exempt AI routes safe. **Do not change it to `none`.**
- *Note:* stateless JWT means no instant global revocation list; the 5-min DB re-check is the mitigation. Acceptable, but if you need instant kill-switch, add a token `jti`/`tokenVersion` check.

### 5) Input Validation — ✅ Good
- Zod schemas via `validateBody(req, schema)` across the API; `validateBody` throws a `NextResponse` that `withAuth` surfaces as a clean 400.
- Search inputs consistently pass through `escapeRegex()` / inline escaping (`leads`, `interviews`, `users/search`, `talent-search`, `exhibitions`, `cms`, `saved-search-alerts`) → ReDoS/operator-injection mitigated.
- `isValidObjectId()` guards id params; magic-byte validation on files (see #7).
- **Minor:** a few handlers read `await req.json()` directly without a zod schema (`offer-letters` PATCH `body.action`, `requisitions` PATCH) — combine with the F1/F5 fixes.

### 6) Database Security — ✅ Good queries / ⚠️ least-privilege not verifiable
- Mongoose parameterizes queries (no string-concatenated NoSQL); `autoIndex:false` in prod; centralized compound indexes.
- **NOT VERIFIED:** DB user least-privilege. A single `MONGODB_URI` is used app-wide — likely one read/write app user. Can't confirm a restricted role from source; recommend a dedicated least-privilege Atlas user (no `dbAdmin`/`clusterAdmin`) and network allow-listing.
- **F12 (LOW):** soft-delete only on `Job`/`ExhibitionRequest`; no schema-level cascade hooks → hard deletes can orphan dependent records (Applications/Interviews/Commissions). Recoverability + referential-integrity concern, not a direct breach.

### 7) File Upload Security — ✅ Strong
- `validateUploadedFile()` enforces size cap, MIME whitelist, and **magic-byte signature match** (rejects spoofed types, validates DOCX ZIP structure) ([file-validation.ts](src/lib/security/file-validation.ts#L70)).
- S3/Spaces object key = `${prefix}/${folder}/${randomUUID()}${ext}` — **server-generated, no user filename** → no path traversal; ContentType pinned; CV uploads use `private` ACL.
- `scanForMalware()` runs before persistence, **fail-closed** by default.
- **F10 (MED):** the real AV scan only runs when `MALWARE_SCAN_URL` is configured; otherwise only the local EICAR tripwire runs. Confirm the scanner URL is set in production (and `MALWARE_SCAN_FAIL_OPEN` is not `true`).
- *Minor:* `onboarding/[id]/upload` and `employers/documents` rely on `uploadFile()`'s internal validation rather than calling `validateUploadedFile()` directly — works, but call it explicitly for defense-in-depth.

### 8) Dependency Security — ⚠️ Patch needed
`npm audit` (prod): **46 vulnerabilities — 4 high, 42 moderate, 0 critical** across 912 prod deps.
- **High:** `next-intl` (via `postcss`), `nodemailer` (≤9.0.0), `form-data` (<2.5.6), `@grpc/grpc-js` (transitive, Google/Firebase).
- **Moderate of note:** `dompurify` ≤3.4.10 — *SAFE_FOR_TEMPLATES / `<template>` sanitizer bypass* (directly relevant to your XSS defense in F9), `postcss` (<8.5.10 `</style>` XSS).
- Most fix via `npm audit fix`; `postcss`/`nodemailer` chains need `npm audit fix --force` (test for breaking changes). **No evidence of Dependabot/Snyk/Trivy in CI** — add automated scanning.

### 9) Failure Handling — ✅ Reasonable
- `withAuth` wraps handlers in try/catch and returns a **generic** `{ error: "Internal server error" }` 500 (no stack/PII leak); validation errors surface as 400.
- Mongoose connection is cached/singleton; external calls (malware scan) use `AbortSignal.timeout`; email sends are `.catch()`-guarded so they don't fail the request.
- **F14 (INFO):** no circuit breakers/retry-with-backoff around third-party APIs (Gemini/Anthropic/Firebase/Pusher/SMTP); a provider outage degrades the dependent feature. Add timeouts + graceful fallbacks on the AI/realtime paths.

### 10) Logging & Monitoring — ✅ Good telemetry, no alerting
- `pino` structured logger + `logActivity()` → `AuditLog`/`ActivityEvent`. Captures `login.success`/`login.failed` (with reason), `account.locked`, `2fa.recovery_code_used`, permission context, and **auto-audits all tenant-view writes** and CMS changes.
- **Gap:** logging exists but there's **no alerting/SIEM** wiring (no "alert on auth-failure spike / rate-limit violation / permission-denial burst"). You can observe an attack after the fact but won't be paged during one. Ship audit events to a monitor (Datadog/Sentry/Grafana) with threshold alerts.

---

## 4. Prioritized Remediation Roadmap

### Do now (this sprint)
1. **F1 — Fix `offer-letters/[id]`**: add a real RBAC guard and ownership check on GET/PATCH/DELETE. Resolve the letter → offer → employer/candidate and verify `ctx` owns it; gate `action: "sign"/"decline"` to the candidate, `"send"/edit` to the owning employer/agent.
2. **F2 — Move rate limiting to Upstash Redis** (already a dependency). Replace the `Map` in `checkRateLimit`/`checkRateLimitDual` with `@upstash/ratelimit` sliding window; keep the DB lockout as backstop.
3. **F4/F5/F6 — Add ownership filters to the GET handlers** of `placements/[id]`, `requisitions/[id]`, `employers/[id]` (reuse the checks already present on their PATCH/DELETE).
4. **F3 — `npm audit fix`** for the non-breaking set; schedule the `--force` chain (`postcss`/`nodemailer`) behind a test pass. Prioritize `dompurify` (it underpins your XSS defense).

### Next (this month)
5. **F7/F8 — Add object scoping** to `assessments/[id]` (assignment check) and subscription mutate/cancel routes (target-user-in-scope check).
6. **F9 — Sanitize on render** in `blog`/`gdpr`/`cookies` (wrap `body` in `sanitizeHtml()` like terms/privacy already do) — belt-and-suspenders with the write-time sanitize.
7. **F10 — Verify `MALWARE_SCAN_URL` is set** in production and `MALWARE_SCAN_FAIL_OPEN` is unset/false.
8. **Add automated dependency scanning** (Dependabot/Snyk) + **alerting** on the audit log (auth-failure/permission-denial spikes).

### Backlog / hardening
9. F11 agent-scope on application notes; F12 soft-delete + cascade strategy; F13 sanitize testimonials write; dedicated least-privilege MongoDB user; circuit breakers on external APIs; consider `tokenVersion` for instant session revocation.

---

## 5. What's Done Well (keep it)

- Centralized `withAuth` + permission matrix; tenant-view with continuous re-authorization and auto-audit.
- bcrypt(12), account lockout, IP login throttle, TOTP 2FA, encrypted secrets at rest.
- JWT with 5-minute DB revalidation (deactivation + password-change invalidation).
- CSRF double-submit (constant-time compare), nonce-based CSP, HSTS preload, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`.
- Magic-byte file validation + UUID storage keys + private CV ACL + fail-closed malware hook.
- Signed, replay-protected, constant-time cron authentication.
- Secrets not committed; env fail-fast; no secret logging.
- Consistent `escapeRegex` usage; broad Zod validation; structured audit logging.

---

## 6. Methodology & Coverage Notes

- **Verified at file:line:** all core security primitives (`withAuth`, NextAuth config, CSRF, rate limiter, cron auth, file validation, malware scan, encryption, env, headers); ~30 high-risk endpoints across invoices, applications, offers, offer-letters, placements, requisitions, employers, job-seekers, talent-pools, leads, commissions, interviews, scorecards, subscriptions, assessments, dm, saved-searches, portfolio, CMS, uploads, auth/abuse routes, change-password.
- **Sampled (not exhaustive):** the full 407-route surface was not read line-by-line. The IDOR pattern (missing owner filter on GET) found in F4/F5/F6 suggests a **targeted sweep of every `[id]` GET handler** is warranted — grep for `findById(` in `src/app/api/**` and confirm each is owner-scoped.
- **Not verifiable from source (ops):** MongoDB user privileges, production env values (`MALWARE_SCAN_URL`, Upstash wiring), WAF/CDN, and runtime alerting.

> Prior internal docs `GAP-REPORT.md` and `SECURITY-FIXES.md` were cross-checked. Notable correction: their A2 "no malware scanning" is **outdated** — a scan hook now exists (F10 refines it). Their A1 (in-memory limiter) is **confirmed still open** (F2).
