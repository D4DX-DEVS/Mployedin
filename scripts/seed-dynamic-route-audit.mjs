/**
 * Idempotent fixtures for every dynamic page covered by the route audit.
 *
 * Usage:
 *   node --env-file=.env scripts/seed-dynamic-route-audit.mjs
 *
 * The script reuses the five documented audit users, creates missing profile
 * records, and upserts one coherent job/application/content/target dataset.
 * It writes the concrete role-to-URL map to audit-dynamic-fixtures.json.
 */
import { writeFile } from "node:fs/promises";
import { MongoClient, ObjectId } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is required");

const SEED_KEY = "dynamic-routes-v1";
const now = new Date();
const year = 2099;

async function connectWithRetry(attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const client = new MongoClient(uri, {
      connectTimeoutMS: 15_000,
      serverSelectionTimeoutMS: 20_000,
    });
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await client.close().catch(() => undefined);
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
      }
    }
  }
  throw lastError;
}

async function requireUser(db, email) {
  const user = await db.collection("users").findOne({ email });
  if (!user) throw new Error(`Required audit user is missing: ${email}`);
  return user;
}

async function upsertAndRead(collection, filter, update) {
  await collection.updateOne(
    filter,
    {
      $set: { ...update, updatedAt: now },
      $setOnInsert: { _id: new ObjectId(), createdAt: now },
    },
    { upsert: true },
  );
  const document = await collection.findOne(filter);
  if (!document) throw new Error(`Fixture upsert did not produce ${collection.collectionName}`);
  return document;
}

async function ensureProfile(collection, filter, defaults) {
  await collection.updateOne(
    filter,
    {
      $setOnInsert: {
        _id: new ObjectId(),
        ...defaults,
        auditSeedKey: SEED_KEY,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true },
  );
  const document = await collection.findOne(filter);
  if (!document) throw new Error(`Profile upsert did not produce ${collection.collectionName}`);
  return document;
}

const client = await connectWithRetry();
try {
  const db = client.db();
  const [adminUser, superAgentUser, agentUser, employerUser, jobSeekerUser] =
    await Promise.all([
      requireUser(db, "admin@mployedin.com"),
      requireUser(db, "superagent@mployedin.com"),
      requireUser(db, "agent@mployedin.com"),
      requireUser(db, "employer@mployedin.com"),
      requireUser(db, "jobseeker@mployedin.com"),
    ]);

  const superAgent = await ensureProfile(
    db.collection("superagents"),
    { userId: superAgentUser._id },
    {
      userId: superAgentUser._id,
      referralCode: "AUDIT-SA-2099",
      assignedCityIds: [],
      assignedStateIds: [],
      commissions: { total: 0, pending: 0, paid: 0 },
      country: "BH",
      currencyCode: "BHD",
    },
  );

  const agent = await ensureProfile(
    db.collection("agents"),
    { userId: agentUser._id },
    {
      userId: agentUser._id,
      superAgentId: superAgent._id,
      referralCode: "AUDIT-AGENT-2099",
      assignedCityIds: [],
      assignedStateIds: [],
      assignedEmployerIds: [],
      assignedJobSeekerIds: [],
      performance: {
        leadsGenerated: 1,
        employersCreated: 1,
        vacanciesPosted: 1,
        jobSeekersSubmitted: 1,
        interviewsScheduled: 0,
        placementsCompleted: 0,
      },
      activityLog: [],
      country: "BH",
      currencyCode: "BHD",
    },
  );

  await db.collection("superagents").updateOne(
    { _id: superAgent._id },
    { $addToSet: { agentIds: agent._id } },
  );

  const employer = await ensureProfile(
    db.collection("employers"),
    { userId: employerUser._id },
    {
      userId: employerUser._id,
      agentId: agent._id,
      companyName: "Audit Route Fixtures W.L.L.",
      companyEmail: employerUser.email,
      country: "BH",
      industry: "Technology",
      companySize: "11-50",
      description: "Deterministic employer fixture for dynamic-route verification.",
      verificationLevel: "company",
      verificationDocs: [],
      domainVerified: true,
      isAgentVerified: true,
      workflowMode: "manual",
      jobIds: [],
      paymentStatus: "active",
      subscriptionType: "premium",
    },
  );
  // Public company detail pages intentionally expose only active employers.
  // These are dedicated audit accounts, so make the reused profile routable
  // without replacing any existing company/business fields.
  await db.collection("employers").updateOne(
    { _id: employer._id },
    { $set: { isActive: true, updatedAt: now } },
  );

  const jobSeeker = await ensureProfile(
    db.collection("jobseekers"),
    { userId: jobSeekerUser._id },
    {
      userId: jobSeekerUser._id,
      agentId: agent._id,
      fullName: "Audit Job Seeker",
      nationality: "Bahraini",
      currentLocation: "Manama, Bahrain",
      skills: ["TypeScript", "React", "Quality Assurance"],
      suggestedSkills: [],
      experience: [],
      education: [],
      languages: [],
      certifications: [],
      projects: [],
      accomplishments: [],
      socialLinks: [],
      profileVisibility: "visible",
      documents: [],
      preferredCountries: ["BH"],
      preferredRoles: ["Quality Engineer"],
      preferredLocations: ["Manama"],
      isOnboarded: true,
    },
  );

  await db.collection("agents").updateOne(
    { _id: agent._id },
    {
      $addToSet: {
        assignedEmployerIds: employer._id,
        assignedJobSeekerIds: jobSeeker._id,
      },
    },
  );

  const job = await upsertAndRead(
    db.collection("jobs"),
    { employerId: employer._id, auditSeedKey: SEED_KEY },
    {
      employerId: employer._id,
      agentId: agent._id,
      title: "Audit Dynamic Route Quality Engineer",
      description: "A deterministic active job used to verify every job detail and edit route.",
      requirements: {
        skills: ["TypeScript", "React", "Quality Assurance"],
        preferredSkills: ["Playwright"],
        experienceMin: 1,
        experienceMax: 5,
        education: "Bachelor's degree",
        languages: ["English", "Arabic"],
        nationality: [],
      },
      employmentType: "full_time",
      workMode: "hybrid",
      responsibilities: ["Validate product workflows", "Maintain automated test coverage"],
      qualifications: ["Experience with browser automation"],
      benefits: ["Flexible work"],
      salary: {
        min: 900,
        max: 1_400,
        currency: "BHD",
        isNegotiable: false,
        period: "monthly",
      },
      location: { country: "BH", city: "Manama", isRemote: false },
      status: "active",
      workflowMode: "manual",
      vacancies: 1,
      applicantIds: [jobSeeker._id],
      poster: { approvalStatus: "approved", uploadedAt: now },
      approvedBy: adminUser._id,
      approvedAt: now,
      expiresAt: new Date("2099-12-31T23:59:59.000Z"),
      showSalary: true,
      views: 0,
      uniqueViews: 0,
      tags: ["audit-fixture"],
      visibility: "public",
      category: "Technology",
      auditSeedKey: SEED_KEY,
    },
  );

  await db.collection("employers").updateOne(
    { _id: employer._id },
    { $addToSet: { jobIds: job._id } },
  );

  const application = await upsertAndRead(
    db.collection("applications"),
    { jobSeekerId: jobSeeker._id, jobId: job._id },
    {
      jobSeekerId: jobSeeker._id,
      jobId: job._id,
      employerId: employer._id,
      agentId: agent._id,
      status: "shortlisted",
      documents: [],
      aiMatchScore: 92,
      matchBreakdown: {
        skills: 95,
        experience: 85,
        education: 90,
        availability: 95,
        overall: 92,
      },
      matchStrengths: ["TypeScript", "Quality Assurance"],
      matchGaps: [],
      autoApplied: false,
      source: "full_form",
      notes: [],
      interviewIds: [],
      appliedAt: now,
      statusHistory: [
        { status: "applied", changedAt: now, changedBy: jobSeekerUser._id },
        { status: "shortlisted", changedAt: now, changedBy: employerUser._id },
      ],
      auditSeedKey: SEED_KEY,
    },
  );

  const blog = await upsertAndRead(
    db.collection("blogposts"),
    { slug: "audit-dynamic-routes" },
    {
      title: "Audit Dynamic Routes",
      titleAr: "تدقيق المسارات الديناميكية",
      slug: "audit-dynamic-routes",
      excerpt: "Deterministic content fixture.",
      excerptAr: "محتوى ثابت للاختبار.",
      body: "<p>This published fixture verifies the public blog detail route.</p>",
      bodyAr: "<p>يُستخدم هذا المحتوى للتحقق من صفحة المدونة.</p>",
      coverImage: "",
      author: "MployedIn Audit",
      tags: ["audit"],
      status: "published",
      publishedAt: now,
      isActive: true,
      auditSeedKey: SEED_KEY,
    },
  );

  const staticPage = await upsertAndRead(
    db.collection("staticpages"),
    { slug: "audit-dynamic-page" },
    {
      slug: "audit-dynamic-page",
      title: "Audit Dynamic Page",
      titleAr: "صفحة التدقيق الديناميكية",
      body: "<p>Deterministic CMS page fixture.</p>",
      bodyAr: "<p>صفحة ثابتة لاختبار نظام المحتوى.</p>",
      isActive: true,
      auditSeedKey: SEED_KEY,
    },
  );

  const poster = await upsertAndRead(
    db.collection("postergenerations"),
    { shareSlug: "audit-dynamic-poster" },
    {
      employerId: employer._id,
      jobId: job._id,
      type: "single-job",
      prompt: "Audit fixture poster",
      style: "professional",
      showFields: { salary: true, location: true, experience: true, skills: true },
      formats: ["instagram-post"],
      variations: [{ backgroundUrl: "/logo.png", layout: "layout-a" }],
      selectedVariation: 0,
      finalPosterUrls: {},
      shareSlug: "audit-dynamic-poster",
      analytics: { views: 0, downloads: 0, qrScans: 0 },
      creditsUsed: 0,
      auditSeedKey: SEED_KEY,
    },
  );

  const monthlyTargets = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    employerTarget: 1,
    employeeTarget: 2,
    financeTarget: 100,
  }));
  const superTarget = await upsertAndRead(
    db.collection("targetprofiles"),
    { assigneeId: superAgentUser._id, assigneeRole: "super_agent", year },
    {
      assigneeId: superAgentUser._id,
      assigneeRole: "super_agent",
      assignedBy: adminUser._id,
      year,
      region: "Bahrain",
      employerTarget: 12,
      employeeTarget: 24,
      financeTarget: 1_200,
      currency: "BHD",
      distributionStrategy: "equal",
      monthlyTargets,
      notes: "Audit dynamic route fixture",
      status: "active",
      auditSeedKey: SEED_KEY,
    },
  );
  const agentTarget = await upsertAndRead(
    db.collection("targetprofiles"),
    { assigneeId: agentUser._id, assigneeRole: "agent", year },
    {
      assigneeId: agentUser._id,
      assigneeRole: "agent",
      assignedBy: superAgentUser._id,
      year,
      region: "Bahrain",
      employerTarget: 12,
      employeeTarget: 24,
      financeTarget: 1_200,
      currency: "BHD",
      distributionStrategy: "equal",
      monthlyTargets,
      parentProfileId: superTarget._id,
      notes: "Audit dynamic route fixture",
      status: "active",
      auditSeedKey: SEED_KEY,
    },
  );

  const lead = await upsertAndRead(
    db.collection("leads"),
    { agentId: agent._id, contactEmail: "audit.dynamic@mployedin.test" },
    {
      agentId: agent._id,
      superAgentId: superAgent._id,
      companyName: "Audit Dynamic Lead W.L.L.",
      contactPerson: "Audit Contact",
      contactEmail: "audit.dynamic@mployedin.test",
      contactPhone: "+973 1700 0000",
      country: "BH",
      city: "Manama",
      industry: "Technology",
      score: 90,
      qualificationLevel: "qualified",
      expectedRevenue: 1_200,
      expectedRevenueCurrency: "BHD",
      status: "interested",
      source: "audit_fixture",
      notes: "Deterministic dynamic-route fixture.",
      autoRouted: false,
      activityLog: [
        { action: "note", note: "Fixture created", timestamp: now, by: agentUser._id },
      ],
      auditSeedKey: SEED_KEY,
    },
  );

  const routes = {
    anonymous: [
      `/en/blog/${blog.slug}`,
      `/en/companies/${employer._id}`,
      `/en/poster/${poster.shareSlug}`,
    ],
    admin: [
      `/en/admin/cms/static-pages/${staticPage._id}/edit`,
      `/en/admin/jobs/${job._id}/edit`,
      `/en/admin/target-management/${superTarget._id}`,
      `/en/admin/targets/${superTarget._id}`,
    ],
    super_agent: [
      `/en/super-agent/agents/${agent._id}`,
      `/en/super-agent/targets/${superTarget._id}`,
    ],
    agent: [
      `/en/agent/leads/${lead._id}`,
      `/en/agent/targets/${agentTarget._id}`,
    ],
    employer: [
      `/en/employer/applications/${application._id}/panel`,
      `/en/employer/candidates/${jobSeeker._id}`,
      `/en/employer/jobs/${job._id}/edit`,
      `/en/employer/jobs/${job._id}/poster`,
    ],
    job_seeker: [
      `/en/job-seeker/applications/${application._id}`,
    ],
  };

  await writeFile(
    "audit-dynamic-fixtures.json",
    `${JSON.stringify({ seedKey: SEED_KEY, generatedAt: now.toISOString(), routes }, null, 2)}\n`,
  );
  console.log(JSON.stringify(routes, null, 2));
} finally {
  await client.close();
}
