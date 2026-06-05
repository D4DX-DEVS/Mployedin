# Security Fixes Tracker — Phase 3 Remediation

Status legend: **Fixed** · **Skipped** (not-an-issue) · **Deferred** (out of scope / needs infra)

Reusable ownership pattern: mirror `offers/[id]`, `invoices/[id]` (`canAccessInvoice`),
`leads/[id]` (`verifyLeadAccess`), `dm/messages` (`assertParticipant`). Agent scope via
`Agent.assignedEmployerIds`; super_agent scope via `getSuperAgentScope().effectiveAgentIds`.

---

## Wave 1 — Critical + cross-tenant High

| ID | Sev | Status | Summary |
|----|-----|--------|---------|
| W1-1 | CRITICAL | **Fixed** | job-seekers/[id] PATCH: added `verifySeekerStaffAccess` (admin global, agent/super_agent scoped, seeker/employer denied) and removed the `User` name/email write that enabled account takeover. |
| W1-2 | HIGH | **Fixed** | job-seekers/[id] GET: same `verifySeekerStaffAccess` guard — no more PII read by id. |
| W1-3 | HIGH | **Fixed** | interviews/[id] GET/PATCH/DELETE: added `verifyInterviewAccess` resolving interview→job→employer/agent; candidate, owning employer, assigned agent, scoped super_agent, or admin only. |
| W1-4 | HIGH | **Fixed** | jobs/[id]: added matrix guards (`jobs` read/update/delete) on exports; scoped agent writes to `assignedEmployerIds`/owned jobs; admin global. |
| W1-5 | HIGH | **Fixed** | applications/[id] GET/PATCH: added `verifyAgentScopeForApplication` mirroring the LIST route; agent/super_agent scoped, admin global. |
| W1-6 | HIGH | **Fixed** | job-seekers validator: removed `.passthrough()` from `jobSeekerProfileUpdateSchema`; explicit allowlist (added `sectionVisibility`, `certifications`, `projects`, `socialLinks` to cover real edit payloads). Blocks mass assignment of system fields. |
| W1-7 | HIGH | **Fixed** | ai/chat POST: added `enforceDailyAiQuota(session.user.id, userRole)` before the OpenRouter fetch, matching every other AI route. |

### Wave 1 deviations / behavior notes
- W1-1/W1-2: super_agent kept as read-only scoped (matrix grants `job_seekers:read`); employer denied on this staff route (no frontend caller). Admin can no longer change a seeker's `name`/`email` via this route — those `User` fields move through user-administration only (admin job-seekers edit form name/email fields now no-op).
- W1-3: DELETE remains a soft-cancel; guard applied identically to GET/PATCH.

### Wave 1 checkpoint
- `tsc --noEmit`: PASS.
- Lint: no ESLint configured in repo; IDE diagnostics clean on all changed files.
- `jest`: 558 passed, 32 skipped, 3 failed — the 3 failures are pre-existing next-intl `getTranslations` client-component errors in admin/agent/super-agent dashboard page render tests, unrelated to these changes.

---

## Wave 2 — Auth-core

| ID | Sev | Status | Summary |
|----|-----|--------|---------|
| W2-1 | HIGH | **Fixed** | `auth/config.ts` JWT callback: DB re-check (isActive + passwordChangedAt) now runs on the normal 5-min updateAge rotation regardless of `pca`, throttled via `token.lastDbCheck`. Deactivated/password-changed users are invalidated within ~5 min instead of up to 3 days. |
| W2-2 | HIGH | **Fixed** | `auth/withAuth.ts`: added `verifyTenantViewStillEligible` re-check on every tenant-view request, mirroring the eligibility rules in `POST /api/tenant/switch` (agent `assignedEmployerIds`, super_agent `agentIds`→employer.agentId, admin global). A removed/de-scoped actor now gets 403 immediately rather than at session expiry. Cookie signing left unchanged. |

### Wave 2 checkpoint
- `tsc --noEmit`: PASS.
- Auth/security suites: `security/auth-helpers.test.ts` + `lib/csrf.test.ts` — 15 passed, 0 failed.
- Full `jest`: remaining failures are NOT from this work — (a) `subscription-withSubscription` / `subscription-featureGate` fail by design because the subscription gates were intentionally opened to grant all employers/job-seekers full access until the payment gateway is wired (out of scope); (b) admin/agent/super-agent/employer dashboard page render tests fail on a pre-existing next-intl `getTranslations` client-component issue.

## Wave 3 — Medium (pending)

| ID | Status | Summary |
|----|--------|---------|
| W3-1 | _pending_ | Employer PII encryption on updateOne path. |
| W3-2 | _pending_ | Consolidate apply endpoints. |
| W3-3 | _pending_ | AI prompt-injection / PII redaction hardening. |
| W3-4 | _pending_ | admin/users matrix guards. |
| W3-5 | _pending_ | CSRF-exempt AI routes review. |

## Wave 4 — Low / hardening (pending)

| ID | Status | Summary |
|----|--------|---------|
| W4-1 | _pending_ | applications/[id] GET fail-closed seeker id comparison bug. |
| W4-2 | _pending_ | CSP style-src 'unsafe-inline'. |
| W4-3 | _pending_ | HSTS preload directive. |
| W4-4 | _pending_ | Cron static Bearer fallback. |
| W4-DEFER | **Deferred** | In-memory rate-limit store needs shared Redis — out of scope; TODO only. |
