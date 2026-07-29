# OWASP Top 10 Security Assessment

**Application:** mployedin  
**Assessment date:** 2026-07-25  
**Authorized target:** `http://localhost:3000` only  
**Code revision:** `36abecf` (`main`)  
**Primary DAST tool:** OWASP ZAP 2.17.0  
**Supplemental tools:** Semgrep 1.171.0, Trivy 0.72.0, Gitleaks 8.30.1, npm audit, Playwright/direct HTTP validation  
**Overall score:** **22/100**  
**OWASP Top 10 status:** **Non-compliant**  
**Production recommendation:** **Do not deploy. Critical and High findings must be remediated and re-tested before production.**

## Remediation update — 2026-07-25

Repository and authorized development-environment remediation was completed after
the assessment. Status is based on code review, 657 passing tests, a production
build, focused Semgrep, npm audit, direct HTTP regression checks, browser checks,
and database password-hash verification.

| Finding | Status | Verification/result |
|---|---|---|
| F-01 fixed privileged credentials | **Completed** | All five passwords removed from source and rotated in the configured development database; old passwords match 0/5 accounts, replacements match 5/5, and password-change timestamps invalidate existing sessions. Replacements are stored only in the local macOS Keychain service `mployedin-dev-seed-passwords`. |
| F-02 tracked cloud/database secrets | **Blocked — external action required** | Hard-coded Google and MongoDB credentials were removed from every current script; tools now require environment inputs and fail closed. Google Cloud/Atlas administration is not authenticated, so key/database-user revocation and usage-log review could not be performed. The old values remain in Git history until an authorized coordinated history rewrite. Do not mark this finding closed until both credentials are rotated. |
| F-03 vulnerable components | **Completed for Critical/High** | Next.js 16.2.11, NextAuth beta.32/Auth.js 0.41.3, Nodemailer 9.0.3, Sharp 0.35.3, WebSocket Driver 0.7.5, and other transitives upgraded/overridden. `npm audit --audit-level=high` now exits successfully with 0 Critical and 0 High; 10 Moderate transitive records remain in Firebase Admin/MCP dependency chains. |
| F-04 LinkedIn SSRF | **Completed** | Canonical `https://www.linkedin.com/in/...` allowlist, existing DNS/IP SSRF guard, redirect-hop validation, 10-second timeout, HTML content-type check, and 1 MB response limit added. Regression tests reject metadata, insecure-scheme, and malicious-suffix URLs. |
| F-05 spoofable proxy identity | **Completed** | Added explicit trusted-proxy resolution, middleware header normalization, and direct protection for Auth.js/auth-public routes and shared rate-limit wrappers. Client forwarding headers are ignored by default. |
| F-06 optional/fail-open CAPTCHA | **Completed** | CAPTCHA is mandatory when configured and now fails closed on missing token, service failure, low score, action mismatch, or hostname mismatch. |
| F-07 JSON-LD injection | **Completed** | All affected JSON-LD insertions use a serializer that escapes HTML-significant characters and Unicode line separators. |
| F-08 invitation email injection | **Completed** | Dynamic HTML text/URL attributes are encoded and subject CR/LF is removed. Focused Semgrep reports zero findings. |
| F-09 missing CI controls | **Completed** | Added `.github/workflows/security.yml` with clean install, tests, build, npm audit gate, Semgrep, Gitleaks, and Trivy. |
| F-10 broad CSP | **Completed** | Removed broad `https:` image access and broad inline-style-element permission; production uses explicit origins, request nonces, and exact framework style hashes. Browser check confirms no unsafe script directive. |
| F-11 malformed public requests | **Completed** | MCP/contact invalid JSON now returns 400 and employer registration wrong content type returns 415, without a 500. |
| F-12 `.env` permissions | **Completed** | Local `.env` mode changed from 0644 to 0600. |
| F-13 password policy | **Completed** | One server-side 12-character composition/common-password policy is applied to registration, privileged creation, change, and reset paths; login remains backward-compatible. |
| F-14 health disclosure | **Completed** | Public health response is reduced to `{"status":"ok"}` (or generic error) with no database/timestamp details. |

### Updated disposition

- **Completed findings:** 13 of 14 observations (12 of 13 Critical–Low vulnerabilities).
- **Open finding:** F-02 remains Critical until the exposed Google key and MongoDB database-user password are rotated and their usage reviewed.
- **Current dependency threshold:** 0 Critical, 0 High, 10 Moderate transitive advisories.
- **Interim security score:** **82/100**.
- **OWASP status:** **Substantially remediated; A02/A08 remain non-compliant because F-02 is open.**
- **Production readiness:** **Not ready while F-02 remains open.** After key revocation, perform a staging ZAP re-test using production TLS/proxy settings before deployment.

## Executive summary

The assessment confirmed 13 security findings: 3 Critical, 1 High, 5 Medium, and 4 Low, plus one Informational observation.

The most urgent risks are:

1. Fixed credentials for all five roles are committed in a seed script and the same known passwords are active in the configured database, including the administrator account.
2. A Google/Gemini API key is committed in a tracked script and is present in Git history.
3. Production dependencies include Critical Auth.js/NextAuth and WebSocket advisories and multiple High Next.js advisories with available fixes.
4. A job seeker's arbitrary saved “LinkedIn” URL is fetched by the server with redirects enabled and without the application's existing SSRF guard.

Positive controls were also verified. Page-level role separation worked across all five roles, 89 privileged GET APIs denied a job-seeker session, GraphQL was admin-only, 307 protected state-changing handler/method combinations rejected missing CSRF tokens, security headers were consistently present, public image proxy SSRF checks blocked metadata/private targets, and no unexpected anonymous GET handler returned a server error during the controlled endpoint sweep.

## Scope and limitations

- Testing was limited to the local application at `localhost:3000`. No production hostname was tested.
- The application connects to a remote development MongoDB cluster. Existing seeded test accounts were used; no new accounts or business records were intentionally created.
- Destructive authenticated actions (deletes, payments, bulk import, notification sends, and irreversible workflow transitions) were not executed. Their code paths were statically reviewed and their authentication/CSRF boundaries were tested.
- Production TLS certificate quality, reverse-proxy behavior, cloud firewall rules, OS packages, and deployed alerting cannot be validated from a localhost source assessment.
- There is no application Dockerfile or Compose manifest, so Docker image and image-trust scanning are not applicable to this repository.
- There is no application WebSocket server endpoint. The only WebSocket use found is an outbound Soniox speech-to-text client.
- ZAP's traditional spider and active scanner completed. Its bundled AJAX spider could not launch its browser on this macOS environment; client-rendered and authenticated coverage was supplemented with route inventory and authenticated HTTP/browser checks.

## Coverage

| Surface | Coverage/result |
|---|---|
| Page routes | 235 `page.tsx` routes inventoried; public crawl plus authenticated role-root and targeted page checks |
| API route files | 422 inventoried |
| Handler methods | 294 GET, 193 POST, 2 PUT, 78 PATCH, 66 DELETE, 1 OPTIONS |
| Anonymous GET sweep | All 294 detected GET handlers requested: 266 returned 401, 12 intentional public 200s, remainder 307/400/403/404; no unexpected 500 |
| Protected mutations | 307 non-exempt POST/PUT/PATCH/DELETE handler combinations tested without CSRF; all returned 403 |
| Privileged APIs | 89 admin/super-agent/agent GET endpoints tested with job-seeker session; all returned 403 |
| Role matrix | 25 dashboard role/section combinations tested; all non-admin cross-role attempts redirected to the caller's dashboard; admin access matched the configured hierarchy |
| GraphQL | Anonymous, job-seeker, and super-agent received 403; admin received 200 |
| ZAP crawl | 57 live public URLs discovered |
| ZAP alerts | 54 raw instances: 0 High, 25 Medium, 11 Low, 18 Informational; validated findings and false positives are separated below |
| WebSockets | No inbound WebSocket endpoint found |
| Semgrep | 4 results: two JSON-LD injection sites, one email HTML injection, one GCM false positive |
| Trivy | 72 dependency advisory records: 4 Critical, 33 High, 27 Medium, 8 Low |
| npm audit, production dependencies | 56 records: 3 Critical, 16 High, 37 Moderate |
| Gitleaks | 5 results: one confirmed cloud key and four false positives |
| Trivy secrets | Three secrets in ignored `.env`; additionally, Gitleaks confirmed a tracked cloud key |

## Findings

### F-01 — Fixed privileged credentials are committed and active

- **Severity:** Critical
- **OWASP:** A07 Identification and Authentication Failures; A05 Security Misconfiguration; A04 Insecure Design
- **Affected file/endpoints:** `scripts/create-admin.mjs:27`; `/en/login`; all authenticated/admin endpoints
- **Description:** The seed script contains fixed passwords for administrator, super-agent, agent, employer, and job-seeker accounts. A read-only database verification confirmed all five accounts exist, are active and verified, and their stored bcrypt hashes match the committed passwords. A full administrator session was obtained through the normal Auth.js credential flow.
- **Evidence:** `scripts/create-admin.mjs:28-33` contains the fixed credentials. Read-only bcrypt verification returned `knownPassword: true` for all five users. Administrator GraphQL access returned 200 after login.
- **Reproduction:**
  1. Read the role credentials from `scripts/create-admin.mjs`.
  2. Submit the administrator email/password through `/en/login` or `/api/auth/callback/credentials`.
  3. Request `/en/admin` or POST `{ "__typename" }` to `/api/graphql`.
  4. Observe an authenticated administrator response.
- **Remediation:** Immediately rotate every seeded password, invalidate all existing sessions, remove fixed credentials from source, and change the script to generate random one-time passwords or require explicit secret inputs. Prevent seed scripts from targeting shared/staging/production databases. Require MFA for privileged roles.
- **Verification:** Confirm the old passwords fail for all five accounts, existing sessions are invalid, the script contains no passwords, a new seed run produces unique random credentials, and privileged login requires MFA.

### F-02 — Live cloud/database credentials committed to source and Git history

- **Severity:** Critical
- **OWASP:** A02 Cryptographic Failures; A08 Software and Data Integrity Failures
- **Affected files:** `scripts/test-gemini.mjs:3`; legacy database/debug/migration scripts; Git commit `b23034d4` and repository history
- **Description:** A Google/Gemini API key was used as a hard-coded fallback in a tracked script. Multiple tracked maintenance scripts also contained a MongoDB connection URI with username/password. Anyone with repository access can consume the API key or access data allowed to the database user. The remediation update removes both from the current tree, but external rotation is still required.
- **Evidence:** Gitleaks rule `gcp-api-key` identified `scripts/test-gemini.mjs:3` in commit `b23034d4`. The current tracked file still contains the key.
- **Reproduction:** Run Gitleaks against Git history or inspect line 3 of the tracked script. Do not send a request with the exposed key.
- **Remediation:** Revoke/rotate the key immediately in Google Cloud, inspect usage logs for abuse, remove the fallback, load the key only from a secret manager/environment, and purge the secret from Git history where policy permits. Add a server-side pre-commit and CI secret scan.
- **Verification:** The old key is disabled, Gitleaks reports no real secret in the current tree or rewritten history, and the script fails closed when `GEMINI_API_KEY` is absent.

### F-03 — Critical and High vulnerable production components

- **Severity:** Critical
- **OWASP:** A06 Vulnerable and Outdated Components; A08 Software and Data Integrity Failures
- **Affected files:** `package.json`, `package-lock.json`
- **Description:** Trivy found 72 advisory records, including 4 Critical and 33 High. `npm audit --omit=dev` still reports 3 Critical, 16 High, and 37 Moderate production records. Important directly or transitively reachable components include:

| Package/version | Advisory | Risk | Fixed version reported by scanner |
|---|---|---|---|
| `next-auth 5.0.0-beta.31` / `@auth/core 0.41.2` | GHSA-8fpg-xm3f-6cx3 | Auth configuration errors can make existence checks fail open | `next-auth 5.0.0-beta.32` |
| `next-auth` / `@auth/core` | GHSA-7rqj-j65f-68wh | Unicode email normalization bypass | `next-auth 5.0.0-beta.32`, `@auth/core 0.41.3` |
| `websocket-driver 0.7.4` | CVE-2026-54466 | Resource-limit/protocol abuse | `0.7.5` |
| `next 16.2.9` | CVE-2026-64641/42/45/49 | DoS, middleware/proxy bypass, SSRF | `16.2.11` |
| `nodemailer 7.0.13` | GHSA-p6gq-j5cr-w38f | Raw-message file read/full-response SSRF | `9.0.1` |
| `sharp 0.34.5` | GHSA-f88m-g3jw-g9cj | Inherited libvips vulnerabilities | `0.35.0` |
| `ws 8.20.0` | CVE-2026-48779 | Fragment-based memory exhaustion | `8.21.0` |

- **Evidence:** Trivy JSON totals: Critical 4, High 33, Medium 27, Low 8. `npm audit --omit=dev`: Critical 3, High 16, Moderate 37.
- **Reproduction:** Run `trivy fs --scanners vuln --include-dev-deps .` and `npm audit --omit=dev`.
- **Remediation:** Upgrade NextAuth/Auth.js and Next.js first, then update the remaining direct dependencies and regenerate the lockfile. Use `npm explain` to update transitive parents. Test authentication, middleware, image processing, email, Firebase, Inngest, and WebSocket clients after upgrades.
- **Verification:** Trivy and npm audit show zero Critical/High production advisories, authentication regression tests pass, and middleware role/CSRF matrices remain green.

### F-04 — Authenticated SSRF through stored LinkedIn profile URL

- **Severity:** High
- **OWASP:** A10 Server-Side Request Forgery
- **Affected files/endpoints:** `src/lib/ai/linkedin-import.ts:46`; `src/lib/validators/job-seekers.ts:30`; `POST /api/linkedin/import-profile`
- **Description:** Job-seeker social links accept any syntactically valid URL. The link labelled `LinkedIn` is later fetched server-side with `redirect: "follow"` and no scheme/host/private-IP validation. The repository already has `assertPublicUrl`/`safeFetch`, but this sink does not use it. Returned internal content is also forwarded to an external AI provider, increasing exfiltration impact.
- **Evidence:** The validator only calls `z.string().url()`. `fetchPublicProfileHtml(profileUrl)` directly invokes `fetch(profileUrl, { redirect: "follow" })`. Public image proxy controls correctly rejected `169.254.169.254` and malicious suffix hosts, showing the missing control is isolated to this sink.
- **Reproduction (safe local verification):**
  1. Use an authorized job-seeker account that has a LinkedIn OAuth token.
  2. Save a `socialLinks` entry labelled `LinkedIn` pointing to a controlled HTTP server.
  3. Call `POST /api/linkedin/import-profile` with a valid CSRF token.
  4. Observe the server request at the controlled endpoint.
  5. Do not target metadata/private services outside an explicitly isolated test network.
- **Remediation:** Require an exact `https://www.linkedin.com/` host policy for this feature, call `safeFetch`, validate every redirect, enforce response-size/time/content-type limits, and prevent internal content from being forwarded to AI providers.
- **Verification:** Controlled public LinkedIn URLs work; loopback, RFC1918, link-local, metadata, alternate schemes, userinfo tricks, DNS rebinding test domains, and redirect hops to private IPs are rejected.

### F-05 — IP rate limits can be bypassed with spoofed forwarding headers

- **Severity:** Medium
- **OWASP:** A04 Insecure Design; A07 Identification and Authentication Failures
- **Affected files/endpoints:** `src/lib/auth/config.ts:53`; `src/lib/security/rateLimit.ts:212`; contact, registration, login, MCP registration, and other rate-limited APIs
- **Description:** Rate-limit keys trust the leftmost client-supplied `X-Forwarded-For` or `X-Real-IP` without a trusted-proxy boundary. After local login rate limiting blocked an additional role login, changing `X-Forwarded-For` immediately allowed it.
- **Evidence:** The login flow takes `.split(",")[0]`; the common dual limiter uses the whole forwarding header. A request with a new spoofed header successfully authenticated after the original source key was limited.
- **Reproduction:** Exhaust a rate limit from an authorized test source, resend with a different `X-Forwarded-For`, and observe the request is processed under a fresh bucket.
- **Remediation:** Use a platform-authenticated client-IP field or normalize forwarding headers only after a trusted reverse proxy strips client values. Apply account/device keys as well as trusted IP keys. Use a distributed fail-closed limiter for authentication and public abuse endpoints.
- **Verification:** Changing client-supplied forwarding headers does not change the rate-limit identity, while requests from genuinely different proxy-reported clients remain distinct.

### F-06 — Contact CAPTCHA is optional and fails open

- **Severity:** Medium
- **OWASP:** A04 Insecure Design
- **Affected endpoint/file:** `POST /api/contact`; `src/app/api/contact/route.ts:28`
- **Description:** CAPTCHA verification only occurs when both the server secret and a client token are present. An attacker can omit `captchaToken`. If verification raises an error, the route explicitly proceeds. Combined with F-05, automated contact spam/database growth is practical.
- **Evidence:** `if (captchaSecret && captchaToken)` skips verification when the token is absent; the catch block logs and continues.
- **Reproduction:** In an authorized test database, submit a schema-valid contact payload without `captchaToken`; the CAPTCHA branch is skipped.
- **Remediation:** When CAPTCHA is configured, require a token and fail closed on absence, timeout, malformed response, hostname/action mismatch, or low score. Add server-side abuse heuristics and trusted-IP rate limiting.
- **Verification:** Missing, invalid, replayed, wrong-action, and service-error tokens return 403/503 without creating a submission.

### F-07 — Stored HTML injection in job JSON-LD

- **Severity:** Medium
- **OWASP:** A03 Injection
- **Affected pages/files:** `/[locale]/jobs/[id]`, `/[locale]/job-seeker/jobs/[id]`; public page line 179 and authenticated page line 200
- **Description:** Employer-controlled job title/description values are JSON-stringified into `dangerouslySetInnerHTML`. `JSON.stringify` does not escape `</script>`, so a stored value can close the JSON-LD element and inject markup. The current nonce-based CSP substantially limits JavaScript execution, but stored markup/phishing and future CSP regressions remain possible.
- **Evidence:** Semgrep reported both sites. The JSON-LD object includes `job.title` and `job.description` and is inserted without escaping `<`.
- **Reproduction:** In an isolated test record, save a job description containing a `</script>` boundary and harmless marker element, then view the public job page and inspect the DOM.
- **Remediation:** Serialize JSON-LD with `<`, `>`, `&`, U+2028, and U+2029 escaped (for example, replace `<` with `\\u003c`) or use a vetted safe JSON-LD component.
- **Verification:** Boundary payloads remain text inside the JSON-LD script and create no DOM nodes; CSP remains enforced.

### F-08 — HTML injection in team invitation emails

- **Severity:** Medium
- **OWASP:** A03 Injection
- **Affected endpoint/file:** team invitation flow; `src/app/api/employers/team/route.ts:220`
- **Description:** Employer-controlled company name and derived role text are interpolated directly into HTML email markup. A malicious employer can inject arbitrary email HTML and phishing links into invitations sent by the trusted platform.
- **Evidence:** Semgrep traced user data into the template. `employer.companyName` is inserted in the subject and HTML without HTML encoding.
- **Reproduction:** In an authorized mail sandbox, set a company name containing harmless closing tags and marker HTML, invite a test address, and inspect the delivered markup.
- **Remediation:** HTML-encode every dynamic text value, use a template engine with auto-escaping, and separately validate URLs used in attributes.
- **Verification:** `<`, `>`, quotes, ampersands, and bidi/control-character test values render as text and cannot add elements or attributes.

### F-09 — No repository CI security or build-integrity enforcement

- **Severity:** Medium
- **OWASP:** A08 Software and Data Integrity Failures; A09 Security Logging and Monitoring Failures
- **Affected repository:** no `.github/workflows`, Dockerfile, or equivalent CI policy found
- **Description:** The repository has a lockfile with integrity hashes but no committed CI workflow enforcing tests, dependency review, secret scanning, SAST, artifact provenance, or deployment gates. Existing Critical issues were therefore not prevented.
- **Evidence:** No CI workflow files were found. A real cloud key and Critical dependency advisories are committed.
- **Remediation:** Add protected-branch CI for `npm ci`, tests/build, Semgrep, Gitleaks, dependency review/Trivy, SBOM generation, and signed/provenance-attested artifacts. Block Critical/High findings and secret detections.
- **Verification:** A test branch containing a synthetic secret or known vulnerable fixture is blocked; approved builds emit an SBOM and verifiable provenance.

### F-10 — CSP retains broad/unsafe directives

- **Severity:** Low
- **OWASP:** A05 Security Misconfiguration
- **Affected file:** `src/lib/security/headers.ts`
- **Description:** Production CSP allows inline styles, broad `https:` images, multiple broad third-party frame/object hosts, and `wasm-unsafe-eval`. Development additionally allows `unsafe-eval`. These choices reduce defense-in-depth if injection occurs.
- **Evidence:** ZAP reported repeated wildcard/inline/eval CSP alerts. `unsafe-eval` was confirmed as development-only; `unsafe-inline` styles and broad sources remain in production.
- **Remediation:** Narrow host allowlists, remove unused frame/object/connect destinations, migrate inline styles, and remove `wasm-unsafe-eval` if not strictly required. Keep per-request nonces and `strict-dynamic`.
- **Verification:** Production headers contain only required origins/directives and all application workflows pass CSP violation monitoring.

### F-11 — Malformed public requests produce avoidable 500 responses

- **Severity:** Low
- **OWASP:** A05 Security Misconfiguration
- **Affected endpoints:** `POST /api/mcp/register`, `POST /api/contact`; invalid-content behavior in employer registration
- **Description:** `validateBody` throws a `NextResponse`, but unwrapped public handlers do not consistently return it. Empty/invalid requests yielded 500 on MCP registration and contact instead of stable 400 responses. This creates noisy logs and a low-cost error/availability path.
- **Evidence:** Empty JSON returned 500 for MCP registration and contact. Authenticated `withAuth` handlers correctly catch and return thrown validation responses.
- **Remediation:** Introduce a common public-handler wrapper or return typed validation results instead of throwing responses. Standardize 400/415 errors before DB access.
- **Verification:** Empty, malformed JSON, wrong content type, oversized input, and schema failures consistently return bounded 4xx responses without stack traces or error-level log floods.

### F-12 — Local secret file is world-readable

- **Severity:** Low
- **OWASP:** A02 Cryptographic Failures
- **Affected file:** `.env`
- **Description:** The ignored `.env` is mode `0644` and contains private-key/API-token material. Other local users on the same host can read it.
- **Evidence:** `stat` returned `-rw-r--r-- 644`; Trivy detected JWT/API/private-key patterns in the file. The file is correctly ignored and has never been committed.
- **Remediation:** Set mode `0600`, keep secrets in an OS/cloud secret manager where possible, and use short-lived credentials.
- **Verification:** Only the owning user can read the file and Trivy/Gitleaks do not find secrets in tracked artifacts.

### F-13 — Inconsistent server-side password policy

- **Severity:** Low
- **OWASP:** A07 Identification and Authentication Failures
- **Affected validators:** employer/agent/admin creation and reset schemas
- **Description:** Job-seeker registration requires mixed character classes, while employer, agent, administrator creation, login, and password reset generally enforce only 8–128 characters. This inconsistency permits weak privileged passwords. The active fixed passwords in F-01 magnify the concern.
- **Evidence:** `employerRegisterSchema`, `agentRegisterSchema`, admin create schemas, and reset-password schema use only `.min(8).max(128)`.
- **Remediation:** Use a single server-side policy for every credential path. Prefer longer minimum length, breached-password screening, and MFA for privileged users rather than brittle composition rules.
- **Verification:** Every create/change/reset path rejects known-breached and too-short passwords and accepts strong passphrases consistently.

### F-14 — Health endpoint reveals database status

- **Severity:** Informational
- **OWASP:** A05 Security Misconfiguration
- **Affected endpoint:** `GET /api/health`
- **Description:** The public health endpoint returns application and database health. It does not disclose credentials or versions, but it gives unauthenticated users operational state.
- **Evidence:** Anonymous request returned `{"status":"ok", ... ,"db":"ok"}`.
- **Remediation:** Keep only a minimal liveness response public; put dependency/readiness detail behind platform authentication or an internal network.
- **Verification:** Public response contains no dependency status; internal monitoring can still retrieve detailed readiness.

## OWASP Top 10 status

| Category | Status | Assessment |
|---|---|---|
| A01 Broken Access Control | Partial pass | No vertical role bypass confirmed. 25 page-role checks, 89 privileged APIs, and GraphQL controls passed. Object/tenant logic was statically reviewed, but destructive cross-tenant object mutations were not executed. |
| A02 Cryptographic Failures | Fail | Tracked live API key and locally over-broad `.env` permissions. AES-256-GCM, bcrypt cost 12, HSTS, and secure production cookie settings are positive controls. |
| A03 Injection | Fail | Stored JSON-LD HTML injection and email HTML injection confirmed. ZAP did not confirm SQL/NoSQL/command/LDAP/XPath/template/CRLF injection. |
| A04 Insecure Design | Fail | Fixed credentials, spoofable rate-limit identity, fail-open/optional CAPTCHA. |
| A05 Security Misconfiguration | Fail | Default credentials, CSP defense gaps, avoidable 500s, and public dependency health. Core clickjacking/MIME/referrer/permissions headers passed. |
| A06 Vulnerable Components | Fail | Critical and High production advisories with fixes available. |
| A07 Authentication Failures | Fail | Active known privileged credentials, spoofable IP limiter, and inconsistent password policy. Account lockout, bcrypt, session invalidation checks, and optional TOTP are present. |
| A08 Software/Data Integrity | Fail | Tracked key, vulnerable lockfile, and no CI integrity/security gates. Lockfile integrity hashes are present. |
| A09 Logging/Monitoring | Partial | Authentication, authorization, tenant-view, and activity audit logging are implemented with Pino redaction. Deployed alerting, immutable retention, and tamper protection were not evidenced; no CI security monitoring exists. |
| A10 SSRF | Fail | LinkedIn import sink bypasses the existing SSRF guard. Public image proxy controls passed private-IP/metadata/redirect-host tests. |

## Additional checks

| Check | Result |
|---|---|
| Reflected/stored/DOM XSS | Stored JSON-LD HTML injection found; ZAP found no confirmed reflected/DOM execution. |
| CSRF | 307 protected mutating handler/method combinations rejected missing tokens. Auth.js callbacks and explicitly exempt bearer/public routes were separately authorization-tested. |
| Clickjacking | Passed: `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'`. |
| File upload | Magic-byte, MIME, size, DOCX-structure, EICAR, and optional fail-closed remote malware controls exist. No destructive upload was performed. |
| Open redirect | Login callback requires same origin/locale; MCP redirect URIs are DB-paired. No open redirect confirmed. |
| Path traversal/file download | Document access helper and route ownership checks found; no confirmed traversal. Dependency advisories still require upgrade. |
| API rate limiting | Present but IP identity is spoofable (F-05); user+IP dual keys exist on many authenticated endpoints. |
| Session fixation/hijacking | Auth.js encrypted session cookie used; HttpOnly/SameSite present. No fixation confirmed. Production Secure behavior is code-configured but not observable on HTTP localhost. |
| Cookie security | Auth cookies HttpOnly/SameSite Lax. Custom CSRF cookie is intentionally JS-readable, SameSite Strict, and Secure in production. |
| Cache poisoning/request smuggling | No confirmed finding. Local Next server is not representative of the production proxy chain. Upgrade Next.js for relevant advisories. |
| HTTP parameter pollution | No confirmed authorization impact. |
| GraphQL | Admin-only; production disables GraphiQL and introspection. |
| WebSockets | No inbound endpoint to test. |

## False positives and development-only observations

1. **ZAP Application Error Disclosure (3):** `/en/blog`, `/en/login`, and `/en/register` returned 500 only after the development compiler process became unstable under concurrent full-route compilation and active scanning. No stack trace disclosure was present. Not treated as an application disclosure finding.
2. **ZAP `script-src unsafe-eval`:** confirmed development-only in `headers.ts`; production uses `wasm-unsafe-eval` instead. The remaining production CSP concerns are captured in F-10.
3. **ZAP Cookie No HttpOnly:** the custom double-submit CSRF cookie must be readable by same-origin JavaScript and is SameSite Strict. Auth/session cookies were HttpOnly.
4. **Semgrep GCM missing tag length:** false positive. Decryption explicitly slices a fixed 16-byte tag, rejects too-short ciphertext, and calls `setAuthTag` before finalization.
5. **Four Gitleaks generic-key results:** test-only NextAuth secret, UI translation keys named `descKey`, and an API documentation example token. The Google API key result is real and reported as F-02.

## Remediation priority

1. **Immediate:** rotate seeded credentials and invalidate sessions; revoke/rotate the tracked Google key; upgrade NextAuth/Auth.js and Next.js.
2. **Before any deployment:** fix LinkedIn SSRF, update all Critical/High dependencies, enforce trusted client IPs, require/fail-close CAPTCHA, and add CI secret/SAST/dependency gates.
3. **Next:** escape JSON-LD and email templates, standardize validation errors and password policy, harden CSP, and restrict local secret permissions.
4. **Re-test:** repeat authenticated ZAP/API sweeps in a production-like staging deployment with dedicated tenants, disposable records, deployed TLS/proxy controls, and alerting enabled.

## Original assessment totals

| Severity | Count |
|---|---:|
| Critical | 3 |
| High | 1 |
| Medium | 5 |
| Low | 4 |
| Informational | 1 |
| **Total vulnerabilities (Critical–Low)** | **13** |
| False positives/development-only groups | 5 |

**Original decision:** The application was **not production ready** at assessment time. See the remediation update at the top of this report for current status.
