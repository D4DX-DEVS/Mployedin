# Admin UI/UX Audit — MPLOYEDIN

**Auditor:** Senior UI/UX Analyst (Playwright-driven)
**Date:** 2026-06-16
**Account:** `admin@mployedin.com` (admin role)
**Environment:** `http://localhost:3000/en/admin` (dev server)
**Coverage:** 46 admin routes × 4 viewports (375 / 768 / 1440 / 1920)
**Method:** Each page fully loaded, full-page screenshots captured at 1440 + 375, live DOM layout measurements (container padding, max-width, left/right gutters, document & inner horizontal overflow) taken at all 4 viewports, console errors captured, representative pages visually inspected and interacted with.
**Screenshots:** `audit-screens/admin/<page>-<viewport>.png`

---

## 1. Executive Summary

The admin platform is built on a **strong, consistent design system**. 42 of 46 pages use the same `.page-container` wrapper with responsive gutters (24px mobile / 32px tablet / 40px desktop), a 1440px max-width, and centered content. Across **every** page and **every** viewport there was **zero document-level horizontal overflow** — a notably good result for an admin suite this large. Visual quality (typography, card design, KPI grids, spacing rhythm) is high and professional.

The issues found are concentrated and fixable:

| Severity | Count | Theme |
|----------|-------|-------|
| High | 4 | Two routes 404 by direct URL; two pages bypass the standard container (full-bleed, no gutters/max-width) |
| Medium | 6 | Inner content overflow on chart/table pages; inconsistent container on poster-templates; React key warning; mixed-currency aggregation |
| Low | 5 | Duplicate/ambiguous routes & titles; truncated sidebar label; empty/loading states; minor mobile crowding |

### Layout consistency verdict
- **Left vs right padding:** Equal on all `.page-container` pages (40/40, 32/32, 24/24). The only asymmetry observed is a consistent ~6px right difference = the vertical scrollbar gutter — **normal, not a defect**.
- **Container width:** Consistent 1440px cap; centered at 1920px. Section pages are intentionally narrower because of a secondary sub-nav rail (see §2).
- **Exceptions:** `system-health`, `activity-timeline` (no container), `poster-templates` (different container). See High/Medium issues.

---

## 2. Design System Baseline (applies to all pages)

**Shell:** Dual-tier sidebar — a primary icon/label rail, plus a contextual **secondary sub-nav panel** that appears for sections with children (People, Finance, CMS, Job Attributes, Location Data, etc.). Parent items with children render as **toggle buttons, not links**, so they expand the submenu rather than navigate.

**Standard page wrapper:** `.page-container`
- padding-left = padding-right at every breakpoint: **24px (≤375) / 32px (768) / 40px (≥1440)**
- `max-width: 1440px`, horizontally centered
- Content area width: ~1238px on full-width pages (dashboard), ~1004px on section pages (sub-nav rail consumes ~240px) — **this width difference is by design and consistent within each context.**

**Top bar:** sticky, 64px, with global search (⌘K), theme toggle, EN/AR language switch, notifications, avatar. Consistent on all pages.

This baseline is the reference against which deviations below are flagged.

---

## 3. Global / Cross-Cutting Issues

### HIGH

**H1 — Parent config routes 404 on direct navigation**
`/admin/job-attributes` and `/admin/location-data` render the global **404 "Page not found"** page. These are parent nav items (with child routes like `…/industries`, `…/countries`). The sidebar toggles their submenu so users don't normally hit the 404 via clicking, but the routes are reachable by direct URL, bookmarks, browser refresh on a redirect, or the command menu.
- **Recommendation:** Add an index `page.tsx` for each that either renders a section landing page or `redirect()`s to the first child (e.g. `…/industries`, `…/countries`).

**H2 — Two pages bypass the standard container (full-bleed)**
`system-health` and `activity-timeline` do **not** use `.page-container` (measured `padding: 0`, `max-width: none`, class `space-y-6` only). Consequences on `system-health`:
- No left/right gutter — content touches the main area edges, inconsistent with every other admin page.
- No 1440px cap — content stretches edge-to-edge on 1920px instead of centering.
- The "Heap Memory" value (`… / 1660 MB`) is **clipped under the floating AI assistant button** at the right edge because there's no right padding.
- **Recommendation:** Wrap both pages' content in `.page-container` (or apply the same `px`/`max-w`/`mx-auto`) to match the rest of admin.

### MEDIUM

**M1 — `poster-templates` uses a non-standard container**
Uses `admin-cms-page-container` with padding **52 / 40 / 28px** instead of the standard 40 / 32 / 24px. Its sibling CMS pages (`cms` overview) use the standard container, so gutters visibly differ within the CMS section.
- **Recommendation:** Align `admin-cms-page-container` to the standard scale, or apply it consistently across all CMS pages if the larger gutter is intentional.

**M2 — Inner horizontal overflow on chart/table pages**
Document-level overflow is 0 everywhere, but the **content area** scrolls horizontally on:
- `exhibitions/analytics` — **116px** (charts render with invalid `width(-1)` per Recharts console warnings; charts appear to mount in a zero-width/hidden container).
- `subscription-dashboard` — **35px**.
- `gdpr` — **10px** (minor).
- **Recommendation:** Constrain wide tables with `overflow-x-auto` on a bounded wrapper, and give Recharts `ResponsiveContainer` a non-zero `minWidth`/`minHeight` or defer rendering until the container has measured width (the charts also emit width(-1) warnings on `tasks`).

**M3 — React "unique key prop" warning (`UninvoicedPlacementsQueue`)**
On `commissions-report` (and the same component on `invoices`), `TableBody` renders list children without unique `key` props — surfaces as the Next.js dev "1 Issue" badge.
- **Recommendation:** Add a stable `key` (e.g. placement `_id`) to the mapped rows.

**M4 — Mixed-currency aggregation in Finance**
The invoices/finance KPI cards show aggregated totals in **INR** while underlying rows/regions show **USD** and **AED**. Summing mixed currencies into one figure can mislead.
- **Recommendation:** Normalize to a base currency with FX, or label/segment totals per currency.

### LOW

**L1 — Duplicate / ambiguous routes & titles**
- `/admin/audit` and `/admin/audit-logs` both render H1 **"Audit Logs"**.
- `/admin/targets` and `/admin/target-management` both render H1 **"Target Management"**.
- `/admin/approvals` renders H1 **"Platform Jobs Overview"** (title doesn't match the "Approvals" nav intent).
- **Recommendation:** Consolidate duplicates (redirect one to the other) and align page titles with their nav labels.

**L2 — Sidebar workspace label truncates**
"ADMIN WORKSPACE" is clipped to "ADMIN WORKSP…" in the sidebar header at all widths.
- **Recommendation:** Reduce font-size/letter-spacing or widen the label container so it fits.

**L3 — Empty / loading states**
- `users` list showed "0 total users" / "Showing 0–0 of 0" with skeleton rows still visible, while the dashboard reports 277 users — verify the list query/loading state.
- `tasks`, `gdpr` show empty states (expected for this data set, but confirm intended copy).

**L4 — Floating AI button overlaps content**
On mobile and on full-bleed pages the bottom-right AI assistant button overlaps the last card / right-edge values.
- **Recommendation:** Add bottom/right safe-area padding to scroll containers, or offset content from the FAB.

---

## 4. Responsive Review (375 / 768 / 1440 / 1920)

| Viewport | Result |
|----------|--------|
| **Mobile 375** | ✓ Sidebar collapses to hamburger; KPI cards stack to single column; header controls fit; **no horizontal scroll** on any page. Minor: Queue/Invoices/Analytics segmented tabs sit tight against the right edge; FAB overlaps last card. |
| **Tablet 768** | ✓ 32px gutters; grids reflow to 2-up; no overflow. |
| **Desktop 1440** | ✓ 40px gutters; full multi-column layouts; reference baseline. |
| **Large 1920** | ✓ Content caps at 1440 and centers on `.page-container` pages. ✗ `system-health` & `activity-timeline` stretch full-width (H2). |

No layout instability, clipped text (except H2/L2), or overflow scrollbars at the document level were observed at any breakpoint.

---

## 5. Per-Page Results

Legend: **C** = uses `.page-container`, **Ov** = max inner content horizontal overflow (px), padding shown L/R. All document-level overflow = 0 at all viewports unless noted.

| # | Page | URL (`/en/admin/…`) | C | Pad (1440/768/375) | Ov | Notes |
|---|------|---------------------|---|--------------------|----|-------|
| 1 | Dashboard | `/` | ✓ | 40/32/24 | 0 | Clean baseline. L2 sidebar label. |
| 2 | Users | `users` | ✓ | 40/32/24 | 0 | L3 — shows 0 users vs 277 on dashboard. |
| 3 | Employers | `employers` | ✓ | 40/32/24 | 0 | OK |
| 4 | Job Seekers | `job-seekers` | ✓ | 40/32/24 | 0 | OK |
| 5 | Agents | `agents` | ✓ | 40/32/24 | 0 | OK |
| 6 | Super Agents | `super-agents` | ✓ | 40/32/24 | 0 | OK |
| 7 | Referral Links | `referral-links` | ✓ | 40/32/24 | 0 | OK |
| 8 | Jobs | `jobs` | ✓ | 40/32/24 | 0 | `employer-legacy-surface` variant. |
| 9 | Applications | `applications` | ✓ | 40/32/24 | 0 | `employer-legacy-surface` variant. |
| 10 | Approvals | `approvals` | ✓ | 40/32/24 | 0 | L1 — H1 "Platform Jobs Overview". |
| 11 | Interviews | `interviews` | ✓ | 40/32/24 | 0 | `employer-legacy-surface` variant. |
| 12 | Placements | `placements` | ✓ | 40/32/24 | 0 | `employer-legacy-surface` variant. |
| 13 | Invoices | `invoices` | ✓ | 40/32/24 | 0 | M3 (key warn), M4 (mixed currency). Clean KPI grid. |
| 14 | Commissions | `commissions` | ✓ | 40/32/24 | 0 | OK |
| 15 | Commission Report | `commissions-report` | ✓ | 40/32/24 | 0 | M3 — React key warning. |
| 16 | Subscriptions | `subscriptions` | ✓ | 40/32/24 | 0 | OK |
| 17 | Subscription Plans | `subscription-plans` | ✓ | 40/32/24 | 0 | OK |
| 18 | Subscription Dashboard | `subscription-dashboard` | ✓ | 40/32/24 | 35 | M2 — 35px inner overflow. |
| 19 | Targets | `targets` | ✓ | 40/32/24 | 0 | L1 — duplicate "Target Management". |
| 20 | Target Management | `target-management` | ✓ | 40/32/24 | 0 | L1 — duplicate of #19. |
| 21 | Target Report | `target-report` | ✓ | 40/32/24 | 0 | OK (print styles present). |
| 22 | CMS | `cms` | ✓ | 40/32/24 | 0 | OK |
| 23 | Poster Templates | `poster-templates` | ✓* | **52/40/28** | 0 | M1 — non-standard container. |
| 24 | Resources | `resources` | ✓ | 40/32/24 | 0 | OK |
| 25 | Job Attributes | `job-attributes` | — | — | — | **H1 — 404**. Children OK. |
| 26 | Location Data | `location-data` | — | — | — | **H1 — 404**. Children OK. |
| 27 | Workflow Templates | `workflow-templates` | ✓ | 40/32/24 | 0 | OK |
| 28 | Matching Weight Templates | `matching-weight-templates` | ✓ | 40/32/24 | 0 | OK |
| 29 | Analytics | `analytics` | ✓ | 40/32/24 | 0 | OK |
| 30 | Reports & Analytics | `reports` | ✓ | 40/32/24 | 0 | OK |
| 31 | Audit | `audit` | ✓ | 40/32/24 | 0 | L1 — H1 "Audit Logs" (dup). |
| 32 | Audit Logs | `audit-logs` | ✓ | 40/32/24 | 0 | L1 — duplicate of #31. |
| 33 | System Health | `system-health` | **✗** | **0/0** | 0 | **H2 — full-bleed, value clipped under FAB. Heap ~97% (red).** |
| 34 | Settings | `settings` | ✓ | 40/32/24 | 0 | OK |
| 35 | Communications | `communications` | ✓ | 40/32/24 | 0 | OK |
| 36 | Messages | `messages` | ✓ | 40/32/24 | 0 | OK |
| 37 | Webhooks | `webhooks` | ✓ | 40/32/24 | 0 | `employer-legacy-surface` variant. Good table/action UI. |
| 38 | GDPR & Privacy | `gdpr` | ✓ | 40/32/24 | 10 | M2 (minor), empty state. |
| 39 | Bulk Import | `bulk-import` | ✓ | 40/32/24 | 1 | OK |
| 40 | Impersonate | `impersonate` | ✓ | 40/32/24 | 0 | OK |
| 41 | Territory | `territory` | ✓ | 40/32/24 | 0 | OK |
| 42 | Exhibitions | `exhibitions` | ✓ | 40/32/24 | 0 | OK |
| 43 | Exhibition Analytics | `exhibitions/analytics` | ✓ | 40/32/24 | **116** | M2 — chart overflow + Recharts width(-1). |
| 44 | Design System | `design-system` | ✓ | 40/32/24 | 0 | OK |
| 45 | Activity Timeline | `activity-timeline` | **✗** | **0/0** | 0 | **H2 — full-bleed, no container.** |
| 46 | Task Board | `tasks` | ✓ | 40/32/24 | 0 | Empty "0 of 0"; Recharts width(-1) warnings. |

\* `poster-templates` uses `admin-cms-page-container`, a container variant with larger gutters.

---

## 6. Positive Findings

- **Consistent gutters & symmetric padding** on 42/46 pages — left padding equals right padding at every breakpoint.
- **Zero document-level horizontal overflow** across all pages and all four viewports.
- **Strong KPI / card design language** — equal-height stat cards, consistent iconography, clear hierarchy (e.g. Finance, System Health, Exhibition Analytics).
- **Robust responsive behavior** — clean hamburger collapse, single-column stacking on mobile, 2-up on tablet, centered max-width on large desktop.
- **Coherent dual-tier navigation** with contextual secondary sub-nav and sensible groupings (ACCOUNTS / WORKFORCE / MARKETING, etc.).
- **Bilingual (EN/AR) + dark-mode** controls present and consistent in the top bar on every page.

---

## 7. Prioritized Remediation Plan

1. **(High)** Add index pages / redirects for `job-attributes` and `location-data` → eliminate the two 404s.
2. **(High)** Wrap `system-health` and `activity-timeline` in `.page-container` → restore consistent gutters, max-width, and stop the clipped value under the FAB.
3. **(Medium)** Fix Recharts sizing (minWidth/deferred mount) and bound wide tables → clear the 116px / 35px / 10px inner overflows and width(-1) warnings.
4. **(Medium)** Normalize `poster-templates` container padding to the standard scale.
5. **(Medium)** Add unique `key`s in `UninvoicedPlacementsQueue` rows; resolve mixed-currency totals in Finance.
6. **(Low)** Consolidate duplicate routes (`audit`/`audit-logs`, `targets`/`target-management`), align mismatched titles (`approvals`), fix the truncated "ADMIN WORKSPACE" label, verify the empty Users list, and add FAB safe-area padding.
