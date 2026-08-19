import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { withSubscription } from "@/lib/subscription/withSubscription";
import Application from "@/models/Application";
import Interview from "@/models/Interview";
import Offer from "@/models/Offer";
import Placement from "@/models/Placement";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";
import { Employer } from "@/models/Employer";
import { validateBody } from "@/lib/validators";
import { applicationCreateSchema } from "@/lib/validators/applications";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { computeBehaviorSignals } from "@/lib/behaviorSignals";
import { inngest } from "@/lib/inngest/client";
import { notifyApplicationReceived } from "@/lib/notifications/trigger";
import type { UserRole } from "@/models/User";
import logger from "@/lib/logger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AuthCtx = any;

// GET /api/applications — paginated list (filtered by role)
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "10"));
  const status = searchParams.get("status") ?? "";
  const jobId = searchParams.get("jobId") ?? "";
  const search = searchParams.get("search")?.trim() ?? "";
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";
  const experienceMin = searchParams.get("experienceMin") ?? "";
  const experienceMax = searchParams.get("experienceMax") ?? "";
  const skills = searchParams.get("skills") ?? "";
  const nationality = searchParams.get("nationality")?.trim() ?? "";
  const scoreMin = searchParams.get("scoreMin") ?? "";
  const scoreMax = searchParams.get("scoreMax") ?? "";
  const fetchJobs = searchParams.get("fetchJobs") === "true";
  const employerIdParam = searchParams.get("employerId") ?? "";
  const sourceParam = searchParams.get("source") ?? "";
  const autoAppliedParam = searchParams.get("autoApplied") ?? "";
  const sortBy = searchParams.get("sortBy") ?? "appliedAt";
  const sortOrder = searchParams.get("sortOrder") === "asc" ? 1 : -1;
  const fetchEmployers = searchParams.get("fetchEmployers") === "true";
  const fetchStats = searchParams.get("fetchStats") === "true";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {};

  // Track employer's accessible job IDs for validation & dropdown
  let accessibleJobIds: unknown[] | null = null;

  if (ctx.role === "job_seeker") {
    const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!seeker) return NextResponse.json({ applications: [], pagination: { page, limit, total: 0, pages: 0 } });
    query.jobSeekerId = seeker._id;
  } else if (ctx.role === "employer") {
    // Get all jobs for this employer then filter
    const { Employer } = await import("@/models/Employer");
    const { CompanyUser } = await import("@/models/CompanyUser");
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp) return NextResponse.json({ applications: [], pagination: { page, limit, total: 0, pages: 0 }, ...(fetchJobs ? { employerJobs: [] } : {}) });

    // Check job-level access for team members
    const teamMember = await CompanyUser.findOne({
      companyId: emp._id,
      userId: ctx.userId,
      status: "active",
    }).select("companyRole jobAccess").lean();

    let jobQuery: Record<string, unknown> = { employerId: emp._id };
    if (
      teamMember &&
      teamMember.companyRole !== "owner" &&
      teamMember.companyRole !== "admin" &&
      teamMember.jobAccess &&
      teamMember.jobAccess.length > 0
    ) {
      jobQuery = { employerId: emp._id, _id: { $in: teamMember.jobAccess } };
    }

    const jobs = await Job.find(jobQuery).select("_id").lean();
    accessibleJobIds = jobs.map((j) => j._id);
    query.jobId = { $in: accessibleJobIds };
  } else if (ctx.role === "agent") {
    // Agent sees applications for their jobs + jobs from assigned employers
    const { Agent } = await import("@/models/Agent");
    const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("_id assignedEmployerIds").lean();
    if (agentDoc) {
      const jobFilter: Record<string, unknown> = {
        $or: [
          { agentId: agentDoc._id },
          ...(agentDoc.assignedEmployerIds?.length
            ? [{ employerId: { $in: agentDoc.assignedEmployerIds } }]
            : []),
        ],
      };
      const agentJobs = await Job.find(jobFilter).select("_id").lean();
      accessibleJobIds = agentJobs.map((j) => j._id);
      query.jobId = { $in: accessibleJobIds };
    } else {
      // Default-deny: a user with role=agent but no active Agent profile must
      // never fall through to an unscoped platform-wide applications query.
      return NextResponse.json({
        applications: [],
        pagination: { page, limit, total: 0, pages: 0 },
        ...(fetchJobs ? { employerJobs: [] } : {}),
      });
    }
  } else if (ctx.role === "super_agent") {
    // S1: scope super_agent to applications for employers within their book of
    // business (team + region agents). Default-deny: an SA with no scope sees
    // nothing — never the platform-wide candidate PII + CV set.
    const { getSuperAgentEmployerIds } = await import("@/lib/auth/agentRestrictions");
    const empIds = await getSuperAgentEmployerIds(ctx.userId);
    if (empIds.length === 0) {
      return NextResponse.json({ applications: [], pagination: { page, limit, total: 0, pages: 0 }, ...(fetchJobs ? { employerJobs: [] } : {}) });
    }
    const saJobs = await Job.find({ employerId: { $in: empIds } }).select("_id").lean();
    accessibleJobIds = saJobs.map((j) => j._id);
    query.jobId = { $in: accessibleJobIds };
  }

  if (status) query.status = status;
  // Validate jobId against accessible jobs to prevent unauthorized access
  if (jobId) {
    if (accessibleJobIds) {
      const isAccessible = accessibleJobIds.some((id) => String(id) === jobId);
      if (!isAccessible) {
        return NextResponse.json({ applications: [], pagination: { page, limit, total: 0, pages: 0 }, ...(fetchJobs ? { employerJobs: [] } : {}) });
      }
    }
    query.jobId = new mongoose.Types.ObjectId(jobId);
  }

  // Date range filter on appliedAt
  if (dateFrom || dateTo) {
    const dateFilter: Record<string, Date> = {};
    if (dateFrom) {
      const from = new Date(dateFrom);
      if (!isNaN(from.getTime())) dateFilter.$gte = from;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      if (!isNaN(to.getTime())) {
        to.setHours(23, 59, 59, 999);
        dateFilter.$lte = to;
      }
    }
    if (Object.keys(dateFilter).length > 0) query.appliedAt = dateFilter;
  }

  // AI score range filter
  if (scoreMin || scoreMax) {
    const scoreFilter: Record<string, number> = {};
    const parsedMin = parseInt(scoreMin);
    const parsedMax = parseInt(scoreMax);
    if (!isNaN(parsedMin) && parsedMin > 0) scoreFilter.$gte = parsedMin;
    if (!isNaN(parsedMax) && parsedMax < 100) scoreFilter.$lte = parsedMax;
    if (Object.keys(scoreFilter).length > 0) query.aiMatchScore = scoreFilter;
  }

  // Employer filter (admin/super_agent only)
  if (employerIdParam && (ctx.role === "admin" || ctx.role === "super_agent")) {
    const empJobs = await Job.find({ employerId: employerIdParam }).select("_id").lean();
    const empJobIds = empJobs.map((j) => j._id);
    if (query.jobId?.$in) {
      query.jobId.$in = query.jobId.$in.filter((id: unknown) => empJobIds.some((ej: unknown) => String(ej) === String(id)));
    } else if (!query.jobId) {
      query.jobId = { $in: empJobIds };
    }
  }

  // Source filter
  if (sourceParam) {
    query.source = sourceParam;
  }

  // Auto-applied filter
  if (autoAppliedParam === "true") {
    query.autoApplied = true;
  } else if (autoAppliedParam === "false") {
    query.autoApplied = { $ne: true };
  }

  // Experience filter — filter by jobSeeker's totalExperienceYears
  let experienceFilterSeekerIds: unknown[] | null = null;
  if (experienceMin || experienceMax) {
    const expFilter: Record<string, number> = {};
    const parsedExpMin = parseInt(experienceMin);
    const parsedExpMax = parseInt(experienceMax);
    if (!isNaN(parsedExpMin)) expFilter.$gte = parsedExpMin;
    if (!isNaN(parsedExpMax)) expFilter.$lte = parsedExpMax;
    if (Object.keys(expFilter).length > 0) {
      const seekers = await JobSeeker.find({ totalExperienceYears: expFilter }).select("_id").lean();
      experienceFilterSeekerIds = seekers.map((s) => s._id);
    }
  }

  // Skills filter — filter by jobSeeker's skills containing any of the requested
  let skillsFilterSeekerIds: unknown[] | null = null;
  if (skills) {
    const skillsList = skills.split(",").map((s) => s.trim()).filter(Boolean);
    if (skillsList.length > 0) {
      const escapedSkills = skillsList.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const seekers = await JobSeeker.find({
        skills: { $in: escapedSkills.map((s) => new RegExp(s, "i")) },
      }).select("_id").lean();
      skillsFilterSeekerIds = seekers.map((s) => s._id);
    }
  }

  // Nationality filter — filter by jobSeeker's nationality (case-insensitive, partial)
  let nationalityFilterSeekerIds: unknown[] | null = null;
  if (nationality) {
    const escaped = nationality.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const seekers = await JobSeeker.find({ nationality: new RegExp(escaped, "i") }).select("_id").lean();
    nationalityFilterSeekerIds = seekers.map((s) => s._id);
  }

  // Combine experience + skills + nationality seeker filters (intersection)
  const seekerIdFilters = [experienceFilterSeekerIds, skillsFilterSeekerIds, nationalityFilterSeekerIds]
    .filter((f): f is unknown[] => f !== null);
  if (seekerIdFilters.length > 0) {
    const combined = seekerIdFilters.reduce((acc, ids) =>
      acc.filter((id) => ids.some((sid) => String(sid) === String(id)))
    );

    if (combined.length === 0) {
      return NextResponse.json({ applications: [], pagination: { page, limit, total: 0, pages: 0 }, ...(fetchJobs ? { employerJobs: [] } : {}) });
    }

    if (query.jobSeekerId) {
      query.$and = [...(query.$and ?? []), { jobSeekerId: { $in: combined } }];
    } else {
      query.jobSeekerId = { $in: combined };
    }
  }

  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const [matchingUsers, matchingJobs, matchingEmployers] = await Promise.all([
      User.find({
        $or: [
          { name: { $regex: escapedSearch, $options: "i" } },
          { email: { $regex: escapedSearch, $options: "i" } },
        ],
      }).select("_id").lean(),
      jobId
        ? Promise.resolve([])
        : Job.find({ title: { $regex: escapedSearch, $options: "i" } }).select("_id").lean(),
      Employer.find({ companyName: { $regex: escapedSearch, $options: "i" } }).select("_id").lean(),
    ]);

    // Find jobs belonging to matching employers
    let jobsByEmployer: Array<{ _id: unknown }> = [];
    if (!jobId && matchingEmployers.length > 0) {
      jobsByEmployer = await Job.find({
        employerId: { $in: matchingEmployers.map((e) => e._id) },
      }).select("_id").lean();
    }

    const seekerClauses: Array<Record<string, unknown>> = [
      { fullName: { $regex: escapedSearch, $options: "i" } },
      { skills: { $regex: escapedSearch, $options: "i" } },
      { currentLocation: { $regex: escapedSearch, $options: "i" } },
      { "experience.jobTitle": { $regex: escapedSearch, $options: "i" } },
    ];

    if (matchingUsers.length > 0) {
      seekerClauses.unshift({ userId: { $in: matchingUsers.map((user) => user._id) } });
    }

    const matchingSeekers = await JobSeeker.find({ $or: seekerClauses }).select("_id").lean();
    const searchClauses: Array<Record<string, unknown>> = [];

    if (matchingSeekers.length > 0) {
      searchClauses.push({ jobSeekerId: { $in: matchingSeekers.map((seeker) => seeker._id) } });
    }

    if (!jobId && matchingJobs.length > 0) {
      searchClauses.push({ jobId: { $in: matchingJobs.map((job) => job._id) } });
    }

    if (!jobId && jobsByEmployer.length > 0) {
      searchClauses.push({ jobId: { $in: jobsByEmployer.map((j) => j._id) } });
    }

    if (searchClauses.length === 0) {
      return NextResponse.json({ applications: [], pagination: { page, limit, total: 0, pages: 0 }, ...(fetchJobs ? { employerJobs: [] } : {}) });
    }

    query.$and = [...(query.$and ?? []), { $or: searchClauses }];
  }

  const skip = (page - 1) * limit;
  const allowedSortFields: Record<string, string> = {
    appliedAt: "appliedAt",
    aiMatchScore: "aiMatchScore",
    status: "status",
    createdAt: "createdAt",
  };
  const sortField = allowedSortFields[sortBy] ?? "appliedAt";

  const [applications, total] = await Promise.all([
    Application.find(query)
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit)
      .select(ctx.role === "job_seeker" ? "-employerNotes -matchStrengths -matchGaps -rejectionReason" : "")
      .populate({
        path: "jobId",
        // requirements powers the "matching skills" column in the employer list
        select: "title location salary category employerId requirements",
        populate: { path: "employerId", select: "companyName logo" },
      })
      .populate({
        path: "jobSeekerId",
        select: "userId fullName skills currentLocation totalExperienceYears experience availabilityStatus profileCompleteness cv.originalUrl",
        populate: { path: "userId", select: "name email avatar" },
      })
      .lean(),
    Application.countDocuments(query),
  ]);

  // For employer/agent view: compute cross-application counts per candidate
  let crossAppCounts: Record<string, number> = {};
  if ((ctx.role === "employer" || ctx.role === "agent") && applications.length > 0) {
    const seekerIds = [...new Set(applications.map((a) => String(a.jobSeekerId?._id)))];
    const counts = await Application.aggregate([
      { $match: { ...query, jobSeekerId: { $in: seekerIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
      { $group: { _id: "$jobSeekerId", count: { $sum: 1 } } },
    ]);
    crossAppCounts = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
  }

  // Optionally return employer's jobs list for the job filter dropdown
  let employerJobs: Array<{ _id: string; title: string; requirements: { skills: string[]; experienceMin: number; experienceMax: number; education?: string; languages?: string[] }; salary: { min: number; max: number; currency: string; period?: string }; location: { country: string; city: string; isRemote: boolean }; employmentType?: string; workMode?: string; status: string; createdAt?: Date }> = [];
  if (fetchJobs && (ctx.role === "employer" || ctx.role === "agent" || ctx.role === "super_agent" || ctx.role === "admin")) {
    const jobQuery: Record<string, unknown> = {};
    if (ctx.role === "employer") {
      const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
      if (emp) jobQuery.employerId = emp._id;
    } else if (ctx.role === "agent") {
      const { Agent } = await import("@/models/Agent");
      const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("_id assignedEmployerIds").lean();
      if (agentDoc) {
        jobQuery.$or = [
          { agentId: agentDoc._id },
          ...(agentDoc.assignedEmployerIds?.length ? [{ employerId: { $in: agentDoc.assignedEmployerIds } }] : []),
        ];
      }
    }
    employerJobs = await Job.find({ ...jobQuery, status: { $in: ["active", "closed"] } })
      .select("title requirements salary location employmentType workMode status createdAt")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
  }

  // For job_seeker: enrich applications with latest interview, offer, and placement data
  let interviewMap: Record<string, unknown> = {};
  let offerMap: Record<string, unknown> = {};
  let placementMap: Record<string, unknown> = {};

  if (ctx.role === "job_seeker" && applications.length > 0) {
    const appIds = applications.map((a) => a._id);

    const [interviews, offers, placements] = await Promise.all([
      Interview.find({
        applicationId: { $in: appIds },
        status: { $nin: ["cancelled"] },
      })
        .select("applicationId type scheduledAt duration location meetLink status candidateResponse outcome instructions")
        .sort({ scheduledAt: -1 })
        .lean(),
      Offer.find({ applicationId: { $in: appIds } })
        .select("applicationId salary startDate benefits status expiresAt")
        .sort({ createdAt: -1 })
        .lean(),
      Placement.find({ applicationId: { $in: appIds } })
        .select("applicationId placedAt startDate salary currency")
        .lean(),
    ]);

    // Map latest interview per application
    for (const iv of interviews) {
      const key = String(iv.applicationId);
      if (!interviewMap[key]) interviewMap[key] = iv;
    }
    // Map latest offer per application
    for (const offer of offers) {
      const key = String(offer.applicationId);
      if (!offerMap[key]) offerMap[key] = offer;
    }
    // Map placement per application
    for (const pl of placements) {
      placementMap[String(pl.applicationId)] = pl;
    }
  }

  // Fetch all employers for the filter dropdown (admin/super_agent only)
  let allEmployers: Array<{ _id: string; companyName: string }> = [];
  if (fetchEmployers && (ctx.role === "admin" || ctx.role === "super_agent")) {
    allEmployers = await Employer.find({})
      .select("companyName")
      .sort({ companyName: 1 })
      .limit(500)
      .lean();
  }

  // Fetch aggregate stats (admin/super_agent only)
  let stats: Record<string, unknown> | null = null;
  if (fetchStats && (ctx.role === "admin" || ctx.role === "super_agent")) {
    const [statusCounts, sourceCounts, avgScore, todayCount, weekCount] = await Promise.all([
      Application.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Application.aggregate([{ $group: { _id: "$source", count: { $sum: 1 } } }]),
      Application.aggregate([
        { $match: { aiMatchScore: { $exists: true, $ne: null } } },
        { $group: { _id: null, avg: { $avg: "$aiMatchScore" }, scored: { $sum: 1 } } },
      ]),
      Application.countDocuments({ appliedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }),
      Application.countDocuments({ appliedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }),
    ]);
    stats = {
      byStatus: Object.fromEntries(statusCounts.map((s) => [s._id, s.count])),
      bySource: Object.fromEntries(sourceCounts.map((s) => [s._id ?? "unknown", s.count])),
      avgAiScore: Math.round(avgScore[0]?.avg ?? 0),
      scoredCount: avgScore[0]?.scored ?? 0,
      todayCount,
      weekCount,
      totalAll: statusCounts.reduce((sum, s) => sum + s.count, 0),
    };
  }

  return NextResponse.json({
    applications: applications.map((app) => ({
      ...app,
      otherApplicationsCount: Math.max(0, (crossAppCounts[String(app.jobSeekerId?._id)] ?? 1) - 1),
      ...(interviewMap[String(app._id)] ? { latestInterview: interviewMap[String(app._id)] } : {}),
      ...(offerMap[String(app._id)] ? { latestOffer: offerMap[String(app._id)] } : {}),
      ...(placementMap[String(app._id)] ? { placement: placementMap[String(app._id)] } : {}),
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    ...(fetchJobs ? { employerJobs } : {}),
    ...(fetchEmployers ? { allEmployers } : {}),
    ...(fetchStats ? { stats } : {}),
  });
}

// POST /api/applications — apply for a job
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  const rl = await checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.applications);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Only job seekers can apply" }, { status: 403 });
  }

  await connectDB();
  const body = await validateBody(req, applicationCreateSchema);
  const { jobId, coverLetter, screeningAnswers, documentIds, includeProfileCv, portfolioUrl } = body;

  const job = await Job.findById(jobId).lean();
  if (!job || job.status !== "active") {
    return NextResponse.json({ error: "Job not found or inactive" }, { status: 404 });
  }

  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).lean();
  if (!seeker) {
    return NextResponse.json({ error: "Job seeker profile not found" }, { status: 404 });
  }

  // Check for any existing application (including withdrawn).
  const existing = await Application.findOne({
    jobSeekerId: seeker._id,
    jobId,
  }).lean();
  if (existing && existing.status !== "withdrawn") {
    return NextResponse.json({ error: "Already applied to this job" }, { status: 409 });
  }

  // Validate required screening questions are answered, and that typed
  // questions (number/date) received parseable values.
  const jobScreeningQuestions = (job as Record<string, unknown>).screeningQuestions as Array<{ id: string; label: string; required: boolean; type?: string }> | undefined;
  if (jobScreeningQuestions && jobScreeningQuestions.length > 0) {
    const answerMap = new Map((screeningAnswers ?? []).map((a: { questionId: string }) => [a.questionId, a]));
    for (const q of jobScreeningQuestions) {
      const answer = answerMap.get(q.id) as { answer?: string | string[] | boolean } | undefined;
      const isEmpty =
        !answer || answer.answer === "" || answer.answer === undefined ||
        (Array.isArray(answer.answer) && answer.answer.length === 0);
      if (q.required && isEmpty) {
        return NextResponse.json(
          { error: `Required screening question "${q.label}" must be answered` },
          { status: 400 }
        );
      }
      if (!isEmpty && typeof answer?.answer === "string") {
        if (q.type === "number" && !Number.isFinite(Number(answer.answer))) {
          return NextResponse.json(
            { error: `Answer to "${q.label}" must be a number` },
            { status: 400 }
          );
        }
        if (q.type === "date" && isNaN(new Date(answer.answer).getTime())) {
          return NextResponse.json(
            { error: `Answer to "${q.label}" must be a valid date` },
            { status: 400 }
          );
        }
      }
    }
  }

  // Check employer's autoRejectBelow threshold for newly scored applications
  // (score would be set by a separate scoring step; we set initial status here)
  // Job.employerId references the Employer collection directly, so look it up by _id.
  const empRecord = await Employer.findById(job.employerId)
    .select("workflow companyName")
    .lean() as { companyName?: string; workflow?: { settings?: { autoRejectBelow?: number; aiAutoScreen?: boolean } } } | null;
  const autoRejectBelow = empRecord?.workflow?.settings?.autoRejectBelow;
  const aiAutoScreen = empRecord?.workflow?.settings?.aiAutoScreen ?? false;

  const seekerDoc = seeker as {
    _id: unknown;
    profileCompleteness?: number;
    updatedAt?: Date;
    documents?: { id?: string; name: string; category?: string; url: string; type?: string }[];
    cv?: { originalUrl?: string };
  };
  const isEasyApply = !!body.easyApply;

  // Build the documents attached to THIS application.
  // Only the seeker's own profile documents (by id) and parsed CV can be attached,
  // preventing arbitrary client-supplied file URLs.
  const profileDocs = seekerDoc.documents ?? [];
  const selectedIds = new Set(documentIds ?? []);
  const appDocuments: { name: string; url: string; type: string }[] = [];

  for (const d of profileDocs) {
    if (d.id && selectedIds.has(d.id)) {
      appDocuments.push({ name: d.name, url: d.url, type: d.category ?? d.type ?? "other" });
    }
  }

  const profileCvUrl = seekerDoc.cv?.originalUrl;
  if (includeProfileCv && profileCvUrl) {
    appDocuments.push({ name: "CV", url: profileCvUrl, type: "resume" });
  }

  if (portfolioUrl) {
    appDocuments.push({ name: "Portfolio", url: portfolioUrl, type: "portfolio" });
  }

  // Fallback: if the seeker selected nothing, attach their resume documents and/or
  // parsed CV so the employer always receives a CV.
  if (appDocuments.length === 0) {
    for (const d of profileDocs) {
      if ((d.category ?? d.type) === "resume") {
        appDocuments.push({ name: d.name, url: d.url, type: "resume" });
      }
    }
    if (appDocuments.length === 0 && profileCvUrl) {
      appDocuments.push({ name: "CV", url: profileCvUrl, type: "resume" });
    }
  }

  const { signals, score: bScore } = computeBehaviorSignals({
    profileCompleteness: seekerDoc.profileCompleteness ?? 0,
    documents: appDocuments,
    coverLetter,
    source: isEasyApply ? "easy_apply" : "full_form",
    autoApplied: false,
    lastActiveAt: seekerDoc.updatedAt,
  });

  const applicationData = {
    jobSeekerId: seeker._id,
    jobId,
    employerId: job.employerId,
    coverLetter,
    documents: appDocuments,
    source: isEasyApply ? 'easy_apply' : 'full_form',
    status: "applied",
    appliedAt: new Date(),
    behaviorSignals: signals,
    behaviorScore: bScore,
    screeningAnswers: screeningAnswers ?? [],
  };

  let application;
  try {
    if (existing && existing.status === "withdrawn") {
      // Re-apply: update the withdrawn application instead of creating a duplicate
      application = await Application.findOneAndUpdate(
        { _id: existing._id, status: "withdrawn" },
        {
          $set: applicationData,
          $unset: {
            withdrawalReason: 1,
            withdrawalNote: 1,
            rejectionReason: 1,
          },
          $push: { statusHistory: { status: "applied", changedAt: new Date(), note: "Re-applied after withdrawal" } },
        },
        { new: true, runValidators: true }
      );
      if (!application) {
        return NextResponse.json({ error: "Already applied to this job" }, { status: 409 });
      }
    } else {
      application = await Application.create({
        ...applicationData,
        statusHistory: [{ status: "applied", changedAt: new Date(), note: "Application submitted" }],
      });
    }
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: number }).code === 11000) {
      return NextResponse.json({ error: "Already applied to this job" }, { status: 409 });
    }
    throw err;
  }

  // Track applicant on the job document for quick count access
  await Job.updateOne(
    { _id: jobId },
    { $addToSet: { applicantIds: seeker._id } }
  );

  // FG-3: AI match scoring runs automatically on every application via Inngest so
  // the seeker's apply request never blocks on an LLM round-trip. Auto-REJECT stays
  // opt-in: the autoRejectBelow threshold is only forwarded when the employer has
  // explicitly enabled aiAutoScreen, so enabling automatic scoring never silently
  // rejects candidates for employers who have not configured a cutoff.
  inngest.send({
    name: "application/ai-screen",
    data: {
      applicationId: String(application._id),
      ...(aiAutoScreen && autoRejectBelow !== undefined ? { autoRejectBelow } : {}),
    },
  }).catch((err) => { logger.error({ err, applicationId: String(application._id) }, "Failed to dispatch application/ai-screen event for AI scoring"); });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "application.create",
    resource: "applications",
    resourceId: String(application._id),
    meta: { jobId },
    req,
  });

  // Notify candidate: submission confirmation
  const companyName = empRecord?.companyName ?? "the employer";
  notifyApplicationReceived(
    ctx.userId,
    "",
    String(job.title ?? "the position"),
    companyName,
    String(application._id)
  ).catch((err) => { logger.error({ err, applicationId: String(application._id), userId: ctx.userId }, "failed to notify applicant of submission"); });

  return NextResponse.json({ application }, { status: 201 });
}

export { getHandler, postHandler };

// Reused by the MCP tools (list_my_applications / list_applicants) — kept
// behind the same subscription gate so ChatGPT access doesn't bypass quotas.
export const applicationsGetHandler = withSubscription(getHandler, { type: "limit", feature: "applicationsViewed" });
