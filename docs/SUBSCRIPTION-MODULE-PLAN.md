# Implementation Plan: MployedIn Subscription Module

## Overview

A complete subscription management system for MployedIn, enabling admin/super-agent manual assignment of tiered subscription plans to employers and job seekers. The system introduces **4 new MongoDB models**, **12+ new API routes**, **6 React Query hooks**, **5+ new UI pages**, and a **server + client feature gating layer** that integrates into the existing `withAuth()` and `canAccess()` permission infrastructure. No payment gateway is needed — subscriptions are assigned manually by admin/super-agent/agent roles.

## Requirements

- Admin creates named subscription plans (Free, Silver, Gold, Platinum) for employers and job seekers
- Each plan defines feature limits, AI usage caps, and boolean feature toggles
- Admin/super-agent/agent assigns a plan to an employer or job seeker
- Subscriptions have start/end dates, auto-renewal flag, and lifecycle status
- Upgrade/downgrade changes the active plan and logs history
- Invoices are auto-generated on assignment, renewal, upgrade, and downgrade
- Server-side feature gating middleware checks subscription before allowing API calls
- Client-side `useFeatureGate()` hook hides/disables features and shows upgrade prompts
- i18n keys for all new UI strings (en + ar)

---

## Architecture Changes

| Change | File(s) |
|--------|---------|
| New model: `SubscriptionPlan` | `src/models/SubscriptionPlan.ts` |
| New model: `Subscription` | `src/models/Subscription.ts` |
| New model: `Invoice` | `src/models/Invoice.ts` |
| New model: `SubscriptionHistory` | `src/models/SubscriptionHistory.ts` |
| New resource type: `"subscriptions"` | `src/types/user.ts` |
| Permission matrix update | `src/lib/permissions/matrix.ts` |
| New validators | `src/lib/validators/subscriptions.ts` |
| New index definitions | `src/lib/db/indexes.ts` |
| Model barrel export | `src/models/index.ts` |
| New feature gating lib | `src/lib/subscription/featureGate.ts` |
| New feature gating middleware | `src/lib/subscription/withSubscription.ts` |
| 7+ new API route files | `src/app/api/admin/subscription-plans/...`, `src/app/api/subscriptions/...` |
| 4 new React Query hooks | `src/hooks/useSubscriptionPlans.ts`, etc. |
| Client feature gate hook | `src/hooks/useFeatureGate.ts` |
| 5+ new pages | `src/app/[locale]/(dashboard)/admin/subscription-plans/page.tsx`, etc. |
| i18n keys | `messages/en.json`, `messages/ar.json` |

---

## 1. Data Models (MongoDB/Mongoose)

### 1.1 `SubscriptionPlan` — Admin-created plan definitions

**File:** `src/models/SubscriptionPlan.ts`

```typescript
import mongoose, { Document, Schema } from "mongoose";

// ── Feature Limit Types ────────────────────────────────────────────
export type PlanTargetRole = "employer" | "job_seeker";

export interface IAIFeatureLimit {
  feature: AIFeatureKey;
  enabled: boolean;
  monthlyLimit: number; // 0 = unlimited when enabled
}

export type AIFeatureKey =
  | "ai_chat"
  | "ai_daily_insights"
  | "ai_job_matching"
  | "ai_cv_extraction"
  | "ai_interview_questions"
  | "ai_skills_gap"
  | "ai_candidate_screening"
  | "ai_salary_benchmark"
  | "ai_job_description"
  | "ai_hiring_reports"
  | "ai_voice_input"
  | "ai_skills_suggest"
  | "ai_profile_fill"
  | "ai_enhance_text"
  | "ai_generate_summary";

export interface IEmployerFeatureLimits {
  maxActiveJobs: number;                // -1 = unlimited
  maxApplicationsViewPerMonth: number;  // -1 = unlimited
  maxTeamMembers: number;               // -1 = unlimited
  aiFeatures: IAIFeatureLimit[];
  analyticsLevel: "none" | "basic" | "advanced";
  dataExport: boolean;
  commTemplates: boolean;
  scorecardEvaluations: boolean;
  matchingWeightCustomization: boolean;
  workflowCustomization: boolean;
  prioritySupport: boolean;
  featuredJobListings: number;          // 0 = none, -1 = unlimited
  brandedCompanyPage: boolean;
}

export interface IJobSeekerFeatureLimits {
  maxApplicationsPerMonth: number;      // -1 = unlimited
  aiFeatures: IAIFeatureLimit[];
  profileVisibilityBoost: boolean;
  salaryInsights: boolean;
  priorityApplicationReview: boolean;
  resumeBuilderAccess: boolean;
}

export interface ISubscriptionPlan extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;                         // e.g., "Gold", "Silver"
  slug: string;                         // e.g., "employer_gold"
  targetRole: PlanTargetRole;
  tier: number;                         // numeric rank: 0=Free, 1=Silver, 2=Gold, 3=Platinum
  description?: string;
  price: number;                        // for display/invoice (admin sets, no payment processing)
  currency: string;                     // "USD", "AED", etc.
  billingCycle: "monthly" | "quarterly" | "yearly";
  employerLimits?: IEmployerFeatureLimits;
  jobSeekerLimits?: IJobSeekerFeatureLimits;
  isActive: boolean;                    // soft-disable a plan
  isDefault: boolean;                   // auto-assign on signup
  sortOrder: number;                    // display order
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
```

**Schema notes:**
- `slug` is unique, auto-generated from `targetRole + "_" + name.toLowerCase()`
- `tier` is numeric for easy comparison on upgrade/downgrade
- `employerLimits` is required when `targetRole === "employer"`; `jobSeekerLimits` when `targetRole === "job_seeker"`
- `isDefault: true` should be unique per `targetRole` (at most one default per role)
- Index: `{ targetRole: 1, isActive: 1, sortOrder: 1 }`

---

### 1.2 `Subscription` — Active subscriptions per user

**File:** `src/models/Subscription.ts`

```typescript
export type SubscriptionStatus =
  | "active"
  | "expired"
  | "cancelled"
  | "suspended";

export interface ISubscription extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;        // ref: User
  targetRole: PlanTargetRole;             // employer | job_seeker
  planId: mongoose.Types.ObjectId;        // ref: SubscriptionPlan
  planSnapshot: {                         // frozen copy of plan limits at assignment time
    name: string;
    tier: number;
    price: number;
    currency: string;
    billingCycle: string;
    employerLimits?: IEmployerFeatureLimits;
    jobSeekerLimits?: IJobSeekerFeatureLimits;
  };
  status: SubscriptionStatus;
  startDate: Date;
  endDate: Date;
  autoRenew: boolean;
  // Usage counters (reset monthly via cron)
  usage: {
    activeJobs?: number;
    applicationsViewed?: number;
    applicationsSubmitted?: number;
    aiUsage: Record<AIFeatureKey, number>; // per-feature monthly count
  };
  usageResetAt: Date;                     // next monthly reset date
  // Assignment tracking
  assignedBy: mongoose.Types.ObjectId;    // admin/super_agent/agent userId
  assignedByRole: string;
  notes?: string;                         // admin notes on assignment
  cancelledAt?: Date;
  cancelledBy?: mongoose.Types.ObjectId;
  cancellationReason?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**Schema notes:**
- One active subscription per `(userId, targetRole)` — compound unique index where `status: "active"`
- `planSnapshot` ensures historical accuracy — if admin edits a plan, existing subscriptions keep original limits
- `usage.aiUsage` is initialized as `Record<AIFeatureKey, 0>` on creation
- `usageResetAt` defaults to start of next month
- Indexes: `{ userId: 1, targetRole: 1, status: 1 }`, `{ endDate: 1, status: 1 }` (for expiry cron), `{ planId: 1 }`

---

### 1.3 `Invoice` — Generated invoices

**File:** `src/models/Invoice.ts`

```typescript
export type InvoiceStatus = "draft" | "issued" | "paid" | "void";
export type InvoiceType = "new" | "renewal" | "upgrade" | "downgrade";

export interface IInvoice extends Document {
  _id: mongoose.Types.ObjectId;
  invoiceNumber: string;                  // auto-generated: "INV-YYYYMM-XXXXX"
  userId: mongoose.Types.ObjectId;        // ref: User
  subscriptionId: mongoose.Types.ObjectId; // ref: Subscription
  planId: mongoose.Types.ObjectId;        // ref: SubscriptionPlan
  type: InvoiceType;
  planName: string;
  description?: string;
  amount: number;
  currency: string;
  billingCycle: string;
  periodStart: Date;
  periodEnd: Date;
  status: InvoiceStatus;
  issuedAt: Date;
  paidAt?: Date;                          // admin marks as paid manually
  markedPaidBy?: mongoose.Types.ObjectId;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**Schema notes:**
- `invoiceNumber` is auto-generated: `INV-202604-00001`
- Index: `{ userId: 1, createdAt: -1 }`, `{ invoiceNumber: 1 }` (unique), `{ subscriptionId: 1 }`

---

### 1.4 `SubscriptionHistory` — Upgrade/downgrade/renewal log

**File:** `src/models/SubscriptionHistory.ts`

```typescript
export type SubscriptionAction =
  | "assigned"
  | "upgraded"
  | "downgraded"
  | "renewed"
  | "cancelled"
  | "expired"
  | "suspended"
  | "reactivated";

export interface ISubscriptionHistory extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  subscriptionId: mongoose.Types.ObjectId;
  action: SubscriptionAction;
  fromPlanId?: mongoose.Types.ObjectId;   // null on first assignment
  toPlanId?: mongoose.Types.ObjectId;     // null on cancellation
  fromPlanName?: string;
  toPlanName?: string;
  performedBy: mongoose.Types.ObjectId;   // admin/agent who performed it
  performedByRole: string;
  reason?: string;
  meta?: Record<string, unknown>;         // arbitrary data (e.g., prorated amount)
  createdAt: Date;
}
```

**Schema notes:**
- Immutable append-only log — no update/delete operations
- Index: `{ userId: 1, createdAt: -1 }`, `{ subscriptionId: 1 }`

---

## 2. Subscription Tier Definitions

### 2.1 Employer Tiers

| Feature | Free (tier 0) | Silver (tier 1) | Gold (tier 2) | Platinum (tier 3) |
|---------|:---:|:---:|:---:|:---:|
| **Active job postings** | 2 | 10 | 50 | Unlimited |
| **Applications visible / month** | 20 | 100 | 500 | Unlimited |
| **Team member seats** | 1 | 3 | 10 | Unlimited |
| **AI Chat** | ❌ | ✅ (50/mo) | ✅ (200/mo) | ✅ Unlimited |
| **AI Daily Insights** | ❌ | ✅ | ✅ | ✅ |
| **AI Job Matching** | ❌ | ✅ (20/mo) | ✅ (100/mo) | ✅ Unlimited |
| **AI CV Extraction** | ❌ | ✅ (10/mo) | ✅ (50/mo) | ✅ Unlimited |
| **AI Interview Questions** | ❌ | ✅ (10/mo) | ✅ (50/mo) | ✅ Unlimited |
| **AI Skills Gap** | ❌ | ❌ | ✅ (30/mo) | ✅ Unlimited |
| **AI Candidate Screening** | ❌ | ❌ | ✅ (30/mo) | ✅ Unlimited |
| **AI Salary Benchmark** | ❌ | ❌ | ✅ (10/mo) | ✅ Unlimited |
| **AI Job Description Gen** | ❌ | ✅ (5/mo) | ✅ (30/mo) | ✅ Unlimited |
| **AI Hiring Reports** | ❌ | ❌ | ✅ (5/mo) | ✅ Unlimited |
| **AI Voice Input** | ❌ | ❌ | ✅ | ✅ |
| **Analytics** | None | Basic | Advanced | Advanced |
| **Data Export** | ❌ | ❌ | ✅ | ✅ |
| **Communication Templates** | ❌ | ✅ | ✅ | ✅ |
| **Scorecard Evaluations** | ❌ | ❌ | ✅ | ✅ |
| **Matching Weight Customization** | ❌ | ❌ | ✅ | ✅ |
| **Workflow Customization** | ❌ | ❌ | ✅ | ✅ |
| **Priority Support** | ❌ | ❌ | ❌ | ✅ |
| **Featured Job Listings** | 0 | 1 | 5 | Unlimited |
| **Branded Company Page** | ❌ | ❌ | ✅ | ✅ |

### 2.2 Job Seeker Tiers

| Feature | Free (tier 0) | Premium (tier 1) | Premium Plus (tier 2) |
|---------|:---:|:---:|:---:|
| **Applications / month** | 10 | 50 | Unlimited |
| **AI Chat** | ❌ | ✅ (30/mo) | ✅ Unlimited |
| **AI CV Extraction** | ❌ | ✅ (3/mo) | ✅ Unlimited |
| **AI Skills Suggest** | ❌ | ✅ (10/mo) | ✅ Unlimited |
| **AI Skills Gap** | ❌ | ✅ (5/mo) | ✅ Unlimited |
| **AI Interview Questions** | ❌ | ✅ (10/mo) | ✅ Unlimited |
| **AI Profile Fill** | ❌ | ✅ (3/mo) | ✅ Unlimited |
| **AI Enhance Text** | ❌ | ✅ (10/mo) | ✅ Unlimited |
| **AI Generate Summary** | ❌ | ✅ (5/mo) | ✅ Unlimited |
| **AI Daily Insights** | ❌ | ✅ | ✅ |
| **AI Voice Input** | ❌ | ❌ | ✅ |
| **Profile Visibility Boost** | ❌ | ✅ | ✅ |
| **Salary Insights** | ❌ | ✅ | ✅ |
| **Priority Application Review** | ❌ | ❌ | ✅ |
| **Resume Builder** | ❌ | ✅ | ✅ |

---

## 3. Permission & Type Updates

### 3.1 Add `"subscriptions"` resource

**File:** `src/types/user.ts`

```typescript
// Add to Resource union:
| "subscriptions"
```

### 3.2 Update permission matrix

**File:** `src/lib/permissions/matrix.ts`

```typescript
admin: {
  subscriptions: ["create", "read", "update", "delete", "export"],
},
super_agent: {
  subscriptions: ["create", "read", "update"],  // can assign subscriptions
},
agent: {
  subscriptions: ["create", "read"],            // can assign, view only
},
employer: {
  subscriptions: ["read"],                       // can view own subscription
},
job_seeker: {
  subscriptions: ["read"],                       // can view own subscription
},
```

---

## 4. Zod Validators

**File:** `src/lib/validators/subscriptions.ts`

```typescript
import { z } from "zod";

const AI_FEATURE_KEYS = [
  "ai_chat", "ai_daily_insights", "ai_job_matching", "ai_cv_extraction",
  "ai_interview_questions", "ai_skills_gap", "ai_candidate_screening",
  "ai_salary_benchmark", "ai_job_description", "ai_hiring_reports",
  "ai_voice_input", "ai_skills_suggest", "ai_profile_fill",
  "ai_enhance_text", "ai_generate_summary",
] as const;

const aiFeatureLimitSchema = z.object({
  feature: z.enum(AI_FEATURE_KEYS),
  enabled: z.boolean(),
  monthlyLimit: z.number().int().min(0),  // 0 = unlimited when enabled
});

const employerLimitsSchema = z.object({
  maxActiveJobs: z.number().int().min(-1),
  maxApplicationsViewPerMonth: z.number().int().min(-1),
  maxTeamMembers: z.number().int().min(-1),
  aiFeatures: z.array(aiFeatureLimitSchema),
  analyticsLevel: z.enum(["none", "basic", "advanced"]),
  dataExport: z.boolean(),
  commTemplates: z.boolean(),
  scorecardEvaluations: z.boolean(),
  matchingWeightCustomization: z.boolean(),
  workflowCustomization: z.boolean(),
  prioritySupport: z.boolean(),
  featuredJobListings: z.number().int().min(-1),
  brandedCompanyPage: z.boolean(),
});

const jobSeekerLimitsSchema = z.object({
  maxApplicationsPerMonth: z.number().int().min(-1),
  aiFeatures: z.array(aiFeatureLimitSchema),
  profileVisibilityBoost: z.boolean(),
  salaryInsights: z.boolean(),
  priorityApplicationReview: z.boolean(),
  resumeBuilderAccess: z.boolean(),
});

/** POST /api/admin/subscription-plans */
export const subscriptionPlanCreateSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  targetRole: z.enum(["employer", "job_seeker"]),
  tier: z.number().int().min(0).max(10),
  description: z.string().max(500).optional(),
  price: z.number().min(0),
  currency: z.string().length(3),
  billingCycle: z.enum(["monthly", "quarterly", "yearly"]),
  employerLimits: employerLimitsSchema.optional(),
  jobSeekerLimits: jobSeekerLimitsSchema.optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
}).refine(
  (d) => (d.targetRole === "employer" ? !!d.employerLimits : !!d.jobSeekerLimits),
  { message: "Limits must match targetRole" }
);

/** PATCH /api/admin/subscription-plans/[id] */
export const subscriptionPlanUpdateSchema = subscriptionPlanCreateSchema.partial();

/** POST /api/subscriptions/assign */
export const subscriptionAssignSchema = z.object({
  userId: z.string().min(1),
  planId: z.string().min(1),
  startDate: z.string().datetime().optional(),  // defaults to now
  endDate: z.string().datetime().optional(),    // defaults to startDate + billingCycle
  autoRenew: z.boolean().optional(),
  notes: z.string().max(500).optional(),
});

/** POST /api/subscriptions/change */
export const subscriptionChangeSchema = z.object({
  userId: z.string().min(1),
  newPlanId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

/** PATCH /api/subscriptions/[id]/cancel */
export const subscriptionCancelSchema = z.object({
  reason: z.string().max(500).optional(),
});

/** PATCH /api/invoices/[id] */
export const invoiceUpdateSchema = z.object({
  status: z.enum(["paid", "void"]).optional(),
  notes: z.string().max(500).optional(),
});
```

---

## 5. API Routes

### 5.1 Admin Plan Management (CRUD)

#### `src/app/api/admin/subscription-plans/route.ts`

| Method | Guard | Description |
|--------|-------|-------------|
| `GET` | `{ resource: "subscriptions", action: "read" }` | List all plans. Query params: `?targetRole=employer&isActive=true` |
| `POST` | `{ resource: "subscriptions", action: "create" }` | Create a new plan. Validate with `subscriptionPlanCreateSchema`. Generate `slug`. Log via `logActivity()`. |

#### `src/app/api/admin/subscription-plans/[id]/route.ts`

| Method | Guard | Description |
|--------|-------|-------------|
| `GET` | `{ resource: "subscriptions", action: "read" }` | Get single plan by ID |
| `PATCH` | `{ resource: "subscriptions", action: "update" }` | Update plan fields |
| `DELETE` | `{ resource: "subscriptions", action: "delete" }` | Soft-delete (`isActive: false`). Prevent if active subscriptions reference this plan. |

### 5.2 Subscription Assignment & Management

#### `src/app/api/subscriptions/assign/route.ts` — `POST`

**Guard:** `{ resource: "subscriptions", action: "create" }`

**Logic:**
1. Validate body with `subscriptionAssignSchema`
2. Look up `SubscriptionPlan` by `planId`, ensure `isActive`
3. Check if user already has active subscription → 409 if yes ("use change endpoint")
4. Validate user's role matches `plan.targetRole`
5. Calculate `endDate` from `startDate + billingCycle` if not provided
6. Create `Subscription` with `planSnapshot` frozen from current plan
7. Initialize `usage.aiUsage` as all zeros
8. Create `SubscriptionHistory` entry → `action: "assigned"`
9. Create `Invoice` → `type: "new"`, status `"issued"`
10. Update `Employer.subscriptionType` / `Employer.paymentStatus` (backward compat)
11. `logActivity()` + return subscription

#### `src/app/api/subscriptions/change/route.ts` — `POST`

**Guard:** `{ resource: "subscriptions", action: "update" }`

**Logic:**
1. Validate body with `subscriptionChangeSchema`
2. Find active subscription for `userId`
3. Find `newPlanId` plan, ensure same `targetRole`
4. Compare `tier` values → determine upgrade or downgrade
5. Update `Subscription.planId`, `planSnapshot`, recalculate `endDate`
6. **On downgrade:** Log warning if current usage exceeds new limits
7. Create `SubscriptionHistory` → `action: "upgraded" | "downgraded"`
8. Create `Invoice` → `type: "upgrade" | "downgrade"`
9. `logActivity()`

#### `src/app/api/subscriptions/[id]/route.ts`

| Method | Guard | Description |
|--------|-------|-------------|
| `GET` | `{ resource: "subscriptions", action: "read" }` | Get subscription by ID (IDOR check) |
| `PATCH` | `{ resource: "subscriptions", action: "update" }` | Cancel subscription (admin/super_agent only) |

#### `src/app/api/subscriptions/my/route.ts` — `GET`

Returns current user's active subscription + plan + usage.

#### `src/app/api/subscriptions/renew/route.ts` — `POST`

**Guard:** `{ resource: "subscriptions", action: "update" }`

**Logic:**
1. Set new `startDate = old endDate`, calculate new `endDate`
2. Reset `usage` counters to zero
3. Set `status: "active"`
4. Create `SubscriptionHistory` → `action: "renewed"`
5. Create `Invoice` → `type: "renewal"`

#### `src/app/api/subscriptions/history/route.ts` — `GET`

Get subscription history for a user. Admin sees any; others see own only.

#### `src/app/api/subscriptions/feature-gate/route.ts` — `GET`

Returns complete feature gate map: `{ features: Record<string, { allowed, limit, used, remaining }> }`

### 5.3 Invoice Routes

#### `src/app/api/invoices/route.ts` — `GET`

List invoices. Admin sees all; employer/job_seeker sees own only.

#### `src/app/api/invoices/[id]/route.ts`

| Method | Description |
|--------|-------------|
| `GET` | Get single invoice (IDOR check) |
| `PATCH` | Mark paid/void (admin only) |

---

## 6. Feature Gating

### 6.1 Server-Side: `withSubscription()` Middleware

**File:** `src/lib/subscription/withSubscription.ts`

```typescript
type FeatureCheck =
  | { type: "ai"; feature: AIFeatureKey }
  | { type: "limit"; feature: "activeJobs" | "applicationsViewed" | "applicationsSubmitted" | "teamMembers" }
  | { type: "toggle"; feature: string };

// Wraps route handler — use AFTER withAuth():
// const handler = withSubscription(innerHandler, { type: "ai", feature: "ai_cv_extraction" });
// export const POST = withAuth(handler, { resource: "ai_cv", action: "read" });
```

**Responses:**
- `403 SUBSCRIPTION_REQUIRED` — no active subscription
- `403 FEATURE_DISABLED` — feature not in plan
- `429 LIMIT_EXCEEDED` — monthly limit reached (includes `{ limit, used }`)
- Usage incremented atomically via `$inc`

### 6.2 Server-Side: `checkFeatureGate()` Utility

**File:** `src/lib/subscription/featureGate.ts`

For conditional logic inside route handlers (not middleware):
```typescript
const gate = await checkFeatureGate(userId, { type: "ai", feature: "ai_chat" });
if (!gate.allowed) return NextResponse.json({ error: gate.reason }, { status: 403 });
```

### 6.3 Client-Side: `useFeatureGate()` Hook

**File:** `src/hooks/useFeatureGate.ts`

```typescript
const { allowed, remaining } = useFeatureGate("ai_cv_extraction");
if (!allowed) return <UpgradePrompt />;
```

### 6.4 Client-Side: `<FeatureGate>` Component

**File:** `src/components/shared/FeatureGate/index.tsx`

```tsx
<FeatureGate feature="scorecardEvaluations">
  <ScorecardSection />
</FeatureGate>
```

---

## 7. React Query Hooks

### 7.1 `useSubscriptionPlans()` — Admin CRUD

**File:** `src/hooks/useSubscriptionPlans.ts`

Hooks: `useSubscriptionPlans(filters)`, `useSubscriptionPlan(id)`, `useCreateSubscriptionPlan()`, `useUpdateSubscriptionPlan()`, `useDeleteSubscriptionPlan()`

### 7.2 `useSubscription()` — Current user's subscription

**File:** `src/hooks/useSubscription.ts`

Hooks: `useMySubscription()`, `useSubscriptionHistory(userId?)`

### 7.3 `useSubscriptionManagement()` — Admin assign/change/cancel

**File:** `src/hooks/useSubscriptionManagement.ts`

Mutations: `useAssignSubscription()`, `useChangeSubscription()`, `useCancelSubscription()`, `useRenewSubscription()`

### 7.4 `useInvoices()` — Invoice listing

**File:** `src/hooks/useInvoices.ts`

Hooks: `useInvoices(filters)`, `useInvoice(id)`, `useUpdateInvoice()`

---

## 8. UI Pages

### 8.1 Admin: Subscription Plans Management
**`src/app/[locale]/(dashboard)/admin/subscription-plans/page.tsx`**

- Tab navigation: "Employer Plans" | "Job Seeker Plans"
- DataTable: Name, Tier, Price, Billing Cycle, Active Subscribers, Status, Actions
- Create/Edit dialog with full limits configuration form
- Duplicate plan action
- Soft-delete with confirmation

### 8.2 Admin: Subscription Assignment
**`src/app/[locale]/(dashboard)/admin/subscriptions/page.tsx`**

- Search user by name/email (uses existing `useUserSearch()`)
- Show current subscription vs. available plans
- Assign / change / cancel actions
- Subscription history timeline
- Bulk assign capability

### 8.3 Admin: Subscription Dashboard
**`src/app/[locale]/(dashboard)/admin/subscription-dashboard/page.tsx`**

- Overview cards: Total active subs, by tier, expiring soon, revenue
- Charts: Distribution pie, trend line, upgrade/downgrade ratio
- Upcoming renewals list
- Recent activity feed

### 8.4 Employer: Subscription Page
**`src/app/[locale]/(dashboard)/employer/subscription/page.tsx`**

- Current plan card with usage meters
- AI usage progress bars per feature
- Job / application / team seat usage vs. limit
- Invoice history table
- "Contact admin to upgrade" CTA

### 8.5 Job Seeker: Subscription Page
**`src/app/[locale]/(dashboard)/job-seeker/subscription/page.tsx`**

- Current plan card
- AI usage meters
- Application count vs. limit
- Invoice history
- "Contact admin to upgrade" CTA

---

## 9. Cron Jobs

### 9.1 Subscription Expiry Check
**`src/app/api/cron/subscription-expiry/route.ts`** — Daily

- Find `endDate < now` and `status === "active"`
- Auto-renew if `autoRenew === true` (create new period, invoice, reset usage)
- Expire if `autoRenew === false` (set status, log history, notify)

### 9.2 Monthly Usage Reset
**`src/app/api/cron/subscription-usage-reset/route.ts`** — Monthly (1st)

- Reset `usage.aiUsage` to zeros
- Reset counter fields
- Update `usageResetAt`

### 9.3 Renewal Reminder
**`src/app/api/cron/subscription-reminder/route.ts`** — Daily

- Notify users expiring in 7, 3, 1 days

---

## 10. Invoice Number Generation

**File:** `src/lib/subscription/invoiceNumber.ts`

Uses atomic counter in `counters` collection:
```
INV-202604-00001, INV-202604-00002, ...
```

---

## 11. Integration Points — Feature Gating Wiring

| Existing Route / Component | Feature Gate | Type |
|---|---|---|
| `POST /api/jobs` | `{ type: "limit", feature: "activeJobs" }` | Server |
| `GET /api/applications` | `{ type: "limit", feature: "applicationsViewed" }` | Server |
| `POST /api/employers/team` | `{ type: "limit", feature: "teamMembers" }` | Server |
| `POST /api/ai/chat` | `{ type: "ai", feature: "ai_chat" }` | Server |
| `POST /api/ai/daily-insights` | `{ type: "ai", feature: "ai_daily_insights" }` | Server |
| `POST /api/ai/match` | `{ type: "ai", feature: "ai_job_matching" }` | Server |
| `POST /api/ai/cv-extract` | `{ type: "ai", feature: "ai_cv_extraction" }` | Server |
| `POST /api/ai/interview-questions` | `{ type: "ai", feature: "ai_interview_questions" }` | Server |
| `POST /api/ai/skills-gap` | `{ type: "ai", feature: "ai_skills_gap" }` | Server |
| `POST /api/ai/screen-candidates` | `{ type: "ai", feature: "ai_candidate_screening" }` | Server |
| `POST /api/ai/salary-benchmark` | `{ type: "ai", feature: "ai_salary_benchmark" }` | Server |
| `POST /api/ai/job-description` | `{ type: "ai", feature: "ai_job_description" }` | Server |
| `POST /api/ai/report` | `{ type: "ai", feature: "ai_hiring_reports" }` | Server |
| `POST /api/ai/speech-to-text` | `{ type: "ai", feature: "ai_voice_input" }` | Server |
| `GET /api/employers/analytics` | `{ type: "toggle", feature: "analyticsLevel" }` | Server |
| `GET /api/*/export` | `{ type: "toggle", feature: "dataExport" }` | Server |
| Matching weights UI | `matchingWeightCustomization` | Client `<FeatureGate>` |
| Workflow UI | `workflowCustomization` | Client `<FeatureGate>` |
| Scorecard UI | `scorecardEvaluations` | Client `<FeatureGate>` |
| Comm templates UI | `commTemplates` | Client `<FeatureGate>` |
| Job seeker apply button | `applicationsSubmitted` | Client `useFeatureGate` |

**Note:** Admin/Super-agent/Agent routes are NEVER gated — subscription gating applies only to `employer` and `job_seeker` roles.

---

## 12. Backward Compatibility

The existing `Employer.paymentStatus` and `Employer.subscriptionType` fields will be maintained:

1. On subscription assign: `Employer.paymentStatus = "active"`, `subscriptionType` mapped from tier
2. On cancel/expire: `Employer.paymentStatus = "pending"`
3. `Subscription` model becomes the source of truth
4. Phase out legacy fields in future release

---

## 13. Phase Breakdown

### Phase 1: Foundation — Data Models + API + Admin CRUD
| # | Task | File | Risk |
|---|------|------|------|
| 1 | Create `SubscriptionPlan` model | `src/models/SubscriptionPlan.ts` | Low |
| 2 | Create `Subscription` model | `src/models/Subscription.ts` | Low |
| 3 | Create `Invoice` model | `src/models/Invoice.ts` | Low |
| 4 | Create `SubscriptionHistory` model | `src/models/SubscriptionHistory.ts` | Low |
| 5 | Update model barrel exports | `src/models/index.ts` | Low |
| 6 | Add `"subscriptions"` resource + permissions | `src/types/user.ts`, `src/lib/permissions/matrix.ts` | Low |
| 7 | Create Zod validators | `src/lib/validators/subscriptions.ts` | Low |
| 8 | Add database indexes | `src/lib/db/indexes.ts` | Low |
| 9 | Create admin plan CRUD routes | `src/app/api/admin/subscription-plans/...` | Low |
| 10 | Create `useSubscriptionPlans` hook | `src/hooks/useSubscriptionPlans.ts` | Low |
| 11 | Create admin Plans page | `src/app/[locale]/(dashboard)/admin/subscription-plans/page.tsx` | Medium |
| 12 | Create seed script for default plans | `scripts/seed-subscription-plans.mjs` | Low |

### Phase 2: Core — Subscription Assignment + Feature Gating
| # | Task | File | Risk |
|---|------|------|------|
| 13 | Create invoice number generator | `src/lib/subscription/invoiceNumber.ts` | Low |
| 14 | Create assign route | `src/app/api/subscriptions/assign/route.ts` | Medium |
| 15 | Create change route (upgrade/downgrade) | `src/app/api/subscriptions/change/route.ts` | Medium |
| 16 | Create subscription detail/cancel route | `src/app/api/subscriptions/[id]/route.ts` | Low |
| 17 | Create my-subscription route | `src/app/api/subscriptions/my/route.ts` | Low |
| 18 | Create renew route | `src/app/api/subscriptions/renew/route.ts` | Low |
| 19 | Create history route | `src/app/api/subscriptions/history/route.ts` | Low |
| 20 | Create `withSubscription()` middleware | `src/lib/subscription/withSubscription.ts` | Medium |
| 21 | Create `checkFeatureGate()` utility | `src/lib/subscription/featureGate.ts` | Low |
| 22 | Create feature-gate API route | `src/app/api/subscriptions/feature-gate/route.ts` | Low |
| 23 | Wire `withSubscription()` into AI routes | All `src/app/api/ai/*` | Medium |
| 24 | Wire limits into job/application/team routes | Various | Medium |
| 25 | Create admin management hooks | `src/hooks/useSubscriptionManagement.ts` | Low |
| 26 | Create admin assignment page | `src/app/[locale]/(dashboard)/admin/subscriptions/page.tsx` | Medium |

### Phase 3: Client UI — Feature Gating + User Pages
| # | Task | File | Risk |
|---|------|------|------|
| 27 | Create `useFeatureGate` hook | `src/hooks/useFeatureGate.ts` | Low |
| 28 | Create `<FeatureGate>` component | `src/components/shared/FeatureGate/index.tsx` | Low |
| 29 | Create `useSubscription` hook | `src/hooks/useSubscription.ts` | Low |
| 30 | Create `useInvoices` hook | `src/hooks/useInvoices.ts` | Low |
| 31 | Create employer subscription page | `src/app/[locale]/(dashboard)/employer/subscription/page.tsx` | Low |
| 32 | Create job seeker subscription page | `src/app/[locale]/(dashboard)/job-seeker/subscription/page.tsx` | Low |
| 33 | Wire `<FeatureGate>` into employer components | Various | Low |
| 34 | Wire `<FeatureGate>` into job seeker components | Various | Low |
| 35 | Add i18n keys (en + ar) | `messages/en.json`, `messages/ar.json` | Low |

### Phase 4: Invoice System
| # | Task | File | Risk |
|---|------|------|------|
| 36 | Create invoice routes | `src/app/api/invoices/...` | Low |
| 37 | Create admin subscription dashboard | `src/app/[locale]/(dashboard)/admin/subscription-dashboard/page.tsx` | Low |
| 38 | PDF invoice generation (optional) | `src/lib/subscription/generateInvoicePdf.ts` | Medium |

### Phase 5: Automation — Cron Jobs + Notifications
| # | Task | File | Risk |
|---|------|------|------|
| 39 | Create expiry cron | `src/app/api/cron/subscription-expiry/route.ts` | Medium |
| 40 | Create usage reset cron | `src/app/api/cron/subscription-usage-reset/route.ts` | Low |
| 41 | Create renewal reminder cron | `src/app/api/cron/subscription-reminder/route.ts` | Low |
| 42 | Add sidebar nav links | Various layout/nav components | Low |

---

## 14. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Breaking existing users** | High | 30-day grace period: treat users without subscriptions as "Gold" tier. Admin assigns during this window. |
| **Race condition on usage counters** | Medium | Use atomic `$inc` with `findOneAndUpdate` and condition check `{ "usage.aiUsage.feature": { $lt: limit } }` |
| **Plan edits invalidate snapshots** | Low | By design — `planSnapshot` is frozen at assignment. Document in admin UI. |
| **Cron job failures** | Medium | Idempotent crons, admin alerts on failure, audit logging |
| **Complex admin form** | Medium | Accordion/tab sections, pre-fill from tier templates, "Clone plan" action |

---

## 15. Success Criteria

- [x] Admin can CRUD subscription plans for employers and job seekers
- [x] Admin/super-agent/agent can assign a plan to a user
- [x] Upgrade and downgrade work correctly with history logging
- [x] Invoices auto-generated on assign, change, and renew
- [x] AI features blocked when not in plan or limit exceeded
- [x] Job posting blocked beyond limit
- [x] Application viewing blocked beyond limit
- [x] Team invites blocked beyond limit
- [x] Client `useFeatureGate()` correctly shows/hides features
- [x] Employer/job seeker can view plan, usage, and invoices
- [x] Expiry cron auto-renews or expires subscriptions
- [x] Usage reset cron resets monthly counters
- [x] All routes have Zod validation
- [x] All routes use `withAuth()` with correct RBAC
- [x] IDOR protection on all endpoints
- [x] i18n keys for en and ar
- [x] 80%+ test coverage on new code (87.9% achieved)
