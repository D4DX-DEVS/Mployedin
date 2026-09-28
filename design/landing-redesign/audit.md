# MPLOYEDIN landing page: AI-era redesign audit

## Executive summary

The current landing page has a strong base: it serves job seekers and employers, lets job seekers search immediately, adapts the hero to the selected audience, and includes locale-aware navigation, loading/retry states, FAQ disclosure, and a mobile menu. The most valuable next step is to make the AI promise explainable and action-oriented. The page currently shows match scores and abstract rows, but visitors cannot see the signals behind a recommendation, what data is used, or what the score does and does not mean.

The recommended direction is an **explainable AI career workspace**: keep the current two-audience entry, add a concrete “Why this match?” explanation, make the role-specific workflow persistent below the hero, and add a stable trust/proof module that does not disappear when optional CMS content is empty. Three isolated coded prototypes are included for review.

## Scope, users, assumptions, and evidence coverage

- **Page:** `/en` public landing page.
- **Users:** anonymous job seekers, anonymous employers, and signed-in visitors returning to their workspace.
- **Primary jobs:** search for a role, create a profile, start hiring, understand AI recommendations, decide whether the platform is trustworthy.
- **Viewport and locale observed:** desktop 1344×827, English. Arabic/RTL, mobile, keyboard, screen reader, and analytics outcomes are not directly observed.
- **Implementation constraint:** this pass creates isolated artifacts and recommendations. Production landing components are unchanged.

### Evidence map

| ID | Evidence | Coverage |
|---|---|---|
| EV-S01 | Live in-app browser screenshot and accessibility tree at `http://localhost:3888/en` | Header, hero, search, audience switch, benefits, categories, workflow, CTA, footer |
| EV-C01 | `src/components/features/public/LandingPage.tsx` | Data loading, hero state, search routing, optional content, carousel, FAQ, localization hooks |
| EV-C02 | `src/components/shared/PublicHeader.tsx` and `src/components/shared/PublicFooter.tsx` | Navigation, locale switch, mobile menu, session-aware dashboard link, footer paths |
| EV-U01 | User request for a complete landing-page review and three usable modern AI artifacts | Explicit redesign intent |

## Critical task map

1. **Find a role:** choose “Find a job” → enter role/location → submit → continue in job results.
2. **Create a profile:** understand value and AI matching → choose profile CTA → register → complete profile.
3. **Start hiring:** choose “Hire talent” → understand employer outcome → open employer registration or sign in.
4. **Evaluate an AI recommendation:** inspect score → understand signals and limits → decide whether to open/apply.
5. **Control trust and privacy:** understand visibility/data inputs → choose what matching can use → continue.

## Category scorecard

Scores reflect available evidence only. They are not usability validation.

| Category | Score | Confidence | Coverage | Rationale |
|---|---:|---|---|---|
| Usability and interaction | 4/5 | High | EV-S01, EV-C01 | Clear hero actions, direct search, FAQ disclosure, retry state; AI explanation is thin. |
| Critical workflow | 3/5 | Medium | EV-S01, EV-C01 | Search and employer routes are direct, but the AI decision and post-hero handoff are under-explained. |
| Information architecture | 3/5 | High | EV-S01, EV-C01, EV-C02 | Audience switch and global nav are understandable; the long page has repeated decision points. |
| Accessibility and inclusion | 3/5 | Medium | EV-C01, EV-C02 | Good labels/ARIA foundations; carousel focus/reduced-motion, mobile focus management, dynamic announcements, and RTL physical alignment need review. |
| Content and comprehension | 3/5 | High | EV-S01, EV-C01 | Copy is readable and user-oriented; AI claims and score meaning need plain-language explanation. |
| Trust, safety, and privacy | 2/5 | Medium | EV-S01, EV-C01 | Verified-employer and privacy cues exist, but recommendation provenance, limits, and controls are not surfaced near the score. |
| Responsive and environmental behavior | 3/5 | Low-medium | EV-C01, EV-C02 | Responsive classes and mobile navigation exist; mobile/RTL rendering was not directly tested. |
| Visual hierarchy and design system | 4/5 | High | EV-S01, EV-C01, globals.css | Cohesive Manrope/blue token system, consistent cards, rounded surfaces, and clear primary actions. |
| User confidence and outcomes | 3/5 | Medium | EV-S01, EV-C01 | Users can predict where primary links go; they cannot yet verify why a recommendation deserves attention. |

## Strengths to preserve

- Two-sided marketplace intent is surfaced immediately with “Find a job” and “Hire talent”.
- Search by role and location is available before registration.
- CTA routing is explicit for job seekers and employers.
- Header, footer, locale switching, FAQ, loading skeleton, and retry states create a stable shell.
- The visual system already supports an AI-era tone: cobalt/cyan palette, soft surfaces, match preview, verification language, and clear spacing.

## Prioritized findings

### P1 — Fix before a broad AI positioning rollout

**F-01 — Match scores are not explainable.**

- **Evidence:** EV-S01, EV-C01
- **Observation:** The preview displays percentages and abstract rows without the signals, freshness, data source, or limitations behind them.
- **Affected task:** Evaluating whether a role is worth opening or applying to.
- **Consequence:** AI can feel decorative or overconfident, reducing trust for candidates and employers.
- **Severity/confidence:** High / High
- **Recommendation:** Add a “Why this match?” disclosure with 2–3 concrete signals, verification state, freshness, and “recommendation, not guarantee” language.
- **Validation:** First-time visitors should explain what drives the score and what it does not promise within 10 seconds.

**F-02 — Trust controls are separated from the AI claim.**

- **Evidence:** EV-S01, EV-C01
- **Observation:** Privacy and verification claims are present, but visitors cannot see or choose which profile inputs influence matching at the decision point.
- **Affected task:** Deciding whether to create a profile or allow employer discoverability.
- **Consequence:** Visitors may delay registration or share more information than intended.
- **Severity/confidence:** High / Medium
- **Recommendation:** Pair the AI preview with a compact explanation and a link or control summary for skills, location preferences, and discoverability.
- **Validation:** Comprehension and consent review in English and Arabic; confirm controls map to real settings before implementation.

**F-03 — Auto-rotating campaign banners need focus and motion safeguards.**

- **Evidence:** EV-C01
- **Observation:** Campaign banners advance every 6.5 seconds and pause on hover/manual control, but focus pause and reduced-motion behavior are not represented.
- **Affected task:** Keyboard or screen-reader user reading a campaign message.
- **Consequence:** The content or action can change while the user is trying to act.
- **Severity/confidence:** High / High
- **Recommendation:** Pause on focus in, return focus after controls, add slide position/status, and honor `prefers-reduced-motion`.
- **Validation:** Keyboard-only and reduced-motion tests with a mocked multi-banner response.

### P2 — Next improvement cycle

**F-04 — One audience toggle can hide the best next action.**

- **Evidence:** EV-S01, EV-C01, EV-C02
- **Observation:** The hero changes copy, benefits, and CTA when switched; shared navigation remains unchanged.
- **Affected task:** Choosing job search, profile creation, or employer onboarding.
- **Consequence:** Visitors may lose role context or choose the wrong path.
- **Severity/confidence:** Medium-high / High
- **Recommendation:** Keep the toggle but add persistent role cards and role-specific workflow steps below the hero.
- **Validation:** Compare wrong-path rate and CTA completion by audience.

**F-05 — The landing page asks visitors to scan a long sequence before a decision.**

- **Evidence:** EV-S01, EV-C01
- **Observation:** Hero, benefits, categories, workflow, optional media, testimonials, blog, FAQ, CTA, and footer all compete for attention.
- **Affected task:** Reaching the primary conversion action.
- **Consequence:** Visitors may scroll without committing, especially on smaller screens.
- **Severity/confidence:** Medium / Medium-high
- **Recommendation:** Use a tighter sequence: value → proof → explainable AI → role CTA → supporting content, with one compact CTA repeated after major sections.
- **Validation:** Scroll depth, CTA visibility, and conversion by viewport.

**F-06 — Search does not preview the next experience.**

- **Evidence:** EV-S01, EV-C01
- **Observation:** Search submits directly to `/jobs`; visitors do not see likely result count, example roles, or how matching will help after the transition.
- **Affected task:** Deciding whether to begin a search.
- **Consequence:** The handoff feels like a context switch.
- **Severity/confidence:** Medium / High
- **Recommendation:** Add a lightweight “roles matched near you” preview or result-count hint without blocking submission.
- **Validation:** Compare search starts, completed searches, and back-navigation.

**F-07 — Optional CMS content can change proof density.**

- **Evidence:** EV-S01, EV-C01
- **Observation:** Banners, videos, testimonials, blog posts, and FAQs disappear when empty or fail gracefully on API errors.
- **Affected task:** Evaluating credibility.
- **Consequence:** The same deployment can feel rich or sparse depending on content population.
- **Severity/confidence:** Medium / High
- **Recommendation:** Keep a stable baseline trust block with verified employer status, direct applications, data controls, and support paths independent of CMS content.
- **Validation:** Render populated, empty, and error payloads at desktop and mobile widths.

### P3 — Accessibility and content hardening queue

- **F-08:** Move landing form controls to stable `id`/`name`/autocomplete metadata and mark the form as search; validate browser autofill and accessibility tree.
- **F-09:** Add focus management and Escape handling to the mobile navigation; validate keyboard and VoiceOver/NVDA.
- **F-10:** Add `aria-busy`/polite status announcements for optional landing content loading and retry failures.
- **F-11:** Replace physical `text-left` in shared FAQ controls with logical alignment and test Arabic/RTL at narrow and wide widths.
- **F-12:** Add a compact mobile-safe AI/trust card because the current right-side preview is hidden below `lg`.

## Audit-to-design traceability

| Finding | Evidence | User/task | Requirement | Success signal |
|---|---|---|---|---|
| F-01 | EV-S01, EV-C01 | Evaluate a recommendation | R-01: show signals, freshness, and limits beside a score | Visitors explain score meaning in 10 seconds |
| F-02 | EV-S01, EV-C01 | Decide whether to share data | R-02: surface matching inputs and visibility controls | Consent comprehension and lower uncertainty |
| F-03 | EV-C01 | Read a campaign safely | R-03: pause carousel on focus and reduced motion | No focus loss in keyboard walkthrough |
| F-04 | EV-S01, EV-C01 | Choose a role path | R-04: keep role-specific actions visible below hero | Higher correct-path CTA completion |
| F-05 | EV-S01, EV-C01 | Reach a conversion action | R-05: tighten sequence and repeat one CTA | Better scroll-to-CTA and completion rate |
| F-06 | EV-S01, EV-C01 | Start job search | R-06: preview the next experience | Higher search completion |
| F-07 | EV-S01, EV-C01 | Trust the platform | R-07: add stable proof independent of CMS | Consistent proof density in empty/error states |

## Recommended direction

### Direction A — Explainable AI career workspace

**Target users and job:** Anonymous professionals and employers deciding whether to enter a focused workflow.

**Findings addressed:** F-01 through F-07, plus F-08 through F-12 as QA requirements.

**Design principle:** Every AI claim should answer three questions: what signal is this, how fresh or verified is it, and what can the visitor do next?

**Key changes:**

1. Keep the existing audience switch as the fast entry point.
2. Replace abstract match rows with explainable role/candidate cards.
3. Add a persistent role-specific workflow block with three steps and one primary CTA.
4. Add a stable trust and data-control block before the final CTA.
5. Keep optional CMS content after the core proof and mark it as supporting content.

**Artifacts:**

- [Artifact 01 — AI match hero](./01-ai-match-hero.html): coded prototype because the match explanation and score interaction need feasibility and comprehension testing.
- [Artifact 02 — AI workflow](./02-ai-workflow.html): coded prototype because role and step state need interaction and responsive testing.
- [Artifact 03 — Trust explainer](./03-trust-explainer.html): coded prototype because provenance, consent, and empty-content proof need state coverage.

**Trade-offs:** This direction adds copy and interaction near the hero and requires real data provenance/consent APIs before production. It should not imply that a score guarantees an outcome.

**Open hypotheses:** Visitors may trust recommendations more when they can inspect signals; employer and candidate paths may need different proof density; a compact mobile trust card may outperform a hidden desktop-only preview.

## QA and validation plan

The prototypes were checked as responsive static files at narrow, standard, and wide layout rules in the shared stylesheet. They include visible focus states, keyboard-reachable controls, logical content structure, reduced-motion CSS, and non-color labels for statuses. The HTML artifacts are design prototypes, not production accessibility validation.

Before implementing in `LandingPage.tsx`:

1. Run keyboard-only and screen-reader walkthroughs for header, audience switch, search, banner, FAQ, and CTAs.
2. Test `/en` and `/ar` at 320px, 768px, and desktop widths; inspect long translated strings and RTL alignment.
3. Mock `/api/public/landing` slow, empty, partial, and failed responses.
4. Verify AI signal provenance, freshness, permissions, and consent semantics against real APIs.
5. Measure search start/completion, profile registration, employer registration, wrong-path clicks, scroll depth, and comprehension of the score explanation.

## Phased implementation plan

- **Phase 1 — Trust and clarity:** implement the explainable match card, stable proof block, search metadata, and banner accessibility safeguards.
- **Phase 2 — Role paths:** add the workflow block and role-specific CTA tracking while preserving current links.
- **Phase 3 — Optimization:** test preview counts, supporting content order, mobile trust-card placement, and English/Arabic copy variants.

No production landing files were changed in this artifact pass.
