# MAP.md — Mployedin Project Map

> Generated from direct source inspection. Every section cites real files.
> Labels: **OBSERVED** = confirmed in code · **INFERRED** = likely, reason given · **NOT VERIFIED** = no evidence.

Stack (OBSERVED): Next.js 16 App Router + Turbopack, NextAuth v5 (JWT), MongoDB/Mongoose, next-intl (en/ar, RTL), Tailwind. Source under `mployedin/src/`.

---

## 1. Roles & Access Model

5 roles (OBSERVED, [src/lib/permissions/matrix.ts](mployedin/src/lib/permissions/matrix.ts#L23)): `admin` (Super Admin), `super_agent`, `agent`, `employer`, `job_seeker`.

- **Auth method**: NextAuth v5 JWT strategy, Credentials + LinkedIn + Apple + Firebase Google providers (OBSERVED [src/lib/auth/config.ts](mployedin/src/lib/auth/config.ts#L29)). bcrypt(12), per-account lockout 5 fails/15 min + per-IP login throttle (OBSERVED config.ts).
- **RBAC enforcement**:
  - Page/section level: middleware `ROLE_ROUTES` map gates dashboard prefixes (OBSERVED [src/proxy.ts](mployedin/src/proxy.ts#L52), `isRoleAllowed` L68).
  - API level: `withAuth(handler, { resource, action })` HOC → `canAccess()` permission matrix (OBSERVED [src/lib/auth/withAuth.ts](mployedin/src/lib/auth/withAuth.ts#L44), matrix.ts L23).
  - Permission matrix: per-role resource→actions table, supports `role_default` and custom permission overrides (OBSERVED matrix.ts).
  - Tenant view: admins/agents can proxy as an employer via signed cookie, write-scoped, auto-audited; DELETE restricted to admin (OBSERVED withAuth.ts L80-200).
- **CSRF**: double-submit cookie, validated in middleware for state-mutating methods (OBSERVED [src/lib/security/csrf.ts](mployedin/src/lib/security/csrf.ts), proxy.ts L126).
- **Security headers**: CSP w/ per-request nonce, HSTS, X-Frame-Options applied in middleware (OBSERVED proxy.ts L80-98, [src/lib/security/headers.ts](mployedin/src/lib/security/headers.ts)).

---

## 2. Route Groups & Pages (by role)

Route root: `mployedin/src/app/[locale]/`. Groups: `(auth)`, `(onboarding)`, `(public)`, `(dashboard)`. ~227 pages total (OBSERVED via directory scan).

### Super Admin — `(dashboard)/admin/*`
Dashboard, users, jobs (+new), applications, agents, job-seekers, employers, targets(+[id]), interviews, invoices(+new), placements, approvals, exhibitions(+analytics), audit-logs, activity-timeline, audit, analytics, reports, commissions(+report), target-report, communications, tasks, webhooks, workflow-templates, gdpr, impersonate, design-system, CMS (blogs, static-pages, faqs, testimonials, banners, contact-submissions, videos), job-attributes (job-types, job-shifts, job-skills, salary-periods, language-levels, major-subjects), location-data/cities, matching-weight-templates, bulk-import, territory. (OBSERVED)

### Super Agent — `(dashboard)/super-agent/*`
Dashboard, agents(+[id]), leads, job-seekers, employers, jobs, targets(+[id]), interviews, invoices(+new), applications, placements, approvals, commissions(+report), market, insights, reports, target-report, exhibitions(+analytics), referral-links, messages, resources, territory, target-management(+create), settings. (OBSERVED)

### Agent — `(dashboard)/agent/*`
Dashboard, leads(+new,+[id]), job-seekers, candidates, employers, jobs(+new,+[id]), targets(+[id]), interviews, placements, offers, invoices, commissions(+report), target-report, reports, messages, calendar, chat, exhibitions, referral-links, resources, target-management, settings, tasks. (OBSERVED)

### Employer — `(dashboard)/employer/*`
Dashboard, jobs(+new,+[id],+edit,+ai-create,+ai-extract), job-templates, candidates(+[id]), applications(+[id]/panel), interviews(+bulk), offers, placements, analytics, screening-analytics, team(+activity-logs), messages, activity-history, calendar, workflow, scorecards, comm-templates, assessments, training, matching-weights, payment-setup, subscription, settings, invoices. (OBSERVED)

### Job Seeker — `(dashboard)/job-seeker/*`
Dashboard, jobs(+[id]), search, applications(+[id],+feedback), offers, profile(+personal-details), cv, experience, portfolio, documents, skills, interviews, courses, profile-views, profile-boost, companies(+[id]), preferences, saved-searches, referral, settings(+notifications), calendar, messages, subscription. (OBSERVED)

### Shared / Auth / Onboarding / Public
- Shared: `(dashboard)/notifications`. (OBSERVED)
- `(auth)`: login, register, agent-register, employer-register, verify-email, forgot-password, reset-password. (OBSERVED)
- `(onboarding)`: onboarding (job-seeker wizard). (OBSERVED)
- `(public)`: landing, jobs(+[id]), companies(+[id]), blog(+[slug]), salary-explorer, contact, faq, gdpr, privacy, terms, cookies. (OBSERVED)

---

## 3. API Routes (grouped by resource)

Root: `mployedin/src/app/api/`. ~384 route files (OBSERVED). Auth pattern unless noted: `withAuth`. Most list GETs use offset pagination (`page`/`limit`→`skip`); most POST/PATCH use `validateBody(zodSchema)`.

- **auth/**: `[...nextauth]`, verify-email, reset-password, resend-verification, forgot-password, job-seeker-register, employer-register, agent-register, post-login-redirect. Public + rate-limited; Zod validated. (OBSERVED)
- **jobs/**: list/create (paginated, jobCreateSchema), `[id]` get/patch, apply, save, track-view, analytics, similar, clone, matching-weights, workflow, recommended, suggestions(public), match-preview. (OBSERVED)
- **applications/**: list/create (paginated), `[id]` get/patch, notes, timeline, documents, feedback, parse-resume, bulk, compare, ai-insights. (OBSERVED)
- **employers/** & **companies/**: employers CRUD, verify, me(+smtp), team(+[id],accept,activity-logs), job-templates, matching-weights(+templates), verify-domain(+confirm), logo, stats, setup-status, posters, screening-analytics, workflow-templates, training. `companies` = public directory (paginated, rate-limited). (OBSERVED)
- **job-seekers/** & **job-seeker/**: list/create, `[id]`(+availability), profile, account, settings, avatar, bulk-cv-download, generate-embeddings, vector-search, cv, documents, dashboard, profile-boost, profile-views, skill-gaps, skill-confirmations, recommended-jobs. (OBSERVED)
- **interviews/ offers/ offer-letters/ hiring-decisions/ scorecards/**: list/create + `[id]` CRUD, scorecard, respond, next-round, bulk, ical export, consensus. (OBSERVED)
- **leads/**: list/create, `[id]`, activities, convert, bulk, check-duplicates. (OBSERVED)
- **invoices/ commissions/ commission-payouts/**: invoices list, `[id]`(pay, verify-payment, delivery, pdf, dispute, credit-note, payments), uninvoiced-placements, recruitment(+bulk), check-duplicate, analytics; commissions CRUD; payouts. (OBSERVED)
- **subscriptions/**: `[id]`, my, history, renew, assign, bulk-assign, change, feature-gate. (OBSERVED)
- **super-agent/** & **admin/**: targets(+profiles, distribute, grouped), agents, dashboard, profile, avatar, applications, leads, job-seekers, interviews, approvals, commissions-report, insights, settings, reports, actions; admin adds users, territories, webhooks, settings, analytics, stats, audit-logs, email-logs, communications/comm-templates, bulk-import, impersonate, export/financial, gdpr, subscription-plans/stats, cms/videos. Admin routes do `withAuth` + inline admin role check. (OBSERVED)
- **dm/ messages/ notifications/**: conversations, messages (paginated), read, manage, customer-care; unread count; notification list. (OBSERVED — REST polling, no WebSocket.)
- **ai/**: ~29 routes (see §6). (OBSERVED)
- **public/ filters/ exchange-rates/ proxy-image/ contact/ reviews/ career-pages/ gdpr/ unsubscribe/**: public read endpoints, rate-limited, some cached. (OBSERVED)
- **cron/**: target-risk-check, subscription-usage-reset, subscription-reminder — guarded by `verifyCronRequest` (OBSERVED). **inngest/** for background jobs.

---

## 4. DB Models (Mongoose)

~110 models in [src/models/](mployedin/src/models) (OBSERVED). Indexes centralized in [src/lib/db/indexes.ts](mployedin/src/lib/db/indexes.ts) with `autoIndex:false`; `ensureIndexes()` runs on connect (OBSERVED [src/lib/db/mongoose.ts](mployedin/src/lib/db/mongoose.ts#L48)).

Core entities & key relationships (OBSERVED from model fields):
- **User** ↔ role-specific profile: `JobSeeker`, `Employer`, `Agent`, `SuperAgent`, `CompanyUser` (all reference `userId`).
- **Job** → `employerId`, `agentId`; soft-delete `deletedAt` (Job.ts L266). **Application** → `jobId`, `jobSeekerId`, `employerId`, `agentId`.
- **Interview**, **Offer**, **OfferLetter**, **Placement**, **HiringDecision**, **Scorecard** → application/job/candidate refs.
- **Lead** → `agentId`; **Commission**/**Invoice**/**CommissionPayout** → agent/superAgent/employer + placement.
- **Subscription**/**SubscriptionPlan**/**SubscriptionHistory**; **Target**/**TargetProfile**/**Territory**.
- Messaging: **Conversation**/**ConversationThread**/**DirectMessage**/**Message**; **Notification**/**NotificationPreference**.
- CMS: **BlogPost**, **StaticPage**, **FAQ**, **Testimonial**, **Banner**, **Video**, **ContactSubmission**.
- Audit/system: **AuditLog**, **ActivityEvent**, **ImpersonationSession**, **TenantViewSession**, **Webhook**, **ApiKey**, **AICache**, **SystemConfig**/**SystemSettings**.
- AI/search: **JobSeeker.searchEmbedding** vector field for semantic search (OBSERVED vector-search route L57).

Soft-delete: only **Job** + **ExhibitionRequest** carry `deletedAt`/`isDeleted` (OBSERVED); other models hard-delete (see GAP-REPORT D).

---

## 5. Auth / Permissions / Security libs

- [src/lib/auth/config.ts](mployedin/src/lib/auth/config.ts) — NextAuth providers, lockout, IP throttle.
- [src/lib/auth/withAuth.ts](mployedin/src/lib/auth/withAuth.ts) — API auth + RBAC + tenant view.
- [src/lib/permissions/matrix.ts](mployedin/src/lib/permissions/matrix.ts) — `canAccess`, role→resource→action map, `getDashboardPath`.
- [src/lib/security/](mployedin/src/lib/security): `rateLimit.ts` (in-memory Map), `csrf.ts`, `headers.ts`, `file-validation.ts` (magic bytes), `sanitize.ts` (escapeRegex, sanitizeObject, isValidObjectId), `html.ts` (DOMPurify), `encryption.ts` (AES-256-GCM), `tenantCookie.ts`.
- [src/lib/env.ts](mployedin/src/lib/env.ts) + [src/instrumentation.ts](mployedin/src/instrumentation.ts) — startup env fail-fast + `onRequestError` server error reporting.
- [src/lib/observability/report-error.ts](mployedin/src/lib/observability/report-error.ts) — client error reporter (Sentry-ready).

---

## 6. AI Integrations

Primary: Google Gemini (OBSERVED [src/lib/ai/gemini.ts], cv-extract route L10). Embeddings via Gemini (OBSERVED [src/lib/ai/embeddings.ts]). Caching via **AICache** (SHA-256 TTL). Inputs sanitized (`sanitizeAIInput`), outputs PII-redacted, token caps applied; gated by subscription `enforceFeatureGate` (OBSERVED cv-extract L26).

Wired AI routes (OBSERVED, `/api/ai/*`): chat(+history), job-description, job-extract, job-search-filters, screen-candidates, cv-extract, skills-suggest, skills-gap, profile-fill, salary-benchmark, lead-score, lead/referral/candidate/application-search-filters, interview-questions, interview-prep-brief, interview-filter, match, poster-content, poster-layout, email-draft, enhance-text, generate-summary, daily-insights, report, speech-to-text, admin-jobseeker-search. Plus semantic vector search at `/api/job-seekers/vector-search`.

---

## 7. File Upload / Storage

- Storage: DigitalOcean Spaces / S3-compatible via [src/lib/storage/spaces.ts](mployedin/src/lib/storage/spaces.ts) (`uploadFile`, `uploadBuffer`, `deleteFile`). (OBSERVED cv-extract import)
- Validation: magic-byte + MIME whitelist + size + DOCX structure check ([src/lib/security/file-validation.ts](mployedin/src/lib/security/file-validation.ts)). CV/avatar/logo/document routes call `validateUploadedFile`. (OBSERVED)
- **No malware/AV scanning** (OBSERVED absence; ClamAV deferred per plan.md L1701).

---

## 8. Background Jobs

- Vercel Cron → `/api/cron/*` guarded by `verifyCronRequest` (OBSERVED). Jobs: target-risk-check, subscription-usage-reset, subscription-reminder.
- Inngest for event-driven jobs ([src/lib/inngest/], `/api/inngest`). (OBSERVED)
- Email via SMTP/templates ([src/lib/communications/email.ts]); WhatsApp (Dxing) per plan. (OBSERVED import in config.ts)
