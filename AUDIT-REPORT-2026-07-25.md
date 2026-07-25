# MployedIn Full Product Audit and Remediation

Date: 2026-07-25  
Environment: clean local production build (`http://localhost:3000`)  
Viewports: desktop 1366×900 and mobile 390×844  
Roles: anonymous, admin, super agent, agent, employer, job seeker

## Final outcome

The audited application is locally release-ready for the tested scope. All
actionable defects found during this audit were implemented and retested:

- TypeScript passes.
- The complete Jest gate passes: 105 suites and 659 tests, with 4 suites and
  32 tests intentionally skipped.
- The clean Next.js 16.2.11 production build passes, including all 312 generated
  page entries and database index setup.
- Deterministic seed data now covers all 16 formerly skipped dynamic patterns.
  Their final production-browser matrix passes 32/32 checks (desktop and
  mobile), with no horizontal overflow.
- `npm audit` reports 0 vulnerabilities after the reviewed dependency upgrade.
- All five supplied accounts authenticate and land in the correct role
  workspace.
- Final targeted production checks have no failed requests, console errors, or
  page errors on the previously affected admin, super-agent, and job-seeker
  pages.

No passwords are stored in this report.

## Scope

The audit covered:

- 237 UI page routes across public, admin, super-agent, agent, employer, and
  job-seeker areas.
- 422 API route files, including 273 files with mutating handlers.
- Authentication, role routing, CRUD behavior, error/loading/empty states,
  desktop and mobile layout, failed responses, browser errors, translation
  runtime behavior, hydration, and source-level concurrency risks.
- Live Admin CMS FAQ create, read, update, and delete with cleanup verification.
- A 10,000-request concurrent quota-boundary test.

The browser crawler derives routes from `src/app`, authenticates separately for
each role, and resolves dynamic pages only from real links. It does not invent
record IDs.

## Verification evidence

| Check | Final result |
|---|---|
| `npx tsc --noEmit` | Pass |
| Jest | 105 passed suites; 659 passed tests |
| Jest skips | 4 suites; 32 tests |
| `npm run build` | Pass |
| Generated/static page entries | 312/312 |
| Seeded dynamic routes | 32/32 pass; 16 routes at desktop and mobile |
| Dependency audit | 0 vulnerabilities |
| Final targeted production retest | Pass; 0 console/page/network errors |
| `git diff --check` | Pass |

The mobile crawl’s sole warning was a generic `Failed to fetch` while leaving
the anonymous Companies page. A fresh isolated mobile retest returned HTTP 200
with no console error; the only aborted requests were Next.js link-prefetch
requests cancelled when the context closed. This is a test-navigation artifact,
not a reproducible product failure.

Raw evidence:

- `audit-crawl-report-desktop.json`
- `audit-crawl-report-mobile.json`
- `audit-dynamic-fixtures.json`
- `audit-dynamic-routes-report.json`

## Implemented fixes

### Authentication and platform security

- Changed login IP throttling so successful credentials never consume the
  failed-login allowance.
- Added a distinct `login_rate_limited` error and localized UI messaging.
- Kept per-account lockout behavior and failure-only IP protection.
- Restored all five supplied audit accounts, clearing stale lock/failure state.
- Replaced the Node-only `node:net` middleware dependency with an Edge-safe
  IPv4/IPv6 validator and added spoofed/invalid address tests.
- Corrected CSP behavior for development while preserving nonce/hash-based
  production script and style controls.

### Race conditions and data integrity

- Made offer response and withdrawal transitions conditional and atomic.
- Updated Offer and Application together in a MongoDB transaction.
- Return `409 Conflict` when another request wins the offer transition.
- Replaced subscription quota check-then-increment with an atomic conditional
  reservation and compensating decrement on handler failure.
- Verified the quota boundary with 10,000 simultaneous calls: exactly 100
  succeeded and 9,900 returned `429`.
- Reactivated withdrawn applications through a conditional update and return
  `409` for duplicate/concurrent reapply attempts.
- Added a unique partial default-plan index per target role and transactional
  default-plan create/update handling.

### CRUD and navigation

- Prevented stale CMS list responses with cancellation and request generations.
- Omit an unselected `isActive` field instead of silently forcing `false`.
- Await refreshes after mutations, optimistically remove deleted rows, and then
  reconcile with the server.
- Added accessible labels to icon-only CMS actions.
- Fixed malformed relative links in Admin Jobs, Admin Reports, Agent Employers,
  Agent Lead detail, Job-seeker search, and Admin impersonation.
- Removed the broken employer profile destination and non-functional clickable
  identity controls; the avatar trigger now has an accessible name.

### Runtime, hydration, translations, and UX

- Removed the global responsive-table DOM mutator that could alter streamed
  markup before React hydration.
- Fixed the remaining exhibition-analytics hydration error by allowing the
  shared dashboard header to render block loading skeletons without nesting a
  `<div>` inside a `<p>`.
- Added/fixed target-report failure translations in English and Arabic.
- Replaced malformed `{{argument}}` messages with valid ICU arguments and
  plural rules, including Easy Apply skill confirmation messages.
- Added a theme toggle to the authentication layout.
- Made AI skill suggestions degrade to a usable empty state when the configured
  OpenRouter provider returns an authentication or availability error.
- Stabilized CMS filter definitions to prevent repeated effect-driven fetches.
- Removed workspace-root inference ambiguity with `outputFileTracingRoot`.

### Test repairs

- Repaired stale Next.js navigation mocks, Query Client setup, selectors,
  landing response mocks, CSRF setup, admin dashboard model mocks, and
  subscription atomic-update expectations.
- Added `@testing-library/dom` as the required direct testing peer.
- Added security regression coverage for trusted proxy handling and Edge-safe
  IP validation.
- Updated the crawl to exclude intentionally protected anonymous routes,
  distinguish cancelled Auth.js navigation requests, and avoid resolving
  static create routes as dynamic IDs.

### Dynamic-route fixtures and dependency upgrade

- Added an idempotent database seeder for the 16 formerly untestable dynamic
  route patterns. It reuses the dedicated audit users without overwriting their
  business/profile details.
- Added a reusable authenticated Playwright audit that checks every seeded URL
  at 1366×900 and 390×844 and records status, redirects, headings, console
  errors, failed requests, and horizontal overflow.
- Fixed shared poster URLs being incorrectly redirected to login by adding the
  poster share prefix to the public-route allowlist and regression coverage.
- Upgraded `firebase-admin` from 13 to 14, pinned the MCP SDK to the exact
  wrapper-compatible version, and overrode vulnerable transitive Hono and UUID
  versions. Runtime imports, the complete test suite, TypeScript, the production
  build, and both full and production-only vulnerability audits all pass.

## Role and page results

- Admin: dashboard, jobs, reports, exhibition analytics, CMS, subscriptions,
  users, targets, finance, communications, locations, settings, health, and
  related CRUD/list pages pass.
- Super agent: dashboard, agents, applications, approvals, targets/report,
  territory, jobs, leads, finance, resources, and settings pass.
- Agent: dashboard, candidates, employers, jobs, leads, targets, tasks,
  placements, finance, communications, and settings pass.
- Employer: dashboard, jobs/create flows, applications, candidates, interviews,
  offers, placements, team, subscription, workflow, analytics, and settings
  pass.
- Job seeker: dashboard, job discovery/detail, applications, Easy Apply skill
  confirmation, profile, CV, documents, experience, portfolio, interviews,
  offers, search, preferences, subscription, and settings pass.
- Public/auth: landing, login, registration variants, verification/reset,
  companies, jobs/detail, blog, contact, legal pages, maintenance, and offline
  page return successfully.

## Non-blocking follow-up

- Next.js warns about the custom `Cache-Control` header for `/_next/static/*`.
  Remove the override if the hosting platform already manages immutable static
  assets.
- The configured OpenRouter credential currently returns `401`. The user
  experience now falls back safely, but AI suggestions require a valid provider
  credential to produce results.
- Add Arabic full-route crawling and automated accessibility tooling (for
  example axe) as continuous quality gates.
