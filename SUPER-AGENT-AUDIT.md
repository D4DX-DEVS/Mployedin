# SUPER AGENT — FULL LIFECYCLE AUDIT

**Platform:** Mployedin — AI-Powered International Recruitment
**Audit perspective:** Super Agent (Regional Team Manager)
**Audit account:** `superagent@mployedin.com`
**Environment:** `http://localhost:3000` (dev / Turbopack)
**Method:** Live Playwright-driven operation of every accessible Super Agent page, modal, API and workflow. Real records created with `AUDIT`-prefixed data.
**Date:** 2026-06-15
**Auditor role assumed:** Senior Recruitment Operations Director / Regional Recruitment Manager / Franchise Head

---

## 1. Executive Summary

The Super Agent workspace is **visually polished, broad in surface area, and architecturally sound on security**, but it is **not production-ready** as a recruitment-management control plane. The cosmetic layer is far ahead of the data layer.

The single most damaging theme is **data integrity**: the same business facts (placements, commissions, applications, employer counts) report **different numbers on different screens** — and in one case **inside a single API response**. A Super Agent cannot trust a dashboard whose headline "Commissions Earned ₹15,000" is contradicted by a Commissions page that says "No commissions found" and a Reports page that says "₹0".

The **headline capability of the role — the Job Approval Gate — is non-functional**. The `/approvals` route has been replaced by a read-only "Regional Jobs" list with no approve/reject controls, while the dashboard still advertises "1 job approval waiting on you." This removes the core quality-control and agent-governance function the role exists to perform.

Security is the strongest area: RBAC is enforced at the API layer (admin endpoints return 403), the admin UI is blocked by middleware, and agent-scope IDOR attempts are rejected ("Agent not in your team").

**Strengths:** Lead pipeline CRM (with AI scoring), Targets/distribution module, Reports with AI report generation, Placements visa workflow, clean responsive shell, solid RBAC.
**Blockers:** Broken approvals, cross-screen metric contradictions, fabricated commission totals, AI market output dumped as raw JSON, placement salary rendering as `[object Object]`, disconnected territory module.

**Production Readiness Score: 41 / 100**
**Recommendation: NO-GO** until P0 data-integrity and approvals issues are resolved.

---

## 2. Walkthrough of Everything Tested

| # | Area | URL | Result |
|---|------|-----|--------|
| 1 | Login / onboarding | `/en/login` → `/en/super-agent` | ✅ Works; no first-run guidance |
| 2 | Dashboard | `/super-agent` | ⚠️ Loads; multiple wrong KPIs |
| 3 | Agents — list | `/super-agent/agents` | ⚠️ Works; slow load; placements contradict dashboard |
| 4 | Agents — create | Add Agent modal | ✅ Created `AUDIT Test Agent` (6→7) |
| 5 | Agents — detail | `/super-agent/agents/[id]` | ✅ Rich profile |
| 6 | Agents — edit/disable | Edit modal | ✅ Status / commission / hours / region |
| 7 | Employers | `/super-agent/employers` | ⚠️ KPIs count one page; onboard works |
| 8 | Approvals | `/super-agent/approvals` | ❌ Read-only; no approve/reject |
| 9 | Jobs (Overview) | `/super-agent/jobs` | ✅ Read-only regional jobs |
| 10 | Applications | `/super-agent/applications` | ❌ Shows 0; API says 4 |
| 11 | Interviews | `/super-agent/interviews` | ✅ Empty monitoring view |
| 12 | Placements | `/super-agent/placements` | ❌ Salary `[object Object]`; count conflicts |
| 13 | Commissions | `/super-agent/commissions` | ❌ 0 records vs ₹15k dashboard; rate read-only |
| 14 | Invoices | `/super-agent/invoices` | ⚠️ KPI=0 vs 2 rows; no commission link |
| 15 | Referral Links | `/super-agent/referral-links` | ⚠️ 0 links; AI search disabled |
| 16 | Leads | `/super-agent/leads` | ✅ Strong CRM + AI scoring |
| 17 | Insights (AI) | `/super-agent/insights` | ⚠️ Single thin insight |
| 18 | Market (AI) | `/super-agent/market` | ❌ Raw JSON output; ~20s |
| 19 | Reports | `/super-agent/reports` | ✅ Good; commission conflicts dashboard |
| 20 | Targets | `/super-agent/target-management` | ✅ Strong; roster mismatch |
| 21 | Target Report | `/super-agent/target-report` | ✅ Navigable |
| 22 | Commission Report | `/super-agent/commissions-report` | ✅ Navigable |
| 23 | Territory | `/super-agent/territory` | ❌ All zeros; disconnected |
| 24 | Messages | `/super-agent/messages` | ✅ 1:1 DM only |
| 25 | Settings | `/super-agent/settings` | ✅ 7 tabs; rate read-only |
| 26 | Mobile (390px) | all | ⚠️ Tables horizontal-scroll, no card reflow |
| 27 | Security probes | API | ✅ 403s, redirect, IDOR blocked |

---

## 3. UX Findings

- **Dashboard "Top Agents" widget is misleading** — shows placements (7/6/4) and lead counts that exist nowhere else in the product.
- **Misleading empty states.** Agents and several list pages render `0` / "Total Agents 0" for ~3 seconds before data appears. KPI cards have no skeleton; a Super Agent glancing at the page sees "0 agents" then "7 agents."
- **Junk/test data surfaced to the operator**: agent named `svdsv`, blank-named "Agent", employer emails like `bob-1777021640704@test.com`, `@mployedin-import.local`. A franchise head demoing this would lose confidence instantly.
- **Currency is inconsistent across the workspace** — dashboard shows ₹ (INR), placements show USD, targets show AED, invoices show INR. No single source-of-truth currency.
- **Confusing lead cards.** Leads page top cards (Open Pipeline 8 / Contacted 1 / Converted 1 / Lost 1) overlap semantically with the stage strip below (New/Contacted/Interested/Negotiating/Converted/Lost).
- **Only 4 dashboard quick actions**; no shortcut to Reports, Territory, Targets, or AI Market despite those being daily-use tools.
- **Mobile data tables** do not reflow into cards; they require horizontal scroll inside a container — usable but cramped for a field manager on a phone.

---

## 4. Functional Gaps

1. **Job Approval Gate missing (P0).** `/approvals` is read-only. No approve/reject/request-changes. The agent → submit → Super Agent → approve chain has no UI. No "pending approval" status exists on any job.
2. **Applications oversight broken (P0).** Page shows "No applications found" while the dashboard API returns `totalApplications: 4`.
3. **Territory management disconnected (P1).** Territory page shows Regions 0 / Agents 0 / Employers 0 / Active Jobs 0 and "0 regions assigned" while the operator manages 7 agents and 22 employers. No real map.
4. **Commission override is admin-only (P2 / role regression).** Both Commissions and Settings show "Set by Admin." Documentation (`ROLES.md`) lists self-configurable `overrideRate` as a key Super Agent capability.
5. **Referral attribution gap (P1).** 0 referral links / 0 registrations despite 22 agent-onboarded employers — onboarding is not tied to referral tracking.
6. **No bulk agent operations (P2).** No multi-select for reassignment, bulk reminders, bulk territory moves — required at 50–100 agents.
7. **No team broadcast / announcements (P2).** Messaging is 1:1 only.
8. **Team roster is not consistent across modules (P1).** Agents page roster (Ahmed/Sara/Khalid/svdsv/ilyas/AUDIT) differs from the Targets roster (Super Agent/Arun Menon/Rajesh Kumar).

---

## 5. Revenue Risks

| Risk | Evidence | Impact |
|------|----------|--------|
| **Fabricated commission total** | Dashboard API returns `commissions:{total:15000,pending:5000,paid:10000}` but Commissions page = 0 records, Reports = ₹0 | Operator manages payouts against numbers that don't exist → disputes, overpayment |
| **Placement → commission not generated** | 1 placement (Unpaid/Pending) exists; Commissions page has 0 entries | Earned commission never created → **revenue leakage** |
| **Invoice → commission not linked** | Invoice ledger "MY COMMISSION" column all "—"; INR 25,000 invoice | Commission not computed from billed revenue |
| **Invoice data quality** | A "Paid" invoice with INR 0 total; a 25,000 invoice "void"; Total Invoices KPI = 0 | Revenue reporting unreliable |
| **Placement salary unreadable** | Salary renders `USD [object Object]` | Cannot verify placement value → cannot validate commission base |
| **Employer revenue blank** | Employers page "Revenue Tracked" = "—" | No commercial visibility per account |

---

## 6. Security Findings

**Overall: strong.** No critical issues found.

| Test | Endpoint / Action | Result |
|------|-------------------|--------|
| Admin user data | `GET /api/admin/users` | ✅ 403 Forbidden |
| Admin agents | `GET /api/admin/agents` | ✅ 403 Forbidden |
| Admin super-agents | `GET /api/admin/super-agents` | ✅ 403 Forbidden |
| Audit logs | `GET /api/admin/audit-logs` | ✅ 403 Forbidden |
| Impersonation | `GET /api/admin/impersonate` | ✅ 403 Forbidden |
| Admin UI | `GET /en/admin` | ✅ Middleware redirect (opaque) |
| Cross-team agent (IDOR) | `GET /api/super-agent/agents/000…000` | ✅ 403 "Agent not in your team" |

**Low-severity observations:**
- Territory enforcement is effectively *open* (0 assigned regions) but **team scoping by `agentIds` still constrains data**, so exposure risk is low.
- Agent creation lets the Super Agent **type a plaintext password** rather than sending an email invite — minor credential-handling concern, not a vulnerability.

---

## 7. AI Findings

| Feature | Finding | Severity |
|---------|---------|----------|
| **Market Intelligence** (`/market`) | Returns **raw, unparsed JSON** (```json `{ "summary":…, "insights":[…` ```) dumped as text instead of insight cards; output truncated/malformed; ~20s latency; admits "country-specific breakdown not available" | **High** |
| **Team Insights** (`/insights`) | Only one insight produced ("7 inactive agents"); no revenue/placement/opportunity insights — thin value. Feedback (Helpful/Dismiss/Refresh) scaffolding present | Medium |
| **Lead AI scoring** (`/leads`) | Works — scores 25/50/75/100 with sources; genuinely useful | ✅ Positive |
| **AI Reports** (`/reports`) | Custom report prompts (team summary, agent comparison, pipeline health) present | ✅ Positive |
| **Referral AI search** | "AI Search" button **disabled** | Low |
| **Explainability** | Insight cites "7-day window with confidence scoring" but no per-number drill-down | Medium |

---

## 8. Scalability Findings (10 / 50 / 100 Agents)

- **10 agents:** Manageable, but the absence of approvals and reliable commissions already hurts.
- **50 agents:** **No bulk actions** (reassign, remind, move territory) makes one-by-one management untenable. KPI cards that count only the **current page** (Employers showed 10 of 22) will badly mislead at scale. Slow list loads compound.
- **100 agents:** Without working **territory segmentation**, a regional head cannot partition oversight. Without **approvals**, quality control does not scale. Cross-module **roster mismatches** indicate the team-membership model is not a single source of truth — a structural scaling risk.
- **AI Insights** must scale from one generic alert to prioritized, ranked, per-agent actions to remain useful past ~10 agents.

---

## 9. Competitive Gap Analysis

| Capability | Mployedin Super Agent | Naukri / LinkedIn / Indeed / Foundit Recruiter | Bullhorn / Zoho Recruit / Greenhouse |
|------------|----------------------|-----------------------------------------------|--------------------------------------|
| Team/req approval workflow | ❌ Broken | ✅ Approval chains | ✅ Mature approvals |
| Reliable commission/payout | ❌ Inconsistent | ✅ (Bullhorn back-office) | ✅ Pay & bill |
| Territory/team segmentation | ❌ Empty | ✅ | ✅ |
| Candidate pipeline oversight | ⚠️ Shows 0 | ✅ | ✅ |
| Lead/CRM + scoring | ✅ Strong | ⚠️ Limited | ✅ (Bullhorn CRM) |
| AI market intelligence | ⚠️ Raw JSON | ⚠️ Emerging | ⚠️ Emerging |
| Bulk team operations | ❌ | ✅ | ✅ |
| Reporting/analytics | ✅ Good (with AI) | ✅ | ✅ Deep |
| Targets/quota distribution | ✅ Strong | ⚠️ | ✅ |
| Mobile recruiter workflow | ⚠️ Scroll tables | ✅ Native apps | ✅ |

**Differentiators worth protecting:** AI lead scoring, Targets distribution, AI report generation.
**Table-stakes gaps that block competitiveness:** approvals, trustworthy commissions, territory, candidate-pipeline accuracy.

---

## 10. Critical Issues (P0)

### C1 — Job Approval Gate is non-functional
- **Severity:** Critical
- **Business impact:** The Super Agent cannot approve/reject agent job postings — the core governance function of the role. No quality control; agents are ungoverned.
- **Reproduction:** Log in as Super Agent → Dashboard shows "1 job approvals waiting on you · Review approvals" → click it → `/super-agent/approvals`.
- **Expected:** A queue of pending postings with Approve / Reject / Request-changes actions.
- **Actual:** Read-only "Regional Jobs" list ("This is a read-only view…"). 0 approve/reject controls; no "pending" status on any job.
- **Recommended fix:** Restore the approval UI calling `PATCH /api/super-agent/approvals/[id]`; add `pending` job status and surface it; make the dashboard count match actionable items.
- **URL:** `http://localhost:3000/en/super-agent/approvals`

### C2 — Placement count contradicts itself across screens (and within one API)
- **Severity:** Critical
- **Business impact:** Placements drive revenue attribution and commissions; the operator cannot trust any placement figure.
- **Reproduction:** Compare Dashboard "Total Placements" (0) · Dashboard Top Agents (7+6+4) · Agents page (all 0) · Reports (0) · Placements page (1). Then call `GET /api/super-agent/dashboard`: same payload has `totalPlacements:0` **and** `agentPerformance[].placementsCompleted: 7,6,4…`.
- **Expected:** One placement number everywhere, from one query.
- **Actual:** At least four different values; internal contradiction in the dashboard endpoint.
- **Recommended fix:** Single placement aggregation source; reconcile `agentPerformance.placementsCompleted` with the placements collection; add a regression test asserting cross-endpoint equality.
- **URL:** `/api/super-agent/dashboard`, `/super-agent`, `/super-agent/agents`, `/super-agent/placements`, `/super-agent/reports`

### C3 — Commissions Earned is fabricated
- **Severity:** Critical
- **Business impact:** Dashboard claims ₹15,000 earned (₹5,000 pending / ₹10,000 paid) but there are **zero commission records**. Payout decisions against phantom money.
- **Reproduction:** Dashboard "Commissions Earned ₹15,000" → Commissions page "No commissions found" → Reports "Commissions ₹0". `GET /api/super-agent/dashboard` returns `commissions:{total:15000,pending:5000,paid:10000}`.
- **Expected:** Commission totals derived from actual commission records.
- **Actual:** Hard/aggregate value with no backing rows.
- **Recommended fix:** Compute dashboard commissions from the same source as the Commissions/Reports pages; auto-create commission entries on placement.
- **URL:** `/super-agent`, `/super-agent/commissions`, `/super-agent/reports`

### C4 — Application oversight shows nothing
- **Severity:** Critical (oversight blind spot)
- **Business impact:** A regional manager cannot see hiring activity; pipeline is invisible.
- **Reproduction:** `/super-agent/applications` → "No applications found." `GET /api/super-agent/dashboard` → `totalApplications:4` (`withdrawn:2, applied:2`).
- **Expected:** The 4 applications listed.
- **Actual:** Empty table.
- **Recommended fix:** Align the applications-page query scope with the dashboard aggregation (likely an agent-vs-employer-owned-job scoping mismatch).
- **URL:** `http://localhost:3000/en/super-agent/applications`

---

## 11. Medium Issues (P1)

### M1 — Placement salary renders `USD [object Object]`
- **Severity:** High/Medium · **Impact:** Cannot read/verify placement value → cannot validate commission base.
- **Repro:** `/super-agent/placements` → Salary column = "USD [object Object]" (desktop and mobile).
- **Expected:** Formatted amount (e.g., "USD 120,000"). **Actual:** Object stringified.
- **Fix:** Format the salary object (min/max/currency) before render.

### M2 — List KPI cards count the current page, not the dataset
- **Impact:** Decision-making on wrong totals.
- **Repro:** Employers page KPIs "Total Employers 10 / Active 10 / Assigned 10" while pagination says "Showing 1–10 of 22." Invoices "Total Invoices 0" with 2 rows.
- **Fix:** Drive KPI cards from server aggregates, not the current page slice.

### M3 — Territory module disconnected
- **Repro:** `/super-agent/territory` → all zeros, "0 regions assigned" despite 7 agents / 22 employers; Targets shows territory "Dubai."
- **Fix:** Wire territory to the same region/`agentIds` model used elsewhere; render real coverage.

### M4 — Referral attribution missing
- **Repro:** `/super-agent/referral-links` → 0 links/registrations though 22 employers were agent-onboarded.
- **Fix:** Tie employer onboarding to referral link records; backfill attribution.

### M5 — Cross-module team roster mismatch
- **Repro:** Agents page (Ahmed/Sara/Khalid/svdsv/ilyas/AUDIT) ≠ Targets roster (Super Agent/Arun Menon/Rajesh Kumar).
- **Fix:** Single team-membership source consumed by all modules.

### M6 — AI Market output is raw JSON
- **Repro:** `/super-agent/market` → ask any prompt → response shows ```json `{…}` ``` text, truncated, ~20s.
- **Fix:** Parse the report-service JSON and render insight cards; add streaming/loading guard and error handling for malformed output.

---

## 12. Low Issues (P2)

- **L1 — Misleading loading state:** lists show `0` before data; add KPI skeletons.
- **L2 — Junk/test data visible** (`svdsv`, blank "Agent", `@test.com`, `@mployedin-import.local`); clean seed/demo data.
- **L3 — Currency inconsistency** across dashboard (₹) / placements (USD) / targets (AED) / invoices (INR).
- **L4 — Referral "AI Search" button disabled**; pagination shows "1 / 0".
- **L5 — Commission override read-only** for Super Agent (role regression vs docs); confirm intended and update `ROLES.md`.
- **L6 — Thin AI insights** (single generic alert); expand to ranked, actionable insights.
- **L7 — No bulk agent actions; 1:1-only messaging; only 4 dashboard quick actions.**
- **L8 — Mobile tables** scroll horizontally instead of reflowing to cards.
- **L9 — Agent creation** uses plaintext password entry instead of email invite; no phone field.
- **L10 — No first-run onboarding/guidance** for a brand-new Super Agent (role, territory, next steps).

---

## 13. Production Readiness Score

**41 / 100**

| Dimension | Weight | Score | Notes |
|-----------|--------|-------|-------|
| Core workflows (approvals, oversight) | 25 | 6/25 | Approvals broken; apps blind |
| Data integrity / metrics | 20 | 4/20 | Cross-screen + intra-API contradictions |
| Revenue/commission accuracy | 15 | 4/15 | Fabricated totals; leakage |
| Security / RBAC | 15 | 14/15 | Strong |
| AI quality | 10 | 4/10 | Raw JSON; thin insights |
| UX / polish | 10 | 6/10 | Polished shell, junk data |
| Mobile / scalability | 5 | 3/5 | Scrolling tables; no bulk ops |

---

## 14. GO / NO-GO Recommendation

**NO-GO.**

The Super Agent role cannot perform its two defining jobs today: **govern agents (approvals)** and **manage money (commissions)**. Combined with cross-screen metric contradictions, shipping this would actively mislead regional managers and risk real payout errors. Security and several modules (Leads, Targets, Reports) are genuinely strong, so the path to GO is **focused remediation, not a rebuild**.

---

## 15. P0 / P1 / P2 Roadmap

### P0 — Blockers (must fix before launch)
1. Restore the **Job Approval workflow** (queue + approve/reject/request-changes + `pending` status). *(C1)*
2. Establish a **single placement aggregation** and reconcile every screen + the dashboard endpoint. *(C2)*
3. Derive **commission totals from real records**; auto-create commission on placement. *(C3)*
4. Fix **Applications oversight scoping** so the team pipeline is visible. *(C4)*

### P1 — High priority
5. Fix **placement salary rendering** (`[object Object]`). *(M1)*
6. Make **KPI cards use server-side aggregates**, not page slices. *(M2)*
7. **Wire the Territory module** to the real region model. *(M3)*
8. Implement **referral attribution** on employer onboarding. *(M4)*
9. Unify **team-membership** across modules. *(M5)*
10. Render **AI Market output as cards**, not raw JSON; add error/latency handling. *(M6)*

### P2 — Quality & scale
11. KPI skeleton loaders; remove misleading zero states. *(L1)*
12. Purge junk/test data; unify currency. *(L2, L3)*
13. Bulk agent actions (reassign, remind, move territory) + multi-select. *(L7)*
14. Team broadcast/announcements in messaging. *(L7)*
15. Expand AI insights to ranked, actionable items with drill-down. *(L6)*
16. Mobile card-reflow for data tables. *(L8)*
17. Email-invite agent creation; add phone. *(L9)*
18. First-run onboarding/guidance. *(L10)*
19. Reconcile docs (`ROLES.md`) with the admin-controlled commission override. *(L5)*

---

*Audit conducted by live operation of the platform as a Super Agent. Test artifacts created: `AUDIT Test Agent` (`audit.agent@mployedin.com`). No destructive actions performed.*
