# Mployedin — Role Architecture

> **Roles in this platform:** `admin` · `super_agent` · `agent` · `employer` · `job_seeker`
>
> This document covers the three internal/staff roles: **Admin**, **Super-Agent**, and **Agent**.

---

## Role Hierarchy

```
Admin
 └── Super-Agent  (regional team manager)
       └── Agent  (frontline recruiter / individual contributor)
```

- Admin sits above the hierarchy and manages the entire platform.
- A Super-Agent manages a team of Agents within a geographic region.
- An Agent is independently assigned to employers and job-seekers and reports (optionally) to a Super-Agent.

---

## 1. Admin

### Purpose
Platform superuser. Full read/write access to every resource and every dashboard section.

### Route Access
Unlike every other role, Admin is allowed to visit ALL dashboard sections:

```
/admin          → admin workspace
/super-agent    → can view super-agent pages
/agent          → can view agent pages
/employer       → can view employer pages
/job-seeker     → can view job-seeker pages
```

### Permission Matrix

| Resource            | Actions                                      |
|---------------------|----------------------------------------------|
| `users`             | create, read, update, delete, **impersonate** |
| `jobs`              | create, read, update, delete, **approve**, export |
| `applications`      | create, read, update, delete, export         |
| `interviews`        | create, read, update, delete                 |
| `placements`        | create, read, update, delete, export         |
| `leads`             | create, read, update, delete, export         |
| `commissions`       | create, read, update, delete, **approve**, export |
| `employers`         | create, read, update, delete, **approve**    |
| `agents`            | create, read, update, delete                 |
| `super_agents`      | create, read, update, delete                 |
| `job_seekers`       | create, read, update, delete                 |
| `notifications`     | create, read, update, delete                 |
| `reports`           | read, export                                 |
| `audit_logs`        | read, export *(exclusive — no other role)*   |
| `cms`               | create, read, update, delete *(exclusive)*   |
| `job_attributes`    | create, read, update, delete *(exclusive)*   |
| `location_data`     | create, read, update, delete *(exclusive)*   |
| `contact_submissions` | read, update, delete *(exclusive)*         |
| `ai_cv / ai_match / ai_assistant` | read                        |
| `offers`            | create, read, update, delete                 |
| `tasks`             | read, update                                 |
| `design_system`     | read                                         |

### Admin Dashboard Pages (`/admin`)

| Page | Path | Description |
|---|---|---|
| Dashboard | `/admin` | Platform-wide KPIs |
| Users | `/admin/users` | Create/edit/deactivate/delete users, bulk actions, role assignment |
| Agents | `/admin/agents` | Onboard and configure agent staff |
| Super Agents | `/admin/super-agents` | Onboard super-agents, assign regions |
| Jobs | `/admin/jobs` | Global job management, approve/reject postings |
| Applications | `/admin/applications` | All applications across the platform |
| Approvals | `/admin/approvals` | Job approval queue |
| Interviews | `/admin/interviews` | All interviews |
| Placements | `/admin/placements` | All confirmed placements |
| Commissions | `/admin/commissions` | Approve and manage all commissions |
| Employers | `/admin/employers` | All employer accounts |
| Job Seekers | `/admin/job-seekers` | All job-seeker profiles |
| Reports | `/admin/reports` | Platform-wide reporting |
| Analytics | `/admin/analytics` | Usage and funnel analytics |
| Audit Logs | `/admin/audit-logs` | Full immutable platform activity trail |
| Territory | `/admin/territory` | Assign geographic regions to super-agents/agents |
| Job Attributes | `/admin/job-attributes` | Manage job categories, skills, industries |
| Location Data | `/admin/location-data` | Countries, states, cities reference data |
| CMS | `/admin/cms` | Banners, FAQs, testimonials, videos, static pages |
| Communications | `/admin/communications` | Send platform notifications |
| Impersonate | `/admin/impersonate` | Log in as another user (admin only) |
| Settings | `/admin/settings` | Platform configuration |
| Design System | `/admin/design-system` | UI component library reference |
| Tasks | `/admin/tasks` | Platform task management |

### API Enforcement
Every `/api/admin/*` route performs a double check even after `withAuth`:

```ts
if (ctx.role !== "admin") {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

### Messaging
Admin can DM any user on the platform without restriction.

---

## 2. Super-Agent

### Purpose
Regional team manager. Oversees a pool of Agents, approves their job postings, and monitors team-wide performance metrics.

### Data Model (`src/models/SuperAgent.ts`)

```ts
{
  userId: ObjectId                // linked User account
  agentIds: ObjectId[]            // agents this super-agent manages
  assignedCityIds: ObjectId[]     // geographic coverage (cities)
  assignedStateIds: ObjectId[]    // geographic coverage (states)
  overrideRate: number            // personal commission override %
  commissions: {
    total: number
    pending: number
    paid: number
  }
}
```

### Permission Matrix

| Resource       | Actions                            |
|----------------|------------------------------------|
| `jobs`         | read, export                       |
| `applications` | read, export                       |
| `interviews`   | read                               |
| `placements`   | read, export                       |
| `leads`        | create, read, update, delete, export |
| `commissions`  | read, **approve**, export          |
| `employers`    | read                               |
| `agents`       | create, read, update *(no delete)* |
| `job_seekers`  | read                               |
| `notifications`| read                               |
| `reports`      | read, export                       |
| `ai_assistant` | read                               |

**Cannot access:** `users`, `audit_logs`, `cms`, `job_attributes`, `location_data`, `contact_submissions`, `impersonate`.

### Super-Agent Dashboard Pages (`/super-agent`)

| Page | Path | Description |
|---|---|---|
| Dashboard | `/super-agent` | KPIs: Region Coverage, Active Agents, Total Placements, Commissions Earned |
| Agents | `/super-agent/agents` | Managed agents with per-agent KPIs (leads, conversions, placements, rate) |
| Leads | `/super-agent/leads` | Cross-agent lead pipeline with status and agent assignment |
| Employers | `/super-agent/employers` | Employers linked to their agents (regional view) |
| Approvals | `/super-agent/approvals` | **Job approval gate** — approve or reject postings submitted by agents |
| Placements | `/super-agent/placements` | Team placements rollup with salaries and start dates |
| Commissions | `/super-agent/commissions` | Per-agent commission tracking, approve commissions, set override rates |
| Market | `/super-agent/market` | AI-powered market intelligence (demand, salaries, skills gaps, visa trends) |
| Reports | `/super-agent/reports` | Aggregate team statistics and financial reporting |

### Key Capabilities

1. **Job Approval Gate**  
   Agents cannot self-publish job postings. They submit for approval, and the super-agent approves or rejects them via `PUT /api/super-agent/approvals/[id]`.

2. **Team Data Aggregation**  
   All pages are scoped to agents in the super-agent's `agentIds[]` array. The API filters records using:
   ```
   WHERE agentId IN (superAgent.agentIds[])
   ```

3. **Commission Override**  
   Super-agents have their own `overrideRate` configurable via `POST /api/super-agent/profile`. This affects how their commissions are calculated relative to the agents they manage.

4. **Market Intelligence**  
   The `/super-agent/market` page provides AI-generated insights including:
   - Top in-demand job categories
   - Average salary ranges by role
   - Most sought-after nationalities
   - Visa processing trends
   - Sector growth patterns
   - Skills demand-supply gaps

### Messaging
Super-agent can DM any user without restriction (same as admin for messaging purposes).

---

## 3. Agent

### Purpose
Frontline recruiter and individual contributor. Manages their own book of business — employers, candidates, jobs, leads, and the full hiring pipeline.

### Data Model (`src/models/Agent.ts`)

```ts
{
  userId: ObjectId                   // linked User account
  superAgentId?: ObjectId            // the super-agent who manages them (optional)
  assignedEmployerIds: ObjectId[]    // their client employer accounts
  assignedJobSeekerIds: ObjectId[]   // their candidate pool
  commissionRate: number             // individual commission %
  performance: {
    leadsGenerated: number
    employersCreated: number
    vacanciesPosted: number
    jobSeekersSubmitted: number
    interviewsScheduled: number
    placementsCompleted: number
  }
  activityLog: IActivityLog[]        // per-action audit trail
}
```

### Permission Matrix

| Resource        | Actions                                 |
|-----------------|-----------------------------------------|
| `jobs`          | create, read, update, export *(no delete, no approve)* |
| `applications`  | read, update, export                    |
| `interviews`    | create, read, update                    |
| `placements`    | read                                    |
| `leads`         | create, read, update *(no delete)*      |
| `employers`     | create, read, update *(no delete)*      |
| `job_seekers`   | read, update                            |
| `notifications` | read                                    |
| `ai_cv`         | read                                    |
| `ai_match`      | read                                    |
| `ai_assistant`  | read                                    |

**Cannot access:** `commissions` (approve/delete), `users`, `audit_logs`, `cms`, `reports` (at platform level), `super_agents`.

### Agent Dashboard Pages (`/agent`)

| Section | Page | Path | Description |
|---|---|---|---|
| — | Dashboard | `/agent` | Personal KPIs: active jobs, applications, interview rate, offer rate |
| **Hiring** | Jobs | `/agent/jobs` | Create and manage job postings assigned to agent |
| | Jobs – New | `/agent/jobs/new` | Create new job posting form |
| | Candidates | `/agent/candidates` | Applications with status and AI match scores |
| | Job Seekers | `/agent/job-seekers` | Search and manage candidate profiles |
| | Interviews | `/agent/interviews` | Schedule/track video, in-person, phone interviews |
| | Placements | `/agent/placements` | Confirmed placements with salary tracking |
| **Tools** | Employers | `/agent/employers` | Manage assigned employer accounts |
| | Leads | `/agent/leads` | 6-stage lead pipeline (new → converted) |
| | Commissions | `/agent/commissions` | Read-only view of own commissions |
| | Reports | `/agent/reports` | AI-generated personal activity reports |
| — | Chat | `/agent/chat` | Multi-channel messaging (general, employers, leads, agents) |

### Key Capabilities

1. **Hiring Pipeline**  
   Owns the full candidate journey end-to-end:
   ```
   Post Job → Receive Applications → Shortlist Candidates
     → Schedule Interview → Track Outcome → Confirm Placement
   ```

2. **Lead Pipeline**  
   6-stage funnel for converting companies into employer clients:
   ```
   new → contacted → interested → negotiating → converted → lost
   ```

3. **AI Tools**  
   - `ai_cv` — parse and score CVs
   - `ai_match` — match candidates to jobs by AI score
   - `ai_assistant` — chat-based reporting with pre-built templates:
     - Weekly activity summary
     - Top conversion opportunities
     - Follow-up priority list
     - Monthly performance overview

4. **Commission Visibility**  
   Agents can view their commission status (pending / approved / paid) but **cannot approve their own commissions** — that power belongs to the super-agent or admin.

### Messaging
```
agent → employer     ✅ always
agent → job_seeker   ⚠️  conditional (only if a shared application exists)
agent → agent        ✅ (via general channel in Chat)
```

---

## Data Isolation Pattern

All shared API routes (`/api/jobs`, `/api/leads`, `/api/commissions`, `/api/placements`, etc.) use a single endpoint but apply role-based filters server-side:

| Role | Data Scope |
|---|---|
| `agent` | `WHERE agentId === me` |
| `super_agent` | `WHERE agentId IN (my agentIds[])` |
| `admin` | No filter — all records |

This is enforced via the `withAuth` wrapper which injects `ctx.role` and `ctx.userId` into every API handler:

```ts
// src/lib/auth/withAuth.ts
export function withAuth(handler, guard?) {
  return async (req, params) => {
    const session = await auth();
    // ... injects ctx.userId, ctx.role, ctx.locale
    if (guard) {
      const allowed = canAccess(role, guard.resource, guard.action, ...);
      if (!allowed) return 403;
    }
    return handler(req, ctx, params);
  };
}
```

---

## Permission Matrix Source

The canonical RBAC table lives in:

```
src/lib/permissions/matrix.ts
```

The `canAccess(role, resource, action)` function is called by `withAuth` on every protected API route and also supports **per-user custom permissions** when `permissionMode === "custom"`.

---

## Middleware Route Guard

`src/proxy.ts` (Next.js middleware) enforces role-to-path access before any page loads:

```ts
const ROLE_ROUTES = {
  admin:       ["/admin", "/super-agent", "/agent", "/employer", "/job-seeker"],
  super_agent: ["/super-agent"],
  agent:       ["/agent"],
  employer:    ["/employer"],
  job_seeker:  ["/job-seeker"],
};
```

If a `super_agent` tries to navigate to `/admin/users`, the middleware redirects them to their own dashboard before the page even renders.
