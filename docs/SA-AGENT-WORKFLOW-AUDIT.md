# Super Agent → Agent Workflow & Region Assignment Audit

> Generated: 2026-04-28
> Scope: Backend APIs + Frontend pages + Region assignment flow

## Executive Summary

The SA→Agent workflow is **functionally solid** with proper RBAC, region subset validation, and dual-scoping (team + region). However, there are **8 gaps** ranging from missing update endpoints to region enforcement inconsistencies.

---

## 1. Complete API Endpoint Map

### Super Agent Endpoints (`/api/super-agent/`)

| Method | Path | Purpose | Auth Guard |
|--------|------|---------|------------|
| GET | `/agents` | List managed agents + performance metrics | `agents:read` |
| POST | `/agents` | Create new agent (user + profile + region) | `agents:create` |
| GET | `/agents/[id]` | Agent detail: leads, referrals, activity | `agents:read` |
| GET | `/approvals` | List pending job approvals | `jobs:read` |
| PATCH | `/approvals/[id]` | Approve/reject agent's job | `jobs:approve` |
| GET | `/approvals/count` | Pending approval count (cached 30s) | `jobs:read` |
| GET | `/leads` | Team-wide lead pipeline | `leads:read` |
| GET | `/jobs` | Team jobs with status filter | `jobs:read` |
| GET | `/territory` | Regional breakdown (agents/employers/jobs per city) | `agents:read` |
| POST | `/actions/send-reminder` | Send performance reminders | `agents:update` |
| POST | `/actions/assign-leads` | Reassign unworked leads between agents | `leads:update` |
| GET/PATCH | `/profile` | SA profile + commission override rate | - |
| GET | `/dashboard` | KPIs: placements, leads, commissions | - |

### Admin Endpoints (for SA/Agent management)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/admin/agents` | Create agent, optionally assign SA |
| PATCH | `/admin/agents` | Update agent regions/SA assignment |
| POST | `/admin/super-agents` | Create SA with regions |
| PATCH | `/admin/super-agents` | Update SA regions/agents |
| POST | `/admin/territories` | Create territory, sync to SA |

---

## 2. Database Schema Summary

### Agent Model
```
userId           → User (unique)
superAgentId?    → SuperAgent
referralCode     → string (unique)
assignedCityIds  → City[] (region restrictions)
assignedStateIds → State[] (region restrictions)
assignedEmployerIds → Employer[]
commissionRate?  → number (0-100)
performance      → { leadsGenerated, employersCreated, vacanciesPosted, ... }
activityLog      → [{ action, targetId, targetType, meta, timestamp }]
```

### SuperAgent Model
```
userId           → User (unique)
referralCode     → string (unique)
agentIds         → Agent[] (managed team)
assignedCityIds  → City[] (own territory)
assignedStateIds → State[] (own territory)
commissions      → { total, pending, paid }
overrideRate?    → number (commission override %)
```

### Territory Model
```
name             → string
countries        → string[]
superAgentId?    → SuperAgent
cityIds          → City[]
stateIds         → State[]
```

### Location Hierarchy
```
Country (20 countries: IN, AE, SA, GB, US, ...)
  └── State (e.g., Maharashtra, Dubai)
        └── City (e.g., Mumbai, Deira) — ~62K total
```

---

## 3. Full Workflow: SA Creates Agent

### Backend Flow (`POST /api/super-agent/agents`)

```
1. withAuth() → verify JWT, check role === "super_agent"
2. Zod validate: { name, email, password, commissionRate?, assignedCityIds?, assignedStateIds? }
3. getSuperAgentOwnRegion(ctx.userId) → SA's own cities/states
4. isRegionSubset(agentRegion, saRegion) → REJECT if agent outside SA territory
5. User.findOne({ email }) → REJECT 409 if duplicate
6. bcrypt.hash(password, 12) → Create User(role: "agent", isActive: true)
7. Create Agent(userId, superAgentId, commissionRate, assignedCityIds, assignedStateIds)
8. SuperAgent.updateOne({ $addToSet: { agentIds: agent._id } })
9. logActivity("agent.create", meta)
10. Return 201 { success, userId, agentId }
```

### Frontend Flow

```
1. SA navigates to /super-agent/agents
2. Clicks "Add Agent" → opens modal dialog
3. Fills form:
   - Full Name (required, 1-100 chars)
   - Email (required, unique)
   - Password (required, min 8 chars)
   - Commission Rate % (optional, 0-100)
   - Region: CascadingLocationPicker (Country → State → City)
4. Region picker validates: selected cities/states ⊆ SA's territory
5. POST /api/super-agent/agents with form data
6. On success: agent appears in list
```

---

## 4. Region Assignment Flow

### How Regions Cascade: Admin → SA → Agent

```
Admin assigns SA regions (no validation):
  PATCH /api/admin/super-agents → sets SA.assignedCityIds, SA.assignedStateIds

SA creates agent with subset of own regions (validated):
  POST /api/super-agent/agents → isRegionSubset(agent, SA) ✅

Admin creates/updates agent (validated against SA):
  PATCH /api/admin/agents → isRegionSubset(agent, SA) ✅
```

### Dual-Scoping: How SA Sees Agents

`getSuperAgentScope()` returns agents from TWO sources:
1. **Team-based:** agents in `SA.agentIds[]` (explicitly assigned)
2. **Region-based:** ANY agent whose cities/states overlap with SA's regions

Combined into `effectiveAgentIds` for all data queries.

### Region Enforcement on Resources

| Role | Function Used | Enforced? |
|------|--------------|-----------|
| Agent | `getAgentRegion()` | ✅ Strict — 403 if outside region |
| Super Agent | `getSuperAgentRegion()` | ✅ Uses effective region (own + agents') |
| Admin | Bypassed | ✅ Full access |

---

## 5. Frontend Pages

| Route | Type | Purpose |
|-------|------|---------|
| `/super-agent` | Server | Dashboard KPIs, quick actions, AI insights |
| `/super-agent/agents` | Client | Agent list, filtering, create dialog |
| `/super-agent/agents/[id]` | Client | Agent detail: profile, leads, referrals, activity |
| `/super-agent/territory` | Client | Region heatmap: cards by coverage density |

### Key Components
- **CascadingLocationPicker** — Country → State → City cascading selector with search
- **InsightsPanel** — AI-powered performance alerts with actionable buttons
- **WorkspacePage** — Layout system (hero, metrics grid, sections, empty states)

---

## 6. Issues Found

### CRITICAL (Functionality Gaps)

| # | Issue | Impact | Location |
|---|-------|--------|----------|
| 1 | **No SA endpoint to update agent regions** | SA can only set regions at creation. To change agent territory, must ask admin. | Missing `PATCH /api/super-agent/agents/[id]` |
| 2 | **No SA endpoint to update own regions** | SA cannot expand/contract their own territory. Only admin can. | `PATCH /api/super-agent/profile` only allows name/phone/overrideRate |
| 3 | **Territory model drift** | `POST /api/admin/territories` pushes to SA via `$addToSet`, but Territory model is never read by SA endpoints. SA territory API rebuilds from SuperAgent document. | `src/models/Territory.ts` vs `GET /api/super-agent/territory` |

### HIGH (Logic Issues)

| # | Issue | Impact | Location |
|---|-------|--------|----------|
| 4 | **Region-based scope leakage** | `getSuperAgentScope()` includes ANY agent with overlapping regions, even if not in `agentIds[]`. SA-1 and SA-2 with overlapping cities will see each other's agents. | `src/lib/auth/agentRestrictions.ts` L120-140 |
| 5 | **No region conflict detection** | Admin can assign same city to multiple SAs without warning. No uniqueness constraint. | `PATCH /api/admin/super-agents` |
| 6 | **State ≠ all cities in state** | Assigning a state doesn't auto-cover its cities. If agent has stateId but resource has cityId (within that state), no match occurs. Must assign cities explicitly. | `isRegionSubset()` + `canAccessResource()` |

### MEDIUM (Missing Features)

| # | Issue | Impact | Location |
|---|-------|--------|----------|
| 7 | **Agent detail page is read-only** | SA cannot edit agent commission, working hours, or deactivate from UI. | `src/app/[locale]/(dashboard)/super-agent/agents/[id]/page.tsx` |
| 8 | **Lead reassignment uses userId not agentDocId** | `assign-leads` endpoint takes `fromAgentUserId`/`toAgentUserId` but `Lead.agentId` references Agent document `_id`. Potential mismatch. | `src/app/api/super-agent/actions/assign-leads/route.ts` |

### LOW (UX Gaps)

| # | Issue | Impact |
|---|-------|--------|
| 9 | No bulk agent creation (CSV import) | Slow onboarding for large teams |
| 10 | No agent deletion from SA level | Must ask admin |
| 11 | No performance charts/visualizations | Only raw numbers shown |
| 12 | Territory page shows static cards, not interactive map | Limited geographic insight |

---

## 7. Permission Matrix

### Super Agent Permissions
```
agents:        create, read, update     (NO delete)
jobs:          read, approve, export    (NO create, NO delete)
leads:         create, read, update, delete, export
employers:     create, read
commissions:   read, approve, export
subscriptions: create, read, update
```

### Agent Permissions
```
jobs:          create, read, update, export  (NO delete, NO approve)
leads:         create, read, update          (NO delete)
employers:     create, read, update
```

---

## 8. Recommendations

### Priority 1 — Fix Now
1. **Add `PATCH /api/super-agent/agents/[id]`** for SA to update agent regions, commission, working hours (with subset validation)
2. **Fix region-based scope leakage** — only include region-based agents if they don't belong to another SA's `agentIds[]`
3. **Verify lead reassignment ID mapping** — ensure `assign-leads` correctly maps userId → Agent._id before querying leads

### Priority 2 — Next Sprint
4. **Add region conflict warning** in admin panel when assigning overlapping territories
5. **Implement state→cities hierarchy** in region checks (assigning a state should auto-cover all its cities)
6. **Add agent edit mode** in detail page (commission, working hours, deactivation toggle)

### Priority 3 — Backlog
7. Deprecate or properly integrate Territory model
8. Add bulk agent creation endpoint
9. Add interactive territory map (Leaflet/Mapbox)
10. Add performance trend charts
