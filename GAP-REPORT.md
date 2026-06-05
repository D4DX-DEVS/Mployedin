# GAP-REPORT.md — Production Readiness Audit

> Companion to [MAP.md](MAP.md). Every claim cites a file and is labeled **OBSERVED** (seen in code), **INFERRED** (deduced, reason given), or **NOT VERIFIED** (no evidence either way). Payments intentionally excluded per instruction.

---

## A. SECURITY

| # | Finding | Evidence | Label | Severity |
|---|---------|----------|-------|----------|
| A1 | **Rate limiter is in-memory `Map`** — not shared across serverless instances and wiped on every cold start/restart. On Vercel each lambda has its own store, so limits are effectively per-instance and easily bypassed; brute-force/abuse protection is weak in production. | [src/lib/security/rateLimit.ts](mployedin/src/lib/security/rateLimit.ts#L16) (`const store = new Map`), comment "For production: swap with Upstash Redis" | OBSERVED | **HIGH** |
| A2 | **No malware/AV scanning on uploads** — validation is magic-byte + MIME + size only. Malicious PDFs/DOCX with valid signatures pass. | [src/lib/security/file-validation.ts](mployedin/src/lib/security/file-validation.ts) (no scan call); deferred in plan.md L1701 | OBSERVED | MEDIUM |
| A3 | **Inconsistent API authorization style** — most routes use `withAuth(handler,{resource,action})` matrix guard, but several do inline role checks (`ctx.role !== ...`) instead of the matrix (e.g. vector-search, cv-extract, admin/* inline admin check). Functional but bypasses the central matrix and is easy to get wrong. | [withAuth.ts](mployedin/src/lib/auth/withAuth.ts#L44) vs [vector-search/route.ts](mployedin/src/app/api/job-seekers/vector-search/route.ts), [cv-extract/route.ts](mployedin/src/app/api/ai/cv-extract/route.ts) | OBSERVED | MEDIUM |
| A4 | **NoSQL-injection helpers underused** — `escapeRegex`/`sanitizeObject`/`isValidObjectId` exist but only some search routes call `escapeRegex`. Other regex/`$in` queries build from user input without it. Mongoose casting mitigates most, but regex DoS / operator-injection risk remains in un-escaped search params. | [src/lib/security/sanitize.ts](mployedin/src/lib/security/sanitize.ts); inconsistent usage across `*/route.ts` | INFERRED (sampled, not exhaustive) | MEDIUM |
| A5 | Auth core is solid: bcrypt(12), per-account lockout (5/15min) + per-IP login throttle, JWT, verified-email gate, CSRF double-submit, CSP nonce, HSTS. | [config.ts](mployedin/src/lib/auth/config.ts), [csrf.ts](mployedin/src/lib/security/csrf.ts), [headers.ts](mployedin/src/lib/security/headers.ts), [proxy.ts](mployedin/src/proxy.ts#L126) | OBSERVED | OK (no action) |
| A6 | Env fail-fast at startup; secrets not hard-coded in sampled files. | [src/lib/env.ts](mployedin/src/lib/env.ts), [instrumentation.ts](mployedin/src/instrumentation.ts) | OBSERVED | OK |
| A7 | **Tenant-view / impersonation** grants admins/agents write access while proxying an employer. Signed cookie + DB session + expiry + auto-audit + DELETE restricted to admin — but blast radius is large; needs a periodic review of audit coverage. | [withAuth.ts](mployedin/src/lib/auth/withAuth.ts#L80-L200) | OBSERVED | MEDIUM |

---

## B. PERFORMANCE

| # | Finding | Evidence | Label | Severity |
|---|---------|----------|-------|----------|
| B1 | **Vector search loads ALL job seekers into memory and computes cosine similarity in Node** on every request (full collection scan + per-doc math, generates missing embeddings inline). Does not scale past a few thousand candidates; high latency + memory. No MongoDB Atlas Vector Search / `$vectorSearch` index used. | [vector-search/route.ts](mployedin/src/app/api/job-seekers/vector-search/route.ts#L45-L70) (`JobSeeker.find({status:{$ne:"deleted"}})` then JS loop) | OBSERVED | **HIGH** |
| B2 | **Offset pagination everywhere** (`skip`+`limit`). Fine for early pages; deep pages get slow as collections grow (skip scans). No cursor/keyset pagination for hot lists. | list routes across `/api/*` use `.skip(page*limit)` | OBSERVED | MEDIUM |
| B3 | Compound indexes were added this session and centralized; `autoIndex:false` avoids prod index churn. Good baseline — but B1's query has no supporting vector index. | [src/lib/db/indexes.ts](mployedin/src/lib/db/indexes.ts), [mongoose.ts](mployedin/src/lib/db/mongoose.ts#L48) | OBSERVED | OK |
| B4 | **Messaging/notifications use REST polling**, no WebSocket/SSE. Many clients polling unread-count/messages adds steady DB load at scale. | `/api/notifications`, `/api/dm/*` (no socket server in repo) | OBSERVED | LOW |
| B5 | AI responses cached via AICache (SHA-256 + TTL) reduces Gemini calls. | [embeddings.ts](mployedin/src/lib/ai/embeddings.ts), AICache model | OBSERVED | OK |

---

## C. DATABASE

| # | Finding | Evidence | Label | Severity |
|---|---------|----------|-------|----------|
| C1 | **Inconsistent soft-delete.** Only `Job` (`deletedAt`) and `ExhibitionRequest` (`isDeleted`+`deletedAt`) support soft delete; all other ~108 models hard-delete. Mixed semantics complicate audit, recovery, and referential integrity. | [Job.ts L266](mployedin/src/models/Job.ts#L266), [ExhibitionRequest.ts L303](mployedin/src/models/ExhibitionRequest.ts#L303); no `deletedAt` elsewhere | OBSERVED | MEDIUM |
| C2 | **No schema-level cascade / orphan cleanup.** No `pre('deleteOne'|'findOneAndDelete'|'remove')` hooks in models; cascade is only manual in a few routes (e.g. GDPR export/delete, tenant switch). Deleting a User/Employer/Job can leave orphaned Applications/Interviews/Commissions referencing dead IDs. | grep: no model-level delete hooks; manual `deleteMany` only in [gdpr/export/route.ts L79](mployedin/src/app/api/gdpr/export/route.ts#L79), [commissionRecords.ts L115](mployedin/src/lib/invoices/commissionRecords.ts#L115), scripts | INFERRED (absence of hooks) | MEDIUM |
| C3 | Indexes centralized and applied on connect; reduces missing-index full scans for standard list queries. | [indexes.ts](mployedin/src/lib/db/indexes.ts) | OBSERVED | OK |
| C4 | Audit trail exists (`AuditLog`, `ActivityEvent`, auto-audit in withAuth writes). | [AuditLog model], [withAuth.ts](mployedin/src/lib/auth/withAuth.ts) | OBSERVED | OK |

---

## D. PAGINATION

Legend: ✅ present/optimized · ⚠️ partial · ❌ missing. "Backend optimized" = server-side skip/limit with index support.

| Page / Endpoint | Pagination present? | Backend optimized? | Status |
|---|---|---|---|
| `/api/jobs` (+ admin/agent/employer job lists) | ✅ page/limit | ✅ skip/limit + index | OK (OBSERVED) |
| `/api/applications` | ✅ page/limit | ✅ | OK (OBSERVED) |
| `/api/job-seekers`, `/api/leads`, `/api/interviews`, `/api/offers` | ✅ page/limit | ✅ | OK (OBSERVED) |
| `/api/invoices`, `/api/commissions` | ✅ page/limit | ✅ | OK (OBSERVED) |
| `/api/messages`, `/api/notifications` | ✅ page/limit | ✅ | OK (OBSERVED) |
| `/api/companies` (public directory) | ✅ page/limit | ✅ | OK (OBSERVED) |
| Dashboard list pages (admin/agent/employer/job-seeker) | ✅ `PaginationControls` component | ✅ (calls paginated APIs) | OK (OBSERVED) |
| `/api/job-seekers/vector-search` | ⚠️ MAX_RESULTS=50 cap only | ❌ full-scan in memory (B1) | **NEEDS FIX** (OBSERVED) |
| Public `(public)/jobs`, `/companies`, `/blog` list pages | ⚠️ likely client-side slice over a fetched set | ⚠️ depends on API limit | INFERRED — page.tsx not directly confirmed |
| Deep pagination (page >> 100) on large collections | ✅ offset works | ⚠️ skip cost grows (B2) | MONITOR (OBSERVED) |

Summary: pagination is broadly present and server-side. The two real gaps are **vector-search (no real pagination, full scan)** and **offset cost at depth**.

---

## E. UI / UX UNIFORMITY

| # | Finding | Evidence | Label | Severity |
|---|---------|----------|-------|----------|
| E1 | Shared primitives drive consistency: a common `PaginationControls`, shadcn/Tailwind component set, and `(dashboard)` layout shells across roles. | dashboard list pages import shared `PaginationControls`; [components.json](mployedin/components.json) | OBSERVED | OK |
| E2 | Error/empty/loading states: root `global-error.tsx`, `(public)/error.tsx`, and dashboard `error.tsx` exist (added in observability phase). Coverage of per-route `loading.tsx`/empty states across all ~227 pages **not exhaustively verified**. | [global-error.tsx], [(public)/error.tsx], dashboard error boundary | OBSERVED (boundaries) / NOT VERIFIED (per-page loading/empty) | LOW |
| E3 | i18n: en/ar with RTL handled centrally; pages were migrated to next-intl keys (prior phase). Risk of stray hard-coded strings in newer pages. | messages/en.json, messages/ar.json; next-intl in middleware | OBSERVED / INFERRED (stray strings) | LOW |
| E4 | No documented shared design-token enforcement beyond Tailwind config + admin `design-system` page; visual uniformity not machine-verified. | [admin/design-system] page | NOT VERIFIED | LOW |

---

## F. CV / RESUME MODULE

| # | Finding | Evidence | Label | Severity |
|---|---------|----------|-------|----------|
| F1 | **CV parsing works**: upload → magic-byte validation → Gemini multimodal (PDF) / mammoth (DOCX) extraction → structured profile fill, feature-gated + rate-limited. | [cv-extract/route.ts](mployedin/src/app/api/ai/cv-extract/route.ts) | OBSERVED | OK |
| F2 | **No CV duplicate detection** — no file hash / content hash / dedupe on upload. Same CV can be re-uploaded/re-parsed unbounded (cost + data dupes). | grep in cv-extract: no `fileHash`/`sha256`/`dedupe`/`isDuplicate` | OBSERVED | MEDIUM |
| F3 | ~~**No resume builder / templated PDF export**~~ **CORRECTED 2026-06-04 — claim was WRONG.** A full CV builder with templated PDF export already exists: `handleDownloadPDF()` ([job-seeker/cv/page.tsx](mployedin/src/app/[locale]/(dashboard)/job-seeker/cv/page.tsx#L382) L382-L388) renders via `@react-pdf/renderer`, with 3 templates (ClassicPDF/ModernPDF/MinimalPDF) in [cv-pdf-document.tsx](mployedin/src/app/[locale]/(dashboard)/job-seeker/cv/cv-pdf-document.tsx) + [cv-pdf-template.tsx](mployedin/src/app/[locale]/(dashboard)/job-seeker/cv/cv-pdf-template.tsx). jsPDF is also used in [lib/export/index.ts](mployedin/src/lib/export/index.ts#L87). Original grep missed the dynamic `await import("@react-pdf/renderer")`. | OBSERVED | OK (no gap) |
| F4 | **No malware scan on CV uploads** (same as A2). | [file-validation.ts](mployedin/src/lib/security/file-validation.ts) | OBSERVED | MEDIUM |
| F5 | CV files stored on Spaces/S3; deletion is hard-delete with no soft-delete/version history. | [spaces.ts](mployedin/src/lib/storage/spaces.ts), C1 | OBSERVED | LOW |

---

## G. AI FEATURES

| # | Finding | Evidence | Label | Severity |
|---|---------|----------|-------|----------|
| G1 | ~29 AI routes are **wired end-to-end** (real handlers, Gemini calls, Zod input, output redaction, subscription gating, AICache). Not stubs. | `/api/ai/*` (see MAP §6); [gemini.ts], [sanitize.ts](mployedin/src/lib/ai/sanitize.ts), [embeddings.ts](mployedin/src/lib/ai/embeddings.ts) | OBSERVED | OK |
| G2 | Semantic/vector search backed by `JobSeeker.searchEmbedding`; embeddings generated on demand if missing — but search executes the **in-memory full-scan** of B1. | [vector-search/route.ts](mployedin/src/app/api/job-seekers/vector-search/route.ts) | OBSERVED | **HIGH** (perf) |
| G3 | AI input sanitized (`sanitizeAIInput`) + token caps (`AI_TOKEN_LIMITS`) + PII redaction → reasonable prompt-injection / cost controls. Effectiveness of injection defenses not adversarially tested. | [sanitize.ts](mployedin/src/lib/ai/sanitize.ts) | OBSERVED / NOT VERIFIED (robustness) | LOW |
| G4 | No per-user AI spend budget/quota beyond rate limit + feature gate; abusive usage could run up Gemini cost (rate limiter is the in-memory one from A1). | [featureGate.ts](mployedin/src/lib/subscription/featureGate.ts), [rateLimit.ts](mployedin/src/lib/security/rateLimit.ts) | INFERRED | MEDIUM |

---

## PRIORITIZED ACTION LIST

### CRITICAL
- *(none)* — no actively exploitable critical vuln or data-loss bug confirmed in sampled scope. Auth/CSRF/headers/env are sound.

### HIGH
1. **A1 — Move rate limiting to a shared store (Upstash Redis/Vercel KV).** Current in-memory limiter is ineffective on serverless; brute-force/abuse + AI-cost protection depend on it. Swap point already marked.
2. **B1 / G2 — Fix vector search.** Replace in-memory full-scan with MongoDB Atlas `$vectorSearch` (or at minimum a pre-filtered, indexed, batched query). Highest scalability risk.

### MEDIUM
3. **C2 — Add cascade/orphan handling** (schema hooks or a delete-service) for User/Employer/Job → dependent records.
4. **C1 / F5 — Standardize soft-delete** (or consciously document hard-delete) across core entities for recoverability + audit.
5. **A3 — Standardize API authorization** on the `withAuth` matrix; remove ad-hoc inline role checks.
6. **A4 — Apply `escapeRegex`/`sanitizeObject` consistently** to all user-driven search/filter queries.
7. **A2 / F4 — Add malware scanning** (ClamAV/3rd-party) to upload pipeline.
8. **F2 — Add CV duplicate detection** (content hash) to cut cost + dupes.
9. ~~**F3 — Build resume generator/PDF export**~~ **DONE/already existed** (CV builder + 3 templated PDF exports via @react-pdf/renderer). Claim corrected above.
10. **G4 — Add per-user AI usage quota/budget.**
11. **A7 — Periodic audit-coverage review** for tenant-view/impersonation writes.

### LOW
12. **B2 — Consider keyset pagination** for hottest deep lists.
13. **B4 — Consider SSE/WebSocket** for messaging/notifications instead of polling.
14. **E2/E3 — Sweep for missing `loading.tsx`/empty states and stray hard-coded strings.**
15. **G3 — Adversarial prompt-injection testing.**

---

>>> **STOP.** This is analysis only — no code changed in this phase. Please review MAP.md and GAP-REPORT.md and tell me which items to fix. On approval I will start with HIGH (A1, then B1/G2), one at a time, stating files touched and verification steps.
