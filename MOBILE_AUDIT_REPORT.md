# Mobile audit — MPLOYEDIN

Scope: all five roles at 390px and 320px. The original pass (2026-08-28) was
written to this path but the file was lost with the untracked `audit/`
screenshots in the `chore: remove tmp scripts and playwright artifacts`
cleanup. What follows is the surviving record: a summary of that pass, then
the instrumented re-audit of 2026-08-31.

## Pass 1 — 2026-08-28 (summary, reconstructed)

**Fixed:** applications bulk-action row wraps instead of hiding its third
button; analytics funnel responsive (was 5 columns at 64px with 7 truncated
labels); candidates list truncation 79 -> 2; privacy notice became a compact
popover inline in the toolbar; Radix checkboxes no longer painted as 44x44
slabs; the admin 4-up stat grid no longer renders at 9px below 480px;
duplicate calendar hidden below xl; type ramp set to 24/20/16 mobile and
30/24/18 desktop; 512 `text-[10px]` raised to 11px across 156 files;
`.page-container` `overflow-wrap` changed from `anywhere` to `break-word`.

**Retracted:** the employer `jobs/[id]/edit`, `jobs/[id]/poster` and job-seeker
`applications/[id]/feedback` "404 P1s" were dev-server phantoms — the routes
work once their `page.tsx` is touched. A second reviewer's "3px page padding",
"two h1" and "unlabelled buttons" claims did not reproduce.

**Deliberately not fixed:** the `responsive-card-table` hydration warning
(styling survives; a real fix is a render-time refactor across every table),
the CV Builder's single 9,507px form, and the analytics hero KPI duplication /
active-tab colour (design decisions).

---

## ADDENDUM 2 — 2026-08-31, instrumented re-audit

Re-measured with a scripted auditor (overflow, ellipsis clipping, sub-11px type,
tap-target size) rather than by eye. Employer role, 390px and 320px.

### Fixed this pass

| Finding | Before | After |
|---|---|---|
| Compact page title lost the cascade | 24px, wrapped to 2 lines | **16px, 1 line**; hero 149 → **135px** |
| Candidate role clipped by the availability chip | role got 90px of 183; every title ≥20 chars ellipsised | chip moved to the meta line — **0 roles clipped** |
| Card meta truncated the years, not the city | `Malappuram, India • 0+ y…` | `0+ yrs • Malappuram, In…` |
| Jobs list title links | 20×180 — under the 24px WCAG 2.5.8 floor | **44px**, zero layout shift |
| Applications candidate links | 20×153, ×10 | **44px**, zero layout shift |

Employer dashboard, jobs, applications, analytics, candidates at 390px:
no horizontal overflow, no sub-11px text, **0 targets under 24px**.

### Two measurement traps worth remembering

1. **`sr-only` text reads as clipped.** A `.sr-only` span is 1px wide, so
   `scrollWidth - clientWidth` is ~33 for every one. 20 of the candidates
   page's 40 "clipped" leaves were screen-reader labels. Filter on
   `clientWidth > 4`.
2. **`elementFromPoint` hits the dev overlay.** Next's dev indicator is a
   fixed, full-viewport div at z-index 2147483647, so every hit test returns
   it. Walk `elementsFromPoint` and skip fixed elements with a huge z-index —
   otherwise a working target reads as unreachable.

The first version of the tap-target fix was an `::after` band. It measured
44px in `getComputedStyle` and caught nothing: with auto z-index the
pseudo-element painted under the card's later siblings. Replaced with
`padding-block: 0.75rem; margin-block: -0.75rem` — a real box that hit-tests
normally, verified by probing its top and bottom edges and confirming it
shadows no other interactive element.

### Known limits, not regressions

- **320px** clips names, roles and meta on the candidates list (56 strings).
  The text column is ~113px there; ellipsis is correct behaviour over overflow.
- Logo (96×33) and dashboard job links (245×39) clear the 24px AA floor but
  not the 44px AAA one.
- Long addresses on the applications list still ellipsise.

Verified: `tsc` clean, jest 807 pass / 2 pre-existing failures
(`agentDashboardPage`, `superAgentDashboardPage` — fail on a clean tree too).
