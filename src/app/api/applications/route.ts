import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
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
import { generateText, GEMINI_MODELS } from "@/lib/ai/gemini";
import { AI_TOKEN_LIMITS, redactPII, sanitizeAIInput } from "@/lib/ai/sanitize";
import { notifyApplicationReceived } from "@/lib/notifications/trigger";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

function sanitizeAiList(values: string[] | undefined, maxItems = 20, maxLength = 80): string {
  const cleaned = (values ?? [])
    .map((value) => sanitizeAIInput(value, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);

  return cleaned.length > 0 ? cleaned.join(", ") : "Not specified";
}

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
  const scoreMin = searchParams.get("scoreMin") ?? "";
  const scoreMax = searchParams.get("scoreMax") ?? "";
  const fetchJobs = searchParams.get("fetchJobs") === "true";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {};

  if (ctx.role === "job_seeker") {
    const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!seeker) return NextResponse.json({ applications: [], pagination: { page, limit, total: 0, pages: 0 } });
    query.jobSeekerId = seeker._id;
  } else if (ctx.role === "employer") {
    // Get all jobs for this employer then filter
    const { Employer } = await import("@/models/Employer");
    const { CompanyUser } = await import("@/models/CompanyUser");
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp) return NextResponse.json({ applications: [], pagination: { page, limit, total: 0, pages: 0 } });

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
    query.jobId = { $in: jobs.map((j) => j._id) };
  } else if (ctx.role === "agent") {
    // Agent sees applications for their jobs + jobs from assigned employers
    const { Agent } = await import("@/models/Agent");
    const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("_id assignedEmployerIds").lean();
    if (!agentDoc) return NextResponse.json({ applications: [], pagination: { page, limit, total: 0, pages: 0 } });
    const jobFilter: Record<string, unknown> = {
      $or: [
        { agentId: agentDoc._id },
        ...(agentDoc.assignedEmployerIds?.length
          ? [{ employerId: { $in: agentDoc.assignedEmployerIds } }]
          : []),
      ],
    };
    const agentJobs = await Job.find(jobFilter).select("_id").lean();
    query.jobId = { $in: agentJobs.map((j) => j._id) };
  }

  if (status) query.status = status;
  if (jobId) query.jobId = jobId;

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

  // Combine experience + skills seeker filters
  if (experienceFilterSeekerIds || skillsFilterSeekerIds) {
    const combined = experienceFilterSeekerIds && skillsFilterSeekerIds
      ? experienceFilterSeekerIds.filter((id) =>
          skillsFilterSeekerIds!.some((sid) => String(sid) === String(id))
        )
      : experienceFilterSeekerIds ?? skillsFilterSeekerIds!;

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
  const [applications, total] = await Promise.all([
    Application.find(query)
      .sort({ appliedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "jobId",
        select: "title location salary category employerId",
        populate: { path: "employerId", select: "companyName logo" },
      })
      .populate({
        path: "jobSeekerId",
        select: "userId fullName skills currentLocation totalExperienceYears experience availabilityStatus profileCompleteness cv.originalUrl",
        populate: { path: "userId", select: "name email" },
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
  let employerJobs: Array<{ _id: string; title: string; requirements: { skills: string[]; experienceMin: number; experienceMax: number; education?: string; languages?: string[] }; salary: { min: number; max: number; currency: string; period?: string }; location: { country: string; city: string; isRemote: boolean }; employmentType?: string; workMode?: string; status: string }> = [];
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
      .select("title requirements salary location employmentType workMode status")
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
  });
}

// POST /api/applications — apply for a job
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  const rl = checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.applications);
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
  const { jobId, coverLetter } = body;

  const job = await Job.findById(jobId).lean();
  if (!job || job.status !== "active") {
    return NextResponse.json({ error: "Job not found or inactive" }, { status: 404 });
  }

  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).lean();
  if (!seeker) {
    return NextResponse.json({ error: "Job seeker profile not found" }, { status: 404 });
  }

  const existing = await Application.findOne({ jobSeekerId: seeker._id, jobId }).lean();
  if (existing) {
    return NextResponse.json({ error: "Already applied to this job" }, { status: 409 });
  }

  // Check employer's autoRejectBelow threshold for newly scored applications
  // (score would be set by a separate scoring step; we set initial status here)
  const empRecord = await Employer.findOne({ userId: job.employerId as unknown as string })
    .select("workflow companyName")
    .lean() as { companyName?: string; workflow?: { settings?: { autoRejectBelow?: number; aiAutoScreen?: boolean } } } | null;
  const autoRejectBelow = empRecord?.workflow?.settings?.autoRejectBelow;
  const aiAutoScreen = empRecord?.workflow?.settings?.aiAutoScreen ?? false;

  const seekerDoc = seeker as { _id: unknown; profileCompleteness?: number; updatedAt?: Date; documents?: { name: string; url: string; type: string }[] };
  const isEasyApply = !!body.easyApply;
  const { signals, score: bScore } = computeBehaviorSignals({
    profileCompleteness: seekerDoc.profileCompleteness ?? 0,
    documents: seekerDoc.documents ?? [],
    coverLetter,
    source: isEasyApply ? "easy_apply" : "full_form",
    autoApplied: false,
    lastActiveAt: seekerDoc.updatedAt,
  });

  const application = await Application.create({
    jobSeekerId: seeker._id,
    jobId,
    employerId: job.employerId,
    coverLetter,
    source: isEasyApply ? 'easy_apply' : 'full_form',
    status: "applied",
    appliedAt: new Date(),
    statusHistory: [{ status: "applied", changedAt: new Date(), note: "Application submitted" }],
    behaviorSignals: signals,
    behaviorScore: bScore,
  });

  // aiAutoScreen: if enabled, compute AI match score immediately and apply auto-reject if threshold set
  if (aiAutoScreen) {
    try {
      const seekerDoc = seeker as Record<string, unknown>;
      const jobDoc = job as Record<string, unknown>;
      const jobReqs = jobDoc.requirements as { skills?: string[]; experienceMin?: number; experienceMax?: number } | undefined;
      const jobLoc = jobDoc.location as { city?: string; country?: string; isRemote?: boolean } | undefined;
      const locationStr = sanitizeAIInput(
        jobLoc?.isRemote ? "Remote" : [jobLoc?.city, jobLoc?.country].filter(Boolean).join(", ") || "N/A",
        120
      );
      const requiredSkills = sanitizeAiList(jobReqs?.skills, 20, 60);
      const expRange = sanitizeAIInput(jobReqs ? `${jobReqs.experienceMin ?? 0}–${jobReqs.experienceMax ?? 10}+ years` : "N/A", 40);
      const seekerExperience = seekerDoc.experience as Array<{ jobTitle?: string; isCurrent?: boolean }> | undefined;
      const currentTitle = sanitizeAIInput(seekerExperience?.find((e) => e.isCurrent)?.jobTitle ?? "N/A", 120);
      const seekerSkills = sanitizeAiList(seekerDoc.skills as string[] | undefined, 25, 60);
      const seekerLangs = (seekerDoc.languages as Array<{ language: string; proficiency: string }> | undefined ?? [])
        .map((language) => sanitizeAIInput(`${language.language} (${language.proficiency})`, 60))
        .filter(Boolean)
        .join(", ") || "N/A";
      const jobTitle = sanitizeAIInput(String(jobDoc.title ?? "N/A"), 120);
      const jobDescription = sanitizeAIInput(String(jobDoc.description ?? ""), 500);

      const prompt = `You are a recruitment AI. Score the match between this job seeker and job posting.

JOB:
Title: ${jobTitle}
Location: ${locationStr}
Required Skills: ${requiredSkills}
Experience Required: ${expRange}
Description: ${jobDescription}

JOB SEEKER:
Current Title: ${currentTitle}
Skills: ${seekerSkills}
Years of Experience: ${sanitizeAIInput(String(seekerDoc.totalExperienceYears ?? "N/A"), 20)}
Languages: ${seekerLangs}

Return JSON only: {"score":<0-100>,"breakdown":{"skills":<0-100>,"experience":<0-100>,"location":<0-100>},"strengths":[],"gaps":[]}`;

      const raw = redactPII(
        await generateText(prompt, GEMINI_MODELS.flash, AI_TOKEN_LIMITS.match)
      ).replace(/```json\n?|```/g, "").trim();

      const matchData = JSON.parse(raw);
      application.aiMatchScore = matchData.score;
      application.matchBreakdown = {
        skills: matchData.breakdown?.skills ?? 0,
        experience: matchData.breakdown?.experience ?? 0,
        overall: matchData.score,
      };
      application.matchStrengths = matchData.strengths ?? [];
      application.matchGaps = matchData.gaps ?? [];

      // Apply auto-reject with the freshly computed score
      if (autoRejectBelow !== undefined && application.aiMatchScore < autoRejectBelow) {
        application.status = "rejected";
        application.rejectionReason = `AI match score (${application.aiMatchScore}) below threshold (${autoRejectBelow})`;
        application.statusHistory.push({ status: "rejected", changedAt: new Date(), note: "Auto-rejected by AI screening" });
      }

      await application.save();
    } catch {
      // Non-blocking: scoring failure never fails the job seeker's submission
    }
  }

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
  ).catch(() => { /* non-blocking */ });

  return NextResponse.json({ application }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
