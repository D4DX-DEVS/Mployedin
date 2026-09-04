/**
 * MongoDB Index Definitions
 * Call ensureIndexes() once at app startup (called from mongoose.ts)
 *
 * autoIndex is disabled in mongoose.ts so we control all index creation here.
 * Each collection is wrapped in try/catch so one conflict never blocks the rest.
 */
import mongoose from "mongoose";
import logger from "@/lib/logger";

type IndexSpec = mongoose.mongo.IndexDescription;

/**
 * Create indexes for a single collection, silently skipping conflicts (code 85).
 *
 * createIndexes() is all-or-nothing: one bad spec in the array aborts the whole
 * command, so a single unbuildable index would take the rest of the collection's
 * indexes down with it. On failure we retry each spec individually so one bad
 * apple cannot cost a collection its other indexes.
 *
 * A `unique` index that fails to build is reported at error level, not warn: it
 * is a CONSTRAINT, and a missing one means duplicate rows can be written with
 * nothing to stop them. That must be alertable, never a line lost in the noise.
 */
async function safeCreateIndexes(
  db: mongoose.mongo.Db,
  collection: string,
  indexes: IndexSpec[],
) {
  // 85 = IndexOptionsConflict (same key, different name) — harmless, skip
  const benign = (err: unknown) => (err as { code?: number }).code === 85;

  try {
    await db.collection(collection).createIndexes(indexes);
    return;
  } catch (err: unknown) {
    if (benign(err)) return;
  }

  for (const spec of indexes) {
    try {
      await db.collection(collection).createIndexes([spec]);
    } catch (err: unknown) {
      if (benign(err)) continue;
      const detail = { err, collection, key: spec.key, event: "index_create_failed" };
      if (spec.unique) {
        // 11000 = duplicate key: the data already violates the constraint.
        logger.error(detail, `[DB] UNIQUE index FAILED on ${collection} — constraint is NOT enforced`);
      } else {
        logger.warn(detail, `[DB] Index warning on ${collection}`);
      }
    }
  }
}

export async function ensureIndexes() {
  const db = mongoose.connection.db;
  if (!db) return;

  // ── Users ──────────────────────────────────────────────────────────────────
  await safeCreateIndexes(db, "users", [
    { key: { email: 1 }, unique: true },
    { key: { role: 1 } },
    { key: { locale: 1 } },
    { key: { createdAt: -1 } },
    // Admin user list: filter by role, sort newest first
    { key: { role: 1, createdAt: -1 } },
  ]);

  // ── JobSeekers ─────────────────────────────────────────────────────────────
  await safeCreateIndexes(db, "jobseekers", [
    { key: { userId: 1 }, unique: true },
    { key: { "skills.name": 1 } },
    { key: { profileCompleteness: -1 } },
    { key: { nationality: 1 } },
    { key: { currentLocation: 1 } },
    { key: { availableFrom: 1 } },
    // Cron hot path: job-alerts cursor pagination over visible, available seekers
    { key: { profileVisibility: 1, availabilityStatus: 1, _id: 1 } },
  ]);

  // ── Employers ──────────────────────────────────────────────────────────────
  await safeCreateIndexes(db, "employers", [
    { key: { userId: 1 }, unique: true },
    { key: { agentId: 1 } },
    { key: { verificationLevel: 1 } },
    { key: { industry: 1 } },
    { key: { country: 1 } },
    { key: { paymentStatus: 1 } },
    { key: { subscriptionType: 1 } },
  ]);

  // ── Agents ─────────────────────────────────────────────────────────────────
  await safeCreateIndexes(db, "agents", [
    { key: { userId: 1 }, unique: true },
    { key: { superAgentId: 1 } },
    { key: { isActive: 1 } },
  ]);

  // ── SuperAgents ────────────────────────────────────────────────────────────
  await safeCreateIndexes(db, "superagents", [
    { key: { userId: 1 }, unique: true },
  ]);

  // ── Jobs ───────────────────────────────────────────────────────────────────
  await safeCreateIndexes(db, "jobs", [
    { key: { status: 1 } },
    { key: { employerId: 1 } },
    { key: { agentId: 1 } },
    { key: { category: 1 } },
    { key: { location: 1 } },
    { key: { createdAt: -1 } },
    { key: { expiresAt: 1 } },
    { key: { "requirements.skills": 1 } },
    { key: { deletedAt: 1 } },
    // Hot path: list active (non-deleted) jobs, newest first
    { key: { status: 1, deletedAt: 1, createdAt: -1 } },
    // Compound indexes for employer/agent + status filtering
    { key: { employerId: 1, status: 1 } },
    { key: { agentId: 1, status: 1, createdAt: -1 } },
    {
      key: { title: "text", description: "text", "requirements.skills": "text" },
      name: "jobs_text_search",
      weights: { title: 10, "requirements.skills": 5, description: 1 },
    },
  ]);

  // ── Applications ───────────────────────────────────────────────────────────
  await safeCreateIndexes(db, "applications", [
    { key: { jobSeekerId: 1, jobId: 1 }, unique: true },
    { key: { jobId: 1 } },
    { key: { jobSeekerId: 1 } },
    { key: { employerId: 1 } },
    { key: { agentId: 1 } },
    { key: { status: 1 } },
    { key: { aiMatchScore: -1 } },
    { key: { appliedAt: -1 } },
    // Pipeline views: applications for a job filtered by status, newest first
    { key: { jobId: 1, status: 1, appliedAt: -1 } },
    { key: { employerId: 1, status: 1, appliedAt: -1 } },
    // Cron hot path: sla-alerts / nps-trigger scan terminal statuses by recency
    { key: { status: 1, updatedAt: -1 } },
  ]);

  // ── Interviews ─────────────────────────────────────────────────────────────
  await safeCreateIndexes(db, "interviews", [
    { key: { applicationId: 1 } },
    { key: { jobSeekerId: 1 } },
    { key: { employerId: 1 } },
    { key: { agentId: 1 } },
    { key: { scheduledAt: 1 } },
    { key: { status: 1 } },
    // Upcoming interviews by status, soonest first
    { key: { status: 1, scheduledAt: 1 } },
    // Prevent duplicate active rounds for the same application
    {
      key: { applicationId: 1, interviewRound: 1 },
      unique: true,
      name: "unique_active_interview_round_per_application",
      // Active only — completed/rescheduled rounds can legitimately repeat
      partialFilterExpression: { status: { $in: ["scheduled", "confirmed"] } },
    },
  ]);

  // ── Placements ─────────────────────────────────────────────────────────────
  await safeCreateIndexes(db, "placements", [
    { key: { applicationId: 1 }, unique: true },
    { key: { jobSeekerId: 1 } },
    { key: { employerId: 1 } },
    { key: { agentId: 1 } },
    { key: { placedAt: -1 } },
  ]);

  // ── Leads ──────────────────────────────────────────────────────────────────
  await safeCreateIndexes(db, "leads", [
    { key: { agentId: 1 } },
    { key: { status: 1 } },
    { key: { followUpAt: 1 } },
    { key: { createdAt: -1 } },
    // Cron hot path: lead-followup-reminder selects open leads due for follow-up
    { key: { status: 1, followUpAt: 1 } },
  ]);

  // ── Agent tasks ────────────────────────────────────────────────────────────
  // The schema used to live inline inside /api/agent/tasks, so its indexes were
  // invisible to this file and never created. The nav badge, the Today queue
  // and the calendar all query by owner and due date.
  await safeCreateIndexes(db, "agenttasks", [
    { key: { userId: 1 } },
    { key: { userId: 1, dueDate: 1, status: 1 } },
  ]);

  // ── Commissions ────────────────────────────────────────────────────────────
  await safeCreateIndexes(db, "commissions", [
    { key: { invoiceId: 1 } },
    // Idempotency guard for createCommissionRecordsForInvoice(): one record per (invoice, agent, type).
    // Partial so placement-only commissions (no invoiceId) stay unconstrained. Mirrors the schema declaration.
    { key: { invoiceId: 1, agentId: 1, type: 1 }, unique: true, partialFilterExpression: { invoiceId: { $exists: true } } },
    { key: { agentId: 1 } },
    { key: { superAgentId: 1 } },
    { key: { placementId: 1 } },
    { key: { status: 1 } },
    { key: { createdAt: -1 } },
    // Agent/super-agent earnings breakdown by status
    { key: { agentId: 1, status: 1 } },
    { key: { superAgentId: 1, status: 1 } },
    // Commission lists: filter by owner, sort newest first
    { key: { agentId: 1, createdAt: -1 } },
    { key: { superAgentId: 1, createdAt: -1 } },
  ]);

  // ── Notifications ──────────────────────────────────────────────────────────
  await safeCreateIndexes(db, "notifications", [
    { key: { userId: 1, isRead: 1 } },
    { key: { createdAt: -1 } },
    { key: { userId: 1, createdAt: -1 } },
    { key: { userId: 1, type: 1, createdAt: -1 } },
  ]);

  // ── SavedSearches ───────────────────────────────────────────────────────────
  await safeCreateIndexes(db, "savedsearches", [
    { key: { userId: 1 } },
    { key: { userId: 1, createdAt: -1 } },
    // Hot path: saved-search-alerts cron selects due alerts (emailAlert + frequency,
    // then lastNotifiedAt range/null). Equality prefix keeps the scan tight at scale.
    { key: { emailAlert: 1, frequency: 1, lastNotifiedAt: 1 } },
  ]);

  // ── AuditLogs ──────────────────────────────────────────────────────────────
  await safeCreateIndexes(db, "auditlogs", [
    { key: { actorId: 1 } },
    { key: { resource: 1 } },
    { key: { action: 1 } },
    { key: { createdAt: -1 } },
    // "what was done inside account X" — the admin audit table and the employer
    // activity screen both filter on this now. autoIndex is off, so the
    // AuditLogSchema.index() declaration alone would never reach the database.
    { key: { onBehalfOfId: 1 } },
  ]);

  // ── ConversationThreads ────────────────────────────────────────────────────
  await safeCreateIndexes(db, "conversationthreads", [
    { key: { userId: 1, context: 1 } },
    { key: { createdAt: -1 } },
  ]);

  // ── Conversations (DM + customer care) ────────────────────────────────────
  await safeCreateIndexes(db, "conversations", [
    // Non-unique: participants is an array — a unique index on it enforces
    // per-element uniqueness collection-wide (no user could ever be in more
    // than one conversation), not per-pair uniqueness. Use participantsKey
    // below for one-thread-per-dm-pair.
    { key: { participants: 1 } },
    {
      key: { participantsKey: 1 },
      unique: true,
      name: "unique_dm_pair",
      partialFilterExpression: { type: "dm" },
    },
    { key: { type: 1, "customerCare.status": 1 } },
    { key: { "customerCare.assignedTo": 1 } },
    { key: { lastMessageAt: -1 } },
  ]);

  // ── DirectMessages ─────────────────────────────────────────────────────────
  await safeCreateIndexes(db, "directmessages", [
    { key: { conversationId: 1, createdAt: 1 } },
  ]);

  // ── SavedJobs ──────────────────────────────────────────────────────────────
  await safeCreateIndexes(db, "savedjobs", [
    { key: { jobSeekerId: 1, jobId: 1 }, unique: true },
    { key: { jobSeekerId: 1, savedAt: -1 } },
  ]);

  // ── ImpersonationSessions ─────────────────────────────────────────────────
  await safeCreateIndexes(db, "impersonationsessions", [
    { key: { adminId: 1 } },
    { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  ]);

  // ── TenantViewSessions ────────────────────────────────────────────────────
  await safeCreateIndexes(db, "tenantviewsessions", [
    { key: { actorId: 1 }, unique: true },
    { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  ]);

  // ── Offers ────────────────────────────────────────────────────────────────
  await safeCreateIndexes(db, "offers", [
    { key: { applicationId: 1 } },
    { key: { jobSeekerId: 1 } },
    { key: { employerId: 1 } },
    { key: { status: 1 } },
    // Compound index for filtering expired offers
    { key: { status: 1, expiresAt: 1 } },
  ]);

  // ── Job Attribute Master Data ──────────────────────────────────────────────
  const attributeCollections = [
    "salaryperiods", "ownershiptypes", "maritalstatuses", "resulttypes",
    "majorsubjects", "degreetypes", "degreelevels", "jobshifts",
    "jobtypes", "jobskills", "jobexperiences", "industries",
    "genders", "functionalareas", "careerlevels", "languagelevels",
  ];

  for (const col of attributeCollections) {
    await safeCreateIndexes(db, col, [
      { key: { slug: 1 }, unique: true },
      { key: { isActive: 1, sortOrder: 1 } },
    ]);
  }

  // ── Location Master Data ───────────────────────────────────────────────────
  await safeCreateIndexes(db, "countries", [
    { key: { code: 1 }, unique: true },
    { key: { isActive: 1, sortOrder: 1 } },
    { key: { name: 1 } },
  ]);

  await safeCreateIndexes(db, "states", [
    { key: { countryId: 1 } },
    { key: { slug: 1 }, unique: true },
    { key: { isActive: 1, sortOrder: 1 } },
  ]);

  await safeCreateIndexes(db, "cities", [
    { key: { stateId: 1 } },
    { key: { slug: 1 }, unique: true },
    { key: { isActive: 1, sortOrder: 1 } },
  ]);

  // ── Subscription Plans ──────────────────────────────────────────────────────
  await safeCreateIndexes(db, "subscriptionplans", [
    { key: { slug: 1 }, unique: true },
    { key: { targetRole: 1, isActive: 1, sortOrder: 1 } },
    {
      key: { targetRole: 1, isDefault: 1 },
      unique: true,
      name: "unique_default_subscription_plan_per_role",
      partialFilterExpression: { isDefault: true },
    },
  ]);

  // ── Subscriptions ─────────────────────────────────────────────────────────
  await safeCreateIndexes(db, "subscriptions", [
    // At most one ACTIVE subscription per (user, role). Blocks the race where two
    // concurrent purchase/assign flows each create an active subscription.
    { key: { userId: 1, targetRole: 1 }, unique: true, partialFilterExpression: { status: "active" } },
    { key: { userId: 1, targetRole: 1, status: 1 } },
    { key: { endDate: 1, status: 1 } },
    { key: { planId: 1 } },
    { key: { usageResetAt: 1, status: 1 } },
  ]);

  // ── Invoices ──────────────────────────────────────────────────────────────
  await safeCreateIndexes(db, "invoices", [
    { key: { invoiceNumber: 1 }, unique: true },
    {
      key: { category: 1, jobId: 1, employerId: 1 },
      unique: true,
      name: "unique_active_recruitment_invoice_per_job_employer",
      partialFilterExpression: {
        category: "recruitment",
        status: { $in: ["draft", "pending_approval", "issued", "sent", "paid", "partially_paid", "overdue"] },
      },
    },
    { key: { userId: 1, createdAt: -1 } },
    { key: { subscriptionId: 1 } },
    { key: { status: 1 } },
    { key: { employerId: 1 } },
    { key: { agentId: 1 } },
    { key: { superAgentId: 1 } },
    { key: { dueDate: 1, status: 1 } },
  ]);

  // ── Subscription History ──────────────────────────────────────────────────
  await safeCreateIndexes(db, "subscriptionhistories", [
    { key: { userId: 1, createdAt: -1 } },
    { key: { subscriptionId: 1 } },
  ]);

  // ── Candidate NPS ──────────────────────────────────────────────────────────
  await safeCreateIndexes(db, "candidatenps", [
    // Cron hot path: nps-trigger dedup lookup by application
    { key: { applicationId: 1 } },
  ]);

  // ── AI Daily Usage (per-user daily quota counter) ──────────────────────────
  await safeCreateIndexes(db, "aidailyusages", [
    { key: { userId: 1, day: 1 }, unique: true },
    { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  ]);

  // ── Model-declared indexes ────────────────────────────────────────────────
  // autoIndex is off, so every Schema.index()/unique:true below existed only in
  // code until now — none of these were ever created in the database. Generated
  // from src/models and kept honest by src/__tests__/lib/index-coverage.test.ts,
  // which fails if a model declares an index this file does not manage.
  await safeCreateIndexes(db, "activityevents", [
    { key: { jobSeekerId: 1, createdAt: -1 } },
    { key: { jobSeekerId: 1, priority: -1, createdAt: -1 } },
    { key: { priority: 1 } },
  ]);

  await safeCreateIndexes(db, "aicaches", [
    { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    { key: { hash: 1 }, unique: true },
  ]);

  await safeCreateIndexes(db, "apikeys", [
    { key: { keyHash: 1 }, unique: true },
    { key: { employerId: 1 } },
    { key: { keyPrefix: 1 } },
  ]);

  await safeCreateIndexes(db, "applicationfeedbacks", [
    { key: { applicationId: 1 }, unique: true },
    { key: { employerId: 1 } },
    { key: { userId: 1 } },
  ]);

  await safeCreateIndexes(db, "applicationforms", [
    { key: { employerId: 1, isDefault: 1 } },
    { key: { jobId: 1 } },
  ]);

  await safeCreateIndexes(db, "approvalworkflows", [
    { key: { employerId: 1, status: 1 } },
    { key: { "approvers.userId": 1, status: 1 } },
    { key: { resourceId: 1 } },
  ]);

  await safeCreateIndexes(db, "assessmentattempts", [
    { key: { assessmentId: 1, userId: 1 } },
    { key: { userId: 1, status: 1 } },
    { key: { jobId: 1 } },
  ]);

  await safeCreateIndexes(db, "backgroundchecks", [
    { key: { employerId: 1, createdAt: -1 } },
    { key: { applicationId: 1 } },
    { key: { jobSeekerId: 1 } },
  ]);

  await safeCreateIndexes(db, "banners", [
    { key: { isActive: 1, sortOrder: 1 } },
  ]);

  await safeCreateIndexes(db, "blogposts", [
    { key: { slug: 1 }, unique: true },
    { key: { status: 1, publishedAt: -1 } },
    { key: { isActive: 1 } },
    { key: { tags: 1 } },
  ]);

  await safeCreateIndexes(db, "broadcasttemplates", [
    { key: { createdBy: 1 } },
    { key: { type: 1 } },
  ]);

  await safeCreateIndexes(db, "surveytemplates", [
    { key: { employerId: 1, trigger: 1 } },
  ]);

  // CandidateSurvey.ts registers two models; SurveyResponse is the second.
  await safeCreateIndexes(db, "surveyresponses", [
    { key: { employerId: 1, trigger: 1 } },
    { key: { applicationId: 1 } },
  ]);

  await safeCreateIndexes(db, "careerpages", [
    { key: { slug: 1 }, unique: true },
    { key: { isPublished: 1 } },
    { key: { employerId: 1 }, unique: true },
  ]);

  await safeCreateIndexes(db, "commtemplates", [
    { key: { employerId: 1 } },
    { key: { employerId: 1, type: 1 } },
  ]);

  await safeCreateIndexes(db, "companyprofileviews", [
    { key: { viewerId: 1, employerId: 1 } },
    { key: { employerId: 1, viewedAt: -1 } },
  ]);

  await safeCreateIndexes(db, "companyreviews", [
    { key: { employerId: 1, status: 1, createdAt: -1 } },
    { key: { userId: 1 } },
    { key: { employerId: 1, userId: 1 }, unique: true },
  ]);

  await safeCreateIndexes(db, "companyusers", [
    { key: { companyId: 1, userId: 1 }, unique: true, sparse: true },
    { key: { companyId: 1, email: 1 }, unique: true },
    { key: { companyId: 1, status: 1 } },
    { key: { inviteToken: 1 }, sparse: true },
    { key: { userId: 1 } },
  ]);

  await safeCreateIndexes(db, "contactsubmissions", [
    { key: { isRead: 1, createdAt: -1 } },
    { key: { createdAt: -1 } },
  ]);

  await safeCreateIndexes(db, "copilotproposals", [
    { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    { key: { userId: 1 } },
    { key: { status: 1 } },
  ]);

  await safeCreateIndexes(db, "diversityresponses", [
    { key: { employerId: 1 } },
    { key: { jobId: 1 } },
    { key: { applicationId: 1 }, unique: true },
  ]);

  await safeCreateIndexes(db, "emaillogs", [
    { key: { sentAt: -1 } },
    { key: { status: 1, sentAt: -1 } },
    { key: { userId: 1, sentAt: -1 } },
    { key: { source: 1, sentAt: -1 } },
    { key: { createdAt: 1 }, expireAfterSeconds: 90 * 24 * 60 * 60 },
    { key: { category: 1 } },
  ]);

  await safeCreateIndexes(db, "emailsequences", [
    { key: { employerId: 1, status: 1 } },
    { key: { "recipients.nextSendAt": 1, status: 1 } },
  ]);

  await safeCreateIndexes(db, "referralprograms", [
    { key: { employerId: 1 } },
  ]);

  // EmployeeReferral.ts registers two models; EmployeeReferral is the default export.
  await safeCreateIndexes(db, "employeereferrals", [
    { key: { employerId: 1, status: 1 } },
    { key: { referrerId: 1 } },
    { key: { candidateEmail: 1 } },
  ]);

  await safeCreateIndexes(db, "exhibitionperformances", [
    { key: { exhibitionId: 1 }, unique: true },
  ]);

  await safeCreateIndexes(db, "exhibitionrequests", [
    { key: { status: 1, createdAt: -1 } },
    { key: { eventCategory: 1 } },
    { key: { priority: 1 } },
    { key: { agentId: 1 } },
    { key: { superAgentId: 1 } },
    { key: { isDeleted: 1 } },
  ]);

  await safeCreateIndexes(db, "extractiondrafts", [
    { key: { employerId: 1, status: 1, createdAt: -1 } },
  ]);

  await safeCreateIndexes(db, "faqs", [
    { key: { isActive: 1, sortOrder: 1 } },
    { key: { category: 1 } },
  ]);

  await safeCreateIndexes(db, "genders", [
    { key: { isActive: 1, sortOrder: 1 } },
    { key: { slug: 1 }, unique: true },
  ]);

  await safeCreateIndexes(db, "hiringdecisions", [
    { key: { applicationId: 1 } },
    { key: { employerId: 1 } },
    { key: { interviewId: 1 } },
  ]);

  await safeCreateIndexes(db, "industries", [
    { key: { isActive: 1, sortOrder: 1 } },
    { key: { slug: 1 }, unique: true },
  ]);

  await safeCreateIndexes(db, "interviewquestions", [
    { key: { interviewId: 1, questionType: 1, createdAt: -1 } },
    { key: { generatedBy: 1 } },
  ]);

  await safeCreateIndexes(db, "jobskills", [
    { key: { isActive: 1, sortOrder: 1 } },
    { key: { name: "text", nameAr: "text" } },
    { key: { slug: 1 }, unique: true },
  ]);

  await safeCreateIndexes(db, "jobtemplates", [
    { key: { employerId: 1 } },
    { key: { sourceJobId: 1 } },
  ]);

  await safeCreateIndexes(db, "majorsubjects", [
    { key: { isActive: 1, sortOrder: 1 } },
    { key: { slug: 1 }, unique: true },
  ]);

  await safeCreateIndexes(db, "maritalstatuses", [
    { key: { isActive: 1, sortOrder: 1 } },
    { key: { slug: 1 }, unique: true },
  ]);

  await safeCreateIndexes(db, "matchingweighttemplates", [
    { key: { scope: 1 } },
    { key: { employerId: 1 } },
    { key: { scope: 1, isDefault: 1 } },
  ]);

  await safeCreateIndexes(db, "mcpauthorizationcodes", [
    { key: { codeHash: 1 }, unique: true },
    { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  ]);

  await safeCreateIndexes(db, "mcpclients", [
    { key: { clientId: 1 }, unique: true },
  ]);

  await safeCreateIndexes(db, "mcptokens", [
    { key: { accessTokenHash: 1 }, unique: true },
    { key: { refreshTokenHash: 1 }, unique: true },
    { key: { userId: 1 } },
    { key: { familyId: 1 } },
  ]);

  await safeCreateIndexes(db, "messages", [
    { key: { channel: 1, createdAt: -1 } },
    { key: { senderId: 1 } },
  ]);

  await safeCreateIndexes(db, "notificationpreferences", [
    { key: { userId: 1 }, unique: true },
    { key: { emailFrequency: 1, unsubscribedAll: 1 } },
  ]);

  await safeCreateIndexes(db, "offerlettertemplates", [
    { key: { employerId: 1 } },
  ]);

  // OfferLetter.ts registers two models; OfferLetter is the default export.
  await safeCreateIndexes(db, "offerletters", [
    { key: { offerId: 1 } },
    { key: { employerId: 1 } },
    { key: { status: 1 } },
  ]);

  await safeCreateIndexes(db, "onboardingchecklists", [
    { key: { employerId: 1, createdAt: -1 } },
    { key: { placementId: 1 }, unique: true },
  ]);

  await safeCreateIndexes(db, "postergenerations", [
    { key: { employerId: 1, createdAt: -1 } },
    { key: { shareSlug: 1 }, unique: true },
    { key: { jobId: 1 } },
  ]);

  await safeCreateIndexes(db, "profileviews", [
    { key: { jobSeekerId: 1, viewedAt: -1 } },
    { key: { viewerId: 1, viewedAt: -1 } },
    { key: { jobSeekerId: 1, viewerId: 1, viewedAt: -1 }, name: "dedup_lookup" },
  ]);

  await safeCreateIndexes(db, "pushsubscriptions", [
    { key: { endpoint: 1 }, unique: true },
    { key: { userId: 1 } },
  ]);

  await safeCreateIndexes(db, "referrallinks", [
    { key: { createdBy: 1 } },
    { key: { agentId: 1 } },
    { key: { superAgentId: 1 } },
    { key: { expiresAt: 1 } },
    { key: { code: 1 }, unique: true },
  ]);

  await safeCreateIndexes(db, "requisitions", [
    { key: { employerId: 1, status: 1 } },
    { key: { hiringManagerId: 1 } },
  ]);

  await safeCreateIndexes(db, "resources", [
    { key: { tags: 1 } },
    { key: { downloadCount: -1 } },
    { key: { category: 1 } },
    { key: { accessLevel: 1 } },
    { key: { isActive: 1 } },
  ]);

  await safeCreateIndexes(db, "resourcedownloadlogs", [
    { key: { resourceId: 1, downloadedAt: -1 } },
    { key: { userId: 1, downloadedAt: -1 } },
    { key: { downloadedAt: 1 } },
  ]);

  await safeCreateIndexes(db, "scorecards", [
    { key: { applicationId: 1 } },
    { key: { employerId: 1 } },
    { key: { interviewId: 1, evaluatedBy: 1 }, unique: true },
  ]);

  await safeCreateIndexes(db, "skillassessments", [
    { key: { employerId: 1, isActive: 1 } },
    { key: { jobIds: 1 } },
  ]);

  await safeCreateIndexes(db, "skillconfirmations", [
    { key: { userId: 1, skill: 1 }, unique: true },
    { key: { userId: 1, status: 1 } },
  ]);

  await safeCreateIndexes(db, "staticpages", [
    { key: { slug: 1 }, unique: true },
    { key: { isActive: 1 } },
  ]);

  await safeCreateIndexes(db, "systemconfigs", [
    { key: { key: 1 }, unique: true },
  ]);

  await safeCreateIndexes(db, "talentpools", [
    { key: { employerId: 1 } },
    { key: { "candidates.jobSeekerId": 1 } },
    { key: { tags: 1 } },
  ]);

  await safeCreateIndexes(db, "targetprofiles", [
    { key: { assigneeId: 1, year: 1, assigneeRole: 1 }, unique: true, partialFilterExpression: { status: "active" } },
    { key: { assignedBy: 1 } },
    { key: { parentProfileId: 1 } },
    { key: { status: 1, year: 1 } },
    { key: { region: 1, year: 1 } },
    { key: { assigneeRole: 1, year: 1 } },
  ]);

  await safeCreateIndexes(db, "territories", [
    { key: { name: 1 } },
    { key: { superAgentId: 1 } },
  ]);

  await safeCreateIndexes(db, "testimonials", [
    { key: { isActive: 1, sortOrder: 1 } },
  ]);

  await safeCreateIndexes(db, "videos", [
    { key: { isActive: 1, sortOrder: 1 } },
  ]);

  await safeCreateIndexes(db, "webhooks", [
    { key: { events: 1, isActive: 1 } },
    { key: { createdBy: 1 } },
  ]);

  await safeCreateIndexes(db, "workflowtemplates", [
    { key: { scope: 1 } },
    { key: { employerId: 1 } },
    { key: { scope: 1, isDefault: 1 } },
  ]);

  // ── GDPR register (admin GDPR page) ────────────────────────────────────────
  await safeCreateIndexes(db, "gdprrequests", [
    { key: { createdAt: -1 } },
    { key: { status: 1 } },
    { key: { userId: 1 } },
  ]);

  await safeCreateIndexes(db, "consentlogs", [
    { key: { createdAt: -1 } },
    // "latest consent per (user, type)" aggregation + per-user history
    { key: { userId: 1, consentType: 1, createdAt: -1 } },
  ]);

  logger.info("[DB] Indexes ensured ✅");
}
