# Audit Backlog — Code-Verified

Every finding below was re-checked against the **current source** by a reader that opened the cited
file and confirmed or refuted the claim from the code itself — not from the finding text. Verdicts:
**REAL** (defect present), **PARTIAL** (partly mitigated), **REFUTED** (code already handles it / premise wrong),
**ALREADY_FIXED** (closed this session).

> Anchors are the reviewer's line references at verification time; the working tree is uncommitted, so a
> line may drift by a few. The evidence column names the real identifiers to grep for.

## Summary

| Verdict | Count |
|---|---|
| REAL | 74 |
| PARTIAL | 6 |
| ALREADY_FIXED | 0 |
| REFUTED | 2 |
| **Total** | **82** |

**Severity of REAL + PARTIAL:** critical 1 · high 14 · medium 42 · low 23

**Fixability of REAL + PARTIAL:** Mechanical (few lines): 32 · Scoped (uses existing primitives): 45 · Needs a design/schema/product decision: 3 · Not a real bug / won't fix: 0

## Shared root causes (one fix closes several)

- **void-paid-invoice-deletes-earned-commissions** also covers: void-paid-invoice-destroys-commissions
- **recruitment-status-mass-assignment** also covers: invalid-invoice-status-500
- **jobseeker-referral-permanently-zero** also covers: agent-register-referral-dropped
- **agent-register-referral-dropped** also covers: jobseeker-referral-permanently-zero

## Confirmed real — REAL & PARTIAL (80)

### `firebase-google-2fa-bypass` — REAL · critical · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/lib/auth/config.ts:553`
- **Code shows:** Line 553 explicitly excludes firebase provider from OAuth 2FA flow: `if (account && account.provider !== "credentials" && account.provider !== "firebase")`. Firebase authorize() at line 279 never checks twoFactorEnabled, unlike the pending2fa logic at lines 664-699 which only applies to non-firebase OAuth providers.
- **Fix:** Move 2FA check from OAuth-specific flow to the Firebase authorize() function and jwt callback. Check if returning Firebase users have twoFactorEnabled and set token.pending2fa before returning, matching the OAuth flow pattern at lines 685-698.

### `admin-target-report-double-count` — REAL · high · fix: Mechanical (few lines) · effort S

- **Where:** `src/app/api/admin/target-report/route.ts:93`
- **Code shows:** Line 93 calls `sumMetrics(enrichedCurrent)` which sums ALL profiles without role filtering (line 81-91). enrichedCurrent contains both super_agent and agent profiles (line 45). Agent profiles have parentProfileId pointing to their super_agent's profile (TargetProfile.ts:36-37), creating a hierarchy. Summing both levels together double-counts targets: a super_agent's 100 target distributed as 50+50 to two agents becomes 50+50+100=200 in the total.
- **Fix:** Filter enrichedCurrent to only include profiles with no parentProfileId (roots only), or split the summary to report only super_agents' targets without including their distributed agent targets.

### `aggregate-string-objectid-zero-achievement` — REAL · high · fix: Mechanical (few lines) · effort S

- **Where:** `src/lib/targets/profileAchievementCalculator.ts:462`
- **Code shows:** Line 462 converts ObjectIds to strings: `const agentDocIds = agents.map((a) => String(a._id))`. Then line 384 in batchCalcEmployerByMonth uses `{ $match: { agentId: { $in: agentDocIds } } }` where agentDocIds are strings but Employer.agentId field is ObjectId type. MongoDB cannot match string '507f1f77bcf86cd799439011' against ObjectId(507f1f77bcf86cd799439011), resulting in 0 matches and 0 achievements.
- **Fix:** Convert agentDocIds array to ObjectIds: `const agentDocIds = agents.map((a) => new mongoose.Types.ObjectId(String(a._id)))` before passing to aggregate queries, or ensure agentDocIds stay as ObjectIds throughout.

### `asymmetric-skill-tokenization` — REAL · high · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/lib/matchScore.ts:289`
- **Code shows:** Line 289: `const jobSkills = job.skills.map(normalizeSkill)` — job side applies normalizeSkill only (no splitting). Line 291: `const seekerSkills = seeker.skills.flatMap(tokenizeSkill)` — seeker side tokenizes compound skills (e.g., 'C++ Node.js' → ['c++', 'node.js', 'c++ node.js']). Job requirement 'c++ node.js' (normalized as one token) never matches seeker's separate 'c++' and 'node.js' entries in their skill tokens.
- **Fix:** Apply tokenizeSkill to job.skills (line 289-290) to match seeker's tokenization, so compound job requirements are split. Alternatively, tokenize seekerSkills into a Set once and normalize job skills per line 289 to ensure parity. Requires testing to confirm scoring intent.

### `bulk-delete-no-cascade` — REAL · high · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/app/api/admin/users/route.ts:143`
- **Code shows:** Line 143 performs `User.deleteOne({ _id: id })` in the bulk delete action. While cascade functions exist in `/lib/db/cascade` (used in the permanent DELETE handler at line 364), the bulk delete action uses no cascade. The agent/job_seeker/employer dependents are not cleaned up.
- **Fix:** Import and call the appropriate cascade functions (cascadeDeleteEmployer, cascadeDeleteJobSeeker, cascadeDeleteAgentUser) before User.deleteOne in the bulk delete case, matching the permanent DELETE handler pattern at lines 348-371.

### `change-password-no-session-revocation` — REAL · high · fix: Mechanical (few lines) · effort S

- **Where:** `src/app/api/users/change-password/route.ts:62`
- **Code shows:** Line 62-63 updates passwordHash but never sets passwordChangedAt field. JWT callback at lines 540-544 only revokes tokens if `dbUser.passwordChangedAt` is set and postdates `token.iat`. Without this timestamp, old tokens issued before the password change won't be revoked.
- **Fix:** Add `user.passwordChangedAt = new Date();` before `await user.save();` at line 63. This triggers the revocation logic in jwt callback.

### `employer-team-membership-never-reaches-session` — REAL · high · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/lib/auth/config.ts:737`
- **Code shows:** Lines 737-749 only resolve companyUserRole for the primary Employer owner via ensureEmployerOwnerMembership(). Invited team members with CompanyUser records have no code path that loads their companyUserRole into token.companyUserRole. Only checks `if (resolvedRole === "employer")`, ignoring CompanyUser records for invited members.
- **Fix:** After resolving employer role at line 749, add a second query to CompanyUser.findOne({ userId: token.id }) to load any team member roles if the employer lookup found no primary Employer record. Set token.companyUserRole and token.companyId from the CompanyUser record.

### `job-workflow-crosstenant-write` — REAL · high · fix: Mechanical (few lines) · effort S

- **Where:** `src/app/api/jobs/[id]/workflow/route.ts:58`
- **Code shows:** Lines 53-60: if (ctx.role === 'employer') checks ownership, else if (![agent, super_agent, admin]) return 403, else allows without check. Agents can rewrite any job's workflow.
- **Fix:** Add ownership check for agent/super_agent roles to verify they own the job before allowing workflow PATCH

### `jobs-myjobs-status-filter-bypass` — REAL · high · fix: Mechanical (few lines) · effort S

- **Where:** `src/app/api/jobs/handlers.ts:82`
- **Code shows:** Lines 82-107: If ctx.role !== 'employer' and myJobs=true, neither the `if (myJobs && ctx.role === 'employer')` block nor the `else if (!myJobs)` block executes. Query contains only `{ deletedAt: null }`, no status filter. Job seekers calling GET /api/jobs?myJobs=true receive all non-deleted jobs including draft/unapproved/closed status.
- **Fix:** Add explicit status='active' filter when myJobs=true and ctx.role !== 'employer', or add role/permission check at function entry to deny myJobs for non-employers. Mirror the expiry check from line 109.

### `pdf-commission-leak-to-customer` — REAL · high · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/lib/invoices/generatePdf.ts:325`
- **Code shows:** Line 325-341: PDF generation iterates commissions without role-based filtering and includes rates and amounts: `${comm.role}: ${comm.rate}% = ${fmt(comm.amount, currency)}`. PDF is downloaded/emailed to employers without redaction, exposing internal commission structure.
- **Fix:** Pass viewer role to generateInvoicePdf(); filter commissions to exclude rate/amount if viewer is employer. Or remove commission section from public PDFs entirely and only show on admin/super-agent downloads.

### `sa-team-view-leaks-all-targets` — REAL · high · fix: Scoped (uses existing primitives) · effort S

- **Where:** `src/app/api/super-agent/target-profiles/route.ts:66`
- **Code shows:** Lines 59-64 fetch ownProfile (may be null if SA has no plan). Line 67 queries `{ parentProfileId: ownProfile?._id }` — when ownProfile is null, this becomes `{ parentProfileId: undefined }`, matching ALL profiles without a parentProfileId set. Lines 72-78 query additionalProfiles with only `assignedBy: ctx.userId` and `year` filter (no role or parentProfileId exclusion), which can return other teams' agent profiles if they were assigned by this user in a different context.
- **Fix:** When ownProfile is null, return empty team view instead of querying with undefined. Or split logic: if ownProfile exists use parentProfileId filter; if not, return error or empty. For additionalProfiles, add explicit role check and team scope verification before returning profiles.

### `screening-prompt-injection` — REAL · high · fix: Scoped (uses existing primitives) · effort S

- **Where:** `src/app/api/ai/screen-candidates/route.ts:147`
- **Code shows:** Lines 107-133 build `candidateSummaries` from seeker data with fields: name (fullName, userId.name), skills, experienceYears, latestRole (jobTitle), education, languages. At line 147, these are injected directly via `${JSON.stringify(candidateSummaries, null, 2)}` into the prompt with no sanitization. Contrast with /api/ai/match route.ts lines 102-122 which explicitly call `sanitizeAIInput()` on each field before prompt inclusion.
- **Fix:** Sanitize each candidate field before building the summary object. Import `sanitizeAIInput` from '@/lib/ai/sanitize' and wrap: `name: sanitizeAIInput(seeker.fullName?.trim() \|\| ..., 120), skills: (seeker.skills ?? []).map(s => sanitizeAIInput(s, 60))`, etc.

### `superagent-agentids-desync` — REAL · high · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/app/api/admin/super-agents/route.ts:400`
- **Code shows:** PATCH handler lines 400-408 syncs Agent.superAgentId but never clears the previous SA's agentIds array. When Agent A moves from SA1 to SA2: (1) Agent.superAgentId is updated to SA2, (2) SA2.agentIds gets Agent A, but (3) SA1.agentIds still contains Agent A. Reading SA1's agentIds afterward shows agents that no longer belong to it.
- **Fix:** After line 403 sets new assignments, fetch the previous SA doc and use `$pull` to remove newly-assigned agents from its agentIds array. Query the Agent for agentIds not in the new assignment to identify which SAs need cleanup: `await SuperAgent.updateMany({ agentIds: { $in: agentIds } }, { $pullAll: { agentIds } })`.

### `void-paid-invoice-deletes-earned-commissions` — REAL · high · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/app/api/invoices/[id]/route.ts:275`
- **Code shows:** Lines 275-283 show void status change calls reverseCommissionsForInvoice() with NO precondition check. reverseCommissionsForInvoice (commissionRecords.ts:115-117) hard-deletes pending/approved Commission rows via deleteMany, while paidAmount field is never reset in the void handler. Invoice can be voided from any status.
- **Fix:** Add precondition check before void: reject if invoice.status === 'paid'. Add compensating logic to mark commissions as 'clawed_back' instead of deleting them, or prevent void of paid invoices entirely.

### `achievement-keyed-on-createdat-and-live-team` — REAL · medium · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/lib/targets/profileAchievementCalculator.ts:110`
- **Code shows:** Lines 110-113 filter commissions by current status ('approved' or 'paid') and createdAt. If a commission is created in month 1 but status changes to 'pending' later, it will not be counted in achievement calculations even though it was created in that month. Monthly achievements derived from Commission.createdAt + current status mean closed-month achievements can mutate retroactively if commission status changes.
- **Fix:** Define achievement policy: either filter by createdAt AND initial status (store status snapshot), or filter by current date AND current status (accepting mutability). If immutability is required, add statusChangedAt to Commission schema and use creation state, or accept this as current behavior and document it.

### `agent-register-referral-dropped` — REAL · medium · fix: Scoped (uses existing primitives) · effort S

- **Where:** `src/app/api/auth/agent-register/route.ts:73`
- **Code shows:** Line 73 writes `referralCode: referralCode \|\| undefined` to User.create(), but the User schema (lines 51-131 in User.ts) does NOT define a referralCode field. Mongoose silently drops fields not in the schema, so this referral data is lost. The referralCode field exists only on Agent and SuperAgent models.
- **Fix:** Add referredBy field to User schema to track which referral code recruited this user, then change line 73 to set referredBy instead of referralCode. This enables jobseeker referral tracking.
- **Shares root cause with:** jobseeker-referral-permanently-zero

### `application-documents-missing-employer-ownership-check` — REAL · medium · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/app/api/applications/[id]/documents/route.ts:41`
- **Code shows:** Line 41 comment: 'Verify access: job seeker owns it, or employer owns it'. Lines 42-47 show only job_seeker role is checked; lines 48-49 return documents for any other role without check.
- **Fix:** Add elif branches for employer and agent/super_agent roles that verify ownership (employer owns application's job, or agent assigned to that job/employer) before returning documents

### `application-timeline-idor` — REAL · medium · fix: Mechanical (few lines) · effort S

- **Where:** `src/app/api/applications/[id]/timeline/route.ts:33`
- **Code shows:** Lines 22-35: if (employer role) verify ownership, else if (job_seeker role) verify ownership, else if (![agent, super_agent, admin]) reject, else allow. Agents bypass all checks.
- **Fix:** Add ownership check for agent/super_agent roles similar to employer check, verifying they control the job the application is for

### `applications-compare-unscoped-for-agents` — REAL · medium · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/app/api/applications/compare/route.ts:42`
- **Code shows:** Lines 40-59: empId only set if (employer role), then at line 56 ownership check is conditional (if empId). For agents, empId stays null and check is skipped, allowing any Application.find() result.
- **Fix:** For agent/super_agent roles, determine correct ownership boundary (assigned employers or jobs with applications) and apply same filter as employer before returning results

### `business-volume-find-drops-status` — REAL · medium · fix: Scoped (uses existing primitives) · effort S

- **Where:** `src/app/api/admin/target-report/route.ts:134`
- **Code shows:** Lines 134-135: `.find((a) => a._id.month === month && [...].includes(a._id.status))` returns only the FIRST matching element. If a month has separate records for 'approved' and 'paid' status, only one is returned. Line 143 then uses `approved?.total ?? 0`, counting only one status's volume instead of both.
- **Fix:** Change line 134-135 to use `.filter()` instead of `.find()`, then sum all matching records. Update line 143 to aggregate: `const approved = businessVolumeAgg.filter(...).reduce((s,a) => s + a.total, 0)`.

### `clientip-collapses-to-constant` — REAL · medium · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/lib/security/clientIp.ts:61`
- **Code shows:** Line 61 returns FALLBACK_CLIENT which is 'direct' (line 1). The function only returns a real IP if VERCEL=1 (lines 42-45) or TRUSTED_PROXY_HOPS > 0 (lines 47-58). Without these env vars set, all requests collapse to the literal string 'direct', causing per-IP rate limits to be aggregated into a single bucket.
- **Fix:** Make the fallback behavior configurable or use a real extraction strategy by default. Consider using cf-connecting-ip for Cloudflare, reading from connection metadata where available, or using a sensible default proxy header chain rather than unconditional fallback.

### `commission-idempotency-not-atomic` — REAL · medium · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/lib/invoices/commissionRecords.ts:52`
- **Code shows:** Line 52-54: `const existingCount = await Commission.countDocuments({ invoiceId }).session(session ?? null); if (existingCount > 0) return [];`. Read-check without unique index or atomic upsert. Concurrent calls can both read count=0 and both create records, duplicating payouts.
- **Fix:** Add unique compound index on (invoiceId, agentId, type) or use MongoDB upsert pattern with $setOnInsert. Or use insertOne with unique constraint and catch duplicate-key error.

### `employer-deactivate-jobs-stay-live` — REAL · medium · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/app/api/admin/users/route.ts:385`
- **Code shows:** Lines 385-386 handle deactivation by only setting `user.isActive = false`. There is no handling of job postings or other employer-specific records. Contrast with permanent deletion (lines 363-366) which calls cascadeDeleteEmployer() but bulk deactivate (line 140) has no equivalent.
- **Fix:** In the deactivate case (line 139-140), after setting isActive = false, update all active Job docs owned by this employer: `await Job.updateMany({ employerId: id, status: 'active' }, { $set: { status: 'closed' } })` or soft-delete them.

### `employer-notes-and-ai-gaps-leak-to-candidate` — REAL · medium · fix: Mechanical (few lines) · effort S

- **Where:** `src/app/api/applications/handlers.ts:442`
- **Code shows:** Line 442 spreads the entire Application document to the response without filtering: applications.map((app) => ({ ...app, ... })). The Application.find() at line 312 does not use .select() to limit fields. Job seekers can call this endpoint (line 59-62 restricts to jobSeekerId when ctx.role==='job_seeker'), so they receive employerNotes, matchStrengths, matchGaps, and rejectionReason from the Application model (lines 60-66 in Application.ts).
- **Fix:** Add .select() to Application.find() at line 312 to exclude sensitive fields: .select('-employerNotes -matchStrengths -matchGaps -rejectionReason'). Or explicitly select safe fields only for job_seeker role in the map() function at line 442.

### `employer-sees-commission-economics` — REAL · medium · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/app/api/invoices/[id]/route.ts:70`
- **Code shows:** Line 72 redacts commissionRate from agentId populate for employers, but invoice.commissions array (line 54 in response) includes full commission breakdown with rate and amount for all viewers. Employers can read line 338: `comm.rate}% = ${fmt(comm.amount)}` in PDF (see pdf-commission-leak-to-customer).
- **Fix:** Filter invoice.commissions in GET response based on role: strip rate/amount if not admin/super_agent. Apply same filter to PDF generation.

### `employer-self-publish-bypasses-moderation-and-approval-status` — REAL · medium · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/app/api/jobs/[id]/handlers.ts:54`
- **Code shows:** PATCH handler line 54: employerVerified = verifiedAt OR isAgentVerified. Line 55-57: if status='active' and NOT verified, reroute to 'pending_approval'. A verified employer can set status='active' regardless of agentId. But POST handler (src/app/api/jobs/handlers.ts:416-419) requires approval for agent-mediated jobs even from verified employers. PATCH ignores agentId check. poster.approvalStatus field (line 85) is only settable by admin (lines 92-95), so employer-initiated status='active' never updates approvalStatus from 'pending' to 'approved'.
- **Fix:** In PATCH patchHandler, mirror POST logic: check if job.agentId exists and reroute verified employer's status='active' to 'pending_approval' (line 55). Alternative: allow status='active' but auto-update poster.approvalStatus='approved' only for non-agent jobs or when admin explicitly approves.

### `enforce-feature-gate-dead-return` — REAL · medium · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/lib/subscription/featureGate.ts:177`
- **Code shows:** Lines 168-177: enforceFeatureGate function returns `null` at line 177 unconditionally. Comment at line 179 says 'no-unreachable -- subscription enforcement disabled temporarily'. Lines 181-200 below are unreachable. This means enforceFeatureGate always permits access and never checks gateMap. Admin toggle of isSubscriptionEnforcementEnabled at line 40 is also bypassed.
- **Fix:** Remove the `return null;` at line 177 and the eslint-disable comment at line 179. When subscription enforcement is ready to re-enable, remove the outer `if (!(await isSubscriptionEnforcementEnabled())) return { allowed: true };` block (lines 40-42) or restructure so the inner logic (line 181+) runs when enabled.

### `epoch-start-date-experience` — REAL · medium · fix: Mechanical (few lines) · effort S

- **Where:** `src/lib/matchScore.ts:459`
- **Code shows:** Line 459: `const start = exp.startDate ? new Date(exp.startDate).getTime() : 0;` — when startDate is missing, start defaults to 0 (epoch timestamp Jan 1, 1970). Line 460 end = now. Calculation (line 463): (now - 0) / millisPerYear ≈ 56 years. Profiles without start dates incorrectly report ~56 years experience, flooring the experience component in match scoring.
- **Fix:** Change line 459 fallback from `0` to `now` (so duration = 0) OR detect missing startDate and skip that entry or set years to 0. Simpler: `const start = exp.startDate ? new Date(exp.startDate).getTime() : now;` so missing dates contribute 0 years, not 56.

### `exhibition-get-and-audit-cross-team` — REAL · medium · fix: Mechanical (few lines) · effort S

- **Where:** `src/app/api/exhibitions/[id]/route.ts:53`
- **Code shows:** Line 53-55 in GET handler checks `ctx.role === "agent" && item.agentId?._id?.toString() !== ctx.userId` but does NOT check super_agent team jurisdiction. Compare to PATCH handler (lines 143-158) which explicitly calls `getSuperAgentScope()` and validates `teamUserIds.includes(item.agentId.toString())` for super_agent. GET allows any super_agent to read any exhibition.
- **Fix:** Extract the team jurisdiction check (lines 143-158 from PATCH) into a reusable helper function and call it in the GET handler for super_agent role, after the agent ownership check.

### `exhibition-perf-idor` — REAL · medium · fix: Mechanical (few lines) · effort S

- **Where:** `src/app/api/exhibitions/[id]/performance/route.ts:10`
- **Code shows:** Lines 10-17 in GET handler have NO authorization check. It queries and returns performance data for any exhibitionId without validating if the requesting user (ctx.userId, ctx.role) owns or manages that exhibition. Any authenticated user can read any exhibition's performance metrics.
- **Fix:** Add authorization logic in GET handler (after connectDB): check if ctx.role is 'admin' (allow all) or if role is 'super_agent' or 'agent', validate team/ownership using the same pattern as PATCH handler in route.ts.

### `five-crons-never-scheduled` — REAL · medium · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/lib/inngest/scheduledCrons.ts:161`
- **Code shows:** Lines 161-173 define scheduledCronFunctions array with 11 exports (interviewReminders, savedSearchAlerts, etc.). Routes exist at /api/cron/sla-alerts and /api/cron/nps-trigger but neither is exported in scheduledCrons.ts. Review of line 138-143 shows invoiceOverdueReminderCron IS scheduled. The missing ones are sla-alerts and nps-trigger (2 routes) plus the finding mentions 5 total crons never scheduled.
- **Fix:** For each /api/cron/* route that should run on a schedule: (1) create a makeScheduledCron call with appropriate cron expression, (2) export it as a const, (3) add to scheduledCronFunctions array. Match the pattern at lines 81-158.

### `job-alerts-permanent-truncation` — REAL · medium · fix: Scoped (uses existing primitives) · effort L

- **Where:** `src/app/api/cron/job-alerts/route.ts:132`
- **Code shows:** Lines 48 and 86-132: TIME_BUDGET_MS = 50_000 (50s). At line 132, if Date.now() - startedAt > TIME_BUDGET_MS, the loop breaks with truncated=true. The next run starts with lastId=null (line 81), restarting from ID 0. Seekers after the truncation point never receive alerts until the batch completes. Since the audience grows, seekers added after the truncation point risk permanent skipping.
- **Fix:** Persist lastId in a dedicated cron state doc (e.g., 'CronState' collection) before breaking. On next run, load and resume from that ID instead of null. Or increase TIME_BUDGET_MS if the 50s budget is too tight, or optimize query/notification dispatch.

### `job-matching-weights-unscoped` — REAL · medium · fix: Mechanical (few lines) · effort S

- **Where:** `src/app/api/jobs/[id]/matching-weights/route.ts:50`
- **Code shows:** Lines 45-53: same pattern as workflow route - if (ctx.role === employer) checks, else if (![agent, super_agent, admin]) reject, else allow. Agents bypass ownership.
- **Fix:** Add ownership check for agent/super_agent to verify they control the job before allowing matching-weights PATCH

### `job-scoring-config-readable-and-writable-unscoped` — REAL · medium · fix: Mechanical (few lines) · effort S

- **Where:** `src/app/api/jobs/[id]/matching-weights/route.ts:80`
- **Code shows:** GET handler at line 17 has no authorization. PATCH handler at lines 45-53 allows agents through without ownership check. Line 80 exports both handlers.
- **Fix:** Add role-based access control to both GET and PATCH handlers, with ownership validation for all roles

### `job-visibility-never-enforced` — REAL · medium · fix: Mechanical (few lines) · effort S

- **Where:** `src/app/[locale]/(public)/jobs/page.tsx:113`
- **Code shows:** Line 113-117: query sets status='active' and expiry filter only. No filter for visibility field. Job.visibility is set at creation (src/app/api/jobs/handlers.ts:457) with default 'public'; enum includes 'private' and 'invite_only' (Job.ts:244). Zero usages of visibility in any query filter (grep confirms). Private/invite_only jobs return to public job search if status='active'.
- **Fix:** Add query filter: `query.visibility = 'public'` at line 113 or in the base query. For authenticated users, conditionally show private/invite_only if employerId matches or they are invited. Current design exposes visibility field but doesn't enforce it.

### `job-workflow-crosstenant-read` — REAL · medium · fix: Mechanical (few lines) · effort S

- **Where:** `src/app/api/jobs/[id]/workflow/route.ts:17`
- **Code shows:** Lines 17-42 show no role/ownership check before returning workflow at lines 26-30 and 37-41. Only validates ID format and existence, then returns data directly.
- **Fix:** Add role-based access control to GET handler matching the ownership pattern used in PATCH handler

### `jobs-list-leaks-agent-commission-and-applicant-ids` — REAL · medium · fix: Mechanical (few lines) · effort S

- **Where:** `src/app/api/jobs/handlers.ts:203`
- **Code shows:** Lines 203-210: .populate('agentId', 'commissionRate userId superAgentId') and nested .populate({ path: 'superAgentId', select: 'overrideRate userId' }) expose agent.commissionRate, agent.superAgentId.overrideRate, and agent.userId.email to all users in response (line 263). No role-based conditional; returned to job seekers viewing active jobs.
- **Fix:** Add role check around the agentId populate or use ternary to select different fields: if job_seeker, omit commissionRate/overrideRate. Alternatively, use .select() projection after .lean() to strip sensitive fields before response.

### `jobs-list-unbounded-portfolio-scan` — REAL · medium · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/app/api/jobs/handlers.ts:248`
- **Code shows:** Line 248: `await Job.find(baseQuery).select('_id employerId vacancies').lean()` loads ALL matching jobs into memory (no .limit()). Line 232-241 also scans all matched job IDs via Application.aggregate() without pagination. For large portfolios (thousands of jobs), this exhausts memory and performance.
- **Fix:** Paginate portfolioJobs with .limit(1000) or cached/background aggregation. Alternatively, compute stats from aggregation pipeline ($group, $sum) instead of loading docs and iterating. Rationale: stats are only needed for dashboard cards, not detail rows.

### `jobseeker-referral-permanently-zero` — REAL · medium · fix: Scoped (uses existing primitives) · effort S

- **Where:** `src/app/api/user/referral/route.ts:30`
- **Code shows:** Line 30 queries `User.find({ referredBy: referralCode })` but the User schema does not define a referredBy field. This query will always return empty results because the field never exists in any document. Agent registration (agent-register/route.ts:73) never writes referredBy either.
- **Fix:** Add referredBy field to User schema and populate it during agent registration. This pairs with the agent-register fix to enable the referral tracking query.
- **Shares root cause with:** agent-register-referral-dropped

### `maxapplicants-not-enforced-at-apply-time` — REAL · medium · fix: Mechanical (few lines) · effort S

- **Where:** `src/app/api/jobs/[id]/apply/route.ts:53`
- **Code shows:** Line 53-64: POST /api/jobs/[id]/apply validates job exists and status='active', checks for duplicate applications, validates screening questions. Zero checks for maxApplicants. Enforcement exists only in cron/job-expiry/route.ts (lines 38-39) which daily closes jobs when applicantIds.length >= maxApplicants. Users can exceed cap until cron runs next.
- **Fix:** Before creating application (line 53+), fetch job's maxApplicants and current applicantIds.length, check: `if (job.maxApplicants && job.applicantIds.length >= job.maxApplicants) return error 422`. Mirrors the POST /api/applications logic pattern.

### `mixed-currency-money-sums` — REAL · medium · fix: Needs a design/schema/product decision · effort M

- **Where:** `src/app/api/super-agent/commissions-report/route.ts:198`
- **Code shows:** Line 198: `grandTotal: overviewSummary.overrideTotal + teamTotal` sums commissions without checking currency. Override commissions and team agent commissions are aggregated from Commission records which have independent currency fields. Line 199 hardcodes `currency: 'AED'`. If agents work in USD/EUR, sums are meaningless.
- **Fix:** Require single-currency reports: filter commissions by currency in aggregations, or return multi-currency breakdown. Design decision: do SAs only operate in one currency region, or must reports show per-currency subtotals?

### `overdue-reminder-emails-customer-admin-link` — REAL · medium · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/app/api/cron/invoice-overdue-reminder/route.ts:196`
- **Code shows:** Line 196 builds email CTA: `<a href="${baseUrl}/en/admin/invoices" ...>View All Invoices</a>`. Email is sent to invoice creator (User at line 66). If creator is an agent or super_agent (not admin), this link is inaccessible. The only actionable link in the email points to an admin-only route, leaving non-admin recipients unable to act.
- **Fix:** Check user.role and build appropriate link: if admin, use /en/admin/invoices; if agent/super_agent, route to their own invoices view (e.g., /en/agent/invoices or /en/dashboard/invoices). Or replace with a generic customer portal link that works for all roles.

### `perm-editor-hides-six-resources` — REAL · medium · fix: Mechanical (few lines) · effort M

- **Where:** `src/components/shared/PermissionEditor.tsx:170`
- **Code shows:** RESOURCE_LABELS (lines 17-47) defines 29 resources including subscriptions, exhibitions, resources, targets, onboarding, invoices. RESOURCE_GROUPS (lines 61-82) only includes 23 resources: Core Business (7), People (5), System (4), AI & Tools (3), Content & Config (4). The 6 missing are subscriptions, exhibitions, resources, targets, onboarding, invoices. The matrix at line 299 only renders resources in group.resources, so these 6 are unreachable in the UI.
- **Fix:** Add missing resources to appropriate RESOURCE_GROUPS. Create new group or add to existing (e.g., 'Finance & Config' for subscriptions/invoices). Example: add `subscriptions, exhibitions, invoices, resources, targets, onboarding` to a new or existing group in RESOURCE_GROUPS at line 61.

### `recruitment-status-mass-assignment` — REAL · medium · fix: Mechanical (few lines) · effort S

- **Where:** `src/lib/validators/subscriptions.ts:183`
- **Code shows:** Line 183 defines status as `z.string().max(50).default("issued")` — allows ANY string, not enum-restricted. An attacker can pass status='paid' and invoice is created with paid status immediately, bypassing normal workflow. No validation against ACTIVE_RECRUITMENT_INVOICE_STATUSES.
- **Fix:** Change line 183 to `status: z.enum(ACTIVE_RECRUITMENT_INVOICE_STATUSES).default('issued')` to restrict to valid statuses only.

### `revenue-includes-void-cancelled` — REAL · medium · fix: Mechanical (few lines) · effort S

- **Where:** `src/app/api/invoices/analytics/route.ts:226`
- **Code shows:** Lines 87-99 aggregate all invoices grouped by status without filtering. Lines 226-235 sum all status rows into totalRevenue including void, cancelled, refunded. No exclusion of terminal statuses when calculating KPI.totalRevenue.
- **Fix:** Exclude terminal statuses in the aggregation: `{ $match: { ...scopeFilter, status: { $nin: INVOICE_TERMINAL_STATUSES } } }` before grouping.

### `role-change-orphans-old-profile` — REAL · medium · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/app/api/admin/users/route.ts:24`
- **Code shows:** ensureRoleProfile (lines 24-48) only creates role profiles with `await Employer.create()`, `await JobSeeker.create()`, etc. It never deletes old profiles. When role changes at lines 130 or 209, old Employer/JobSeeker/Agent/SuperAgent records remain orphaned.
- **Fix:** Modify ensureRoleProfile to accept the old role and delete its profile before creating the new one. Example: if oldRole was 'employer', delete Employer record before creating JobSeeker profile.

### `role-change-stale-custom-perms` — REAL · medium · fix: Mechanical (few lines) · effort S

- **Where:** `src/app/api/admin/users/route.ts:175`
- **Code shows:** Batch role change at line 130 and single-user PATCH at line 209 update the role but never reset permissionMode or customPermissions. Old custom permission maps keyed to the previous role remain active and can deny abilities of the new role (jwt callback at line 537 reloads permissionMode, but doesn't clear custom restrictions).
- **Fix:** When role is changed, set permissionMode to "role_default" and clear customPermissions: add `updateData.permissionMode = "role_default"; updateData.customPermissions = undefined;` when role is provided. Same for batch operation.

### `sa-referral-link-orphans-employer` — REAL · medium · fix: Mechanical (few lines) · effort S

- **Where:** `src/app/api/auth/employer-register/route.ts:197`
- **Code shows:** Lines 197-202 handle superAgentId: when a SuperAgent referral is found, the code sets only `verifiedByAgentId = saRef.userId` but never sets `referrerAgentId`. Then line 239 creates the Employer with `...(referrerAgentId ? { agentId: referrerAgentId } : {})`, so employers from SA referrals get no agentId field set. This orphans the employer from the agent network.
- **Fix:** When superAgentId is resolved (line 197), find the associated Agent(s) under the SuperAgent and set referrerAgentId to one of them, or leave agentId unset but ensure the Employer can be queried via verifiedByAgentId instead.

### `sa-writes-approvedbudget` — REAL · medium · fix: Scoped (uses existing primitives) · effort S

- **Where:** `src/app/api/exhibitions/[id]/route.ts:220`
- **Code shows:** Lines 220-222 set `item.approvedBudget = Number(approvedBudget)` whenever `approvedBudget !== undefined && status !== "budget_approved"`. Super_agent VALID_TRANSITIONS (lines 19-23) never include transition to 'budget_approved', so a super_agent can PATCH with status='under_review' and approvedBudget=<value> to set budget outside the intended approval gate. Comment on line 219 says 'admin can set approvedBudget before budget_approved stage' but this applies to both admin and super_agent.
- **Fix:** Restrict line 220-222 to `ctx.role === "admin"` only, or clarify product intent: should super_agent be allowed to set approvedBudget at all? If not, add role check: `if (approvedBudget !== undefined && status !== "budget_approved" && ctx.role === "admin")`

### `subscription-page-shows-locked` — REAL · medium · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/app/[locale]/(dashboard)/employer/subscription/page.tsx:154`
- **Code shows:** Lines 153-162 define featureList with hardcoded { allowed: true } for jobPosting, applicantTracking, teamCollaboration (first 3 items). The gateMap.features parameter passed at line 109 is ignored for these rows. Only dataExport, commTemplates, scorecards, prioritySupport read from features object. If gateMap has bypass flag or subscription is inactive, the first three still show as allowed/included.
- **Fix:** Replace hardcoded `allowed: true` for jobPosting, applicantTracking, teamCollaboration with reads from features or limits. Example: `{ label: t('jobPosting'), ..., allowed: features.jobPosting?.allowed ?? true }` (or use gateMap.bypass flag if present).

### `territory-counts-query-nonexistent-fields` — REAL · medium · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/app/api/super-agent/territory/route.ts:44`
- **Code shows:** Lines 44 and 45 query Employer with non-existent fields: `Employer.countDocuments({ city: c.name })` and `Employer.countDocuments({ state: s.name })`. Employer model (Employer.ts:1-99) has no 'city' or 'state' fields — only 'country'. Queries for non-existent fields always return 0. Similarly, line 52 queries Agent for assignedStateIds which exists, but line 58 queries Employer.state which doesn't.
- **Fix:** Query Employer by matching related Job records by city/state, or redesign to link Employer → City/State through Job intermediate. For now, remove or fix the city/state employer count queries. Ensure queries match actual schema fields.

### `two-engines-one-number` — REAL · medium · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/lib/inngest/aiScreenApplication.ts:105`
- **Code shows:** Line 105 in aiScreenApplication.ts: `application.aiMatchScore = matchData.score` where matchData comes from `generateText(prompt, GEMINI_MODELS.flash, ...)` at line 101 (non-deterministic LLM). Separately, /api/ai/match route.ts line 171 also calls `Application.findByIdAndUpdate(..., { aiMatchScore: matchData.score, ... })` with the same LLM model at line 158. Both write to the same `aiMatchScore` field but can produce different results on re-run, and both call the same non-deterministic Gemini Flash model.
- **Fix:** Add a deterministic scoring engine (rule-based, schema-validated) as primary, use LLM only for qualitative analysis (strengths/gaps). Separate columns: `aiMatchScore` (LLM deterministic summary if needed) and `computedMatchScore` (rule-based, stable). Or add `scoredVia` field to track which engine produced the score and prevent re-scoring.

### `unvalidated-model-output-to-db` — REAL · medium · fix: Mechanical (few lines) · effort S

- **Where:** `src/lib/inngest/aiScreenApplication.ts:104`
- **Code shows:** Line 104: `const matchData = JSON.parse(raw);` is called without try-catch wrapper. If the LLM returns malformed JSON, the function throws an unhandled error and exits, leaving the application in a perpetually unscored state (line 50 checks `if (application.aiMatchScore != null)` but if parsing fails, the job won't retry cleanly). Line 105 then writes `matchData.score` unclamped—if LLM returns {"score": 999} or null, it's written as-is. Compare to /api/ai/match route.ts lines 162-166 which wraps JSON.parse in try-catch and returns HTTP 500.
- **Fix:** Wrap line 104 in try-catch: `let matchData; try { matchData = JSON.parse(raw); } catch { return { skipped: true, reason: 'invalid json from ai' }; }`. Then validate and clamp score: `const score = typeof matchData?.score === 'number' ? Math.max(0, Math.min(100, matchData.score)) : 0;` before writing at line 105.

### `void-paid-invoice-destroys-commissions` — REAL · medium · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/app/api/invoices/[id]/route.ts:275`
- **Code shows:** Same as above finding: reverseCommissionsForInvoice deletes approved Commission rows on void, destroying the audit trail of what was earned. No status precondition prevents voiding paid invoices.
- **Fix:** Same fix as sibling: add precondition or mark-as-clawed-back pattern instead of deletion.
- **Shares root cause with:** void-paid-invoice-deletes-earned-commissions

### `approvedbudget-immutability-comment-lies` — REAL · low · fix: Mechanical (few lines) · effort S

- **Where:** `src/app/api/exhibitions/[id]/route.ts:199`
- **Code shows:** Line 199 comment states 'Lock in approvedBudget at financial approval time' but the lock is not enforced: (1) Lines 204-206 only set it when transitioning to 'budget_approved' with `if (approvedBudget !== undefined)`, (2) Lines 220-222 allow re-assignment outside that transition when `status !== "budget_approved"`. Additionally, line 205 calls `Number(approvedBudget)` without validation; if non-numeric, NaN fails schema validator (line 253: `min: 0`), causing unhandled error → 500.
- **Fix:** Fix line 199 comment to reflect actual behavior: 'Set approvedBudget during budget approval; may be overwritten by admin on later updates.' Add input validation before line 205 and 221: check `Number.isFinite(Number(approvedBudget))` and return 400 if invalid.

### `ats-check-idor` — REAL · low · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/app/api/ai/ats-check/route.ts:79`
- **Code shows:** Lines 78-87: if role is employer/agent/admin and jobSeekerId provided, fetches that seeker's CV directly. Later (lines 103-127) there IS ownership check for jobId keyword coverage, but base ATS analysis lacks it.
- **Fix:** For employer/agent roles requesting jobSeekerId without jobId, verify seeker has application to their job(s). For agent, check assigned employer IDs. Reuse the pattern from jobId access control.

### `career-page-jobs-query-uses-nonexistent-status` — REAL · low · fix: Mechanical (few lines) · effort S

- **Where:** `src/app/api/career-pages/[slug]/route.ts:22`
- **Code shows:** Line 22 queries Job.find({ employerId: page.employerId, status: 'published' }). The Job model enum at line 190 of Job.ts defines status as ['draft', 'pending_approval', 'active', 'paused', 'closed', 'expired']. The value 'published' does not exist in this enum, so the query matches zero jobs and the public career page always returns an empty jobs array.
- **Fix:** Change line 22 from status: 'published' to status: 'active' to match the enum defined in the Job model.

### `commission-on-tax` — REAL · low · fix: Mechanical (few lines) · effort S

- **Where:** `src/app/api/invoices/recruitment/route.ts:187`
- **Code shows:** Line 134 calculates billedTotal including tax: `billedTotal = discountedSubtotal + taxAmount + serviceCharge`. Line 187 applies commission rate to billedTotal: `agentAmount = (billedTotal * finalRate) / 100`. Agent commission is calculated on collected tax, treating it as platform revenue.
- **Fix:** Calculate commission on discountedSubtotal only (before tax): `agentAmount = (discountedSubtotal * finalRate) / 100`. Tax is a pass-through liability, not platform revenue.

### `credit-note-always-500` — REAL · low · fix: Mechanical (few lines) · effort S

- **Where:** `src/app/api/invoices/[id]/credit-note/route.ts:64`
- **Code shows:** Line 64-67 create credit note with negative amounts: `unitPrice: -body.amount, amount: -body.amount, subtotal: -body.amount, totalAmount: -body.amount`. Invoice schema (Invoice.ts:268-269) enforces `min: 0` on amount and totalAmount. MongoDB schema validation rejects negative values, causing 500 error.
- **Fix:** Remove negation: use positive `body.amount` directly in lineItems and totals. Credit note semantics are implied by status='credit_note', not by negative amounts.

### `custom-perms-unenforced-guardless-admin-routes` — REAL · low · fix: Mechanical (few lines) · effort S

- **Where:** `src/app/api/admin/agents/route.ts:403`
- **Code shows:** Lines 403-405 export handlers wrapped with bare `withAuth(getHandler)` instead of `withAuth(getHandler, { resource: 'agents', action: 'read' })`. Comparison: users/route.ts line 399-402 uses `withAuth(getHandler, { resource: 'users', action: 'read' })`. Without resource/action guards, custom permissions cannot restrict access to admin/agents and admin/super-agents.
- **Fix:** Update lines 403-405 to include guards: `export const GET = withAuth(getHandler, { resource: 'agents', action: 'read' });` (and 'create'/'update' for POST/PATCH). Same pattern as users/route.ts.

### `diversity-report-application-count-idor` — REAL · low · fix: Mechanical (few lines) · effort S

- **Where:** `src/app/api/diversity/route.ts:24`
- **Code shows:** Lines 20-26: filter set to caller's employerId, but if jobId provided, count uses only jobId without checking it belongs to employerId. No validation that jobId is the employer's job.
- **Fix:** When jobId is provided, query Job to verify its employerId matches the calling employer's ID before proceeding with count

### `feature-gate-toggle-dead` — REAL · low · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/lib/subscription/featureGate.ts:176`
- **Code shows:** Lines 33-154 define checkFeatureGate which reads subscription limits and gates features. However, enforceFeatureGate (the function used in route handlers to actually block requests) returns null before reaching the gating logic (line 177). So even if checkFeatureGate is correct, enforceFeatureGate always allows access and admin's toggle via isSubscriptionEnforcementEnabled is ineffective.
- **Fix:** Same fix as enforce-feature-gate-dead-return: remove line 177's unconditional return null and properly enable/disable subscription enforcement when the feature is ready.

### `invalid-invoice-status-500` — REAL · low · fix: Mechanical (few lines) · effort S

- **Where:** `src/lib/validators/subscriptions.ts:183`
- **Code shows:** Same schema issue: unvalidated string allows out-of-enum status. Database-level enum constraint fails silently in Zod validator, returning 500 instead of 400 validation error. Should fail early with 400.
- **Fix:** Use z.enum() constraint (fixes both this and the mass-assignment issue).
- **Shares root cause with:** recruitment-status-mass-assignment

### `matching-weights-noop-on-deterministic-score` — REAL · low · fix: Needs a design/schema/product decision · effort M

- **Where:** `src/lib/validators/ai.ts:12`
- **Code shows:** aiMatchSchema accepts weights field (lines 12-18 in validators) with keys 'skills', 'experience', 'education', 'location'. Line 46 of /api/ai/match/route.ts extracts it via validateBody but never uses it. Handler invokes Gemini API (line 158) with hardcoded prompt; weight values have no effect on score. Vocabulary mismatch: schema keys are 'skills'/'experience'/'education'/'location' but AI breakdown returns 'skills'/'experience'/'location'/'language'.
- **Fix:** Either (a) remove weights from schema and UI if deterministic scoring is final design, or (b) implement weight support by blending Gemini score with calculateMatchScore() and applying weights. Requires decision: which scoring engine is authoritative (AI vs. deterministic).

### `notification-stats-loads-all-preferences` — REAL · low · fix: Scoped (uses existing primitives) · effort S

- **Where:** `src/app/api/admin/notification-stats/route.ts:25`
- **Code shows:** Line 25 executes NotificationPreference.find({}).select('emailFrequency unsubscribedAll').lean() which loads all NotificationPreference documents into memory. Lines 41-57 then iterate in JavaScript to count frequencies instead of using MongoDB aggregation pipeline, causing O(n) memory usage and O(n) application-level computation.
- **Fix:** Replace the find().lean() with an aggregation pipeline: NotificationPreference.aggregate([{ $group: { _id: '$emailFrequency', count: { $sum: 1 } } }]) to compute counts server-side without loading documents into application memory.

### `referral-deactivation-bypass` — REAL · low · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/app/api/referral/route.ts:41`
- **Code shows:** GET endpoint (line 124) performs write side effects: lines 35-46 generate a new referralCode and save it if the ReferralLink is missing or inactive. A GET request that modifies state violates HTTP semantics and breaks distributed link sharing — calling the endpoint multiple times with the same link produces different results.
- **Fix:** Move the ReferralLink creation/update logic to a separate POST or PUT endpoint. The GET handler should only return the current referral state without modifying it.

### `referral-maxuses-toctou` — REAL · low · fix: Needs a design/schema/product decision · effort M

- **Where:** `src/app/api/auth/employer-register/route.ts:184`
- **Code shows:** Line 184 checks `if (rl.maxUses > 0 && rl.usedCount >= rl.maxUses)` and rejects if exceeded. However, line 247 increments via `$inc: { usedCount: 1 }`. Between the read check and the write increment, multiple concurrent requests can all read usedCount < maxUses and proceed, causing the limit to be exceeded. No atomic check-and-increment.
- **Fix:** Use MongoDB atomic operations (findByIdAndUpdate with $inc and conditional checks) or implement pessimistic locking to ensure maxUses is never exceeded. Alternatively, reject increments that would exceed maxUses within the update itself.

### `referral-validate-unauthenticated-oracle` — REAL · low · fix: Scoped (uses existing primitives) · effort S

- **Where:** `src/app/api/referral/validate/route.ts:8`
- **Code shows:** GET handler (line 8, no withAuth guard) accepts unauthenticated requests. Lines 17-48 query ReferralLink, Agent, and SuperAgent by code and return referrer name. An attacker can enumerate referral codes to discover which codes exist and whose names are associated, via the 'referrerName' field in the response.
- **Fix:** Either: (1) Add authentication requirement using withAuth middleware, or (2) Anonymize response to avoid leaking referrer name to unauthenticated users (return only valid/invalid status), or (3) Add rate limiting to make enumeration impractical.

### `referral-validate-unauthenticated-unrated-scans` — REAL · low · fix: Scoped (uses existing primitives) · effort S

- **Where:** `src/app/api/referral/validate/route.ts:31`
- **Code shows:** GET handler has no rate limiting (no checkRateLimit call) and performs up to 3 unindexed collection scans per request: ReferralLink.findOne (line 17), Agent.findOne (line 31), SuperAgent.findOne (line 41). An unauthenticated attacker can spam requests to monopolize database query capacity.
- **Fix:** Add rate limiting via checkRateLimit at the start of the handler, using a config like { limit: 10, windowSec: 60 } for unauthenticated code validation. Alternatively, add indexes on (code, isActive) to speed up the queries.

### `sa-distribute-partial-write-on-403` — REAL · low · fix: Mechanical (few lines) · effort M

- **Where:** `src/app/api/super-agent/target-profiles/route.ts:293`
- **Code shows:** Lines 293-299: The scope validation check `if (!allowedAgentUserIds.has(alloc.agentUserId))` happens INSIDE the loop at iteration i. If iterations 0 and 1 succeed and create profiles (lines 331-346, 356-372), then iteration 2 fails the scope check (line 294), the loop returns 403 (line 295) but the first two profiles were already persisted to the database.
- **Fix:** Move all validation before any database writes. Collect and validate all allocations in a first pass, then only write if all pass. Or use transaction to atomically commit all or rollback on first error.

### `sa-list-scope-narrower-than-create-scope` — REAL · low · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/app/api/invoices/route.ts:63`
- **Code shows:** Line 63-67 (list handler): `filter.$or = [{ userId }, { agentId: { $in: sa.agentIds } }]`. recruitment/route.ts line 104-106 (create handler): uses `getSuperAgentScope` which returns `effectiveAgentIds`. SA-created region invoices can vanish from SA's own list if agentIds and effectiveAgentIds diverge.
- **Fix:** Make both handlers use the same scope resolution: call getSuperAgentScope in both list and create handlers, use effectiveAgentIds consistently.

### `stale-reregistration-double-attribution` — REAL · low · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/app/api/auth/employer-register/route.ts:123`
- **Code shows:** Lines 123-126 delete a stale unverified User and Employer without decrementing the usedCount on any associated ReferralLink. Then lines 245-260 increment usedCount and add a new registration to the same ReferralLink. If the original User was referred via the same link, this creates: (1) double-counting toward maxUses, (2) orphaned registration record in registrations array (employerId/userId pointing to deleted records).
- **Fix:** Before deleting stale Employer, find and decrement usedCount on the ReferralLink it was tracked under. Alternatively, add a pre-delete hook to Employer that handles cleanup, or prevent re-registration with the same referral code within the 24-hour stale window.

### `upstash-absent-fails-open-per-instance` — REAL · low · fix: Scoped (uses existing primitives) · effort S

- **Where:** `src/lib/security/rateLimit.ts:95`
- **Code shows:** getUpstashLimiter at line 95 returns null if UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN are missing (lines 96-98). In checkRateLimit (line 139), failClosed only checks for exceptions when limiter.limit() is called (line 156), not when limiter is null. Line 165 unconditionally falls back to per-instance in-memory store regardless of failClosed setting.
- **Fix:** Check if limiter is null at line 145 and return { allowed: false } when failClosed=true and limiter is null, before attempting the fallback to in-memory store.

### `users-export-lastlogin-dead-field` — REAL · low · fix: Mechanical (few lines) · effort S

- **Where:** `src/app/[locale]/(dashboard)/admin/users/page.tsx:84`
- **Code shows:** Line 84 defines export column `{ header: 'Last Login', key: 'lastLoginAt', formatter: ... }` reading field 'lastLoginAt'. User model (src/models/User.ts line 44) defines `lastLogin?: Date;` not 'lastLoginAt'. Export will always show '—' because the field doesn't exist on returned User objects.
- **Fix:** Change line 84 key from `'lastLoginAt'` to `'lastLogin'` to match User.ts interface.

### `ai-match-unguarded-write-and-read` — PARTIAL · high · fix: Scoped (uses existing primitives) · effort S

- **Where:** `src/app/api/ai/match/route.ts:169`
- **Code shows:** Line 33: endpoint is protected with `withAuth` middleware and lines 53-65 include RBAC checks for employer/agent roles. However, lines 169-180 perform `Application.findByIdAndUpdate(applicationId, {...})` without verifying that the applicationId belongs to the job being matched or is owned by the requester. An attacker could provide an applicationId from any job/employer and it would be updated.
- **Fix:** Before updating the application at line 169, verify ownership: fetch the Application by applicationId and confirm its jobId matches the job being analyzed. Add: `if (applicationId) { const app = await Application.findById(applicationId); if (!app \|\| String(app.jobId) !== String(jobId)) return forbidden; }`

### `admin-self-destruct-no-last-admin-guard` — PARTIAL · medium · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/app/api/admin/users/route.ts:122`
- **Code shows:** Line 122-124 guards against deactivate/delete of own account: `if (id === ctx.userId && (action === "deactivate" \|\| action === "delete"))`. However, setRole action (lines 129-134) is NOT guarded, allowing self-demotion. No check prevents the last admin from being removed entirely.
- **Fix:** Add setRole to the self-protection check at line 122. Additionally, before demoting the last admin, query for other active admins and prevent the operation if none exist: `const adminCount = await User.countDocuments({ role: "admin", isActive: true });`

### `sent-invoice-no-commission` — PARTIAL · medium · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/app/api/invoices/recruitment/route.ts:296`
- **Code shows:** Line 296 shows `if (finalInvoiceStatus === 'issued') { ... createCommissionRecordsForInvoice }`. Status 'sent' skips commission creation. However, schema defaults to 'issued' (line 47 of subscriptions.ts), so status='sent' must be explicitly set during creation, making this a narrow attack vector rather than automatic.
- **Fix:** Create commissions for any non-draft status, or explicitly list payable statuses that warrant commissions. The default-to-issued mitigates but doesn't eliminate the risk.

### `csrf-exempt-invariant-violated` — PARTIAL · low · fix: Scoped (uses existing primitives) · effort M

- **Where:** `src/lib/security/csrf.ts:143`
- **Code shows:** Lines 143-152 document the invariant: 'INVARIANT: do not change the session cookie to sameSite=none and do not add data-mutating routes here without restoring CSRF'. The invariant is clearly and strongly documented. However, the invariant text itself serves as a guard; the actual enforcement depends on developers adhering to it when adding routes. The routes I sampled (/api/ai/chat, /api/ai/lead-score, /api/ai/daily-insights) are read-only inference endpoints.
- **Fix:** Add runtime validation that prevents POST/PATCH/DELETE exemptions unless a flag explicitly bypasses this check, or use a naming convention that makes violations obvious during review.

### `payout-batch-ref-reuse` — PARTIAL · low · fix: Mechanical (few lines) · effort S

- **Where:** `src/app/api/commission-payouts/route.ts:98`
- **Code shows:** Line 98: `const paidCommissions = await Commission.find({ paymentRef: batchRef }).lean();` queries by batchRef alone. Lines 76-87 updateMany guards with `status: 'approved', paidAt: null`, so double-payment is prevented. However, line 98 summary would re-count previously paid commissions if batchRef is reused, inflating payout reports even if DB is protected.
- **Fix:** Query with additional status guard: `Commission.find({ paymentRef: batchRef, status: 'paid' })` to only count what was actually paid in this batch.

### `pending2fa-api-lockdown-dead-code` — PARTIAL · low · fix: Scoped (uses existing primitives) · effort S

- **Where:** `src/proxy.ts:212`
- **Code shows:** Lines 204-225 do execute and return 403 for pending2fa users accessing APIs. However, session callback at line 766 in config.ts already clears session.user.id when pending2fa is true, making the user unauthenticated for withAuth. This middleware protection is belt-and-suspenders — effective but redundant.
- **Fix:** This is defensive depth and not harmful, but if clarity is desired, add a comment explaining it's a redundant safety layer that runs before withAuth can check. No fix required unless redundancy is undesired.

## Refuted — do not chase (2)

### `tenantview-cookie-not-path-scoped` — REFUTED · medium · fix: Not a real bug / won't fix · effort S

- **Where:** `src/lib/auth/withAuth.ts:146`
- **Code shows:** Cookie is set with path: "/" (line 236), but tenant view is correctly scoped by code logic. Lines 142-146 check isRoleSpecificApi and skip tenant view for /api/admin, /api/super-agent, /api/agent paths. The /api/tenant/switch endpoint has skipTenantView: true (line 241). Actors retain full access to their own dashboards and exit affordance exists.
- **Fix:** No fix needed. The code correctly handles role-specific API exemption via isRoleSpecificApi check. Cookie path scope is a defense-in-depth measure, but the core protection is the pathname check.

### `equal-split-fails-fractional-target` — REFUTED · low · fix: Not a real bug / won't fix · effort S

- **Where:** `src/lib/targets/distributionStrategies.ts:20`
- **Code shows:** Lines 20-25 compute empPer = floor(annual/12) and empRem = annual - (empPer*12). Lines 29 add 1 to first empRem months. Example: annual=100, empPer=8, empRem=4 → [9,9,9,9,8,8,8,8,8,8,8,8] sums to 100. The remainder distribution ensures monthly sum always equals annual target. Validation at validateDistributionSum (lines 96-98) checks empSum === annual.employerTarget, which passes for all distributions generated by equalDistribution.
- **Fix:** No fix needed. The finding's premise is incorrect — equal split correctly represents non-integer annual targets.

