/**
 * MongoDB Index Definitions
 * Call ensureIndexes() once at app startup (called from mongoose.ts)
 */
import mongoose from "mongoose";

export async function ensureIndexes() {
  const db = mongoose.connection.db;
  if (!db) return;

  try {
    // ── Users ────────────────────────────────────────────────────────────────
    await db.collection("users").createIndexes([
      { key: { email: 1 }, unique: true, name: "users_email_unique" },
      { key: { role: 1 }, name: "users_role" },
      { key: { locale: 1 }, name: "users_locale" },
      { key: { createdAt: -1 }, name: "users_createdAt_desc" },
    ]);

    // ── JobSeekers ────────────────────────────────────────────────────────────
    await db.collection("jobseekers").createIndexes([
      { key: { userId: 1 }, unique: true, name: "jobseekers_userId_unique" },
      { key: { "skills.name": 1 }, name: "jobseekers_skills" },
      { key: { profileCompleteness: -1 }, name: "jobseekers_completeness" },
      { key: { nationality: 1 }, name: "jobseekers_nationality" },
      { key: { currentLocation: 1 }, name: "jobseekers_location" },
      { key: { availableFrom: 1 }, name: "jobseekers_availableFrom" },
    ]);

    // ── Employers ─────────────────────────────────────────────────────────────
    await db.collection("employers").createIndexes([
      { key: { userId: 1 }, unique: true, name: "employers_userId_unique" },
      { key: { agentId: 1 }, name: "employers_agentId" },
      { key: { verificationLevel: 1 }, name: "employers_verificationLevel" },
      { key: { industry: 1 }, name: "employers_industry" },
      { key: { country: 1 }, name: "employers_country" },
    ]);

    // ── Agents ────────────────────────────────────────────────────────────────
    await db.collection("agents").createIndexes([
      { key: { userId: 1 }, unique: true, name: "agents_userId_unique" },
      { key: { superAgentId: 1 }, name: "agents_superAgentId" },
      { key: { isActive: 1 }, name: "agents_isActive" },
    ]);

    // ── SuperAgents ───────────────────────────────────────────────────────────
    await db.collection("superagents").createIndexes([
      { key: { userId: 1 }, unique: true, name: "superagents_userId_unique" },
    ]);

    // ── Jobs ──────────────────────────────────────────────────────────────────
    await db.collection("jobs").createIndexes([
      { key: { status: 1 }, name: "jobs_status" },
      { key: { employerId: 1 }, name: "jobs_employerId" },
      { key: { agentId: 1 }, name: "jobs_agentId" },
      { key: { category: 1 }, name: "jobs_category" },
      { key: { location: 1 }, name: "jobs_location" },
      { key: { createdAt: -1 }, name: "jobs_createdAt_desc" },
      { key: { expiresAt: 1 }, name: "jobs_expiresAt" },
      { key: { "requirements.skills": 1 }, name: "jobs_skills" },
      {
        key: { title: "text", description: "text", "requirements.skills": "text" },
        name: "jobs_text_search",
        weights: { title: 10, "requirements.skills": 5, description: 1 },
      },
    ]);

    // ── Applications ──────────────────────────────────────────────────────────
    await db.collection("applications").createIndexes([
      { key: { jobSeekerId: 1, jobId: 1 }, unique: true, name: "apps_jobseeker_job_unique" },
      { key: { jobId: 1 }, name: "apps_jobId" },
      { key: { jobSeekerId: 1 }, name: "apps_jobSeekerId" },
      { key: { status: 1 }, name: "apps_status" },
      { key: { aiMatchScore: -1 }, name: "apps_matchScore_desc" },
      { key: { appliedAt: -1 }, name: "apps_appliedAt_desc" },
    ]);

    // ── Interviews ────────────────────────────────────────────────────────────
    await db.collection("interviews").createIndexes([
      { key: { applicationId: 1 }, name: "interviews_applicationId" },
      { key: { jobSeekerId: 1 }, name: "interviews_jobSeekerId" },
      { key: { employerId: 1 }, name: "interviews_employerId" },
      { key: { scheduledAt: 1 }, name: "interviews_scheduledAt" },
      { key: { status: 1 }, name: "interviews_status" },
    ]);

    // ── Placements ────────────────────────────────────────────────────────────
    await db.collection("placements").createIndexes([
      { key: { applicationId: 1 }, unique: true, name: "placements_appId_unique" },
      { key: { jobSeekerId: 1 }, name: "placements_jobSeekerId" },
      { key: { employerId: 1 }, name: "placements_employerId" },
      { key: { agentId: 1 }, name: "placements_agentId" },
      { key: { placedAt: -1 }, name: "placements_placedAt_desc" },
    ]);

    // ── Leads ─────────────────────────────────────────────────────────────────
    await db.collection("leads").createIndexes([
      { key: { agentId: 1 }, name: "leads_agentId" },
      { key: { status: 1 }, name: "leads_status" },
      { key: { followUpAt: 1 }, name: "leads_followUpAt" },
      { key: { createdAt: -1 }, name: "leads_createdAt_desc" },
    ]);

    // ── Commissions ───────────────────────────────────────────────────────────
    await db.collection("commissions").createIndexes([
      { key: { agentId: 1 }, name: "commissions_agentId" },
      { key: { superAgentId: 1 }, name: "commissions_superAgentId" },
      { key: { placementId: 1 }, name: "commissions_placementId" },
      { key: { status: 1 }, name: "commissions_status" },
      { key: { createdAt: -1 }, name: "commissions_createdAt_desc" },
    ]);

    // ── Notifications ─────────────────────────────────────────────────────────
    await db.collection("notifications").createIndexes([
      { key: { userId: 1, isRead: 1 }, name: "notifications_userId_isRead" },
      { key: { createdAt: -1 }, name: "notifications_createdAt_desc" },
      { key: { userId: 1, createdAt: -1 }, name: "notifications_userId_createdAt" },
    ]);

    // ── AuditLogs ─────────────────────────────────────────────────────────────
    await db.collection("auditlogs").createIndexes([
      { key: { actorId: 1 }, name: "audit_actorId" },
      { key: { resource: 1 }, name: "audit_resource" },
      { key: { action: 1 }, name: "audit_action" },
      { key: { createdAt: -1 }, name: "audit_createdAt_desc" },
    ]);

    // ── ConversationThreads ───────────────────────────────────────────────────
    await db.collection("conversationthreads").createIndexes([
      { key: { userId: 1, context: 1 }, name: "threads_userId_context" },
      { key: { createdAt: -1 }, name: "threads_createdAt_desc" },
    ]);



    // ── Job Attribute Master Data ─────────────────────────────────────────────
    const attributeCollections = [
      "salaryperiods",
      "ownershiptypes",
      "maritalstatuses",
      "resulttypes",
      "majorsubjects",
      "degreetypes",
      "degreelevels",
      "jobshifts",
      "jobtypes",
      "jobskills",
      "jobexperiences",
      "industries",
      "genders",
      "functionalareas",
      "careerlevels",
      "languagelevels",
    ];

    for (const col of attributeCollections) {
      await db.collection(col).createIndexes([
        { key: { slug: 1 }, unique: true, name: `${col}_slug_unique` },
        { key: { isActive: 1, sortOrder: 1 }, name: `${col}_active_sort` },
      ]);
    }

    // ── Location Master Data ──────────────────────────────────────────────────
    await db.collection("countries").createIndexes([
      { key: { code: 1 }, unique: true, name: "countries_code_unique" },
      { key: { isActive: 1, sortOrder: 1 }, name: "countries_active_sort" },
      { key: { name: 1 }, name: "countries_name" },
    ]);

    await db.collection("states").createIndexes([
      { key: { countryId: 1 }, name: "states_countryId" },
      { key: { slug: 1 }, unique: true, name: "states_slug_unique" },
      { key: { isActive: 1, sortOrder: 1 }, name: "states_active_sort" },
    ]);

    await db.collection("cities").createIndexes([
      { key: { stateId: 1 }, name: "cities_stateId" },
      { key: { slug: 1 }, unique: true, name: "cities_slug_unique" },
      { key: { isActive: 1, sortOrder: 1 }, name: "cities_active_sort" },
    ]);

    console.log("[DB] Indexes ensured ✅");
  } catch (err) {
    // Non-fatal — indexes may already exist
    console.warn("[DB] Index creation warning:", err);
  }
}
