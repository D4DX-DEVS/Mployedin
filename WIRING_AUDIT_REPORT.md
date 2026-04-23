# Mployedin Wiring & Pipeline Audit Report

**Date:** April 23, 2026  
**Method:** Graphify knowledge graph (2,521 nodes, 2,824 edges) + static file analysis  
**Scope:** Full codebase — 240 API routes, 35 hooks, 60+ models, 50+ lib modules

---

## CRITICAL ISSUES (Must Fix)

### 1. MIDDLEWARE NOT WIRED — SECURITY BYPASS
| Detail | Value |
|--------|-------|
| **Severity** | CRITICAL |
| **File** | `src/proxy.ts` |
| **Problem** | Next.js middleware is defined in `proxy.ts` but Next.js only auto-detects `middleware.ts` (or `src/middleware.ts`). The compiled middleware manifest is **empty** (`sortedMiddleware: []`). |
| **Impact** | CSRF protection, security headers, auth redirects, and i18n locale routing via middleware are **NOT ACTIVE** in production. |
| **Fix** | Rename `src/proxy.ts` → `src/middleware.ts` |

### 2. ALL 8 INNGEST BACKGROUND FUNCTIONS NOT EXPORTED FROM INDEX
| Detail | Value |
|--------|-------|
| **Severity** | CRITICAL |
| **Problem** | There is no `src/lib/inngest/index.ts`. The Inngest route (`src/app/api/inngest/route.ts`) imports functions directly and **does serve them correctly**. However, the functions are not re-exported from a central barrel, meaning external consumers can't discover them. |
| **Reality** | **False alarm on wiring** — functions ARE correctly imported in `route.ts` and served. The audit script checked for `index.ts` barrel which doesn't exist, but the direct imports in `route.ts` are correct. |
| **Affected Functions** | `notificationOrchestrator`, `dailyRecommendationsCron`, `dailyDigestWorker`, `reEngagementCron`, `profileCompletionCron`, `weeklyDigestCron`, `jobExpiryAlertsCron`, `similarJobsAfterApply` |
| **autoApply** | Intentionally disabled with TODO comment — not a bug |

### 3. DEBUG ENDPOINT IN PRODUCTION
| Detail | Value |
|--------|-------|
| **Severity** | HIGH |
| **File** | `src/app/api/debug/employer-jobs/route.ts` |
| **Problem** | Debug endpoint marked "DELETE this file after debugging is complete" still exists. Exposes employer/user internal data (ObjectIds, emails, role info). |
| **Fix** | Delete the file |

---

## HIGH PRIORITY ISSUES

### 4. MUTATING ROUTES WITHOUT INPUT VALIDATION (51 routes)
Routes that accept POST/PUT/PATCH/DELETE but don't validate request body with Zod:

| Route | Risk |
|-------|------|
| `api/auth/employer-register` | Registration data not validated — injection risk |
| `api/auth/job-seeker-register` | Registration data not validated |
| `api/dm/route.ts` | DM creation — no body validation |
| `api/dm/[conversationId]/messages` | Message send — no body validation |
| `api/dm/customer-care` | Customer care — no validation |
| `api/employers/logo` | Logo upload (file upload — lower risk) |
| `api/employers/me/smtp` | SMTP config — no validation on credentials |
| `api/employers/me/smtp/test` | SMTP test — no validation |
| `api/employers/posters` | Poster generation — no validation |
| `api/employers/[id]/verify` | Employer verification — no validation |
| `api/job-seeker/cv` | CV upload (file — lower risk) |
| `api/job-seeker/documents` | Document upload (file — lower risk) |
| `api/job-seekers/account` | Account management — no validation |
| `api/job-seekers/avatar` | Avatar upload (file — lower risk) |
| `api/jobs/[id]/apply` | Job application — no validation |
| `api/jobs/[id]/clone` | Job clone — no validation |
| `api/jobs/[id]/matching-weights` | Weight config — no validation |
| `api/jobs/[id]/save` | Save job — no validation |
| `api/jobs/[id]/workflow` | Workflow config — no validation |
| `api/referral-links/route.ts` | Referral link CRUD — no validation |
| `api/referral-links/[id]` | Referral link update — no validation |
| `api/saved-jobs/[id]` | Saved job delete — lower risk |
| `api/super-agent/actions/assign-leads` | Lead assignment — no validation |
| `api/super-agent/actions/send-reminder` | Reminder send — no validation |
| `api/super-agent/approvals/[id]` | Approval action — no validation |
| `api/super-agent/insights/feedback` | Feedback — no validation |
| `api/super-agent/profile` | Profile update — no validation |
| `api/super-agent/settings` | Settings update — no validation |
| `api/unsubscribe` | Email unsubscribe — no validation |
| `api/user/notification-preferences` | Notification prefs — no validation |
| `api/admin/notification-config` | Admin notif config — no validation |
| `api/admin/notification-config/user-override` | User override — no validation |
| `api/admin/settings` | Admin settings — no validation |
| `api/admin/settings/test-email` | Test email — no validation |
| `api/admin/test-email` | Test email (duplicate?) — no validation |
| `api/admin/cms/contact-submissions/[id]` | Contact submission — no validation |
| `api/admin/jobs/[id]/approve` | Job approval — no validation |
| `api/agent/settings` | Agent settings — no validation |
| `api/ai/enhance-text` | AI text enhance — no validation |
| `api/ai/generate-summary` | AI summary — no validation |
| `api/employers/documents` | Document management — no validation |
| `api/employers/job-templates/[id]` | Template update — no validation |
| `api/employers/job-templates/[id]/use` | Template use — no validation |
| `api/employers/[id]/profile-view` | Profile view track — no validation |
| `api/gdpr/export` | GDPR export — no validation |
| `api/inngest` | Inngest webhook (internal) |
| `api/jobs/[id]/track-view` | View tracking — no validation |

### 5. CRON JOB SECURITY
| Route | Issue |
|-------|-------|
| `api/cron/autoapply` | Uses `withAuth` instead of `verifyCronRequest` — inconsistent auth pattern |
| All other cron routes | Correctly use `verifyCronRequest` with `CRON_SECRET` |

### 6. DUPLICATE TEST-EMAIL ENDPOINTS
| Route | Issue |
|-------|-------|
| `api/admin/settings/test-email` | Test email endpoint #1 |
| `api/admin/test-email` | Test email endpoint #2 — likely duplicate |

---

## MEDIUM PRIORITY — Orphan/Dead Code

### 7. ORPHAN API ROUTES (no frontend consumer detected)
| Route | Status |
|-------|--------|
| `api/ai/screen-candidates` | No hook/page calls this endpoint |
| `api/debug/employer-jobs` | Debug endpoint (should be deleted) |
| `api/employers/verify-domain` | No frontend wiring found |
| `api/og/job` | OG image route (called by social crawlers, not frontend — OK) |
| `api/users/change-password` | May be called from settings page via direct fetch |

### 8. UNUSED MODEL
| File | Issue |
|------|-------|
| `src/models/JobAttribute.ts` | Not imported by any file in src/ |

### 9. UNUSED LIB MODULES
| File | Issue |
|------|-------|
| `src/lib/ai/claude.ts` | Claude AI client not imported anywhere |
| `src/lib/inngest/events.ts` | Event type definitions not imported (types may be inline) |

### 10. UNUSED COMPONENTS (not imported by any page/component)
| Component | Issue |
|-----------|-------|
| `src/components/features/dm/CustomerCarePage.tsx` | No importer found |
| `src/components/features/employer/CandidateComparison.tsx` | No importer found |
| `src/components/features/employer/jobs/PosterGallery.tsx` | No importer found |
| `src/components/features/public/ApplyButton.tsx` | No importer found |
| `src/components/features/super-agent/AssistantChat.tsx` | No importer found |
| `src/components/shared/ErrorBoundary.tsx` | No importer found |
| `src/components/shared/VoiceInputStatus.tsx` | No importer found |

### 11. HOOKS WITHOUT API CALLS (utility hooks — not bugs)
| Hook | Status |
|------|--------|
| `useDebounce.ts` | Utility hook — no API calls (expected) |
| `useLinkedInShare.ts` | Window.open — no fetch (expected) |
| `usePagination.ts` | State-only hook (expected) |
| `usePermissions.ts` | May derive from context, not API (check if stale) |

---

## LOW PRIORITY — Graph-Only Issues (AST Limitation)

### 12. GRAPH FRAGMENTATION
The knowledge graph detected **567 connected components** instead of 1. This is primarily because:
- AST extraction can't detect `fetch('/api/...')` string-based connections (hooks → routes)
- Mongoose model registration is runtime (`mongoose.model('X')`) not static import
- Next.js framework wiring (layouts, loading states) is convention-based

**Real disconnections** (verified by file analysis): Only ~15 genuine issues found (listed above).  
**False positives**: ~550 components are just AST limitations.

---

## PIPELINE WIRING SUMMARY

| Pipeline | Status | Details |
|----------|--------|---------|
| **Middleware (CSRF/Auth/i18n)** | BROKEN | `proxy.ts` not detected as middleware — rename to `middleware.ts` |
| **Inngest Background Jobs** | OK | All 7 active functions properly served in route.ts |
| **autoApply Feature** | DISABLED | Intentionally disabled with TODO — not a bug |
| **Email Pipeline** | OK | `src/lib/communications/email.ts` wired, 2 exports, callers found |
| **Notification Pipeline** | OK | orchestrator → Inngest → email delivery chain intact |
| **Validator Pipeline** | PARTIAL | 19/20 validators used; index.ts barrel unused but validators imported directly |
| **Model Pipeline** | OK (1 exception) | All models imported except `JobAttribute.ts` |
| **Hook → API Pipeline** | OK | All hooks with fetch calls point to existing routes |
| **Component Pipeline** | PARTIAL | 7 components have no importers (may be lazy/dynamic) |
| **Cron Pipeline** | PARTIAL | 1 cron uses wrong auth pattern (withAuth vs verifyCronRequest) |
| **Security Headers** | BROKEN | Dependent on middleware which isn't active |
| **CSRF Protection** | BROKEN | Dependent on middleware which isn't active |

---

## RECOMMENDED FIX PRIORITY

1. **IMMEDIATE**: Rename `src/proxy.ts` → `src/middleware.ts` (restores CSRF, security headers, auth, i18n)
2. **IMMEDIATE**: Delete `src/app/api/debug/employer-jobs/route.ts`
3. **THIS SPRINT**: Add Zod validation to the 51 mutating routes (prioritize auth, DM, AI endpoints)
4. **THIS SPRINT**: Remove duplicate `api/admin/test-email` route
5. **NEXT SPRINT**: Delete unused `JobAttribute.ts` model, `claude.ts`, 7 unused components
6. **NEXT SPRINT**: Investigate orphan routes (`screen-candidates`, `verify-domain`)
