/**
 * MongoDB Index Definitions
 * Call ensureIndexes() once at app startup (called from mongoose.ts)
 *
 * autoIndex is disabled in mongoose.ts so we control all index creation here.
 * Each collection is wrapped in try/catch so one conflict never blocks the rest.
 */
import mongoose from "mongoose";

type IndexSpec = mongoose.mongo.IndexDescription;

/** Create indexes for a single collection, silently skipping conflicts (code 85). */
async function safeCreateIndexes(
  db: mongoose.mongo.Db,
  collection: string,
  indexes: IndexSpec[],
) {
  try {
    await db.collection(collection).createIndexes(indexes);
  } catch (err: unknown) {
    const code = (err as { code?: number }).code;
    // 85 = IndexOptionsConflict (same key, different name) — harmless, skip
    if (code !== 85) {
      console.warn(`[DB] Index warning on ${collection}:`, (err as Error).message);
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
  ]);

  // ── JobSeekers ─────────────────────────────────────────────────────────────
  await safeCreateIndexes(db, "jobseekers", [
    { key: { userId: 1 }, unique: true },
    { key: { "skills.name": 1 } },
    { key: { profileCompleteness: -1 } },
    { key: { nationality: 1 } },
    { key: { currentLocation: 1 } },
    { key: { availableFrom: 1 } },
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
  ]);

  // ── Commissions ────────────────────────────────────────────────────────────
  await safeCreateIndexes(db, "commissions", [
    { key: { invoiceId: 1 } },
    { key: { agentId: 1 } },
    { key: { superAgentId: 1 } },
    { key: { placementId: 1 } },
    { key: { status: 1 } },
    { key: { createdAt: -1 } },
    // Agent/super-agent earnings breakdown by status
    { key: { agentId: 1, status: 1 } },
    { key: { superAgentId: 1, status: 1 } },
  ]);

  // ── Notifications ──────────────────────────────────────────────────────────
  await safeCreateIndexes(db, "notifications", [
    { key: { userId: 1, isRead: 1 } },
    { key: { createdAt: -1 } },
    { key: { userId: 1, createdAt: -1 } },
    { key: { userId: 1, type: 1, createdAt: -1 } },
  ]);

  // ── AuditLogs ──────────────────────────────────────────────────────────────
  await safeCreateIndexes(db, "auditlogs", [
    { key: { actorId: 1 } },
    { key: { resource: 1 } },
    { key: { action: 1 } },
    { key: { createdAt: -1 } },
  ]);

  // ── ConversationThreads ────────────────────────────────────────────────────
  await safeCreateIndexes(db, "conversationthreads", [
    { key: { userId: 1, context: 1 } },
    { key: { createdAt: -1 } },
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
    { key: { isDefault: 1, targetRole: 1 } },
  ]);

  // ── Subscriptions ─────────────────────────────────────────────────────────
  await safeCreateIndexes(db, "subscriptions", [
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

  // ── AI Daily Usage (per-user daily quota counter) ──────────────────────────
  await safeCreateIndexes(db, "aidailyusages", [
    { key: { userId: 1, day: 1 }, unique: true },
    { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  ]);

  console.log("[DB] Indexes ensured ✅");
}
