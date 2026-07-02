# Injection & Unsafe Input Handling — Audit Findings

> Scope: 5 categories requested — raw SQL, `dangerouslySetInnerHTML`, SSRF, mass assignment,
> file uploads. Pass done 2026-07-02 against `mployedin/src`. Static + targeted file reads.
> Companion to `ACCESS-CONTROL-MAP.md`. No fixes applied.

## Summary

| Severity | Count |
|---|---|
| 🔴 CRITICAL | 3 |
| 🟡 WARNING | 5 |
| 🔵 SUGGESTION | 3 |

Headline: three SSRF holes (public image proxy allowlist bypass + two unvalidated
webhook fetches) and three raw-HTML render sinks with no sanitization. Mass assignment
(the previously-fixed pattern) and file uploads both came back **clean** — every `...body`
spread is gated by a Zod schema, and every upload does server-side MIME + size + magic-byte
checks into non-executable object storage.

---

## 1. Raw SQL string concatenation

**N/A — no SQL in this codebase.** Stack is MongoDB/Mongoose. No `$queryRaw`, `.query(`,
`sequelize`, or template-literal query building anywhere in `src`.

Only `.raw()` hit is `src/app/[locale]/(dashboard)/job-seeker/cv/tips-drawer.tsx:67`
(`t.raw(...)` — i18n message lookup, not a query). Not a finding.

NoSQL-injection note: Mongoose update/query filters reviewed under category 4 are scoped
by app-set ids (userId/employerId), not raw body objects, so `$where`/operator-injection
surface is low. No `$where` usage found.

---

## 2. dangerouslySetInnerHTML (XSS)

Two sanitizers exist: `src/lib/security/html.ts` (DOMPurify, robust, client) and
`src/lib/security/sanitize-html.ts` (regex-based, weaker, server). JSON-LD / theme-script
sinks in `layout.tsx` are `JSON.stringify` or static code — safe, not listed.

### 🔴 CRITICAL — Raw CMS HTML rendered with no sanitization (3 pages)

📍 Locations:
- `src/app/[locale]/(public)/gdpr/page.tsx:71` — `__html: body`
- `src/app/[locale]/(public)/cookies/page.tsx:68` — `__html: body`
- `src/app/[locale]/(public)/blog/[slug]/page.tsx:119` — `__html: body`

❌ Problem: `body` comes straight from CMS endpoints (`/api/public/pages/*`,
`/api/public/blogs/{slug}`) → DB → admin editor, and is injected raw. Sibling pages
`terms` and `privacy` wrap the identical source in `sanitizeHtml()` (DOMPurify) at line 69;
these three do not. Stored XSS to every public visitor if any CMS write path (or an
over-privileged/compromised admin) lands script.
💡 Why: Same data class as terms/privacy, but the sanitize call was dropped — inconsistent
handling is the whole bug.

### 🟡 WARNING — CMS editor live-preview renders unsanitized HTML

📍 `src/app/[locale]/(dashboard)/admin/cms/static-pages/new/page.tsx:191,242` and
`.../[id]/edit/page.tsx:222,273`

❌ Problem: Preview tab dumps the textarea `body`/`bodyAr` raw into the DOM. Backend
re-sanitizes on POST/PATCH, so it isn't persisted unsanitized — but the author's session
executes attacker/typo'd script live during editing (self-XSS / admin-session risk).
💡 Why: Admin-only and non-persistent, so not critical, but a real DOM sink.

### 🔵 SUGGESTION — sanitized sinks, confirm coverage stays

📍 `terms/page.tsx:69`, `privacy/page.tsx:69`, `job-seeker/cv/templates.tsx:139`,
`components/shared/AIEmailDraftButton.tsx:153`, `employer/applications/page.tsx:2795`
— all DOMPurify-wrapped or client-only preview of the user's own input. Acceptable today;
keep the sanitize wrapper when refactoring. Also: server sanitizer is regex-based —
consider server-side DOMPurify for parity with the client.

---

## 3. Server-side fetch with user-controlled URL (SSRF)

### 🔴 CRITICAL — Public image proxy allowlist bypass

📍 `src/app/api/proxy-image/route.ts:34` (endpoint is PUBLIC, no auth)

❌ Problem: allowlist check is
`ALLOWED_HOSTS.some((host) => parsed.hostname.endsWith(host))`.
`endsWith("digitaloceanspaces.com")` matches attacker-registrable
`evildigitaloceanspaces.com` (no dot boundary). Attacker controls that domain →
server fetches arbitrary URL → response body returned to caller. HTTPS-only + 10s timeout
limit it, but it's an unauthenticated arbitrary-fetch / allowlist bypass.
✅ Direction (no fix applied): match on exact host or `hostname === h || hostname.endsWith("." + h)`.
💡 Why: Suffix match without a leading-dot boundary is the classic allowlist bypass.

### 🔴 CRITICAL — Webhook dispatch fetches user URL, no private-IP block

📍 `src/lib/integrations/webhookDispatcher.ts:132` — `fetch(webhook.url, …)`

❌ Problem: `webhook.url` is validated only by `z.string().url()` at creation
(`src/app/api/admin/webhooks/route.ts`). No block on `localhost`, `127.0.0.1`,
`10./172.16./192.168.`, or `169.254.169.254` (cloud metadata). Server issues requests to
internal services / metadata endpoint. Note: `/api/developer` also exposes webhook
creation to ANY authenticated role (per ACCESS-CONTROL-MAP §4), widening who can set the URL.
💡 Why: No SSRF egress filtering on a server-initiated request to a user-supplied host.

### 🔴 CRITICAL — Webhook test endpoint, same unvalidated fetch

📍 `src/app/api/admin/webhooks/[id]/test/route.ts:59` — `fetch(webhook.url, …)`

❌ Problem: Loads stored `webhook.url` and fetches it with the same missing private-IP
validation. Admin-gated so blast radius is smaller, but identical root cause; fix both with
one shared URL-guard helper.

### 🟡 WARNING — LinkedIn import fetch of stored profile URL

📍 `src/lib/ai/linkedin-import.ts:48` (also `src/lib/auth/linkedin-profile.ts`)

❌ Problem: `fetchPublicProfileHtml(profileUrl)` fetches a URL sourced from user
`socialLinks`. Exploitable only if users can store an arbitrary LinkedIn URL without
host validation. Verify the profile-update path constrains host to `linkedin.com`.
💡 Why: User-settable DB field flowing into a server fetch — SSRF if unconstrained.

### 🟡 WARNING — rehost-avatar fetches external URL, only protocol-checked

📍 `src/lib/storage/rehost-avatar.ts:37`

❌ Problem: `fetch(url)` guarded only by `/^https?:\/\//` (line 28) — no private-IP block.
Currently fed OAuth-provider avatar URLs (Google/LinkedIn, trusted) so risk is LOW, but any
future caller passing user input makes it SSRF. Add the shared guard here too.

### 🔵 SUGGESTION — next.config remotePatterns wildcard

📍 `next.config.ts:77` — `hostname: "*.digitaloceanspaces.com"`

Next/Image only (client render), not a server-fetch SSRF vector. Wildcard is broad; pin to
the specific bucket host if practical. Non-issue for this audit's scope.

**Confirmed non-issues:** `contact/route.ts` (hardcoded reCAPTCHA verify URL),
`whatsapp.ts` (hardcoded Dxing API), `ai/chat` + `ai/speech-to-text` (hardcoded upstream AI
base URLs) — no user-controlled host.

---

## 4. Mass assignment (`{...body}` / `$set: body` into DB write)

**CLEAN.** All 24 spread/`$set` sites checked (list from ACCESS-CONTROL-MAP satellites +
grep of the api tree). Every one is **guarded**: `validateBody()` with a strict Zod schema
whitelists fields *before* the spread, sensitive fields (`status`, `role`, `createdBy`,
`userId`, `employerId`, `assignedBy`, webhook `secret`) are app-set/hardcoded not taken from
body, and multi-tenant updates scope the query filter by owner id.

Representative confirmations (all 🔵 no-action):
- `admin/webhooks/[id]/route.ts:52` `$set: body` — `webhookUpdateSchema`, secret not settable.
- `user/saved-searches/[id]/route.ts:32` `$set: body` — schema `.strict()`, filter scoped by `userId`.
- `admin/targets/[id]/route.ts:61` `findByIdAndUpdate($set: body)` — `targetUpdateSchema`
  admits only `targetValue/currency/notes/status`.
- `leads/route.ts:90`, `reviews/route.ts:121`, `assessments/route.ts:116`,
  `career-pages/route.ts:76` (nested `theme` merge, whitelisted), all `*target-profiles`,
  `*workflow-templates`, `*matching-weight-templates`, `subscription-plans`,
  `comm-templates`, `job-templates` — schema-validated + ownership-scoped.

No `Object.assign(doc, body)` anywhere. The previously-fixed pattern has **not** regressed.

---

## 5. File uploads

**CLEAN.** All 11 upload endpoints enforce server-side controls:

- **MIME:** validated server-side via `validateUploadedFile()` or hardcoded allowlists —
  not relying on client `accept=""`. `file-validation.ts` also does **magic-byte** checks
  (rejects `.exe` renamed to `.jpg`; DOCX gets ZIP-structure check).
- **Size:** enforced server-side before upload — 5MB avatars/logos, 10MB CV/docs,
  50MB resources, 5MB speech.
- **Storage/execution:** DigitalOcean Spaces (S3-compatible object storage), never local
  `public/`. Cannot execute. CVs stored `private` + presigned URLs. Malware scan
  (`lib/security/malware-scan.ts`, EICAR + optional ClamAV, fail-closed) runs on every upload.

Endpoints verified: `job-seeker/cv`, `job-seeker/documents`, `job-seeker/onboarding/[id]/upload`,
`employers/documents`, `employers/logo`, `job-seekers/avatar`, `super-agent/avatar`,
`agent/avatar`, `resources`, `ai/cv-extract`, `ai/speech-to-text`.

🔵 SUGGESTION — `resources/route.ts:13` uses prefix MIME match
(`type.startsWith("text/")` etc.), so subtypes like `text/x-python` pass. No execution risk
in object storage, but tighten to an explicit list if fine-grained control is wanted.

---

## Fix priority

1. `proxy-image/route.ts:34` — public unauth SSRF, exact-host match.
2. `webhookDispatcher.ts:132` + `webhooks/[id]/test/route.ts:59` — one shared private-IP/URL guard.
3. gdpr / cookies / blog pages — wrap `__html` in `sanitizeHtml()` like terms/privacy.
4. Verify LinkedIn `socialLinks` URL host validation; add guard to `rehost-avatar.ts`.
5. CMS editor preview + server-side DOMPurify parity (lower priority).
