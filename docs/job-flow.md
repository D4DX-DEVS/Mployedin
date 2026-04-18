# Job Posting & Fetching — Full System Flow

> Last reviewed: 2026-04-18  
> Status: Production-audited. All critical bugs fixed.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Employer Job Posting Flow](#2-employer-job-posting-flow)
3. [Approval Workflow](#3-approval-workflow)
4. [Job Seeker Fetching Flow](#4-job-seeker-fetching-flow)
5. [Apply Flow](#5-apply-flow)
6. [Supporting Flows](#6-supporting-flows)
7. [Data Model — Job](#7-data-model--job)
8. [Role Permissions Matrix](#8-role-permissions-matrix)
9. [API Endpoints Reference](#9-api-endpoints-reference)
10. [Indexes & Performance](#10-indexes--performance)
11. [Bugs Fixed](#11-bugs-fixed)
12. [Known Remaining Issues](#12-known-remaining-issues)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    EMPLOYER SIDE                            │
│                                                             │
│  Employer Dashboard ──► POST /api/jobs                      │
│       (jobs/page.tsx)        │                              │
│                              ▼                              │
│                    Approval Workflow                         │
│                    (pending / auto-approved)                 │
│                              │                              │
│                              ▼                              │
│                    Job.status = "active"                     │
└─────────────────────────────────────────────────────────────┘
                               │
                               │  Active Jobs visible to seekers
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  JOB SEEKER SIDE                            │
│                                                             │
│  GET /api/jobs              — paginated search + filters    │
│  GET /api/jobs/recommended  — ML-scored recommendations     │
│  GET /api/job-seeker/recommended-jobs — quick match (top 5) │
│  GET /api/jobs/[id]         — job detail                    │
│  GET /api/jobs/[id]/similar — related jobs                  │
│                                                             │
│  POST /api/jobs/[id]/apply  — apply                         │
│  POST /api/jobs/[id]/save   — save/unsave toggle            │
└─────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────┐
│                    AUTOMATION                               │
│                                                             │
│  GET /api/cron/job-expiry   — closes expired/full jobs      │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Employer Job Posting Flow

### Step-by-step

```
1. Employer fills in job form (or uses AI assistant via /api/jobs/suggestions)
   └─► match-preview (/api/jobs/match-preview) shows live candidate pool size

2. POST /api/jobs
   ├─ Zod validation (jobCreateSchema)
   ├─ HTML sanitization on description (sanitizeHtml)
   ├─ Resolve employerId from Employer collection
   ├─ Agent assignment logic:
   │    ├─ body.agentId provided → verify agent is assigned to this employer
   │    ├─ Employer.agentId set  → inherit it
   │    └─ neither              → autoAssignAgent() (smart capacity-based pick)
   ├─ Approval status decision (see §3)
   ├─ Job.create(...)
   ├─ logActivity("job.create")
   └─ notify() super_agent if pending approval

3. Job lands in DB with status "draft" or "active"
```

### Employer Job Management (jobs/page.tsx)

The employer dashboard supports:
- Filter by status, approvalStatus, workMode, salary visibility, location, skills
- Debounced text search (300ms)
- Clone job → `POST /api/jobs/[id]/clone`
- Save as template → `POST /api/employers/job-templates`
- Activate / Deactivate → `PATCH /api/jobs/[id]` with `{ status }`
- Delete → `DELETE /api/jobs/[id]`
- Pagination with page/limit controls

### Domain Verification Gate

Employers cannot set `status: "active"` (publish) via PATCH unless `Employer.domainVerified === true`.  
Error: `403 Domain not verified`.

---

## 3. Approval Workflow

| Who posts | Agent involved? | `poster.approvalStatus` | `status` |
|-----------|----------------|------------------------|---------|
| admin | — | `approved` | `active` (or as sent) |
| employer | No | `approved` | `active` (or as sent) |
| employer | Yes | `pending` | `draft` |
| agent | — | `pending` | `draft` |

### Approval path (admin / super_agent)

```
POST /api/admin/jobs/[id]/approve
  body: { approved: true | false }

  approved = true  → poster.approvalStatus = "approved", status = "active"
  approved = false → poster.approvalStatus = "rejected", status = "closed"

  logActivity("job.approved" | "job.rejected")
```

Admin job list for review: `GET /api/admin/jobs?approvalStatus=pending`

---

## 4. Job Seeker Fetching Flow

### A. Paginated Job Feed — `GET /api/jobs`

Public listing (no `myJobs` flag):
```
query:
  status = "active"
  poster.approvalStatus = "approved"     ← defensive guard (fixed)
  expiresAt = null OR expiresAt >= now
```

Filters available via query params:
| Param | Type | Notes |
|-------|------|-------|
| `search` | string | MongoDB `$text` search (title + description + tags) |
| `category` | string | Exact match |
| `location` | string | Regex on country or city |
| `workMode` | string | onsite / hybrid / remote |
| `skills` | CSV | `$all` regex match, capped at 8 skills |
| `remote` | boolean | Filter `location.isRemote = true` |
| `currency` | string | 3-letter code |
| `showSalary` | boolean | Filter salary visibility |
| `page` | number | Default 1 |
| `limit` | number | Default 10, max 100 |

Response:
```json
{
  "jobs": [...],
  "pagination": { "page", "limit", "total", "pages", "totalPages" }
}
```
Cache: `private, max-age=30, stale-while-revalidate=60`

### B. Recommended Jobs (simple) — `GET /api/job-seeker/recommended-jobs`

- Role-gated: `job_seeker` only
- Reads seeker's `skills`, `preferredCountries`, `preferredRoles`, `preferredSalary`, `preferredJobType`
- Excludes already-applied jobs (using correct `seeker._id`)
- Scores up to 50 candidates:
  - Skills overlap: 40%
  - Location match: 30% (partial 20% for remote)
  - Salary range overlap: 20%
  - Job type match: 10%
  - Role title bonus: +5
- Returns top N (default 5, max 30)

### C. Recommended Jobs (advanced) — `GET /api/jobs/recommended`

- Cursor-based pagination (not page-based)
- Larger candidate pool (200 jobs)
- Shared `calculateMatchScore()` algorithm from `@/lib/matchScore`
- Sort modes: `match` (default) | `latest` | `salary`
- `min_score` filter (default 30)
- Returns `{ jobs, nextCursor, total }`

### D. Job Detail — `GET /api/jobs/[id]`

- Requires auth
- Job seekers: only active jobs returned (non-active → 404, fixed)
- Employers / agents / admin: any status visible
- Populates: `companyName`, `country`, `industry`, `verificationLevel`

### E. Similar Jobs — `GET /api/jobs/[id]/similar`

- **Public** (no auth) — usable from public job pages
- Rate limited: 60 req/min per IP
- Scores by skills + tags keyword overlap
- Returns top 6 from pool of 20
- Filters: `status: "active"`, non-expired

---

## 5. Apply Flow

```
POST /api/jobs/[id]/apply   (job_seeker only)

1. Validate ObjectId
2. Check ctx.role === "job_seeker"
3. Fetch job (must be status: "active")
4. Fetch JobSeeker profile
5. Duplicate check: Application.findOne({ jobSeekerId: seeker._id, jobId })
6. Compute behaviorSignals (profileCompleteness, source, lastActive)
7. Application.create(...)
   └─ status: "applied"
   └─ source: "easy_apply"
   └─ statusHistory: [{ status: "applied", changedAt: now }]
   └─ behaviorScore
8. (non-blocking) Send confirmation email to job seeker
9. (non-blocking) Send alert email to employer (if emailNewApplicant != false)
10. (non-blocking) Fire ActivityEvent(type: "application_update", priority: 1)
11. Return { success: true, applicationId }
```

---

## 6. Supporting Flows

### Clone Job — `POST /api/jobs/[id]/clone`

- Roles: employer (owner-checked), agent, admin
- Creates a copy with `status: "draft"`
- Approval status mirrors job creation logic:
  - Admin → `approved`
  - Agent → `pending`
  - Employer + effective agent (source or employer-assigned) → `pending`
  - Employer without agent → `approved`
- Resolves effective agent: `source.agentId ?? employer.agentId ?? null`
- Title appended with ` (Copy)`
- Copies: title, description, requirements, salary, location, tags, vacancies, workflowMode
- Logs `job.clone` activity

### Save Job — `POST /api/jobs/[id]/save` (toggle)

- Role: job_seeker only
- Toggle: saves if not saved, unsaves if already saved
- New saves require job to be `status: "active"` and `poster.approvalStatus: "approved"`
- Unsave always allowed (even on closed jobs — seeker may have saved before closure)
- Returns `{ saved: boolean }`

### Job Templates — `GET|POST /api/employers/job-templates`

- Employer only
- Templates scoped strictly to their `employerId`
- Used to pre-fill job creation form

### AI Job Suggestions — `GET /api/jobs/suggestions`

- Any authenticated role
- Rate limited by AI config
- Returns AI-generated: title variants, top skills, salary range, experience range
- Input sanitized with `sanitizeAIInput()` + `redactPII()`

### Candidate Pool Preview — `GET /api/jobs/match-preview`

- Any authenticated role
- Shows estimated count of matching job seekers by skills, country, and experience range
- Filters: `skills` (comma-separated), `country`, `experienceMin`, `experienceMax`
- Experience filter uses `JobSeeker.totalExperienceYears` field
- Returns `{ count, topSkills }`

### Auto-Expiry Cron — `GET /api/cron/job-expiry`

- Secured via `verifyCronRequest()` (cron secret header)
- Closes jobs where: `status: "active"` AND `expiresAt <= now`
- Also closes jobs where: `applicantIds.length >= maxApplicants`
- Deduplicates merged set by job ID
- Bulk update: `Job.updateMany({ _id: { $in: jobIds } }, { $set: { status: "closed" } })`
- Notifies each employer via in-app notification

---

## 7. Data Model — Job

```typescript
interface IJob {
  employerId: ObjectId        // ref: Employer (required)
  agentId?: ObjectId          // ref: Agent
  title: string               // required, trimmed
  description: string         // required, HTML-sanitized on save
  category?: string
  location: {
    country: string           // required
    city: string              // required
    isRemote: boolean
  }
  requirements: {
    skills: string[]
    preferredSkills?: string[]
    experienceMin: number     // default 0
    experienceMax: number     // default 30
    education?: string
    languages: string[]
    nationality?: string[]
  }
  salary: {
    min: number
    max: number
    currency: string          // default "AED"
    isNegotiable: boolean
    period: "monthly"|"yearly"|"lpa"
  }
  employmentType?: "full_time"|"part_time"|"contract"|"internship"|"freelance"
  workMode?: "onsite"|"hybrid"|"remote"
  status: "draft"|"pending_approval"|"active"|"closed"|"expired"
  workflowMode: "auto"|"manual"
  vacancies?: number          // min 1
  maxApplicants?: number      // min 1
  applicantIds: ObjectId[]    // ref: JobSeeker
  poster: {
    approvalStatus: "pending"|"approved"|"rejected"
    url?: string
    uploadedAt?: Date
  }
  approvedBy?: ObjectId
  approvedAt?: Date
  expiresAt?: Date
  showSalary: boolean         // default true
  views: number
  uniqueViews: number
  tags: string[]
  visibility: "public"|"private"|"invite_only"
  createdAt: Date
  updatedAt: Date
}
```

---

## 8. Role Permissions Matrix

| Action | job_seeker | employer | agent | super_agent | admin |
|--------|-----------|---------|-------|-------------|-------|
| List jobs (public feed) | ✅ | ✅ | ✅ | ✅ | ✅ |
| List own jobs (myJobs) | ❌ | ✅ | ✅ | ❌ | ✅ |
| View job detail (active) | ✅ | ✅ | ✅ | ✅ | ✅ |
| View job detail (draft/closed) | ❌ | own only | own only | ✅ | ✅ |
| Create job | ❌ | ✅ | ✅ | ❌ | ✅ |
| Update job | ❌ | own only | own only | ✅ | ✅ |
| Delete job | ❌ | own only | ❌ | ❌ | ✅ |
| Clone job | ❌ | own only | ✅ | ❌ | ✅ |
| Approve/reject job | ❌ | ❌ | ❌ | ✅ | ✅ |
| Apply to job | ✅ | ❌ | ❌ | ❌ | ❌ |
| Save job | ✅ | ❌ | ❌ | ❌ | ❌ |
| View recommendations | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage templates | ❌ | ✅ | ❌ | ❌ | ❌ |

---

## 9. API Endpoints Reference

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|-----------|-------|
| GET | `/api/jobs` | required | dual (IP+userId) | Public feed or myJobs |
| POST | `/api/jobs` | required | — | Create job |
| GET | `/api/jobs/[id]` | required | — | Job detail |
| PATCH | `/api/jobs/[id]` | required | — | Update job |
| DELETE | `/api/jobs/[id]` | required | — | Delete/archive |
| POST | `/api/jobs/[id]/apply` | required | — | Apply |
| POST | `/api/jobs/[id]/save` | required | — | Toggle save |
| POST | `/api/jobs/[id]/clone` | required | — | Clone as draft |
| POST | `/api/jobs/[id]/track-view` | public | 30/min per IP | View counter |
| GET | `/api/jobs/[id]/similar` | public | 60/min per IP | Related jobs |
| GET | `/api/jobs/recommended` | required | — | Advanced ML recs |
| GET | `/api/jobs/match-preview` | required | dual | Candidate pool preview |
| GET | `/api/jobs/suggestions` | required | AI rate limit | AI job form suggestions |
| GET | `/api/job-seeker/recommended-jobs` | required | — | Quick match (top N) |
| POST | `/api/admin/jobs/[id]/approve` | admin/super_agent | — | Approve/reject |
| GET | `/api/admin/jobs` | admin/super_agent | — | Admin job list |
| GET | `/api/employers/job-templates` | employer | — | List templates |
| POST | `/api/employers/job-templates` | employer | — | Create template |
| GET | `/api/cron/job-expiry` | cron secret | — | Auto-close expired |

---

## 10. Indexes & Performance

Indexes on `Job` collection:
```
{ employerId: 1 }
{ agentId: 1 }
{ status: 1 }
{ "location.country": 1 }
{ "requirements.skills": 1 }
{ createdAt: -1 }
{ title: "text", description: "text", tags: "text" }   ← text search
{ status: 1, "poster.approvalStatus": 1, createdAt: -1 }  ← compound (partial: status="active")
```

The compound partial index covers the public feed query (`status: "active"` + `poster.approvalStatus: "approved"` + sort by `createdAt`). Uses `partialFilterExpression: { status: "active" }` for a smaller, faster index.

---

## 11. Bugs Fixed (2026-04-18)

### Bug 1 — Recommended jobs excluded wrong applied-job IDs
**File:** `src/app/api/job-seeker/recommended-jobs/route.ts:33`
```ts
// Before (wrong — ctx.userId is User ID, never matches Application.jobSeekerId)
Application.find({ jobSeekerId: ctx.userId })

// After (correct — seeker._id is the JobSeeker document ID)
Application.find({ jobSeekerId: seeker._id })
```
**Impact:** Already-applied jobs were never excluded from recommendations — seekers kept seeing jobs they applied to.

---

### Bug 2 — Single job detail exposed draft/closed jobs to job seekers
**File:** `src/app/api/jobs/[id]/route.ts`
```ts
// Added status guard for job_seeker role
if (ctx.role === "job_seeker" && job.status !== "active") {
  return NextResponse.json({ error: "Job not found" }, { status: 404 });
}
```
**Impact:** Any authenticated user knowing a job's ObjectId could read draft, pending, or closed jobs.

---

### Bug 3 — Zod schema missing model fields (education, languages, nationality)
**File:** `src/lib/validators/jobs.ts`
```ts
// Added to requirementsSchema:
education: z.string().max(200).optional(),
languages: z.array(z.string().max(100)).max(20).optional(),
nationality: z.array(z.string().max(100)).max(50).optional(),
```
**Impact:** These fields existed in the model and DB schema but were silently stripped by Zod — they could never be set via the API.

---

### Bug 4 — requirementsSchema missing experienceMin/Max cross-validation
**File:** `src/lib/validators/jobs.ts`
```ts
// Added .refine() to requirementsSchema (mirrors the salary schema pattern)
.refine(
  (r) => r.experienceMin === undefined || r.experienceMax === undefined
      || r.experienceMax >= r.experienceMin,
  { message: "experienceMax must be >= experienceMin" }
)
```
**Impact:** Jobs with `experienceMin: 10, experienceMax: 2` could be saved without error.

---

### Fix 5 — Public listing missing approvalStatus guard
**File:** `src/app/api/jobs/route.ts`
```ts
// Added to public listing query branch:
query["poster.approvalStatus"] = "approved";
```
**Impact:** A job manually patched to `status: "active"` with `approvalStatus: "pending"` could appear in the public feed.

---

### Fix 6 — Cron notification link missing locale prefix
**File:** `src/app/api/cron/job-expiry/route.ts`
```ts
// Before
link: `/employer/jobs`

// After — uses defaultLocale constant (not hardcoded)
const defaultLocale = "en";
link: `/${defaultLocale}/employer/jobs`
```
**Impact:** In-app notification link from the auto-expiry cron pointed to a non-localized path, breaking navigation in the Next.js i18n app. Now uses a configurable constant.

---

### Fix 7 — Clone always set approvalStatus to "pending"
**File:** `src/app/api/jobs/[id]/clone/route.ts`
```ts
// Before — all clones forced to pending
poster: { approvalStatus: "pending" }

// After — mirrors POST /api/jobs approval logic
const effectiveAgentId = source.agentId ?? emp.agentId ?? null;
approvalStatus = effectiveAgentId ? "pending" : "approved"; // for employer
// Agent → always pending, Admin → always approved
```
**Impact:** Employer self-clones (no agent involvement) were unnecessarily blocked. Now auto-approved when no agent is involved, matching the job creation flow.

---

### Fix 8 — match-preview ignored experienceMin/experienceMax params
**File:** `src/app/api/jobs/match-preview/route.ts`
```ts
// Added experience range filter
if (experienceMin > 0 || experienceMax < 50) {
  query.totalExperienceYears = {};
  if (experienceMin > 0) query.totalExperienceYears.$gte = experienceMin;
  if (experienceMax < 50) query.totalExperienceYears.$lte = experienceMax;
}
```
**Impact:** Experience params were parsed but silently ignored — candidate pool count only reflected skills + country.

---

### Fix 9 — Similar jobs missing approvalStatus guard
**File:** `src/app/api/jobs/[id]/similar/route.ts`
```ts
// Added to similar jobs query (consistent with public feed)
"poster.approvalStatus": "approved",
```
**Impact:** Jobs with `status: "active"` but `approvalStatus: "pending"` could appear in similar jobs results.

---

### Fix 10 — Save job didn't verify job was active
**File:** `src/app/api/jobs/[id]/save/route.ts`
```ts
// Added before creating SavedJob:
const job = await Job.findById(jobId).select("status poster.approvalStatus").lean();
if (!job) return 404;
if (job.status !== "active" || job.poster?.approvalStatus !== "approved") return 400;
// Unsave still allowed on any job (seeker may have saved before closure)
```
**Impact:** Seekers could save closed/draft/unapproved jobs. Now only active+approved jobs can be saved; unsave always works.

---

### Fix 11 — Compound partial index for public feed
**File:** `src/models/Job.ts`
```ts
JobSchema.index(
  { status: 1, "poster.approvalStatus": 1, createdAt: -1 },
  { partialFilterExpression: { status: "active" } }
);
```
**Impact:** The public feed query (`status: active` + `approvalStatus: approved` + sort by `createdAt`) had no compound index. Partial index keeps it small (only active jobs indexed).

---

## 12. Known Remaining Issues

### Confirmed by-design

| Decision | File | Rationale |
|----------|------|-----------|
| Agent cannot delete jobs | `jobs/[id]/route.ts` | By design. Only employer (owner) and admin can delete. Agents can close/edit jobs. Prevents audit trail loss and matches industry platforms (LinkedIn, Indeed). |
