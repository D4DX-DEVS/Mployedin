# Mployedin Access-Control Map

> Read-only mapping pass — pre-audit baseline. Generated 2026-07-02 by static scan of
> `src/app/api/**/route.ts` (418 route files), `src/proxy.ts` (middleware),
> `src/lib/auth/withAuth.ts`, `src/lib/permissions/matrix.ts`, and mongoose models.
> Nothing was modified. "Actual access" = what the code enforces today, not intent.

---

## 1. Roles

**Platform roles** — mongoose enum, `src/models/User.ts:62`:

| Role | Notes |
|---|---|
| `admin` | Full matrix; may enter all 5 dashboard sections |
| `super_agent` | Manages agents; portfolio oversight |
| `agent` | Manages employers/leads/job seekers |
| `employer` | Company workspace; has team sub-roles below |
| `job_seeker` | Candidate self-service |

Plus a per-user overlay: `permissionMode: "role_default" | "custom"` with `customPermissions`
(`canAccess()` in `src/lib/permissions/matrix.ts` honors it). **Custom mode can widen or narrow
any role's matrix per user — audit who can set it (`/api/admin/users` PATCH).**

**Employer team sub-roles** — `src/models/CompanyUser.ts:3`:
`owner`, `admin`, `hiring_manager`, `accounting`, `finance_viewer`, `viewer`.
Enforced only partially: `withAuth` blocks write actions for `viewer`/`finance_viewer` **only when
the route has an RBAC guard** (`withAuth.ts:282-291`). Routes without a guard get no team-role
enforcement at the wrapper level.

**Pseudo-principals:**

- **Cron caller** — HMAC-SHA256 signed requests (`src/lib/security/cron-auth.ts`, 5-min replay window). All 16 `/api/cron/*` routes verified to call `verifyCronRequest()`.
- **Inngest** — `/api/inngest` served by Inngest SDK; auth relies on `INNGEST_SIGNING_KEY` (NEEDS VERIFICATION it is set in prod).
- **Tenant-view actor** — admin/super_agent/agent impersonating an employer via signed cookie; eligibility re-verified per request (`withAuth.ts` W2-2); DELETE restricted to admin.
- **Admin impersonation** — `/api/admin/impersonate` (`users.impersonate`).

---

## 2. Enforcement architecture

- **Middleware** (`src/proxy.ts`) protects **pages only**: login redirect, role→section map
  (`ROLE_ROUTES`: admin may enter all 5 sections; every other role only its own), email-verify gate,
  OAuth-2FA lockdown, CSRF for mutating `/api/*`. It does **not** authenticate API routes.
- **API auth is per-route.** Three patterns:
  1. `withAuth(handler, { resource, action })` → permission-matrix RBAC (206 routes)
  2. `withAuth(handler)` + inline `ctx.role` checks (or no check at all — 48 routes)
  3. raw `await auth()` inside the handler (16 routes, mostly `/api/ai/*`)
- **No server actions** — zero `"use server"` files in `src/`.
- **One GraphQL endpoint** — `/api/graphql`, inline admin check + introspection disabled
  (resolver-level authz NEEDS VERIFICATION).
- Dashboard `layout.tsx` checks session + maintenance only, **not role** — page role enforcement
  lives solely in `proxy.ts` (single point of failure worth noting).

**How to read the table below:** where the Actual-access cell lists roles like
`admin, super_agent, agent`, those are the roles whose permission matrix satisfies the route's
`{resource, action}` guard. Handlers usually add ownership scoping on top (NOT verified per-route
in this pass). `(handler also branches on: …)` = inline `ctx.role` comparisons found in the file.

---

## 3. Page routes

Middleware `ROLE_ROUTES` is the only role gate for pages.

| Section | Pages | Intended role (middleware) | Confidence |
|---|---|---|---|
| `/admin/**` | 78 | admin | high |
| `/super-agent/**` | 30 | super_agent, admin | high |
| `/agent/**` | 29 | agent, admin | high |
| `/employer/**` | 38 | employer, admin, + agent/super_agent/admin via tenant-view cookie | high |
| `/job-seeker/**` | 30 | job_seeker, admin (onboarding + email-verify gates) | high |
| `/(dashboard)/notifications` | 1 | any authenticated | high |
| `/(public)`: `/`, jobs(+[id]), companies(+[id]), blog(+[slug]), contact, faq, gdpr, privacy, cookies, terms, salary-explorer | 14 | public | high |
| `/(auth)`: login, register, agent-register, employer-register, forgot/reset-password, verify-email, verify-oauth-2fa, confirm-email-change | 9 | public (logged-in users redirected to dashboard) | high |
| `/onboarding` | 1 | job_seeker (unverified email allowed) | high |
| `/poster/[slug]`, `/maintenance`, `~offline` | 3 | public | high |

---

## 4. Top NEEDS-VERIFICATION list for the audit

1. **`/api/ai/chat`** — raw `auth()`, imports 17 models incl. `AuditLog`, `Commission`, `Lead`; role-scoping is internal to the AI tooling. Top priority.
2. **48 `withAuth`-no-guard routes** — any authenticated role reaches the handler; ownership checks exist only inside handlers, unverified. Notable: `/api/developer` (API keys/webhooks), `/api/agent/tasks`, `/api/dm/[conversationId]/*`, `/api/invoices/[id]/send`, `/api/applications/[id]/parse-resume`, `/api/applications/[id]/documents/download`, `/api/job-seekers/avatar`, `/api/gdpr/export`, all employer ATS satellites (application-forms, approval-workflows, career-pages, diversity, email-sequences, employee-referrals, offer-letters, requisitions, talent-pools, messages).
3. **Matrix-guard-wider-than-path routes** — the RBAC guard admits more roles than the URL prefix implies: `/api/admin/communications` GET (`notifications.read` → all roles), `/api/admin/interviews` (`interviews.read` → all roles), `/api/admin/subscription-*` GETs (`subscriptions.read` → admin/super_agent/agent/employer), `/api/admin/target*` (super_agent/agent pass), `/api/super-agent/jobs`+`approvals` (`jobs.read` → all roles, no inline check found), `/api/jobs/[id]/analytics` (`jobs.read` → all roles), `/api/job-seekers/bulk-cv-download` + `vector-search` (`job_seekers.read` → all roles incl. job_seeker).
4. **Public surface**: `/api/proxy-image` (SSRF — verify URL allowlist), `/api/inngest` (signing key), `/api/employers/verify-domain/confirm` (token strength), `/api/graphql` (resolver authz).
5. **`permissionMode: "custom"`** — per-user matrix override; audit the setter path.
6. **Raw-`auth()` routes bypass `withAuth` extras** — tenant-view scoping and employer team read-only enforcement don't apply there (2FA-pending is still covered by middleware, which 403s API calls). Affected: 12 `/api/ai/*` routes + `users/change-password`, `users/locale`, `employers/setup-status`, `jobs/auto-draft`, `auth/post-login-redirect`.

---

## 5. Full API route table (418 route files)

Legend — **Actual access**: `PUBLIC` = no session required; `cron (HMAC)` = `verifyCronRequest()`;
role list = roles passing the RBAC guard; `handler role checks: …` = inline-only enforcement;
`ANY authenticated role` = `withAuth` with no guard and no inline role check found.
**Confidence**: `high` = guard visible in code; `NEEDS VERIFICATION` = enforcement (if any) is
deeper in the handler than this static pass traced; `—` = public by design, confirm intent.

| Route | Methods | Actual access (code) | Models | Confidence |
|---|---|---|---|---|
| /api/activity | GET | handler role checks: job_seeker | ActivityEvent,JobSeeker | high |
| /api/admin/activity-timeline | GET | admin (handler also branches on: admin) | AuditLog,User | high |
| /api/admin/agents | GET,POST,PATCH | handler role checks: admin | User,Agent,SuperAgent | high |
| /api/admin/analytics | GET | admin | Job,Application,Placement,Commission,Interview,Agent | high |
| /api/admin/audit-logs | GET | admin | AuditLog,User | high |
| /api/admin/bulk-import | POST | admin (handler also branches on: admin) | User,Job,Employer | high |
| /api/admin/cms/banners | GET,POST | admin | Banner,User | high |
| /api/admin/cms/banners/[id] | GET,PATCH,DELETE | admin | Banner,User | high |
| /api/admin/cms/blogs | GET,POST | admin | BlogPost,User | high |
| /api/admin/cms/blogs/[id] | GET,PATCH,DELETE | admin | BlogPost,User | high |
| /api/admin/cms/contact-submissions | GET | admin | ContactSubmission,User | high |
| /api/admin/cms/contact-submissions/[id] | GET,PATCH,DELETE | admin | ContactSubmission,User | high |
| /api/admin/cms/faqs | GET,POST | admin | FAQ,User | high |
| /api/admin/cms/faqs/[id] | GET,PATCH,DELETE | admin | FAQ,User | high |
| /api/admin/cms/static-pages | GET,POST | admin | StaticPage,User | high |
| /api/admin/cms/static-pages/[id] | GET,PATCH,DELETE | admin | StaticPage,User | high |
| /api/admin/cms/testimonials | GET,POST | admin | Testimonial,User | high |
| /api/admin/cms/testimonials/[id] | GET,PATCH,DELETE | admin | Testimonial,User | high |
| /api/admin/cms/videos | GET,POST | admin | Video,User | high |
| /api/admin/cms/videos/[id] | GET,PATCH,DELETE | admin | Video,User | high |
| /api/admin/comm-templates | GET,POST | admin, super_agent, agent, employer, job_seeker | BroadcastTemplate | high |
| /api/admin/comm-templates/[id] | PATCH,DELETE | admin | BroadcastTemplate | high |
| /api/admin/commissions-report | GET | admin, super_agent, agent | Commission,Agent,SuperAgent,User | high |
| /api/admin/communications | GET,POST | admin, super_agent, agent, employer, job_seeker | Notification,User | high |
| /api/admin/email-logs | GET | handler role checks: admin | EmailLog | high |
| /api/admin/export/financial | GET | admin, super_agent (handler also branches on: admin) | Invoice,Commission | high |
| /api/admin/gdpr | GET | admin (handler also branches on: admin) | AuditLog,User | high |
| /api/admin/impersonate | POST,GET | admin | User,ImpersonationSession | high |
| /api/admin/interviews | GET | admin, super_agent, agent, employer, job_seeker | Interview,Agent | high |
| /api/admin/job-attributes/[category] | GET,POST | admin | User | high |
| /api/admin/job-attributes/[category]/[id] | GET,PATCH,DELETE | admin | User | high |
| /api/admin/jobs | GET | admin, super_agent, agent, employer, job_seeker (handler also branches on: super_agent) | Job,Employer,SuperAgent,User | high |
| /api/admin/jobs/[id]/approve | POST | admin, agent, employer (handler also branches on: agent) | Job,Agent,User | high |
| /api/admin/jobs/[id]/feature | POST | admin, agent, employer (handler also branches on: admin) | Job | high |
| /api/admin/location-data/cities | GET,POST | admin | User,City | high |
| /api/admin/location-data/cities/[id] | GET,PATCH,DELETE | admin | User,City | high |
| /api/admin/location-data/countries | GET,POST | admin | User,Country | high |
| /api/admin/location-data/countries/[id] | GET,PATCH,DELETE | admin | User,Country | high |
| /api/admin/location-data/states | GET,POST | admin | User,State | high |
| /api/admin/location-data/states/[id] | GET,PATCH,DELETE | admin | User,State | high |
| /api/admin/matching-weight-templates | GET,POST | admin (handler also branches on: admin) | MatchingWeightTemplate | high |
| /api/admin/matching-weight-templates/[id] | GET,PATCH,DELETE | admin (handler also branches on: admin) | MatchingWeightTemplate | high |
| /api/admin/notification-config | GET,PATCH | handler role checks: admin | SystemConfig | high |
| /api/admin/notification-config/user-override | POST,DELETE | handler role checks: admin | SystemConfig | high |
| /api/admin/notification-stats | GET | handler role checks: admin | User,NotificationPreference,EmailLog | high |
| /api/admin/settings | GET,POST | admin (handler also branches on: admin) | SystemSettings | high |
| /api/admin/settings/test-email | POST | admin (handler also branches on: admin) | — | high |
| /api/admin/stats | GET | admin | User,Job,Application,Interview | high |
| /api/admin/subscription-dashboard | GET | admin, super_agent, agent, employer | Subscription,Invoice,SubscriptionHistory,User | high |
| /api/admin/subscription-plans | GET,POST | admin, super_agent, agent, employer (handler also branches on: admin) | SubscriptionPlan | high |
| /api/admin/subscription-plans/[id] | GET,PATCH,DELETE | admin, super_agent, agent, employer (handler also branches on: admin) | SubscriptionPlan,Subscription | high |
| /api/admin/subscription-stats | GET | admin, super_agent, agent, employer | Subscription,Invoice,SubscriptionHistory | high |
| /api/admin/subscriptions | GET | admin, super_agent, agent, employer | Subscription | high |
| /api/admin/super-agents | GET,POST,PATCH | handler role checks: admin | User,Agent,SuperAgent,TargetProfile | high |
| /api/admin/system-health | GET | admin (handler also branches on: admin) | User,Job,Application | high |
| /api/admin/target-profiles | GET,POST | admin, super_agent, agent | TargetProfile,User,SuperAgent | high |
| /api/admin/target-profiles/[id] | GET,PATCH,DELETE | admin, super_agent, agent | TargetProfile,User | high |
| /api/admin/target-profiles/[id]/reassign | PATCH | admin, super_agent | TargetProfile,User | high |
| /api/admin/target-profiles/analytics | GET | admin, super_agent, agent | TargetProfile,User | high |
| /api/admin/target-profiles/regions | GET | admin, super_agent, agent | TargetProfile | high |
| /api/admin/target-report | GET | admin, super_agent, agent | TargetProfile,User,SuperAgent,Commission | high |
| /api/admin/targets | GET,POST | admin, super_agent, agent | Target,User | high |
| /api/admin/targets/[id] | GET,PATCH,DELETE | admin, super_agent, agent | Target,User | high |
| /api/admin/targets/distribute | POST | admin, super_agent | Target | high |
| /api/admin/targets/grouped | GET | admin, super_agent, agent | Target,SuperAgent,User | high |
| /api/admin/territories | GET,POST | admin (handler also branches on: admin) | Territory,SuperAgent | high |
| /api/admin/territories/[id] | GET,PATCH,DELETE | admin (handler also branches on: admin) | Territory,SuperAgent | high |
| /api/admin/test-email | POST | handler role checks: admin | — | high |
| /api/admin/users | GET,PATCH,POST,DELETE | admin (handler also branches on: admin, agent, super_agent, employer, job_seeker) | User,Agent,SuperAgent,Employer,JobSeeker | high |
| /api/admin/webhooks | GET,POST | admin (handler also branches on: admin) | Webhook | high |
| /api/admin/webhooks/[id] | GET,PATCH,DELETE | admin (handler also branches on: admin) | Webhook | high |
| /api/admin/webhooks/[id]/rotate-secret | POST | admin (handler also branches on: admin) | Webhook | high |
| /api/admin/webhooks/[id]/test | POST | admin (handler also branches on: admin) | Webhook | high |
| /api/admin/workflow-templates | GET,POST | admin (handler also branches on: admin) | WorkflowTemplate | high |
| /api/admin/workflow-templates/[id] | GET,PATCH,DELETE | admin (handler also branches on: admin) | WorkflowTemplate | high |
| /api/agent/analytics | GET | handler role checks: agent, admin | Agent,Job,Application,Lead,Placement,Commission,Interview,Offer | high |
| /api/agent/avatar | POST,DELETE | handler role checks: agent, admin | User | high |
| /api/agent/commissions-report | GET | admin, super_agent, agent | Commission,Agent | high |
| /api/agent/dashboard | GET | handler role checks: agent, admin | Agent,Job,Application,Lead,Placement,Interview,Commission,Offer | high |
| /api/agent/profile | GET,PATCH | handler role checks: agent, admin | Agent,User | high |
| /api/agent/settings | GET,PATCH | handler role checks: agent, admin | Agent,User | high |
| /api/agent/settings/invoice-defaults | GET,PATCH | handler role checks: agent, admin | Agent,User | high |
| /api/agent/target-profiles | GET | admin, super_agent, agent | TargetProfile,User | high |
| /api/agent/target-report | GET | admin, super_agent, agent | TargetProfile,Agent,Commission | high |
| /api/agent/targets | GET | admin, super_agent, agent | Target | high |
| /api/agent/targets/leaderboard | GET | admin, super_agent, agent | Target,SuperAgent,Agent,User | high |
| /api/agent/tasks | GET,POST | ANY authenticated role (no rbac guard) | — | NEEDS VERIFICATION |
| /api/agent/tasks/[id] | PATCH,DELETE | ANY authenticated role (no rbac guard) | — | NEEDS VERIFICATION |
| /api/ai/admin-jobseeker-search | POST | admin, super_agent, agent, employer, job_seeker | User | high |
| /api/ai/application-search-filters | POST | admin, super_agent, agent, employer, job_seeker | User | high |
| /api/ai/ats-check | POST | handler role checks: job_seeker, employer, agent, admin | JobSeeker,Job,Employer,Agent | high |
| /api/ai/candidate-search-filters | POST | admin, super_agent, agent, employer, job_seeker | User | high |
| /api/ai/chat | POST | ANY authenticated (raw auth(), no role gate found) | JobSeeker,Job,User,Employer,Agent,SuperAgent,Lead,Application,Interview,Placement,Commission,BlogPost,FAQ,Banner,ContactSubmission,Testimonial,AuditLog | NEEDS VERIFICATION |
| /api/ai/chat-history | GET,POST,DELETE | ANY authenticated role (no rbac guard) | ConversationThread | NEEDS VERIFICATION |
| /api/ai/chat/drafts | GET,POST | session + inline checks: employer, admin | ConversationThread,User | NEEDS VERIFICATION |
| /api/ai/chat/drafts/[id] | GET,DELETE | session + inline checks: admin | ConversationThread,User | NEEDS VERIFICATION |
| /api/ai/cv-extract | POST | session + inline checks: job_seeker | JobSeeker,User | NEEDS VERIFICATION |
| /api/ai/daily-insights | GET | handler role checks: job_seeker, employer | Application,Job,JobSeeker,Employer | high |
| /api/ai/email-draft | POST | ANY authenticated (raw auth(), no role gate found) | Application,Job,JobSeeker,Employer | NEEDS VERIFICATION |
| /api/ai/enhance-text | POST | handler role checks: job_seeker | — | high |
| /api/ai/generate-summary | POST | handler role checks: job_seeker | JobSeeker | high |
| /api/ai/interview-filter | POST | ANY authenticated (raw auth(), no role gate found) | — | NEEDS VERIFICATION |
| /api/ai/interview-prep-brief | POST | ANY authenticated (raw auth(), no role gate found) | Interview,Job,JobSeeker,Application | NEEDS VERIFICATION |
| /api/ai/interview-questions | POST,GET | ANY authenticated (raw auth(), no role gate found) | InterviewQuestion | NEEDS VERIFICATION |
| /api/ai/job-description | POST | ANY authenticated role (no rbac guard) | — | NEEDS VERIFICATION |
| /api/ai/job-extract | POST | session + inline checks: employer, admin | Employer,User,ExtractionDraft | NEEDS VERIFICATION |
| /api/ai/job-extract/drafts | GET | session + inline checks: employer, admin | Employer,ExtractionDraft,User | NEEDS VERIFICATION |
| /api/ai/job-extract/drafts/[id] | GET,PATCH,DELETE | handler role checks: admin | ExtractionDraft,Employer,User | high |
| /api/ai/job-search-filters | POST | admin, super_agent, agent, employer, job_seeker | User | high |
| /api/ai/lead-score | POST | ANY authenticated (raw auth(), no role gate found) | Lead | NEEDS VERIFICATION |
| /api/ai/lead-search-filters | POST | admin, super_agent, agent | User | high |
| /api/ai/match | POST | handler role checks: employer, agent | Job,JobSeeker,Application,Employer,Agent | high |
| /api/ai/poster-content | POST | ANY authenticated role (no rbac guard) | — | NEEDS VERIFICATION |
| /api/ai/poster-generate | POST | handler role checks: employer | Employer,PosterGeneration,Job,User | high |
| /api/ai/poster-more-variations | POST | handler role checks: employer | Employer,PosterGeneration,User | high |
| /api/ai/profile-fill | POST | handler role checks: job_seeker | JobSeeker | high |
| /api/ai/referral-search-filters | POST | ANY authenticated role (no rbac guard) | User | NEEDS VERIFICATION |
| /api/ai/report | POST | admin, super_agent, agent | User,Job,Application,Agent,Employer,Placement,Commission,JobSeeker | high |
| /api/ai/salary-benchmark | GET | ANY authenticated (raw auth(), no role gate found) | — | NEEDS VERIFICATION |
| /api/ai/screen-candidates | POST | ANY authenticated (raw auth(), no role gate found) | Job,Application,JobSeeker,Employer | NEEDS VERIFICATION |
| /api/ai/skills-gap | POST | ANY authenticated role (no rbac guard) | Job,JobSeeker | NEEDS VERIFICATION |
| /api/ai/skills-suggest | GET | ANY authenticated role (no rbac guard) | JobSeeker | NEEDS VERIFICATION |
| /api/ai/speech-to-text | POST | ANY authenticated (raw auth(), no role gate found) | — | NEEDS VERIFICATION |
| /api/application-feedback | GET,POST | handler role checks: job_seeker | ApplicationFeedback,Application | high |
| /api/application-forms | GET,POST | ANY authenticated role (no rbac guard) | ApplicationForm,Employer | NEEDS VERIFICATION |
| /api/application-forms/[id] | GET,PATCH,DELETE | ANY authenticated role (no rbac guard) | ApplicationForm,Employer | NEEDS VERIFICATION |
| /api/applications | GET,POST | handler role checks: job_seeker, employer, agent, super_agent, admin | Application,Interview,Offer,Placement,Job,JobSeeker,User,Employer,CompanyUser,Agent | high |
| /api/applications/[id] | GET,PATCH | admin, super_agent, agent, employer, job_seeker (handler also branches on: agent, super_agent, employer, job_seeker, admin) | Application,Employer,Agent,User,JobSeeker,Interview,Offer | high |
| /api/applications/[id]/documents | GET,POST,DELETE | admin, super_agent, agent, employer, job_seeker (handler also branches on: job_seeker) | Application,JobSeeker,User | high |
| /api/applications/[id]/documents/download | GET | ANY authenticated role (no rbac guard) | Application,JobSeeker | NEEDS VERIFICATION |
| /api/applications/[id]/feedback | POST | handler role checks: job_seeker | Application,CandidateNPS,User,JobSeeker | high |
| /api/applications/[id]/notes | POST | admin, agent, employer, job_seeker (handler also branches on: employer) | Application,Employer,User | high |
| /api/applications/[id]/parse-resume | POST | ANY authenticated role (no rbac guard) | Application,JobSeeker | NEEDS VERIFICATION |
| /api/applications/[id]/timeline | GET | handler role checks: employer, job_seeker | Application,AuditLog,Employer,User,JobSeeker | high |
| /api/applications/ai-insights | GET | admin, super_agent, agent, employer, job_seeker (handler also branches on: admin, super_agent) | Application,User | high |
| /api/applications/bulk | POST | admin, agent, employer, job_seeker (handler also branches on: employer) | Application,Employer,JobSeeker,CommTemplate,User | high |
| /api/applications/compare | GET | admin, super_agent, agent, employer, job_seeker (handler also branches on: employer) | Application,Employer,Job,User | high |
| /api/approval-workflows | GET,POST | ANY authenticated role (no rbac guard) | ApprovalWorkflow,Employer | NEEDS VERIFICATION |
| /api/approval-workflows/[id] | PATCH,DELETE | ANY authenticated role (no rbac guard) | ApprovalWorkflow | NEEDS VERIFICATION |
| /api/assessments | GET,POST | handler role checks: employer, job_seeker | SkillAssessment,AssessmentAttempt,Employer | high |
| /api/assessments/[id] | GET,POST | handler role checks: job_seeker | SkillAssessment,AssessmentAttempt | high |
| /api/auth/[...nextauth] | ? | PUBLIC (no auth in handler) | — | — |
| /api/auth/agent-register | POST | PUBLIC (no auth in handler) | User,Agent | — |
| /api/auth/confirm-email-change | POST | PUBLIC (no auth in handler) | User | — |
| /api/auth/employer-register | POST | PUBLIC (no auth in handler) | User,Employer,Agent,SuperAgent,ReferralLink,CompanyUser | — |
| /api/auth/forgot-password | POST | PUBLIC (no auth in handler) | User | — |
| /api/auth/job-seeker-register | POST | PUBLIC (no auth in handler) | User,JobSeeker | — |
| /api/auth/oauth-2fa/verify | POST | ANY authenticated (raw auth(), no role gate found) | User | NEEDS VERIFICATION |
| /api/auth/post-login-redirect | GET | session + inline checks: job_seeker | — | NEEDS VERIFICATION |
| /api/auth/resend-verification | POST | PUBLIC (no auth in handler) | User | — |
| /api/auth/reset-password | POST | PUBLIC (no auth in handler) | User | — |
| /api/auth/verify-email | POST | PUBLIC (no auth in handler) | User | — |
| /api/career-pages | GET,POST,PATCH | ANY authenticated role (no rbac guard) | CareerPage,Employer | NEEDS VERIFICATION |
| /api/career-pages/[slug] | GET | PUBLIC (no auth in handler) | CareerPage,Job | — |
| /api/commission-payouts | POST,GET | handler role checks: admin | Commission | high |
| /api/commissions | GET,POST | admin, super_agent, agent (handler also branches on: agent, super_agent, admin) | Commission,SystemSettings,Agent,SuperAgent,User | high |
| /api/commissions/[id] | GET,PATCH,DELETE | admin, super_agent, agent (handler also branches on: admin, agent, super_agent) | Commission,Agent,SuperAgent,User | high |
| /api/companies | GET | PUBLIC (no auth in handler) | Employer,Job | — |
| /api/contact | POST | PUBLIC (no auth in handler) | ContactSubmission | — |
| /api/countries | GET | PUBLIC (no auth in handler) | Country | — |
| /api/courses | GET | PUBLIC (no auth in handler) | — | — |
| /api/cron/agent-weekly-digest | GET | cron (HMAC verifyCronRequest) | User,Agent,Lead,Employer,Placement,Commission,Interview | high |
| /api/cron/autoapply | POST | cron (HMAC verifyCronRequest) | JobSeeker | high |
| /api/cron/interview-reminders | GET | cron (HMAC secret) | Interview,JobSeeker | high |
| /api/cron/invoice-overdue | GET | cron (HMAC verifyCronRequest) | Invoice,User | high |
| /api/cron/invoice-overdue-reminder | GET | cron (HMAC verifyCronRequest) | Invoice,User | high |
| /api/cron/job-alerts | GET | cron (HMAC verifyCronRequest) | Job,JobSeeker,User | high |
| /api/cron/job-expiry | GET | cron (HMAC verifyCronRequest) | Job,Employer,User | high |
| /api/cron/lead-followup-reminder | GET | cron (HMAC verifyCronRequest) | Lead,Agent,User | high |
| /api/cron/nps-trigger | GET | cron (HMAC verifyCronRequest) | Application,CandidateNPS,JobSeeker | high |
| /api/cron/offer-expiry | GET | cron (HMAC verifyCronRequest) | Offer,Application,Employer,JobSeeker | high |
| /api/cron/saved-search-alerts | GET | cron (HMAC verifyCronRequest) | SavedSearch,Job,User,NotificationPreference | high |
| /api/cron/sla-alerts | GET | cron (HMAC verifyCronRequest) | Application,Employer,User | high |
| /api/cron/subscription-expiry | GET | cron (HMAC verifyCronRequest) | Subscription,SubscriptionHistory,Invoice,Employer,User | high |
| /api/cron/subscription-reminder | GET | cron (HMAC verifyCronRequest) | Subscription | high |
| /api/cron/subscription-usage-reset | GET | cron (HMAC verifyCronRequest) | Subscription | high |
| /api/cron/target-risk-check | GET | cron (HMAC verifyCronRequest) | TargetProfile,Notification | high |
| /api/dashboard/stats | GET | handler role checks: job_seeker | Application,Interview,SavedJob,ProfileView,JobSeeker | high |
| /api/developer | GET,POST,DELETE | ANY authenticated role (no rbac guard) | ApiKey,Webhook,Employer | NEEDS VERIFICATION |
| /api/diversity | GET,POST | ANY authenticated role (no rbac guard) | DiversityResponse,Employer,Application | NEEDS VERIFICATION |
| /api/dm | GET,POST | handler role checks: job_seeker, employer | Conversation,User,JobSeeker,Employer | high |
| /api/dm/[conversationId]/manage | PATCH,DELETE | ANY authenticated role (no rbac guard) | Conversation,DirectMessage | NEEDS VERIFICATION |
| /api/dm/[conversationId]/messages | GET,POST | ANY authenticated role (no rbac guard) | Conversation,DirectMessage | NEEDS VERIFICATION |
| /api/dm/[conversationId]/read | PATCH | ANY authenticated role (no rbac guard) | Conversation,DirectMessage | NEEDS VERIFICATION |
| /api/dm/conversation | GET | ANY authenticated role (no rbac guard) | Conversation,User | NEEDS VERIFICATION |
| /api/dm/customer-care | GET,POST | handler role checks: job_seeker, admin | Conversation,User,DirectMessage | high |
| /api/dm/customer-care/[conversationId]/manage | PATCH | handler role checks: job_seeker, admin | Conversation,User | high |
| /api/email-sequences | GET,POST | ANY authenticated role (no rbac guard) | EmailSequence,Employer | NEEDS VERIFICATION |
| /api/email-sequences/[id] | GET,PATCH,DELETE | ANY authenticated role (no rbac guard) | EmailSequence,Employer | NEEDS VERIFICATION |
| /api/employee-referrals | GET,POST | ANY authenticated role (no rbac guard) | EmployeeReferral,Employer | NEEDS VERIFICATION |
| /api/employer/applications/notify-matches | POST | admin, agent, employer, job_seeker | Employer,Application,JobSeeker | high |
| /api/employer/background-checks | GET,POST | admin, super_agent, agent, employer, job_seeker | Employer,Application,BackgroundCheck,User | high |
| /api/employer/background-checks/[id] | GET,PATCH | admin, super_agent, agent, employer, job_seeker | Employer,BackgroundCheck,User | high |
| /api/employer/payment-config | POST | handler role checks: employer, admin | Employer | high |
| /api/employer/talent-search | GET | admin, super_agent, agent, employer, job_seeker | JobSeeker,User | high |
| /api/employer/talent-search/invite | POST | admin, agent, employer, job_seeker | Employer,Job,JobSeeker,Application | high |
| /api/employers | GET,POST | admin, super_agent, agent, employer (handler also branches on: agent, super_agent) | User,Employer,Agent,SuperAgent,CompanyUser | high |
| /api/employers/[id] | GET,PATCH,DELETE | admin, super_agent, agent, employer (handler also branches on: employer, agent, super_agent) | User,Agent,Employer | high |
| /api/employers/[id]/profile-view | POST | ANY authenticated role (no rbac guard) | CompanyProfileView,Employer | NEEDS VERIFICATION |
| /api/employers/[id]/verify | POST,DELETE | admin (handler also branches on: admin) | Employer,User | high |
| /api/employers/activity-history | GET | handler role checks: employer | Employer,AuditLog,User | high |
| /api/employers/agents | GET | admin, super_agent, agent, employer (handler also branches on: employer, admin) | Employer,Agent,User | high |
| /api/employers/analytics | GET | admin, super_agent, agent, employer (handler also branches on: employer) | Employer,Job,Application,Placement,User | high |
| /api/employers/analytics/feedback-trends | GET | admin, super_agent, agent, employer, job_seeker (handler also branches on: employer, admin) | Employer,Scorecard,User | high |
| /api/employers/analytics/historical | GET | handler role checks: employer | Employer,Job,Application,User | high |
| /api/employers/analytics/jobs | GET | admin, super_agent, agent, employer (handler also branches on: employer) | Employer,Job,Application,User | high |
| /api/employers/analytics/offers | GET | handler role checks: employer | Employer,Offer,User | high |
| /api/employers/analytics/pipeline | GET | handler role checks: employer | Employer,Job,Application,User | high |
| /api/employers/analytics/response-time | GET | admin, super_agent, agent, employer (handler also branches on: employer) | Employer,Job,Application,User | high |
| /api/employers/candidates/[id] | GET | admin, super_agent, agent, employer | Employer,Application,Interview,JobSeeker | high |
| /api/employers/candidates/[id]/cv | GET | handler role checks: job_seeker, employer, agent, super_agent, admin | JobSeeker | high |
| /api/employers/comm-templates | GET,POST | admin, super_agent, agent, employer | Employer,CommTemplate,User | high |
| /api/employers/comm-templates/[id] | GET,PATCH,DELETE | admin, super_agent, agent, employer | Employer,CommTemplate,User | high |
| /api/employers/documents | POST,DELETE | handler role checks: employer | Employer,User | high |
| /api/employers/job-templates | GET,POST | admin, super_agent, agent, employer (handler also branches on: employer) | Employer,JobTemplate,User | high |
| /api/employers/job-templates/[id] | GET,DELETE,PATCH | admin, super_agent, agent, employer (handler also branches on: employer) | Employer,JobTemplate,User | high |
| /api/employers/job-templates/[id]/use | POST | admin, agent, employer (handler also branches on: employer) | Employer,JobTemplate,Job,User | high |
| /api/employers/logo | POST,DELETE | handler role checks: employer | Employer,User | high |
| /api/employers/matching-weight-templates | GET,POST | admin, super_agent, agent, employer (handler also branches on: employer, admin) | MatchingWeightTemplate,Employer | high |
| /api/employers/matching-weight-templates/[id] | GET,PATCH,DELETE | admin, super_agent, agent, employer (handler also branches on: employer, admin) | MatchingWeightTemplate,Employer | high |
| /api/employers/matching-weights | ? | admin, super_agent, agent, employer | Employer | high |
| /api/employers/me | GET,PATCH | handler role checks: employer | Employer,User | high |
| /api/employers/me/smtp | GET,PUT,DELETE | admin, super_agent, agent, employer (handler also branches on: employer) | Employer | high |
| /api/employers/me/smtp/test | POST | admin, agent, employer (handler also branches on: employer) | Employer | high |
| /api/employers/poster-credits | GET | handler role checks: employer | Employer,User | high |
| /api/employers/posters | GET,POST | handler role checks: employer | Employer,PosterGeneration,User | high |
| /api/employers/posters/[id] | GET,DELETE | handler role checks: employer | Employer,PosterGeneration | high |
| /api/employers/screening-analytics | GET | handler role checks: employer, admin | Application,Job,Employer | high |
| /api/employers/setup-status | GET | ANY authenticated (raw auth(), no role gate found) | Employer,Job | NEEDS VERIFICATION |
| /api/employers/stats | GET | handler role checks: employer | Employer,Job,Application,Interview,Placement,User | high |
| /api/employers/team | GET,POST | handler role checks: employer | CompanyUser,Employer,User | high |
| /api/employers/team/[id] | PATCH,DELETE | handler role checks: employer | CompanyUser,Employer | high |
| /api/employers/team/accept | POST | handler role checks: employer | CompanyUser,Employer,User | high |
| /api/employers/team/activity-logs | GET | admin, super_agent, agent, employer (handler also branches on: employer) | AuditLog,CompanyUser,Employer,User | high |
| /api/employers/verify-domain | POST | handler role checks: employer | Employer,CompanyUser | high |
| /api/employers/verify-domain/confirm | GET | PUBLIC (no auth in handler) | Employer | — |
| /api/employers/workflow | GET,PATCH | handler role checks: employer, admin | Employer | high |
| /api/employers/workflow-templates | GET,POST | admin, super_agent, agent, employer (handler also branches on: employer, admin) | WorkflowTemplate,Employer | high |
| /api/employers/workflow-templates/[id] | GET,PATCH,DELETE | admin, super_agent, agent, employer (handler also branches on: employer, admin) | WorkflowTemplate,Employer | high |
| /api/exchange-rates | GET | PUBLIC (no auth in handler) | — | — |
| /api/exhibitions | GET,POST | admin, super_agent, agent (handler also branches on: agent, super_agent) | ExhibitionRequest,Agent,SuperAgent | high |
| /api/exhibitions/[id] | GET,PATCH,DELETE | admin, super_agent, agent (handler also branches on: agent, super_agent, admin) | ExhibitionRequest,User | high |
| /api/exhibitions/[id]/audit | GET | admin, super_agent, agent (handler also branches on: admin, super_agent) | ExhibitionRequest | high |
| /api/exhibitions/[id]/performance | GET,PUT | admin, super_agent, agent (handler also branches on: admin) | ExhibitionPerformance,ExhibitionRequest | high |
| /api/exhibitions/analytics | GET | admin, super_agent, agent (handler also branches on: admin, super_agent) | ExhibitionRequest,ExhibitionPerformance,Agent,SuperAgent,User | high |
| /api/filters | GET | PUBLIC (no auth in handler) | — | — |
| /api/filters/locations | GET | PUBLIC (no auth in handler) | Country,State,City | — |
| /api/gdpr | GET | PUBLIC (no auth in handler) | — | — |
| /api/gdpr/export | GET,DELETE | ANY authenticated role (no rbac guard) | User,JobSeeker,Application,Interview,Notification | NEEDS VERIFICATION |
| /api/graphql | GET,POST | session + inline checks: admin | — | NEEDS VERIFICATION |
| /api/hiring-decisions | GET,POST | admin, super_agent, agent, employer, job_seeker (handler also branches on: employer) | HiringDecision,Scorecard,Employer,Application,User | high |
| /api/inngest | ? | PUBLIC — Inngest SDK signature | — | — |
| /api/interviews | GET,POST | admin, super_agent, agent, employer, job_seeker (handler also branches on: job_seeker, employer, agent, super_agent) | Interview,Application,Job,JobSeeker,User,Employer,Agent | high |
| /api/interviews/[id] | GET,PATCH,DELETE | admin, super_agent, agent, employer, job_seeker (handler also branches on: admin, job_seeker, employer, agent, super_agent) | Interview,Application,JobSeeker,Job,Employer,Agent,User | high |
| /api/interviews/[id]/next-round | POST | admin, agent, employer | Interview,Application,JobSeeker,Job,User | high |
| /api/interviews/[id]/respond | POST | admin, super_agent, agent, employer, job_seeker (handler also branches on: job_seeker) | Interview,JobSeeker,Employer,User | high |
| /api/interviews/[id]/scorecard | GET,POST | admin, agent, employer (handler also branches on: employer, job_seeker) | Interview,Scorecard,Employer,User | high |
| /api/interviews/bulk | POST | admin, agent, employer (handler also branches on: agent) | Interview,Application,JobSeeker,Agent,Employer | high |
| /api/interviews/export/ical | GET | admin, super_agent, agent, employer, job_seeker (handler also branches on: job_seeker, employer) | Interview,JobSeeker,Job,Employer,User | high |
| /api/invoices | GET | admin, super_agent, agent, employer (handler also branches on: admin, super_agent, agent) | Invoice,Employer,Job,Agent,SuperAgent | high |
| /api/invoices/[id] | GET,PATCH | admin, super_agent, agent, employer (handler also branches on: super_agent, agent) | Invoice,Agent,SuperAgent,Employer | high |
| /api/invoices/[id]/credit-note | POST | admin, super_agent (handler also branches on: admin) | Invoice | high |
| /api/invoices/[id]/delivery | POST | admin, super_agent, agent, employer | Invoice | high |
| /api/invoices/[id]/dispute | GET,POST | admin, super_agent, agent, employer | Invoice | high |
| /api/invoices/[id]/pay | GET,POST | admin, super_agent, agent, employer | Invoice | high |
| /api/invoices/[id]/payments | GET,POST | admin, super_agent, agent, employer | Invoice | high |
| /api/invoices/[id]/pdf | GET | handler role checks: admin, super_agent, agent | Invoice,User,SuperAgent,Agent | high |
| /api/invoices/[id]/send | POST | ANY authenticated role (no rbac guard) | Invoice,User | NEEDS VERIFICATION |
| /api/invoices/[id]/verify-payment | POST | admin, super_agent, agent, employer | Invoice | high |
| /api/invoices/analytics | GET | admin, super_agent, agent, employer (handler also branches on: super_agent, agent, admin) | Invoice,Commission,Agent,SuperAgent | high |
| /api/invoices/check-duplicate | GET | ANY authenticated role (no rbac guard) | Invoice | NEEDS VERIFICATION |
| /api/invoices/recruitment | POST | admin, super_agent, agent (handler also branches on: agent, super_agent) | Invoice,Job,Employer,Agent,SuperAgent,SystemSettings | high |
| /api/invoices/recruitment/bulk | POST | admin, super_agent, agent (handler also branches on: admin) | Invoice,Placement,Job,Employer,Agent,SuperAgent,SystemSettings | high |
| /api/invoices/uninvoiced-placements | GET | admin, super_agent, agent, employer (handler also branches on: super_agent) | Placement,Invoice,SuperAgent,Agent | high |
| /api/job-seeker/cv | POST | handler role checks: job_seeker | JobSeeker | high |
| /api/job-seeker/dashboard | GET | handler role checks: job_seeker | Application,Interview,SavedJob,JobSeeker,ProfileView,Notification | high |
| /api/job-seeker/documents | GET,POST,DELETE | handler role checks: job_seeker | JobSeeker | high |
| /api/job-seeker/documents/[docId]/download | GET | handler role checks: job_seeker, admin | JobSeeker | high |
| /api/job-seeker/me | GET | handler role checks: job_seeker | JobSeeker | high |
| /api/job-seeker/onboarding | GET | admin, employer (handler also branches on: job_seeker) | JobSeeker,OnboardingChecklist,User | high |
| /api/job-seeker/onboarding/[id] | PATCH | admin, employer (handler also branches on: job_seeker) | JobSeeker,Employer,User,OnboardingChecklist | high |
| /api/job-seeker/onboarding/[id]/upload | POST | admin, employer (handler also branches on: job_seeker) | JobSeeker,Employer,User,OnboardingChecklist | high |
| /api/job-seeker/personal-details-options | GET | handler role checks: job_seeker | Gender,MaritalStatus,Country,User | high |
| /api/job-seeker/profile | GET,PATCH | handler role checks: job_seeker | JobSeeker,User | high |
| /api/job-seeker/profile-boost | GET,POST | handler role checks: job_seeker | JobSeeker | high |
| /api/job-seeker/profile-views | GET | handler role checks: job_seeker | ProfileView,Employer,User | high |
| /api/job-seeker/recommended-jobs | GET | handler role checks: job_seeker | Job,JobSeeker,Application | high |
| /api/job-seeker/skill-confirmations | GET,POST | handler role checks: job_seeker | SkillConfirmation,JobSeeker,User | high |
| /api/job-seeker/skill-gaps | GET | handler role checks: job_seeker | Job,JobSeeker,SkillConfirmation,User | high |
| /api/job-seekers | GET | admin, super_agent, agent, employer, job_seeker (handler also branches on: agent) | JobSeeker,Agent,User | high |
| /api/job-seekers/[id] | GET,PATCH,DELETE | admin, super_agent, agent, employer, job_seeker (handler also branches on: admin, agent, super_agent, employer) | JobSeeker,User,Agent,ProfileView,Employer | high |
| /api/job-seekers/[id]/availability | GET | admin, super_agent, agent, employer, job_seeker | JobSeeker,Interview | high |
| /api/job-seekers/account | GET,DELETE | handler role checks: job_seeker | User,JobSeeker | high |
| /api/job-seekers/avatar | POST,DELETE | ANY authenticated role (no rbac guard) | User | NEEDS VERIFICATION |
| /api/job-seekers/bulk-cv-download | POST | admin, super_agent, agent, employer, job_seeker | JobSeeker,User | high |
| /api/job-seekers/generate-embeddings | POST | admin, agent, job_seeker | JobSeeker,User | high |
| /api/job-seekers/profile | ? | handler role checks: job_seeker | JobSeeker,User | high |
| /api/job-seekers/settings | GET,PATCH | handler role checks: job_seeker | JobSeeker | high |
| /api/job-seekers/vector-search | POST | admin, super_agent, agent, employer, job_seeker | JobSeeker,User | high |
| /api/jobs | GET,POST | handler role checks: agent, employer, admin, super_agent | Job,Application,Employer,Agent,SuperAgent,CompanyUser,ExtractionDraft,User | high |
| /api/jobs/[id] | GET,PATCH,DELETE | admin, super_agent, agent, employer, job_seeker (handler also branches on: job_seeker, employer, agent, admin) | Job,Employer,Agent,User | high |
| /api/jobs/[id]/analytics | GET | admin, super_agent, agent, employer, job_seeker | Application,Job | high |
| /api/jobs/[id]/apply | POST | handler role checks: job_seeker | Job,Application,JobSeeker,ActivityEvent,Employer,User | high |
| /api/jobs/[id]/clone | POST | handler role checks: employer, agent | Job,Employer,Agent,User | high |
| /api/jobs/[id]/matching-weights | GET,PATCH | handler role checks: employer | Job,Employer,User | high |
| /api/jobs/[id]/save | POST | handler role checks: job_seeker | Job,SavedJob,JobSeeker | high |
| /api/jobs/[id]/similar | GET | PUBLIC (no auth in handler) | Job | — |
| /api/jobs/[id]/track-view | POST | PUBLIC (no auth in handler) | Job | — |
| /api/jobs/[id]/workflow | GET,PATCH | handler role checks: employer | Job,Employer,User | high |
| /api/jobs/auto-draft | POST | ANY authenticated (raw auth(), no role gate found) | Job,Employer | NEEDS VERIFICATION |
| /api/jobs/match-preview | GET | ANY authenticated role (no rbac guard) | JobSeeker | NEEDS VERIFICATION |
| /api/jobs/recommended | GET | handler role checks: job_seeker | Job,JobSeeker,Application | high |
| /api/jobs/suggestions | GET | ANY authenticated role (no rbac guard) | — | NEEDS VERIFICATION |
| /api/leads | GET,POST | admin, super_agent, agent (handler also branches on: agent) | Lead,Agent | high |
| /api/leads/[id] | GET,PATCH,DELETE | admin, super_agent, agent (handler also branches on: agent) | Lead,Agent,User | high |
| /api/leads/[id]/activities | GET,POST | admin, super_agent, agent (handler also branches on: agent) | Lead,Agent,User | high |
| /api/leads/[id]/convert | POST | admin, super_agent, agent (handler also branches on: agent, super_agent, admin) | Lead,Agent,User,Employer,CompanyUser | high |
| /api/leads/bulk | POST | admin, super_agent, agent (handler also branches on: agent) | Lead,Agent,User | high |
| /api/leads/check-duplicates | GET | admin, super_agent, agent (handler also branches on: agent) | Agent | high |
| /api/linkedin/import-profile | POST | handler role checks: job_seeker | User,JobSeeker | high |
| /api/messages | ? | ANY authenticated role (no rbac guard) | Message,User | NEEDS VERIFICATION |
| /api/notifications | GET,PATCH | ANY authenticated role (no rbac guard) | Notification | NEEDS VERIFICATION |
| /api/offer-letters | GET,POST | ANY authenticated role (no rbac guard) | OfferLetter,Employer | NEEDS VERIFICATION |
| /api/offer-letters/[id] | GET,PATCH,DELETE | handler role checks: admin | OfferLetter,Employer,User | high |
| /api/offers | GET,POST | admin, super_agent, agent, employer, job_seeker (handler also branches on: agent, job_seeker, employer) | Offer,Application,Employer,JobSeeker,Job,Agent,User | high |
| /api/offers/[id] | GET,PATCH,DELETE | admin, super_agent, agent, employer, job_seeker (handler also branches on: job_seeker, employer, agent, super_agent) | Offer,Application,Employer,JobSeeker,Agent,User | high |
| /api/offers/[id]/letter/pdf | GET | admin, super_agent, agent, employer, job_seeker (handler also branches on: job_seeker, employer, agent, super_agent, admin) | Offer,Employer,JobSeeker,Agent,User | high |
| /api/offers/[id]/remind | POST | admin, agent, employer, job_seeker (handler also branches on: employer) | Offer,Employer,JobSeeker,Agent,Job,User | high |
| /api/offers/[id]/revise | PATCH | admin, agent, employer, job_seeker (handler also branches on: employer) | Offer,Employer,JobSeeker,Agent,User | high |
| /api/og/job | GET | PUBLIC (no auth in handler) | Job,Employer | — |
| /api/placements | GET,POST | admin, super_agent, agent, employer (handler also branches on: employer, agent, job_seeker, super_agent, admin) | Placement,Employer,JobSeeker,Job,Agent,User | high |
| /api/placements/[id] | GET,PATCH,DELETE | admin, super_agent, agent, employer (handler also branches on: admin, employer, agent, super_agent) | Placement,Employer,User,Agent | high |
| /api/placements/[id]/onboarding | GET,POST,PATCH | admin, super_agent, agent, employer (handler also branches on: employer, admin) | Placement,Employer,OnboardingChecklist,User | high |
| /api/poster/[slug]/qr | GET | PUBLIC (no auth in handler) | PosterGeneration | — |
| /api/poster/[slug]/track | POST | PUBLIC (no auth in handler) | PosterGeneration | — |
| /api/proxy-image | GET | PUBLIC (no auth in handler) | — | — |
| /api/public/blogs | GET | PUBLIC (no auth in handler) | BlogPost | — |
| /api/public/blogs/[slug] | GET | PUBLIC (no auth in handler) | BlogPost | — |
| /api/public/landing | GET | PUBLIC (no auth in handler) | FAQ,Banner,Testimonial,Video,BlogPost | — |
| /api/public/pages/[slug] | GET | PUBLIC (no auth in handler) | StaticPage | — |
| /api/referral | GET | admin, super_agent, agent, employer (handler also branches on: agent, super_agent) | Agent,SuperAgent,ReferralLink | high |
| /api/referral-links | GET,POST | handler role checks: agent, super_agent, admin | ReferralLink,Agent,SuperAgent | high |
| /api/referral-links/[id] | GET,PATCH,DELETE | handler role checks: agent, super_agent, admin | ReferralLink,Agent,SuperAgent | high |
| /api/referral/validate | GET | PUBLIC (no auth in handler) | Agent,SuperAgent,ReferralLink,User | — |
| /api/requisitions | GET,POST | ANY authenticated role (no rbac guard) | Requisition,Employer | NEEDS VERIFICATION |
| /api/requisitions/[id] | GET,PATCH,DELETE | handler role checks: admin | Requisition,Employer | high |
| /api/resources | GET,POST | admin, super_agent, agent (handler also branches on: admin) | Resource | high |
| /api/resources/[id] | GET,POST,PATCH,DELETE | admin, super_agent, agent (handler also branches on: admin) | Resource,ResourceDownloadLog | high |
| /api/resources/[id]/downloads | GET | admin, super_agent, agent (handler also branches on: admin) | ResourceDownloadLog | high |
| /api/reviews | GET,POST | handler role checks: job_seeker | CompanyReview,Employer,User | high |
| /api/salary-explorer | GET | PUBLIC (no auth in handler) | Job | — |
| /api/saved-jobs | GET,POST | handler role checks: job_seeker | SavedJob | high |
| /api/saved-jobs/[id] | DELETE | handler role checks: job_seeker | SavedJob | high |
| /api/scorecards | GET,POST | admin, super_agent, agent, employer, job_seeker (handler also branches on: employer, job_seeker) | Scorecard,Interview,Application,Employer,User | high |
| /api/scorecards/[id] | GET,PATCH | admin, super_agent, agent, employer, job_seeker (handler also branches on: employer) | Scorecard,Employer,User | high |
| /api/scorecards/consensus | GET | admin, super_agent, agent, employer, job_seeker (handler also branches on: employer) | Scorecard,Employer,User | high |
| /api/settings/public | GET | admin, super_agent, agent, employer, job_seeker | SystemSettings | high |
| /api/social/linkedin/share | POST | ANY authenticated role (no rbac guard) | — | NEEDS VERIFICATION |
| /api/subscriptions/[id] | GET,PATCH | admin, super_agent, agent, employer | Subscription,SubscriptionHistory,Employer | high |
| /api/subscriptions/assign | POST | admin, super_agent, agent | SubscriptionPlan,Subscription,Invoice,SubscriptionHistory,User,Employer | high |
| /api/subscriptions/bulk-assign | POST | admin, super_agent, agent | SubscriptionPlan,Subscription,Invoice,SubscriptionHistory,User,Employer | high |
| /api/subscriptions/change | POST | admin, super_agent | SubscriptionPlan,Subscription,Invoice,SubscriptionHistory,Employer | high |
| /api/subscriptions/checkout | POST | admin, super_agent, agent, employer (handler also branches on: employer, job_seeker) | SubscriptionPlan | high |
| /api/subscriptions/feature-gate | GET | admin, super_agent, agent, employer | — | high |
| /api/subscriptions/history | GET | admin, super_agent, agent, employer | SubscriptionHistory | high |
| /api/subscriptions/my | GET | admin, super_agent, agent, employer (handler also branches on: employer, job_seeker) | Subscription | high |
| /api/subscriptions/plans | GET | admin, super_agent, agent, employer (handler also branches on: employer, job_seeker) | SubscriptionPlan | high |
| /api/subscriptions/renew | POST | admin, super_agent | Subscription,Invoice,SubscriptionHistory,Employer | high |
| /api/subscriptions/self-assign | POST | admin, super_agent, agent, employer (handler also branches on: employer, job_seeker) | Subscription | high |
| /api/super-agent/actions/assign-leads | POST | admin | Agent,Lead | high |
| /api/super-agent/actions/send-reminder | POST | admin | Agent,Notification | high |
| /api/super-agent/agents | GET,POST | admin, super_agent (handler also branches on: super_agent) | User,Agent,SuperAgent,Lead | high |
| /api/super-agent/agents/[id] | GET,PATCH | admin, super_agent | User,Agent,Lead,ReferralLink | high |
| /api/super-agent/applications | GET | admin, super_agent, agent, employer, job_seeker (handler also branches on: super_agent, admin) | Application,Agent,Job,User | high |
| /api/super-agent/approvals | GET | admin, super_agent, agent, employer, job_seeker | Job,Agent | high |
| /api/super-agent/approvals/[id] | PATCH | admin, super_agent (handler also branches on: super_agent, admin) | Job,Agent,SuperAgent,User | high |
| /api/super-agent/approvals/count | GET | admin, super_agent, agent, employer, job_seeker | Job,Agent | high |
| /api/super-agent/avatar | POST,DELETE | handler role checks: super_agent, admin | User | high |
| /api/super-agent/commissions-report | GET | admin, super_agent, agent | Commission,Agent,SuperAgent,User | high |
| /api/super-agent/dashboard | GET | admin, super_agent | Agent,User,Job,Application,Placement,Lead,Commission | high |
| /api/super-agent/insights | GET | admin, super_agent | Agent,User,Lead,Placement | high |
| /api/super-agent/insights/feedback | POST | admin | — | high |
| /api/super-agent/interviews | GET | admin, super_agent, agent, employer, job_seeker (handler also branches on: super_agent, admin) | Interview | high |
| /api/super-agent/job-seekers | GET | admin, super_agent, agent, employer, job_seeker (handler also branches on: super_agent, admin) | Agent,JobSeeker,User | high |
| /api/super-agent/jobs | GET | admin, super_agent, agent, employer, job_seeker | Job,Agent | high |
| /api/super-agent/leads | GET | admin, super_agent, agent | Lead | high |
| /api/super-agent/profile | GET,PATCH | handler role checks: super_agent, admin | SuperAgent,User | high |
| /api/super-agent/reports | GET | admin, super_agent, agent | Agent,User,Lead,Placement,Commission | high |
| /api/super-agent/settings | GET,PATCH | handler role checks: super_agent, admin | SuperAgent,User | high |
| /api/super-agent/settings/invoice-defaults | GET,PATCH | handler role checks: super_agent, admin | SuperAgent,User | high |
| /api/super-agent/target-profiles | GET,POST | admin, super_agent, agent | TargetProfile,Agent,User | high |
| /api/super-agent/target-profiles/analytics | GET | admin, super_agent, agent | TargetProfile,User | high |
| /api/super-agent/target-report | GET | admin, super_agent, agent | TargetProfile,User,Commission,Agent | high |
| /api/super-agent/targets | GET,POST | admin, super_agent, agent | Target,SuperAgent,Agent,User | high |
| /api/super-agent/targets/distribute | POST | admin, super_agent | Target,SuperAgent,Agent | high |
| /api/super-agent/targets/grouped | GET | admin, super_agent, agent | Target,SuperAgent,Agent,User | high |
| /api/super-agent/territory | GET | admin, super_agent, agent (handler also branches on: super_agent, admin) | Agent,Employer,Job,State,City | high |
| /api/surveys | GET,POST | handler role checks: job_seeker | CandidateSurvey,Employer,Application | high |
| /api/talent-pools | GET,POST | ANY authenticated role (no rbac guard) | TalentPool,Employer | NEEDS VERIFICATION |
| /api/talent-pools/[id] | GET,PATCH,DELETE | ANY authenticated role (no rbac guard) | TalentPool,Employer | NEEDS VERIFICATION |
| /api/taxonomy | GET | PUBLIC (no auth in handler) | JobSkill,Industry,MajorSubject,Country,City,Job | — |
| /api/tenant/switch | POST,GET | handler role checks: employer, agent, super_agent | Agent,SuperAgent,Employer,User,TenantViewSession | high |
| /api/unsubscribe | GET,POST | PUBLIC (no auth in handler) | NotificationPreference,SavedSearch | — |
| /api/user/2fa | GET,POST | ANY authenticated role (no rbac guard) | User | NEEDS VERIFICATION |
| /api/user/autoapply | PATCH | handler role checks: job_seeker | JobSeeker | high |
| /api/user/currency | GET | ANY authenticated role (no rbac guard) | Agent,SuperAgent,Employer,JobSeeker,SystemSettings | NEEDS VERIFICATION |
| /api/user/email-change | GET,POST,DELETE | ANY authenticated role (no rbac guard) | User | NEEDS VERIFICATION |
| /api/user/notification-preferences | GET,PATCH | ANY authenticated role (no rbac guard) | NotificationPreference | NEEDS VERIFICATION |
| /api/user/portfolio | GET,POST | ANY authenticated role (no rbac guard) | — | NEEDS VERIFICATION |
| /api/user/portfolio/[id] | DELETE | ANY authenticated role (no rbac guard) | — | NEEDS VERIFICATION |
| /api/user/profile-completion | GET | handler role checks: job_seeker | JobSeeker | high |
| /api/user/referral | GET | ANY authenticated role (no rbac guard) | User | NEEDS VERIFICATION |
| /api/user/saved-searches | GET,POST | ANY authenticated role (no rbac guard) | SavedSearch | NEEDS VERIFICATION |
| /api/user/saved-searches/[id] | PATCH,DELETE | ANY authenticated role (no rbac guard) | SavedSearch | NEEDS VERIFICATION |
| /api/users/[userId] | GET | handler role checks: job_seeker, employer | User,JobSeeker,Employer | high |
| /api/users/change-password | POST | ANY authenticated (raw auth(), no role gate found) | User | NEEDS VERIFICATION |
| /api/users/locale | PATCH | ANY authenticated (raw auth(), no role gate found) | User | NEEDS VERIFICATION |
| /api/users/search | GET | ANY authenticated role (no rbac guard) | User | NEEDS VERIFICATION |
