# Mployedin — Role Workflow Complete Report

> Generated: 2026-04-28  
> Purpose: Super Agent, Agent, Admin — Complete workflow, regional logic, and restrictions

---

## 1. Role Hierarchy

```
Admin (Platform Superuser)
 └── Super Agent (Regional Team Manager)
       └── Agent (Frontline Recruiter)
```

| Role | ആരാണ് | പ്രധാന ഉത്തരവാദിത്തം |
|------|--------|----------------------|
| **Admin** | Platform owner | എല്ലാ CRUD operations, User management, Impersonation, Audit logs |
| **Super Agent** | Regional team manager | Agent team management, Job approvals, Commission oversight, Team KPIs |
| **Agent** | Frontline recruiter | Lead generation, Employer/Job creation, Candidate management |

---

## 2. Admin — Complete Workflow

### 2.1 Admin-ന് ചെയ്യാൻ കഴിയുന്നത്

| Action | API Endpoint | Description |
|--------|-------------|-------------|
| **Super Agent Create** | `POST /api/admin/super-agents` | Super Agent user + profile create ചെയ്യുക |
| **Super Agent Update** | `PATCH /api/admin/super-agents` | Name, email, regions, agents, commission rate update ചെയ്യുക |
| **Super Agent List** | `GET /api/admin/super-agents` | എല്ലാ Super Agents list ചെയ്യുക (with agent count, regions) |
| **Agent Create** | `POST /api/admin/agents` | Agent user + profile create ചെയ്യുക, optional-ആയി Super Agent-ന് assign ചെയ്യുക |
| **Agent Update** | `PATCH /api/admin/agents` | Agent details, regions, super agent assignment update ചെയ്യുക |
| **Agent List** | `GET /api/admin/agents` | എല്ലാ Agents list ചെയ്യുക (with super agent name, regions) |
| **Territory Create** | `POST /api/admin/territories` | Territory (geographic group) create ചെയ്യുക, Super Agent-ന് assign ചെയ്യുക |
| **Territory List** | `GET /api/admin/territories` | Territories list ചെയ്യുക |
| **Location Data CRUD** | `/api/admin/location-data/*` | Countries, States, Cities — full CRUD |
| **User Impersonation** | - | ഏത് user-ആയും impersonate ചെയ്യാൻ കഴിയും |
| **Audit Logs** | `/api/admin/audit-logs` | System-wide activity logs view ചെയ്യുക |
| **CMS Management** | `/api/admin/cms` | Content management |
| **Job Attributes** | `/api/admin/job-attributes` | Job categories, industries, etc. manage ചെയ്യുക |

### 2.2 Super Agent Creation Flow (Admin)

```
Admin clicks "Create Super Agent"
    ↓
Fills form: name, email, password, overrideCommissionRate,
            assignedCityIds[], assignedStateIds[], agentIds[]
    ↓
POST /api/admin/super-agents
    ↓
├── Step 1: User.create({ role: "super_agent", ... })
├── Step 2: SuperAgent.create({ userId, overrideRate, regions, agentIds })
├── Step 3: Agent.updateMany → set superAgentId on all assigned agents
└── Step 4: logActivity("super_agent.create")
    ↓
✅ Super Agent created with regions and agents linked
```

### 2.3 Agent Creation Flow (Admin)

```
Admin clicks "Create Agent"
    ↓
Fills form: name, email, password, superAgentId?,
            commissionRate, assignedCityIds[], assignedStateIds[]
    ↓
POST /api/admin/agents
    ↓
├── Step 1: User.create({ role: "agent", ... })
├── Step 2: Agent.create({ userId, superAgentId, commissionRate, regions })
├── Step 3: IF superAgentId → SuperAgent.addToSet({ agentIds: agent._id })
├── Step 4: IF superAgentId → Notify super agent ("New team member joined")
└── Step 5: logActivity("agent.create")
    ↓
✅ Agent created, linked to Super Agent (optional), regions assigned
```

### 2.4 Region Allocation Flow (Admin)

```
Location Data Hierarchy:
    Country (e.g., UAE, Saudi Arabia)
        └── State (e.g., Dubai, Abu Dhabi)
              └── City (e.g., Deira, JBR, Al Ain)

Admin creates location data:
    POST /api/admin/location-data/countries  → Country create
    POST /api/admin/location-data/states     → State create (under Country)
    POST /api/admin/location-data/cities     → City create (under State)

Admin assigns regions:
    When creating/updating Agent:
        assignedCityIds: [cityId1, cityId2]
        assignedStateIds: [stateId1]

    When creating/updating Super Agent:
        assignedCityIds: [cityId1, cityId2, cityId3]
        assignedStateIds: [stateId1, stateId2]
```

---

## 3. Super Agent — Complete Workflow

### 3.1 Super Agent-ന്റെ Complete API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/super-agent/dashboard` | GET | Team KPIs — placements, leads, commissions |
| `/api/super-agent/agents` | GET | Managed agents list (with performance metrics) |
| `/api/super-agent/agents/[id]` | GET | Agent detail — leads, referrals, activity log |
| `/api/super-agent/approvals` | GET | Pending job approvals list |
| `/api/super-agent/approvals/[id]` | PATCH | Job approve/reject ചെയ്യുക |
| `/api/super-agent/approvals/count` | GET | Pending approval count (cached 30s) |
| `/api/super-agent/leads` | GET | Team-wide lead pipeline |
| `/api/super-agent/jobs` | GET | Team job postings |
| `/api/super-agent/job-seekers` | GET | Candidate pool |
| `/api/super-agent/interviews` | GET | Team interviews |
| `/api/super-agent/applications` | GET | Team applications |
| `/api/super-agent/reports` | GET | Aggregated team statistics & commission reports |
| `/api/super-agent/commissions` | - | Commission tracking & approval |
| `/api/super-agent/territory` | GET | Assigned regions breakdown (agents/employers/jobs per region) |
| `/api/super-agent/profile` | GET/PATCH | Profile view/update, overrideRate set ചെയ്യുക |
| `/api/super-agent/settings` | GET/PATCH | Settings management |
| `/api/super-agent/avatar` | POST/DELETE | Profile avatar |
| `/api/super-agent/insights` | GET | AI-powered market intelligence |
| `/api/super-agent/insights/feedback` | POST | Insights feedback |
| `/api/super-agent/actions/send-reminder` | POST | Send reminders to agents |

### 3.2 Super Agent CAN DO

| Action | Details |
|--------|---------|
| ✅ **View all team agents** | Performance metrics, leads count, conversion rate, response time |
| ✅ **View agent details** | Leads, referral links, activity log, statistics |
| ✅ **Approve/Reject jobs** | Agents submit jobs → Super Agent approves/rejects |
| ✅ **View team leads** | Full lead pipeline across all managed agents |
| ✅ **View team data** | Jobs, applications, interviews, placements, job seekers |
| ✅ **Approve commissions** | Commission approval workflow |
| ✅ **Set commission override** | `overrideRate` percentage set ചെയ്യാം |
| ✅ **View territory stats** | Region-wise agent count, employer count, job count, seeker count |
| ✅ **AI Market Insights** | Salary trends, nationality insights, visa trends, sector growth |
| ✅ **Create leads** | Lead generation from super agent level |
| ✅ **Create employers** | Can create new employer accounts |
| ✅ **Export data** | Jobs, applications, placements, leads, commissions, reports |

### 3.3 Super Agent CANNOT DO

| Action | Details |
|--------|---------|
| ❌ **Create agents** | Admin-only — Super Agent-ന് agent create ചെയ്യാൻ കഴിയില്ല |
| ❌ **Delete agents** | No delete permission |
| ❌ **Remove agents from team** | Admin must reassign |
| ❌ **Access audit logs** | Admin-only |
| ❌ **Manage CMS** | Admin-only |
| ❌ **Manage location data** | Admin-only (countries/states/cities) |
| ❌ **Manage job attributes** | Admin-only |
| ❌ **Impersonate users** | Admin-only |
| ❌ **Manage contact submissions** | Admin-only |
| ❌ **Delete commissions** | Can only approve, not delete |

### 3.4 Super Agent Team Data Flow

```
Super Agent Dashboard Load:
    ↓
GET /api/super-agent/dashboard
    ↓
├── Fetch SuperAgent profile (get agentIds[])
├── Query WHERE agentId IN (superAgent.agentIds[])
│   ├── Count active jobs
│   ├── Count total applications
│   ├── Count scheduled interviews
│   ├── Count placements
│   ├── Count leads
│   └── Sum pending commissions
└── Return aggregated KPIs
```

### 3.5 Job Approval Workflow

```
Agent submits a job posting:
    Job.status = "pending_approval"
        ↓
Super Agent sees it in:
    GET /api/super-agent/approvals
        ↓
Super Agent reviews and:
    PATCH /api/super-agent/approvals/[id]
        ↓
    ├── { action: "approve" } → Job.status = "active"
    └── { action: "reject", reason: "..." } → Job.status = "rejected"
```

---

## 4. Agent — Complete Workflow

### 4.1 Agent API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agent/dashboard` | GET | Personal metrics — active jobs, applications, interviews, placements, leads, commissions, offers |
| `/api/agent/profile` | GET/PATCH | Profile view/update (name, phone) |
| `/api/agent/settings` | GET/PATCH | Settings |
| `/api/agent/tasks` | GET | Task list |
| `/api/agent/avatar` | POST/DELETE | Avatar |

### 4.2 Agent CAN DO

| Action | Details |
|--------|---------|
| ✅ **Create jobs** | Jobs create ചെയ്യാം (status: pending_approval) |
| ✅ **Update jobs** | Own jobs update ചെയ്യാം |
| ✅ **Create leads** | Lead generation |
| ✅ **Update leads** | Lead status update |
| ✅ **Create employers** | New employer accounts |
| ✅ **Update employers** | Employer details update |
| ✅ **Create interviews** | Interview schedule ചെയ്യാം |
| ✅ **View applications** | Applications view + update ചെയ്യാം |
| ✅ **View job seekers** | Candidate pool access |
| ✅ **AI tools** | CV analysis, matching, AI assistant |
| ✅ **Subscriptions** | Create and view subscriptions |

### 4.3 Agent CANNOT DO

| Action | Details |
|--------|---------|
| ❌ **Approve jobs** | Super Agent must approve |
| ❌ **Delete jobs** | No delete permission |
| ❌ **Delete leads** | No delete permission |
| ❌ **View commissions** | No commission access |
| ❌ **Export reports** | No report/export access |
| ❌ **Manage agents** | Cannot manage other agents |
| ❌ **Access outside region** | Region-restricted (403 error) |

---

## 5. Regional Restrictions — CRITICAL FINDINGS

### 5.1 Agent Regional Restrictions (ENFORCED ✅)

**File:** `src/lib/auth/agentRestrictions.ts`

Agent-ന് strict regional enforcement ഉണ്ട്:

```
Agent Request → requireAgentRegionAccess() middleware
    ↓
├── Get agent's assignedCityIds[] and assignedStateIds[]
├── Check resource's cityId/stateId matches agent's regions
├── IF match → ✅ Access allowed
├── IF agent is directly assigned (agentId match) → ✅ Access allowed
└── IF no match → ❌ 403 Forbidden
```

**MongoDB Filter (buildAgentRegionFilter):**
```javascript
{
  $or: [
    { agentId: agentUserId },              // directly assigned
    { cityId: { $in: assignedCityIds } },   // city match
    { stateId: { $in: assignedStateIds } }  // state match
  ]
}
```

**Supported resource types:**
- `employer` — cityId/stateId check
- `lead` — cityId/stateId check
- `application` — always allowed if agent is assigned

### 5.2 Super Agent Regional Restrictions (NOT ENFORCED ⚠️)

**Current State:**
- Super Agent-ന് `assignedCityIds[]` ഉം `assignedStateIds[]` ഉം model-ൽ ഉണ്ട്
- **പക്ഷേ ഇത് enforce ചെയ്യുന്നില്ല** — informational/reporting purpose മാത്രം
- `agentRestrictions.ts` ൽ: `if (ctx.role !== "agent") return null;` — Super Agent-നെ skip ചെയ്യുന്നു
- Super Agent can see ALL data from ALL their managed agents regardless of region
- Data scoping is by `agentIds[]` (team-based), NOT region-based

**What this means:**
- ഒരു Super Agent-ന് Dubai region assign ചെയ്തിട്ടുണ്ടെങ്കിലും, Abu Dhabi-ലുള്ള agent-ന്റെ data view ചെയ്യാൻ കഴിയും (if that agent is in their agentIds[])
- Territory data is purely for reporting/dashboard visualization
- No server-side enforcement prevents cross-region access for Super Agents

### 5.3 Admin Regional Restrictions (NONE — by design)

- Admin-ന് ഒരു regional restriction-ഉം ഇല്ല
- Full platform access across all regions

---

## 6. Data Models — Relationship Diagram

```
┌──────────────┐       ┌──────────────────┐       ┌──────────────┐
│    Country    │◄──────│      State       │◄──────│     City     │
│  (UAE, SA)   │  1:N  │  (Dubai, Riyadh) │  1:N  │ (Deira, JBR) │
└──────────────┘       └──────────────────┘       └──────────────┘
                              ▲                          ▲
                              │                          │
                     assignedStateIds[]          assignedCityIds[]
                              │                          │
┌──────────────┐       ┌──────────────────┐
│  Territory   │       │   Super Agent    │
│  (metadata)  │───────│                  │
│ superAgentId │       │  agentIds[]      │──────────────┐
└──────────────┘       │  assignedCityIds │              │
                       │  assignedStateIds│              │
                       │  overrideRate    │              │
                       │  commissions{}   │              │
                       └──────────────────┘              │
                                                         │ 1:N
                                                         ▼
                                                  ┌──────────────────┐
                                                  │      Agent       │
                                                  │                  │
                                                  │  superAgentId    │
                                                  │  assignedCityIds │
                                                  │  assignedStateIds│
                                                  │  assignedEmployer│
                                                  │  assignedJobSeek │
                                                  │  performance{}   │
                                                  │  commissionRate  │
                                                  └──────────────────┘
                                                         │
                                              ┌──────────┼──────────┐
                                              ▼          ▼          ▼
                                         ┌────────┐ ┌────────┐ ┌────────┐
                                         │  Lead  │ │Employer│ │  Job   │
                                         └────────┘ └────────┘ └────────┘
```

---

## 7. Permission Matrix — Side by Side

| Resource | Admin | Super Agent | Agent |
|----------|-------|-------------|-------|
| `jobs` | CRUD + approve + export | read + approve + export | create + read + update + export |
| `applications` | CRUD + export | read + export | read + update + export |
| `interviews` | CRUD | read | create + read + update |
| `placements` | CRUD + export | read + export | read |
| `leads` | CRUD + export | CRUD + export | create + read + update |
| `commissions` | CRUD + approve + export | read + approve + export | — |
| `employers` | CRUD + approve | create + read | create + read + update |
| `agents` | CRUD | create + read + update | — |
| `job_seekers` | CRUD | read | read + update |
| `super_agents` | CRUD | — | — |
| `users` | CRUD + impersonate | — | — |
| `notifications` | CRUD | read | read |
| `reports` | read + export | read + export | — |
| `audit_logs` | read + export | — | — |
| `ai_cv` | read | — | read |
| `ai_match` | read | — | read |
| `ai_assistant` | read | read | read |
| `tasks` | read + update | — | — |
| `job_attributes` | CRUD | — | — |
| `location_data` | CRUD | — | — |
| `cms` | CRUD | — | — |
| `contact_submissions` | read + update + delete | — | — |
| `offers` | CRUD | — | — |
| `subscriptions` | CRUD + export | create + read + update | create + read |

---

## 8. Auto-Assignment Logic

**File:** `src/lib/agents/autoAssign.ts`

Agent auto-assignment scoring (when a new job needs an agent):

| Factor | Max Points | Logic |
|--------|-----------|-------|
| **Workload** | 40 | Fewer active jobs = higher score. `40 - (activeJobs × 5)` |
| **Performance** | 40 | Placement rate = `placementsCompleted / jobSeekersSubmitted × 40` |
| **Geographic** | 20 | More assigned cities = higher score. `min(20, cityCount × 5)` |
| **Total** | 100 | Highest score wins assignment |

---

## 9. Key Issues & Gaps Identified

### 🔴 Critical: Super Agent Regional Enforcement Missing

**Problem:** Super Agent-ന്റെ `assignedCityIds[]` ഉം `assignedStateIds[]` ഉം model-ൽ store ചെയ്യുന്നുണ്ട്, but server-side enforcement ഇല്ല.

**Current behavior:**
- Super Agent-ന് ANY agent in their `agentIds[]` view ചെയ്യാം, regardless of region
- Territory data is informational only

**Should be decided:**
1. Super Agent CAN see all their agents' data regardless of region? (current behavior)
2. OR Super Agent should ONLY see data within their assigned regions?

### 🟡 Agent Creation by Super Agent

**Current:** Super Agent-ന് agent create ചെയ്യാൻ permission matrix-ൽ `agents: ["create", "read", "update"]` ഉണ്ട്, **BUT** actual API endpoint (`POST /api/admin/agents`) admin-only ആണ്.

**Gap:** Permission says "create" is allowed, but no Super Agent-specific route exists for agent creation.

### 🟡 Territory Model — Loosely Integrated

**Current:** Territory is a separate model with `superAgentId`, but actual region enforcement uses `assignedCityIds[]` and `assignedStateIds[]` directly on SuperAgent/Agent models.

**Question:** Territory model actually used anywhere beyond admin listing?

---

## 10. Recommended Changes (for your review)

| # | Change | Priority | Impact |
|---|--------|----------|--------|
| 1 | Super Agent regional enforcement decide ചെയ്യുക (enforce or keep open) | 🔴 High | Security/Access control |
| 2 | Super Agent agent creation endpoint add ചെയ്യുക (`POST /api/super-agent/agents`) | 🟡 Medium | Workflow improvement |
| 3 | Territory model integration strengthen ചെയ്യുക OR remove ചെയ്യുക | 🟢 Low | Code clarity |
| 4 | Agent-ന്റെ region restrict ചെയ്യുമ്പോൾ, Super Agent-ന്റെ region subset ആണോ validate ചെയ്യുക | 🟡 Medium | Data integrity |
| 5 | Super Agent → Agent creation-ൽ, agent-ന്റെ regions super agent-ന്റെ regions-ന്റെ subset ആയിരിക്കണം validate ചെയ്യുക | 🟡 Medium | Business logic |

---

*ഈ report-ൽ changes വേണമെന്നുണ്ടെങ്കിൽ, specific items mention ചെയ്യുക — implement ചെയ്യാം.*
