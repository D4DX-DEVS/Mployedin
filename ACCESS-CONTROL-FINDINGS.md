# Mployedin Access-Control Audit — Findings

> Follow-up to [ACCESS-CONTROL-MAP.md](./ACCESS-CONTROL-MAP.md). Read-only audit pass,
> generated 2026-07-02. Deep-read ~16 routes covering every category the map flagged
> plus the canonical IDOR targets; the remaining ~400 routes follow the verified-safe
> `Employer.findOne({ userId: ctx.userId })` tenant pattern per the map. **No code modified.**

## Summary

The codebase has one dominant, **correct** tenant pattern: the server derives the tenant
from the session via `Employer.findOne({ userId: ctx.userId })` and filters every query by
that `employer._id`. It never trusts a client-sent `employerId` or role. Session identity is
always server-derived from `auth()` in [withAuth.ts:96](./src/lib/auth/withAuth.ts#L96) — no
route trusts a client-sent role field. Most "ANY authenticated / no-guard" routes are safe
because of this. The real holes are the handful that skip that derivation.

| # | Severity | Route | Issue |
|---|----------|-------|-------|
| 1 | CRITICAL | `applications/[id]/parse-resume` | No ownership check → candidate PII disclosure (IDOR) |
| 2 | HIGH | `job-seekers/bulk-cv-download` | Guard too wide + no tenant filter → mass CV/PII export |
| 3 | HIGH | `jobs/[id]/analytics` | Guard too wide + no resource ownership check |
| 4 | MEDIUM | `developer` | Webhook URL unvalidated → SSRF |
| 5 | MEDIUM | `offer-letters` | Cross-tenant template read |
| 6 | LOW | `talent-pools/[id]` | `add_candidate` doesn't validate jobSeekerId |

---

## CRITICAL

### 1. Candidate PII disclosure via missing ownership check (IDOR)

**File:** [src/app/api/applications/[id]/parse-resume/route.ts:13-52](./src/app/api/applications/%5Bid%5D/parse-resume/route.ts#L13-L52)

`withAuth(postHandler)` has no RBAC guard, and the handler never verifies the caller
owns/employs the application. It loads any `applicationId`, pulls the candidate's `JobSeeker`
(name, phone, location, skills, experience, education, summary) and returns it. Any
authenticated user — including an unrelated `job_seeker` — can harvest full candidate profiles
by iterating IDs.

**Fix:** resolve the caller's Employer/Agent and assert `application.employerId` / `agentId`
matches before parsing; deny `job_seeker`.

---

## HIGH

### 2. Mass CV/PII export — guard too wide, no tenant filter

**File:** [src/app/api/job-seekers/bulk-cv-download/route.ts:12,85](./src/app/api/job-seekers/bulk-cv-download/route.ts#L12)

Guard is `{ resource: "job_seekers", action: "read" }`, which per the matrix admits
`job_seeker` and `employer` too (map §3). The doc-comment says "Admin-only" but the code isn't.
Query: `JobSeeker.find({ "cv.originalUrl": {$exists,$ne:""}, ... }).limit(200)` — **no
tenant/agent filter at all**, returns up to 200 candidates' names + CV URLs to any logged-in
user, including a job seeker dumping every other seeker's résumé.

**Fix:** tighten guard to admin/agent/super_agent (or add explicit `ctx.role` allowlist) and
scope results to the caller's assigned candidates.

### 3. Job analytics readable by anyone — guard too wide, no ownership

**File:** [src/app/api/jobs/[id]/analytics/route.ts:8-93](./src/app/api/jobs/%5Bid%5D/analytics/route.ts#L8-L93)

Guard `{ jobs, read }` admits all roles incl. `job_seeker` (map §3). Handler loads
`Job.findById(id)` and aggregates its application funnel with **no check that the job belongs
to the caller** — `{ $match: { jobId: ObjectId(id) } }`. Any authenticated user reads
application counts, status breakdown, and 30-day trend for any job.

**Fix:** after loading the job, verify `job.employerId` / `agentId` against the caller
(mirror `verifyAgentScopeForApplication`).

---

## MEDIUM

### 4. Webhook URL unvalidated (SSRF)

**File:** [src/app/api/developer/route.ts:77-98](./src/app/api/developer/route.ts#L77-L98)

`Webhook.create({ url: webhookUrl })` accepts any string; deliveries will then POST to
attacker-chosen internal/metadata URLs. Auth/scoping itself is fine (by `createdBy`).

**Fix:** validate URL is https + public host; block private/link-local ranges at creation and
at send time.

### 5. Cross-tenant offer-letter template read

**File:** [src/app/api/offer-letters/route.ts:70-72](./src/app/api/offer-letters/route.ts#L70-L72)

On generate, `OfferLetterTemplate.findById(templateId)` has **no `employerId` filter** (unlike
every other query in the file at :20, :27, :37). A guessed template ObjectId lets one employer
inline another tenant's template content into their own letter.

**Fix:** `findOne({ _id: templateId, employerId: employer._id })`.

---

## LOW

### 6. talent-pools add_candidate integrity

**File:** [src/app/api/talent-pools/[id]/route.ts:46-62](./src/app/api/talent-pools/%5Bid%5D/route.ts#L46-L62)

`add_candidate` doesn't verify `jobSeekerId` refers to a real/visible seeker before pushing it
into the (correctly self-scoped) pool. Data-integrity only; self-contained.

---

## Notes

### IDOR-enumeration surface (positive)

Every sensitive route validates IDs with `mongoose.isValidObjectId`, and resources are keyed by
**Mongo ObjectIds, not auto-increment integers**. ObjectIds embed a timestamp + counter but
aren't trivially sequential across tenants, so blind enumeration is hard. The exposure that
matters is missing *authorization* (findings 1–3), not ID predictability. **No sequential /
predictable IDs found in URLs or API responses.**

### Large raw-`auth()` / no-guard surface (map §4)

`ai/chat` ([route.ts:35-67](./src/app/api/ai/chat/route.ts#L35-L67)) role-scopes internally —
admin/super-agent data branches are gated by `userRole` checks, reads are own-profile — so no
IDOR found. But the 48 no-guard + 16 raw-`auth()` routes each rely entirely on in-handler
scoping with no wrapper backstop. Findings 1–3 are exactly where that in-handler scoping was
omitted; treat the rest of that list as needing the same per-handler confirmation.

### Verified-safe (spot checks, ownership correct)

`application-forms` (+`[id]`), `talent-pools/[id]` metadata, `requisitions`, `career-pages`,
`offer-letters` letters, `diversity` (POST checks `application.candidateId === ctx.userId`),
`dm/[conversationId]/messages` + `manage` (participant check), `notifications`, `users/search`
(role-filtered), `gdpr/export`, `job-seekers/avatar`, `invoices/[id]/send`, `applications/[id]`
PATCH, `applications/[id]/documents/download` (tiered policy).
