# MployedIn Subscription Module — Complete Guide

> Last updated: April 21, 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [Role-by-Role Breakdown](#2-role-by-role-breakdown)
3. [Employer Tier Comparison](#3-employer-tier-comparison)
4. [Job Seeker Tier Comparison](#4-job-seeker-tier-comparison)
5. [Subscription Lifecycle](#5-subscription-lifecycle)
6. [Feature Gating System](#6-feature-gating-system)
7. [Invoice System](#7-invoice-system)
8. [Cron Automation](#8-cron-automation)
9. [API Route Reference](#9-api-route-reference)
10. [Sidebar Navigation](#10-sidebar-navigation)
11. [Database Models](#11-database-models)
12. [Test Coverage](#12-test-coverage)

---

## 1. Overview

The subscription module controls **what each user can do** in MployedIn based on their assigned plan tier. There is **no payment gateway** — admins assign plans manually. Every employer and job seeker is automatically given a **Free plan** on registration, with a **30-day grace period** (Gold/Premium-tier access) to prevent lockout during deployment.

### Key Numbers

| Metric | Count |
|--------|-------|
| MongoDB Models | 4 (SubscriptionPlan, Subscription, Invoice, SubscriptionHistory) |
| API Routes | 16+ subscription-specific |
| Server-Side Feature Gates | 16 routes gated |
| Client-Side Feature Gates | 6 components gated |
| Cron Jobs | 3 (expiry, usage reset, reminder) |
| React Query Hooks | 8 hook files |
| UI Pages | 5 dashboard pages |
| Tests | 117 (5 suites, all passing) |

---

## 2. Role-by-Role Breakdown

### 2.1 Admin

**What they can do:**
- Full CRUD on subscription plans (Create, Read, Update, Delete, Export)
- Assign any plan to any employer or job seeker
- Upgrade, downgrade, cancel, and renew subscriptions
- Bulk-assign a plan to up to 100 users at once
- View all invoices and mark them as paid or void
- Access the subscription analytics dashboard (KPIs, tier distribution, trends, revenue)

**Sidebar links:**
| Item | Path | Icon |
|------|------|------|
| Subscription Plans | `/admin/subscription-plans` | Crown |
| Subscriptions | `/admin/subscriptions` | CreditCard |
| Subscription Dashboard | `/admin/subscription-dashboard` | BarChart2 |

**Feature gating:** Admin is **never gated** — all subscription checks are bypassed.

**Permission matrix:**
```
subscriptions: ["create", "read", "update", "delete", "export"]
```

---

### 2.2 Super Agent

**What they can do:**
- Assign plans to employers and job seekers
- Upgrade, downgrade, cancel, and renew subscriptions
- Bulk-assign plans (up to 100 users)
- View all subscriptions and invoices
- Mark invoices as paid/void

**Sidebar links:** None (accesses subscription features via admin routes with their permissions)

**Feature gating:** Super Agent is **never gated** — all subscription checks are bypassed.

**Permission matrix:**
```
subscriptions: ["create", "read", "update"]
```

---

### 2.3 Agent

**What they can do:**
- Assign plans to employers (their referred employers)
- View subscriptions and invoices (read-only)
- Cannot cancel, downgrade, or mark invoices as paid

**Sidebar links:** None

**Feature gating:** Agent is **never gated** — all subscription checks are bypassed.

**Permission matrix:**
```
subscriptions: ["create", "read"]
```

---

### 2.4 Employer

**What they can do:**
- View their own current subscription plan and usage
- See usage meters (active jobs, applications viewed, team seats, AI feature usage)
- View their invoice history
- See "Contact admin to upgrade" CTA when on a limited plan
- Access features based on their plan tier (see §3)

**Sidebar links:**
| Item | Path | Icon |
|------|------|------|
| My Subscription | `/employer/subscription` | Crown |

**Feature gating:** Employer is **fully gated** based on their active plan. If no plan exists, they get a 30-day grace period with Gold-tier access.

**Permission matrix:**
```
subscriptions: ["read"]
```

**What happens on registration:**
1. Employer account is created
2. `autoAssignDefaultPlan("employer")` is called (fire-and-forget)
3. The default "Free" plan is assigned automatically with `autoRenew: true`
4. Subscription, history, and invoice (if paid plan) are all created
5. If no default plan exists, the 30-day grace period kicks in

---

### 2.5 Job Seeker

**What they can do:**
- View their own current subscription plan and usage
- See usage meters (applications submitted, AI feature usage)
- View their invoice history
- See "Contact admin to upgrade" CTA
- Access features based on their plan tier (see §4)

**Sidebar links:**
| Item | Path | Icon |
|------|------|------|
| My Subscription | `/job-seeker/subscription` | Crown |

**Feature gating:** Job Seeker is **fully gated** based on their active plan. Grace period gives Premium-tier access for 30 days.

**Permission matrix:**
```
subscriptions: ["read"]
```

**What happens on registration:**
1. Job seeker account is created
2. `autoAssignDefaultPlan("job_seeker")` is called (fire-and-forget)
3. The default "Free" plan is assigned automatically
4. Same lifecycle as employer registration

---

## 3. Employer Tier Comparison

### 3.1 Plans Overview

| | Free | Silver | Gold | Platinum |
|---|:---:|:---:|:---:|:---:|
| **Tier** | 0 | 1 | 2 | 3 |
| **Price** | 0 AED/mo | 499 AED/mo | 1,499 AED/mo | 3,999 AED/mo |
| **Default** | ✅ | — | — | — |

### 3.2 Core Limits

| Feature | Free | Silver | Gold | Platinum |
|---------|:----:|:------:|:----:|:--------:|
| Active Job Postings | 2 | 10 | 50 | Unlimited |
| Applications Visible / Month | 20 | 100 | 500 | Unlimited |
| Team Member Seats | 1 | 3 | 10 | Unlimited |
| Featured Job Listings | 0 | 1 | 5 | Unlimited |

### 3.3 Boolean Features

| Feature | Free | Silver | Gold | Platinum |
|---------|:----:|:------:|:----:|:--------:|
| Analytics | None | Basic | Advanced | Advanced |
| Data Export | ❌ | ❌ | ✅ | ✅ |
| Communication Templates | ❌ | ✅ | ✅ | ✅ |
| Scorecard Evaluations | ❌ | ❌ | ✅ | ✅ |
| Matching Weight Customization | ❌ | ❌ | ✅ | ✅ |
| Workflow Customization | ❌ | ❌ | ✅ | ✅ |
| Priority Support | ❌ | ❌ | ❌ | ✅ |
| Branded Company Page | ❌ | ❌ | ✅ | ✅ |

### 3.4 AI Features (Monthly Limits)

| AI Feature | Free | Silver | Gold | Platinum |
|------------|:----:|:------:|:----:|:--------:|
| AI Chat | ❌ | 50 | 200 | ∞ |
| AI Daily Insights | ❌ | ∞ | ∞ | ∞ |
| AI Job Matching | ❌ | 20 | 100 | ∞ |
| AI CV Extraction | ❌ | 10 | 50 | ∞ |
| AI Interview Questions | ❌ | 10 | 50 | ∞ |
| AI Skills Gap Analysis | ❌ | ❌ | 30 | ∞ |
| AI Candidate Screening | ❌ | ❌ | 30 | ∞ |
| AI Salary Benchmark | ❌ | ❌ | 10 | ∞ |
| AI Job Description Gen | ❌ | 5 | 30 | ∞ |
| AI Hiring Reports | ❌ | ❌ | 5 | ∞ |
| AI Voice Input | ❌ | ❌ | ∞ | ∞ |

> ❌ = disabled, ∞ = unlimited, number = monthly cap

---

## 4. Job Seeker Tier Comparison

### 4.1 Plans Overview

| | Free | Premium | Premium Plus |
|---|:---:|:-------:|:------------:|
| **Tier** | 0 | 1 | 2 |
| **Price** | 0 AED/mo | 49 AED/mo | 99 AED/mo |
| **Default** | ✅ | — | — |

### 4.2 Core Limits

| Feature | Free | Premium | Premium Plus |
|---------|:----:|:-------:|:------------:|
| Applications / Month | 10 | 50 | Unlimited |

### 4.3 Boolean Features

| Feature | Free | Premium | Premium Plus |
|---------|:----:|:-------:|:------------:|
| Profile Visibility Boost | ❌ | ✅ | ✅ |
| Salary Insights | ❌ | ✅ | ✅ |
| Priority Application Review | ❌ | ❌ | ✅ |
| Resume Builder Access | ❌ | ✅ | ✅ |

### 4.4 AI Features (Monthly Limits)

| AI Feature | Free | Premium | Premium Plus |
|------------|:----:|:-------:|:------------:|
| AI Chat | ❌ | 30 | ∞ |
| AI CV Extraction | ❌ | 3 | ∞ |
| AI Skills Suggest | ❌ | 10 | ∞ |
| AI Skills Gap | ❌ | 5 | ∞ |
| AI Interview Questions | ❌ | 10 | ∞ |
| AI Profile Fill | ❌ | 3 | ∞ |
| AI Enhance Text | ❌ | 10 | ∞ |
| AI Generate Summary | ❌ | 5 | ∞ |
| AI Daily Insights | ❌ | ∞ | ∞ |
| AI Voice Input | ❌ | ❌ | ∞ |

---

## 5. Subscription Lifecycle

### 5.1 Registration Flow

```
User Registers
    ↓
autoAssignDefaultPlan()  ← fire-and-forget
    ↓
Find default plan (isDefault: true, isActive: true)
    ↓
┌─ Plan found ──→ Create Subscription (active, autoRenew: true)
│                 Create SubscriptionHistory (action: "assigned")
│                 Create Invoice (if price > 0)
│
└─ No plan found → Grace period covers the user (30 days, Gold/Premium access)
```

### 5.2 Grace Period (30 Days)

When a user has **no active subscription**:

1. System checks `user.createdAt`
2. If within 30 days → **allow all features** with Gold (employer) or Premium (job seeker) limits
3. If past 30 days → return `403 SUBSCRIPTION_REQUIRED`
4. No usage tracking during grace period

**Purpose:** Prevents existing users from being locked out when the subscription system is deployed to production.

### 5.3 Assignment by Admin

```
Admin searches user → Selects plan → Clicks Assign
    ↓
POST /api/subscriptions/assign
    ↓
Verify: user exists, role matches plan.targetRole, no active sub
    ↓
Create Subscription with planSnapshot (frozen limits)
Create SubscriptionHistory → action: "assigned"
Create Invoice → type: "new", status: "issued"
Update Employer.paymentStatus = "active" (backward compat)
Audit log
```

### 5.4 Upgrade / Downgrade

```
Admin selects new plan → Clicks Change
    ↓
POST /api/subscriptions/change
    ↓
Compare old tier vs new tier → determine "upgraded" or "downgraded"
    ↓
Update planId, planSnapshot, recalculate endDate
Create SubscriptionHistory → action: "upgraded" | "downgraded"
Create Invoice → type: "upgrade" | "downgrade"
Audit log
```

### 5.5 Cancellation

```
Admin clicks Cancel → Enters reason
    ↓
PATCH /api/subscriptions/[id]
    ↓
Set status: "cancelled", cancelledAt, cancelledBy, cancellationReason
Create SubscriptionHistory → action: "cancelled"
Update Employer.paymentStatus = "pending" (backward compat)
Audit log
```

### 5.6 Renewal

```
Admin clicks Renew (for expired/active sub)
    ↓
POST /api/subscriptions/renew
    ↓
Set new startDate = old endDate, calculate new endDate
Reset all usage counters to 0
Set status: "active"
Create SubscriptionHistory → action: "renewed"
Create Invoice → type: "renewal"
```

### 5.7 Auto-Renewal via Cron

```
Daily cron: GET /api/cron/subscription-expiry
    ↓
Find active subs where endDate < now
    ↓
┌─ autoRenew: true
│     Extend period (new startDate/endDate)
│     Reset all usage counters
│     Create history → action: "renewed"
│     Create invoice → type: "renewal"
│     Update Employer.paymentStatus = "active"
│     Send email notification
│
└─ autoRenew: false
      Set status: "expired"
      Create history → action: "expired"
      Set Employer.paymentStatus = "pending"
      Send email notification
```

### 5.8 Bulk Assignment

```
Admin enters user IDs + selects plan → Clicks Bulk Assign
    ↓
POST /api/subscriptions/bulk-assign
    ↓
For each userId (max 100):
  - Verify user exists and role matches
  - Skip if already has active sub
  - Create Subscription + History + Invoice
    ↓
Return: { assigned: N, total: M, results: [...] }
```

---

## 6. Feature Gating System

### 6.1 How It Works

Every API route that needs subscription control uses one of two patterns:

**Pattern 1: `withSubscription()` middleware wrapper** — for routes using `withAuth()`

```typescript
export const POST = withAuth(
  withSubscription(createHandler, { type: "limit", feature: "activeJobs" }),
);
```

**Pattern 2: `enforceFeatureGate()` inline** — for routes with manual auth or Pattern B/C

```typescript
const gateErr = await enforceFeatureGate(ctx.userId, ctx.role, {
  type: "ai", feature: "ai_chat",
});
if (gateErr) return gateErr;
```

### 6.2 Bypass Rules

| Role | Gated? |
|------|--------|
| admin | **Never** — full bypass |
| super_agent | **Never** — full bypass |
| agent | **Never** — full bypass |
| employer | **Yes** — checked against plan |
| job_seeker | **Yes** — checked against plan |

### 6.3 Server-Side Gates (16 Routes)

#### Limit Gates (numeric caps)

| Route | Method | Feature | What it checks |
|-------|--------|---------|----------------|
| `/api/jobs` | POST | `activeJobs` | Active job count vs `maxActiveJobs` |
| `/api/applications` | GET | `applicationsViewed` | View count vs `maxApplicationsViewPerMonth` |
| `/api/applications` | POST | `applicationsSubmitted` | Submit count vs `maxApplicationsPerMonth` |
| `/api/employers/team` | POST | `teamMembers` | Team count vs `maxTeamMembers` |

#### Toggle Gates (boolean on/off)

| Route | Feature | What it checks |
|-------|---------|----------------|
| `/api/employers/analytics` | `analyticsLevel` | Analytics level !== "none" |

#### AI Gates (monthly usage caps with atomic increment)

| Route | Feature Key |
|-------|-------------|
| `/api/ai/chat` | `ai_chat` |
| `/api/ai/cv-extract` | `ai_cv_extraction` |
| `/api/ai/daily-insights` | `ai_daily_insights` |
| `/api/ai/interview-questions` | `ai_interview_questions` |
| `/api/ai/job-description` | `ai_job_description` |
| `/api/ai/match` | `ai_job_matching` |
| `/api/ai/report` | `ai_hiring_reports` |
| `/api/ai/salary-benchmark` | `ai_salary_benchmark` |
| `/api/ai/screen-candidates` | `ai_candidate_screening` |
| `/api/ai/skills-gap` | `ai_skills_gap` |
| `/api/ai/speech-to-text` | `ai_voice_input` |

### 6.4 Client-Side Gates (6 Components)

#### `<FeatureGate>` component (wrap/hide UI sections)

| Page | Feature | Effect |
|------|---------|--------|
| Matching Weights | `matchingWeightCustomization` | Hides entire page if disabled |
| Workflow | `workflowCustomization` | Hides entire page if disabled |
| Comm Templates | `commTemplates` | Hides entire page if disabled |
| Applications | `scorecardEvaluations` | Hides ScorecardForm section |

#### `useFeatureGate()` hook (conditional logic)

| Component | Feature | Effect |
|-----------|---------|--------|
| JobFeedPage | `applicationsSubmitted` | Disables Apply button + shows toast |
| RecommendedJobs | `applicationsSubmitted` | Disables Apply button + shows toast |

### 6.5 Error Responses

| Error Code | HTTP Status | When |
|------------|-------------|------|
| `SUBSCRIPTION_REQUIRED` | 403 | No active subscription and past grace period |
| `FEATURE_DISABLED` | 403 | Feature not included in plan |
| `LIMIT_EXCEEDED` | 429 | Monthly limit reached (includes `limit` and `used` in response) |

---

## 7. Invoice System

### 7.1 Invoice Generation

Invoices are auto-generated for:
- **New subscriptions** → `type: "new"`
- **Upgrades** → `type: "upgrade"`
- **Downgrades** → `type: "downgrade"`
- **Renewals** → `type: "renewal"`

**Invoice number format:** `INV-YYYYMM-XXXXX` (e.g., `INV-202604-00001`)

Generated using an atomic counter in the `counters` collection.

### 7.2 Invoice Statuses

| Status | Description |
|--------|-------------|
| `draft` | Created but not issued |
| `issued` | Active invoice awaiting payment |
| `paid` | Marked as paid by admin |
| `void` | Cancelled/voided |

### 7.3 Who Can Do What

| Action | admin | super_agent | agent | employer | job_seeker |
|--------|:-----:|:-----------:|:-----:|:--------:|:----------:|
| View all invoices | ✅ | ✅ | ✅ | — | — |
| View own invoices | — | — | — | ✅ | ✅ |
| Mark paid/void | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## 8. Cron Automation

### 8.1 Daily: Subscription Expiry Check

**Endpoint:** `GET /api/cron/subscription-expiry`
**Schedule:** Daily
**Auth:** HMAC-SHA256 signed request via `verifyCronRequest()`

**What it does:**
1. Finds active subscriptions where `endDate < now`
2. For `autoRenew: true`: extends period, resets usage, creates renewal invoice, sends notification
3. For `autoRenew: false`: expires subscription, resets employer payment status, sends notification

### 8.2 Monthly: Usage Counter Reset

**Endpoint:** `GET /api/cron/subscription-usage-reset`
**Schedule:** 1st of each month

**What it does:**
1. Finds active subscriptions where `usageResetAt <= now`
2. Resets all usage counters to 0: `activeJobs`, `applicationsViewed`, `applicationsSubmitted`, all `aiUsage`
3. Sets next `usageResetAt` to 1st of following month

### 8.3 Daily: Renewal Reminders

**Endpoint:** `GET /api/cron/subscription-reminder`
**Schedule:** Daily

**What it does:**
1. Sends in-app notifications at **7, 3, and 1 day(s)** before expiry
2. Sends **email** only for 3-day and 1-day reminders
3. For auto-renew users: sends informational "will auto-renew" notification at 3 days

---

## 9. API Route Reference

### Admin Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/subscription-plans` | List all plans (filter by targetRole, isActive) |
| POST | `/api/admin/subscription-plans` | Create a new plan |
| GET | `/api/admin/subscription-plans/[id]` | Get single plan |
| PATCH | `/api/admin/subscription-plans/[id]` | Update plan |
| DELETE | `/api/admin/subscription-plans/[id]` | Soft-delete plan |
| GET | `/api/admin/subscription-stats` | Dashboard stats (KPIs, distributions) |

### Subscription Management Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/subscriptions/assign` | Assign plan to user |
| POST | `/api/subscriptions/change` | Upgrade/downgrade |
| POST | `/api/subscriptions/renew` | Renew subscription |
| POST | `/api/subscriptions/bulk-assign` | Bulk assign to multiple users |
| GET | `/api/subscriptions/[id]` | Get subscription by ID |
| PATCH | `/api/subscriptions/[id]` | Cancel subscription |
| GET | `/api/subscriptions/my` | Current user's subscription |
| GET | `/api/subscriptions/history` | Subscription history |
| GET | `/api/subscriptions/feature-gate` | Full feature gate map |

### Invoice Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/invoices` | List invoices (staff: all, users: own) |
| GET | `/api/invoices/[id]` | Get single invoice |
| PATCH | `/api/invoices/[id]` | Mark paid/void (admin only) |

### Cron Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/cron/subscription-expiry` | Daily expiry check |
| GET | `/api/cron/subscription-usage-reset` | Monthly usage reset |
| GET | `/api/cron/subscription-reminder` | Daily renewal reminders |

---

## 10. Sidebar Navigation

| Role | Menu Items |
|------|------------|
| **Admin** | Subscription Plans (Crown), Subscriptions (CreditCard), Subscription Dashboard (BarChart2) |
| **Super Agent** | — (no sidebar items, accesses via admin routes) |
| **Agent** | — (no sidebar items) |
| **Employer** | My Subscription (Crown) |
| **Job Seeker** | My Subscription (Crown) |

---

## 11. Database Models

### SubscriptionPlan (`subscriptionplans` collection)

Stores admin-created plan definitions. Each plan targets either `employer` or `job_seeker`.

**Key fields:** `name`, `slug` (unique, auto-generated), `targetRole`, `tier` (0-10), `price`, `currency`, `billingCycle`, `employerLimits`/`jobSeekerLimits`, `isActive`, `isDefault`

**Indexes:** `{ targetRole: 1, isActive: 1, sortOrder: 1 }`, `{ slug: 1 }` (unique), `{ isDefault: 1, targetRole: 1 }`

### Subscription (`subscriptions` collection)

One active subscription per `(userId, targetRole)`.

**Key fields:** `userId`, `targetRole`, `planId`, `planSnapshot` (frozen copy of limits), `status` (active/expired/cancelled/suspended), `startDate`, `endDate`, `autoRenew`, `usage` (counters), `usageResetAt`, `assignedBy`

**Indexes:** `{ userId: 1, targetRole: 1, status: 1 }`, `{ endDate: 1, status: 1 }`, `{ planId: 1 }`, `{ usageResetAt: 1, status: 1 }`

### Invoice (`invoices` collection)

**Key fields:** `invoiceNumber` (unique, INV-YYYYMM-XXXXX), `userId`, `subscriptionId`, `type` (new/renewal/upgrade/downgrade), `amount`, `currency`, `status` (draft/issued/paid/void), `paidAt`, `markedPaidBy`

**Indexes:** `{ userId: 1, createdAt: -1 }`, `{ invoiceNumber: 1 }` (unique), `{ subscriptionId: 1 }`, `{ status: 1 }`

### SubscriptionHistory (`subscriptionhistories` collection)

Append-only audit log. No updates or deletes.

**Key fields:** `userId`, `subscriptionId`, `action` (assigned/upgraded/downgraded/renewed/cancelled/expired/suspended/reactivated), `fromPlanId`/`toPlanId`, `performedBy`, `performedByRole`

**Indexes:** `{ userId: 1, createdAt: -1 }`, `{ subscriptionId: 1 }`

---

## 12. Test Coverage

| Suite | Tests | Coverage |
|-------|:-----:|----------|
| `subscription-validators.test.ts` | 40 | All 7 Zod schemas validated |
| `subscription-helpers.test.ts` | 17 | calcEndDate, nextUsageReset, initAiUsage, buildPlanSnapshot, tierToLegacyType |
| `subscription-featureGate.test.ts` | 22 | AI/limit/toggle/no-sub/grace-period checks + getFeatureGateMap |
| `subscription-withSubscription.test.ts` | 16 | Bypass roles, no-sub, grace period, AI/limit/toggle gates |
| `permissions.test.ts` | 22 | RBAC for all 5 roles including subscriptions resource |
| **Total** | **117** | **87.9% statement coverage** |

---

## File Map

```
src/
├── models/
│   ├── SubscriptionPlan.ts       # Plan definitions
│   ├── Subscription.ts           # Active subscriptions
│   ├── Invoice.ts                # Generated invoices
│   └── SubscriptionHistory.ts    # Immutable audit log
│
├── lib/subscription/
│   ├── withSubscription.ts       # Route middleware wrapper
│   ├── featureGate.ts            # checkFeatureGate + enforceFeatureGate + getFeatureGateMap
│   ├── gracePeriod.ts            # 30-day grace period logic
│   ├── autoAssign.ts             # Auto-assign default plan on signup
│   ├── helpers.ts                # calcEndDate, buildPlanSnapshot, etc.
│   └── invoiceNumber.ts          # Atomic INV-YYYYMM-XXXXX generator
│
├── lib/validators/
│   └── subscriptions.ts          # 7 Zod validation schemas
│
├── hooks/
│   ├── useSubscriptionPlans.ts   # Admin plan CRUD hooks
│   ├── useSubscriptionManagement.ts # Assign/change/cancel/renew/bulk hooks
│   ├── useSubscription.ts        # User's own subscription hook
│   ├── useInvoices.ts            # Invoice listing hooks
│   └── useFeatureGate.ts         # Client feature gate hook
│
├── components/shared/
│   └── FeatureGate/index.tsx     # <FeatureGate>, FeatureLockBadge, UpgradeHint
│
├── app/api/
│   ├── admin/subscription-plans/         # CRUD routes
│   ├── admin/subscription-stats/         # Dashboard stats
│   ├── subscriptions/assign/             # Plan assignment
│   ├── subscriptions/change/             # Upgrade/downgrade
│   ├── subscriptions/renew/              # Renewal
│   ├── subscriptions/bulk-assign/        # Bulk assignment
│   ├── subscriptions/[id]/              # Detail + cancel
│   ├── subscriptions/my/               # Current user's sub
│   ├── subscriptions/history/           # History timeline
│   ├── subscriptions/feature-gate/      # Full gate map
│   ├── invoices/                        # Invoice list
│   ├── invoices/[id]/                   # Invoice detail + mark paid
│   └── cron/
│       ├── subscription-expiry/         # Daily expiry cron
│       ├── subscription-usage-reset/    # Monthly reset cron
│       └── subscription-reminder/       # Daily reminder cron
│
├── app/[locale]/(dashboard)/
│   ├── admin/subscription-plans/page.tsx      # Plan management UI
│   ├── admin/subscriptions/page.tsx           # Assignment + bulk UI
│   ├── admin/subscription-dashboard/page.tsx  # Analytics dashboard
│   ├── employer/subscription/page.tsx         # Employer plan view
│   └── job-seeker/subscription/page.tsx       # Job seeker plan view
│
└── __tests__/lib/
    ├── subscription-validators.test.ts
    ├── subscription-helpers.test.ts
    ├── subscription-featureGate.test.ts
    ├── subscription-withSubscription.test.ts
    └── permissions.test.ts

scripts/
└── seed-subscription-plans.mjs    # Seeds 7 default plans
```
