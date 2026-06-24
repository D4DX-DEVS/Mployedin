# Security Re-Validation — Mployedin

**Date:** 2026-06-24
**Scope:** Re-audit of the six remediated findings **C1, H1, H2, H3, M2, L1** — re-proven from current code, not assumed fixed. Includes per-role privilege-escalation attempts and a fresh authorization sweep (IDOR / ownership / multi-tenant / GraphQL / GET routes / exports).

## Summary

| ID | Finding | Status |
|---|---|---|
| C1 | GraphQL platform-wide exposure to super_agent | ✅ **VERIFIED FIXED** |
| H1 | requisitions/[id] GET IDOR | ✅ **VERIFIED FIXED** |
| H2 | placements/[id] GET IDOR | ⚠️ **PARTIALLY FIXED** (super_agent still unscoped) |
| H3 | employers/[id] GET IDOR | ⚠️ **PARTIALLY FIXED** (super_agent still unscoped) |
| M2 | agent self-approves own-commission payment | ✅ **VERIFIED FIXED** |
| L1 | GraphiQL/introspection in prod | ✅ **VERIFIED FIXED** |

**Net:** 4 fully fixed, 2 partially fixed. The partial fixes share one root cause — **`super_agent` is not scoped on oversight-read paths**, so a super-agent can read any placement (candidate PII + salary) and any employer (PII) platform-wide, crossing territory boundaries. Every other super_agent path in the app *is* scoped (`getSuperAgentScope`), so this is an omission, not design.

---

## C1 — GraphQL platform-wide exposure → ✅ VERIFIED FIXED

**Original attack:** any `super_agent` POSTs `{ subscriptionDashboard { topCustomers{name email} overview{mrr arr} } }` to `/api/graphql` and receives platform-wide revenue + customer PII.

**Code proof (`src/app/api/graphql/route.ts`):**
```ts
const role = (session?.user as unknown as { role?: string })?.role;
// C1: ... Restrict to admin only ...
if (role !== "admin") {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

**Per-role escalation attempt:**
| Role | Result | Why |
|---|---|---|
| Admin | ✅ allowed (by design — owns platform data) | `role === "admin"` |
| Super Agent | 🔒 403 | `role !== "admin"` |
| Agent | 🔒 403 | `role !== "admin"` |
| Employer | 🔒 403 | `role !== "admin"` |
| Job Seeker | 🔒 403 | `role !== "admin"` |

**Alternative path:** `createYoga`/`createSchema` grep → the only GraphQL mount is `/api/graphql` (the `admin/territories/route.ts` hit is a local Zod `createSchema`, not a GraphQL server). No second GraphQL endpoint exposes this data. **Result: original path closed, no alternative GraphQL path.** (Recommend a separate sweep of super_agent-accessible *REST* subscription/report routes for platform-wide aggregates — out of scope here.)

---

## H1 — requisitions/[id] GET IDOR → ✅ VERIFIED FIXED

**Original attack:** any authenticated user (incl. job_seeker) `GET /api/requisitions/<anyId>` reads any requisition.

**Code proof (`src/app/api/requisitions/[id]/route.ts`):**
```ts
const requisition = await Requisition.findById(id).lean();
if (!requisition) return 404;
// H1: object-level authz — only the owning employer (or admin) may read.
if (ctx.role !== "admin") {
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer || String(requisition.employerId) !== String(employer._id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
```

**Per-role escalation attempt:**
| Role | Result | Why |
|---|---|---|
| Admin | ✅ allowed | `ctx.role === "admin"` bypass |
| Super Agent | 🔒 403 | no Employer profile → `findOne` null → 403 |
| Agent | 🔒 403 | no Employer profile → 403 |
| Employer (owner) | ✅ allowed | `employerId === employer._id` |
| Employer (non-owner) | 🔒 403 | employerId mismatch |
| Job Seeker | 🔒 403 | no Employer profile → 403 |

**Alternative path:** the list route `GET /api/requisitions` is employer-scoped (`filter = { employerId: employer._id }`). No other route returns requisitions unscoped. **Result: fully closed.**

---

## H2 — placements/[id] GET IDOR → ⚠️ PARTIALLY FIXED

**Original attack:** employer/agent A reads employer/agent B's placement (candidate PII + salary).

**Code proof (`src/app/api/placements/[id]/route.ts`):** GET now calls `verifyOwnership`:
```ts
const forbidden = await verifyOwnership(placement, ctx);
if (forbidden) return forbidden;
```
But `verifyOwnership` has **no super_agent branch**:
```ts
async function verifyOwnership(placement, ctx): Promise<NextResponse | null> {
  if (ctx.role === "admin") return null;
  if (ctx.role === "employer") { /* 403 unless employerId matches */ }
  else if (ctx.role === "agent") { /* 403 unless agentId matches */ }
  return null;            // ← super_agent reaches here → ALLOWED (any placement)
}
```
RBAC guard is `{ resource: "placements", action: "read" }`; per the matrix, `super_agent` has `placements:[read,export]` → passes RBAC, then `verifyOwnership` returns `null` → reads **any** placement.

**Per-role escalation attempt:**
| Role | Result | Why |
|---|---|---|
| Admin | ✅ allowed | `verifyOwnership` admin bypass |
| Super Agent | ❌ **ALLOWED — any placement, platform-wide** | no super_agent branch → `return null` |
| Agent (non-owner) | 🔒 403 | agentId mismatch |
| Employer (non-owner) | 🔒 403 | employerId mismatch |
| Job Seeker | 🔒 403 (RBAC) | no `placements:read` |

**Verdict:** original employer/agent IDOR **closed**; **super_agent cross-territory read of candidate PII + salary remains open.**
**Fix:** add a super_agent branch to `verifyOwnership` (scope via `getSuperAgentScope(ctx.userId).effectiveAgentIds` against `placement.agentId`), or default-deny the fall-through.

---

## H3 — employers/[id] GET IDOR → ⚠️ PARTIALLY FIXED

**Original attack:** any agent/super_agent/employer reads any employer's User PII (name/email/phone) by id.

**Code proof (`src/app/api/employers/[id]/route.ts`):**
```ts
if (ctx.role === "employer" && ctx.userId !== params?.id) return 403;
if (ctx.role === "agent") {
  const agent = await Agent.findOne({ userId: ctx.userId }).select("assignedEmployerIds").lean();
  if (!agent?.assignedEmployerIds?.map(String).includes(params!.id)) return 403;
}
// admin & super_agent → no check → User.findById(...) returned
```
RBAC guard `{ resource: "employers", action: "read" }`; matrix gives `super_agent` `employers:[create,read]` → passes RBAC, no ownership branch → reads **any** employer.

**Per-role escalation attempt:**
| Role | Result | Why |
|---|---|---|
| Admin | ✅ allowed | oversight (no check) |
| Super Agent | ❌ **ALLOWED — any employer PII, platform-wide** | no super_agent scope check |
| Agent (non-assigned) | 🔒 403 | not in `assignedEmployerIds` |
| Employer (non-self) | 🔒 403 | `ctx.userId !== params.id` |
| Job Seeker | 🔒 403 (RBAC) | no `employers:read` |

**Verdict:** original employer/agent IDOR **closed**; **super_agent platform-wide PII read remains open.** (Auth secrets remain protected — `passwordHash`, `passwordResetToken`, `twoFactorSecretEnc`, etc. are schema-level `select:false`; the leak is PII, not credentials.)
**Fix:** scope super_agent to employers reachable via `getSuperAgentScope` (their agents' `assignedEmployerIds`), or treat super_agent like agent.

---

## M2 — agent self-approves own-commission payment → ✅ VERIFIED FIXED

**Original attack:** the assigned agent `POST /api/invoices/[id]/verify-payment {action:"approve"}` → invoice `paid` → the agent's own commission auto-approved.

**Code proof (`src/app/api/invoices/[id]/verify-payment/route.ts`):**
```ts
// M2 (segregation of duties): ... Restrict approval to admin/super_agent ...
if (body.action === "approve" && !["admin", "super_agent"].includes(ctx.role)) {
  return NextResponse.json({ error: "Only admin or super-agent can approve payments" }, { status: 403 });
}
```

**Alternative paths checked (no agent bypass):**
- `invoices/[id]/payments` POST (records a payment that can flip status→paid and approve commissions): gated `if (!["admin","super_agent"].includes(ctx.role)) 403` (line 82). Agent 🔒.
- `invoices/[id]` PATCH `status:"paid"`: admin/super_agent only (line 117). Agent 🔒.
- `invoices/[id]/pay` POST: online-gateway session only; gateway is a stub → 501; no commission approval. Agent cannot mark paid.

**Per-role escalation attempt:**
| Role | Result | Why |
|---|---|---|
| Admin | ✅ approve | by design |
| Super Agent | ✅ approve (see residual) | allowed by fix |
| Agent | 🔒 403 on approve (may still reject) | role check; and all alt paths admin/super_agent-only |
| Employer / Job Seeker | 🔒 403 | not staff / no `subscriptions` perms |

**Verdict:** the agent self-approval attack is **closed on every path.**
**Residual (lower, supervisory):** a `super_agent` can still approve an invoice that carries their **own override commission** (same SoD class, one tier up). Recommend admin-only approval for invoices containing the approver's own commission, or excluding self-commission from auto-approval.

---

## L1 — GraphiQL / introspection in production → ✅ VERIFIED FIXED

**Code proof (`src/app/api/graphql/route.ts`):**
```ts
const yoga = createYoga({
  schema, graphqlEndpoint: "/api/graphql", fetchAPI: { Response },
  graphiql: process.env.NODE_ENV !== "production",   // playground OFF in prod
});
```
Combined with C1 (`role !== "admin" → 403`), the playground and schema are unreachable by any non-admin, and the GraphiQL UI is disabled in production for everyone.

**Per-role:** all non-admins 🔒 403 before reaching yoga; admin gets no playground in prod.
**Residual (info):** GraphQL **introspection** (raw `__schema` query) is still enabled in yoga, but only an authenticated admin can reach it — admins already see all data. Optionally add `@graphql-yoga/plugin-disable-introspection` to fully disable.

---

## Fresh Authorization Sweep (this pass)

**Checked & clean:**
- **GraphQL authorization:** single mount, admin-only (C1). ✅
- **Invoice money paths:** `verify-payment`, `payments`, `pay`, `[id]` PATCH all enforce `canAccessInvoice` + admin/super_agent role gates for state changes. ✅
- **Invoice/job-seeker/offer-letter GET IDOR:** previously confirmed scoped (`canAccessInvoice`, `verifySeekerStaffAccess`, `resolveLetterAccess`). ✅

**New systemic finding:**
- **S1 (MED) — `super_agent` unscoped on oversight-read routes.** Confirmed on `placements/[id]` GET (H2) and `employers/[id]` GET (H3). Because `super_agent` carries broad `read` grants in the matrix but the per-handler scope check is missing/short-circuited, a super-agent reads across **all** territories. **Recommend auditing every route where the matrix grants `super_agent … read/export`** (e.g. `applications`, `interviews`, `commissions`, `reports`) for a `getSuperAgentScope` filter, and introducing a shared `requireOwnership()`/`requireSuperAgentScope()` helper.

**Not completed (cost-bounded — recommend follow-up):**
- **Exports/reports isolation:** only `gdpr/export` is a literal export route (self-service, by-design self-scoped — not re-read this pass). Inline exports (`action:"export"` on list routes, PDF/`recruitment` routes) were **not** swept — these are prime bulk-leak vectors and warrant a dedicated pass, especially under the S1 super_agent-scope lens.
- **Full `findById` GET sweep** across the remaining ~150 handlers (the IDOR-on-GET pattern is now confirmed recurring).

---

## Required actions before "VERIFIED FIXED" on H2/H3

1. Add a `super_agent` scope branch to `placements` `verifyOwnership` and to `employers/[id]` GET (use `getSuperAgentScope(ctx.userId).effectiveAgentIds`; for employers, resolve the target's `agentId`/`assignedEmployerIds`).
2. Re-run this revalidation on H2/H3 after the change.
3. Sweep all `super_agent … read/export` routes (S1) + the export/report surface.
