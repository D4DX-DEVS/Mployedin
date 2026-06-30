# Mployedin — Production Readiness Plan

> Last updated: 2026-04-13
> Status: Active
> Priority order: Critical → High → Medium → Low

---

## Verdict

**Near production-level SaaS (Top 10–15% portfolio level)**

Architecture is solid. Stack is industry-standard. AI integration is a genuine differentiator.
The gaps below are the difference between "impressive portfolio" and "ships to real users."

---

## Phase 1 — Critical (Fix before any production traffic)

### 1. Replace In-Memory Rate Limiter with Redis

**Why:** In-memory rate limits reset on every serverless cold start — essentially useless at scale and easily bypassable by waiting for a redeployment.

**Implementation:**
- Install `@upstash/ratelimit` + `@upstash/redis`
- Create `src/lib/security/rate-limit.ts` wrapping Upstash sliding window
- Replace the current in-memory map in `src/lib/security/` with the Redis-backed version
- Apply limits per-IP using request headers (`x-forwarded-for` → real IP extraction)
- Keep existing limits: 100/min API, 20/min AI, 10/min auth, 5/min upload
- Add a `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` to `.env.example`

**Effort:** ~4 hours
**Files:** `src/lib/security/rate-limit.ts`, all API routes that call it

---

### 2. Raise Test Coverage to 70%+

**Why:** 50% is the minimum threshold configured in `jest.config.ts` — it will get flagged in any serious code review or hiring process.

**Priority areas to test:**

| Area | Type | Why |
|------|------|-----|
| `src/lib/validators/` | Unit | All Zod schemas — easiest wins |
| `src/lib/auth/` | Unit | RBAC logic, permission checks |
| `src/lib/security/` | Unit | Rate limit, CSRF, encryption |
| `src/app/api/jobs/route.ts` | Integration | Core feature, highest traffic |
| `src/app/api/applications/` | Integration | Core workflow |
| `src/app/api/auth/register` | Integration | Security-sensitive |
| AI model router | Unit | Fallback logic (Gemini → Claude) |

**Approach:**
- Write unit tests first for pure functions (validators, RBAC logic, encryption utils)
- Write integration tests for API routes using `jest` + `mongodb-memory-server`
- Add E2E Playwright flows for: job seeker apply flow, employer post + review, admin approve job
- Raise `jest.config.ts` threshold to 70 once coverage reaches it

**Effort:** ~2–3 days
**Files:** `src/__tests__/**`, `e2e/`

---

## Phase 2 — High Priority (Fix before showing to investors / interviewers)

### 3. Replace `console.log` with Structured Logging (Pino)

**Why:** `console.log` in production leaks stack traces, has no log levels, and tanks performance on serverless.

**Implementation:**
- Install `pino` + `pino-pretty` (dev only)
- Create `src/lib/logger.ts` — singleton Pino instance with JSON output in production
- Global find-replace `console.log/warn/error` → `logger.info/warn/error`
- Add request ID to log context in API middleware

**Effort:** ~3 hours
**Files:** `src/lib/logger.ts`, all API routes

---

### 4. Harden Cron Endpoint Security

**Why:** Env secret alone can be leaked via logs, error messages, or misconfigured infra. Cron endpoints that trigger data mutations need defense in depth.

**Implementation:**
- Add IP allowlist validation (Vercel Cron sends from known IPs — whitelist them)
- Replace plain secret with HMAC-SHA256 signed timestamp tokens:
  - Cron caller signs `timestamp + route` with `CRON_SECRET`
  - Endpoint verifies signature + rejects if timestamp > 5 minutes old (replay protection)
- Add to `src/lib/security/cron-auth.ts`

**Effort:** ~2 hours
**Files:** `src/lib/security/cron-auth.ts`, `src/app/api/cron/*/route.ts`

---

### 5. Implement JWT Refresh Token + Sliding Sessions

**Why:** 1-hour hard expiry forces re-login mid-session. Real SaaS uses refresh tokens or sliding window sessions.

**Implementation:**
- Add `refreshToken` field to User model (hashed, 30-day expiry)
- Add `POST /api/auth/refresh` endpoint — validates refresh token, issues new JWT
- Update NextAuth config to include refresh token rotation
- Store refresh token in httpOnly cookie (not localStorage)
- Auto-refresh on client via React Query `refetchInterval` or NextAuth session callback

**Effort:** ~5 hours
**Files:** `src/lib/auth/`, `src/models/User.ts`, `src/app/api/auth/refresh/route.ts`

---

## Phase 3 — Medium Priority (Production polish)

### 6. GDPR Compliance (Data Deletion + Export)

**Why:** Required by law if any EU users. Also shows maturity to interviewers.

**Implementation:**
- `DELETE /api/job-seekers/me` — hard delete or anonymize all PII fields
- `GET /api/job-seekers/me/export` — return JSON/PDF of all stored user data
- Add "Delete Account" and "Download My Data" to job seeker settings page
- Cascade soft-delete: applications, messages, saved jobs → anonymized
- Log deletion in AuditLog with timestamp

**Effort:** ~1 day
**Files:** `src/app/api/job-seekers/me/`, `src/app/[locale]/(dashboard)/job-seeker/settings/page.tsx`

---

### 7. AI Cost Optimization — Caching + Deduplication

**Why:** Gemini/Claude calls are expensive at scale. The same CV parsed 10 times = 10x wasted cost.

**Implementation:**
- Cache AI responses by input hash (SHA-256 of input) in MongoDB with TTL index (24h for job match, 7d for CV parse)
- Deduplicate in-flight requests: if same hash is being processed, queue second request to wait for first result
- Add `cachedAt` + `cacheHit` fields to AI response logs for monitoring
- Estimate: ~60–70% cache hit rate on job matching (same job matched against many candidates)

**Effort:** ~4 hours
**Files:** `src/lib/ai/`, `src/models/AICache.ts` (new)

---

### 8. Review 54 MongoDB Collections for Consolidation

**Why:** Over-normalization in MongoDB causes excessive `$lookup` joins — hurts read performance. MongoDB is designed for embedding, not rigid relational separation.

**Candidates to embed or merge:**

| Collections | Action |
|-------------|--------|
| `Country` + `State` + `City` | Keep separate (location data is shared reference data — OK) |
| `SkillLevel` / `JobType` / `Industry` / `CareerLevel` | Consolidate into single `JobAttribute` collection with a `category` field |
| `Notification` settings | Embed notification preferences into `User` document |
| `ConversationParticipant` (if separate) | Embed into `Conversation` |

**Effort:** ~1 day (analysis + migration)
**Files:** `src/models/`, `src/lib/db/indexes.ts`

---

## Phase 4 — Low Priority (Nice to have)

### 9. Database Query Optimization

- Add explain plans to the 5 most-called API routes
- Ensure compound indexes cover all `find({ status, createdAt })` patterns
- Add query result pagination everywhere (check for missing `limit` on list endpoints)
- Consider read replicas for analytics/stats queries to avoid blocking writes

---

### 10. Error Monitoring (Sentry)

- Install `@sentry/nextjs`
- Capture unhandled API errors with context (userId, route, input shape — no PII)
- Set up alerts for error rate spikes
- Replace bare `try/catch → return 500` patterns with Sentry-instrumented handlers

---

### 11. CI/CD Pipeline

- Add GitHub Actions workflow:
  - `npm run lint` on every PR
  - `jest --coverage` with coverage report comment on PR
  - Playwright E2E on merge to main
  - `tsc --noEmit` type check
- Block merges if coverage drops below threshold

---

### 12. API Response Standardization

Currently some routes return `{ data }`, others return raw objects, others return `{ error }` strings.

- Define a standard envelope: `{ success: boolean, data?: T, error?: string, meta?: { pagination } }`
- Apply consistently across all 164 routes
- Update frontend hooks to unwrap the envelope

---

## Priority Matrix

| # | Task | Impact | Effort | Priority |
|---|------|--------|--------|----------|
| 1 | Redis rate limiter | Critical | Low | P0 |
| 2 | Test coverage 70% | High | High | P0 |
| 3 | Structured logging | Medium | Low | P1 |
| 4 | Cron auth hardening | High | Low | P1 |
| 5 | JWT refresh tokens | High | Medium | P1 |
| 6 | GDPR deletion/export | High | Medium | P2 |
| 7 | AI response caching | High | Low | P2 |
| 8 | Collection consolidation | Medium | Medium | P2 |
| 9 | Query optimization | Medium | Medium | P3 |
| 10 | Sentry error monitoring | Medium | Low | P3 |
| 11 | CI/CD pipeline | High | Low | P3 |
| 12 | API response envelope | Low | Medium | P3 |

---

## What's Already Strong (Don't Touch)

- AES-256-GCM PII encryption — production-grade, keep as-is
- RBAC + custom permission overrides — well designed
- AI model router with Gemini → Claude fallback — solid
- Audit logging (immutable) — correct approach
- Soft deletes everywhere — correct for compliance
- Zod validation on all endpoints — keep enforcing this
- Security headers (CSP, HSTS, X-Frame-Options) — good

---

## Interview Talking Points (When Asked About This Project)

1. **"How do you handle security at scale?"**
   → AES-256 PII encryption, RBAC with custom overrides, CSRF, rate limiting, immutable audit logs

2. **"How does your AI integration work?"**
   → Model router with task-specific routing (flash model for CV/chat, pro model for reports), graceful fallback to Claude when Gemini fails

3. **"What would you improve first?"**
   → Redis-backed rate limiter (in-memory doesn't survive serverless restarts), then raise test coverage from 50% to 70%+

4. **"How do you handle multi-tenancy?"**
   → Role-based isolation (employer sees only their jobs/applications), CompanyUser table for team-level RBAC, agent geo-restriction at the auth middleware layer
