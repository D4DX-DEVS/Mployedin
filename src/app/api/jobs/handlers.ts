import { NextRequest, NextResponse } from "next/server";
import { Types, Error as MongooseError } from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import { Application } from "@/models/Application";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { Employer } from "@/models/Employer";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import { CompanyUser } from "@/models/CompanyUser";
import { autoAssignAgent } from "@/lib/agents/autoAssign";
import { sanitizeHtml } from "@/lib/security/sanitize-html";
import { ExtractionDraft } from "@/models/ExtractionDraft";

// Force Mongoose model registration (prevents tree-shaking)
void SuperAgent;
import { notify } from "@/lib/notifications/trigger";
import type { UserRole } from "@/models/User";
import logger from "@/lib/logger";
import { checkAdvert } from "@/lib/compliance/inclusiveWording";
import { escapeRegex } from "@/lib/security/sanitize";
import { getSuperAgentEmployerIds } from "@/lib/auth/agentRestrictions";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { validateBody } from "@/lib/validators";
import { jobCreateSchema } from "@/lib/validators/jobs";
import type { AuthContext } from "@/lib/auth/withAuth";

// The local shape was missing tenantView, so handlers could not tell an admin or
// agent acting inside an employer's account from the employer themselves.
type AuthCtx = Pick<AuthContext, "userId" | "role" | "locale" | "tenantView">;

// GET /api/jobs — paginated job search (role-scoped)
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  const rateLimit = await checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.api);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) },
      }
    );
  }

  await connectDB();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "10"));
  const search = (searchParams.get("search") ?? "").slice(0, 500);
  const status = searchParams.get("status") ?? "";
  const category = (searchParams.get("category") ?? "").slice(0, 200);
  const location = (searchParams.get("location") ?? "").slice(0, 200);
  const currency = searchParams.get("currency") ?? "";
  const workMode = searchParams.get("workMode") ?? "";
  const showSalary = searchParams.get("showSalary") ?? "";
  const skills = (searchParams.get("skills") ?? "")
    .split(",")
    .map((skill) => skill.trim())
    .filter((skill) => skill.length > 0 && skill.length <= 50)
    .slice(0, 8);
  const sortBy = searchParams.get("sortBy") ?? "";
  const remote = searchParams.get("remote") === "true";
  const myJobs = searchParams.get("myJobs") === "true";
  const invoiceableOnly = searchParams.get("invoiceableOnly") === "true";
  /* "applications=none" — jobs nobody has applied to. The admin dashboard
     raises these as an alert; the link needs a filter or the admin lands on the
     full jobs list and has to find them by eye. */
  const withoutApplications = searchParams.get("applications") === "none";
  const employerId = searchParams.get("employerId") ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = { deletedAt: null };

  // Tracks whether the query is actually confined to jobs this caller
  // owns or manages. Only then may they filter by a non-public status —
  // otherwise `myJobs=true&status=draft` would return every unpublished job
  // on the platform to any signed-in user.
  let ownershipScoped = false;

  // Agent-scoped: only their own jobs + jobs from assigned employers
  if (ctx.role === "agent") {
    const agentDoc = await Agent.findOne({ userId: ctx.userId })
      .select("_id assignedEmployerIds")
      .lean();
    if (agentDoc) {
      const conditions: Record<string, unknown>[] = [{ agentId: agentDoc._id }];
      if (!invoiceableOnly && agentDoc.assignedEmployerIds?.length) {
        conditions.push({ employerId: { $in: agentDoc.assignedEmployerIds } });
      }
      query.$or = conditions;
      ownershipScoped = true;
    }
  } else if (ctx.role === "super_agent") {
    // Portfolio-scoped, default-deny on an empty scope.
    query.employerId = { $in: await getSuperAgentEmployerIds(ctx.userId) };
    ownershipScoped = true;
  } else if (myJobs && ctx.role === "employer") {
    // Employer fetching their own jobs — scope to their employerId, no status filter
    const empDoc = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!empDoc) {
      return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
    }

    query.employerId = empDoc._id;

    // Enforce job-level access for team members (hiring_manager / viewer)
    const teamMember = await CompanyUser.findOne({
      companyId: empDoc._id,
      userId: ctx.userId,
      status: "active",
    }).select("companyRole jobAccess").lean();

    if (
      teamMember &&
      teamMember.companyRole !== "owner" &&
      teamMember.companyRole !== "admin" &&
      teamMember.jobAccess &&
      teamMember.jobAccess.length > 0
    ) {
      query._id = { $in: teamMember.jobAccess };
    }
    ownershipScoped = true;
  } else if (myJobs && ctx.role !== "employer") {
    // Non-employers requesting myJobs must see only active jobs
    query.status = "active";
    query.$or = [{ expiresAt: null }, { expiresAt: { $gte: new Date() } }];
  } else if (!myJobs) {
    query.status = "active";
    query.$or = [{ expiresAt: null }, { expiresAt: { $gte: new Date() } }];
  }

  const canFilterManagedJobs = ownershipScoped || ctx.role === "admin";

  if (status && canFilterManagedJobs) query.status = status;
  if (search) query.$text = { $search: search };
  if (category) query.category = category;
  if (workMode) query.workMode = workMode;
  if (location) {
    const locationPattern = new RegExp(escapeRegex(location), "i");
    const locationCondition = {
      $or: [
        { "location.country": locationPattern },
        { "location.city": locationPattern },
      ],
    };
    query.$and = [...(query.$and ?? []), locationCondition];
  }
  if (remote) query["location.isRemote"] = true;
  if (currency) query["salary.currency"] = currency;
  if (showSalary === "true" || showSalary === "false") query.showSalary = showSalary === "true";
  if (skills.length > 0) {
    query["requirements.skills"] = {
      $all: skills.map((skill) => new RegExp(`^${escapeRegex(skill)}$`, "i")),
    };
  }
  if (employerId && Types.ObjectId.isValid(employerId)) {
    // Expand to all employer profiles sharing the same companyName (handles duplicate profiles)
    const emp = await Employer.findById(new Types.ObjectId(employerId)).select("companyName").lean();
    if (emp) {
      const sameNameIds = await Employer.find({ companyName: emp.companyName }).select("_id").lean();
      query.employerId = sameNameIds.length > 1
        ? { $in: sameNameIds.map(e => e._id) }
        : emp._id;
    } else {
      query.employerId = new Types.ObjectId(employerId);
    }
  }

  if (withoutApplications) {
    const jobIdsWithApplications = await Application.distinct("jobId", {});
    query._id = { $nin: jobIdsWithApplications };
  }

  const skip = (page - 1) * limit;

  // Sorting. Explicit sortBy overrides the implicit text-score default.
  // Application-count sorting needs the real count from the Application
  // collection (matches the displayed number), which lives outside the Job
  // document — resolve the ordered + paginated ids via aggregation, then fetch
  // the full docs and reorder to match.
  const isApplicationSort =
    (sortBy === "applications_desc" || sortBy === "applications_asc") && canFilterManagedJobs;

  let orderedIds: Types.ObjectId[] | null = null;
  if (isApplicationSort) {
    const sortDir = sortBy === "applications_asc" ? 1 : -1;
    const ordered = await Job.aggregate([
      { $match: query },
      {
        $lookup: {
          from: Application.collection.name,
          let: { jid: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$jobId", "$$jid"] } } },
            { $count: "n" },
          ],
          as: "_appCount",
        },
      },
      { $addFields: { _appCount: { $ifNull: [{ $arrayElemAt: ["$_appCount.n", 0] }, 0] } } },
      { $sort: { _appCount: sortDir, createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      { $project: { _id: 1 } },
    ]);
    orderedIds = ordered.map((d) => d._id as Types.ObjectId);
  }

  const baseJobQuery = orderedIds
    ? Job.find({ _id: { $in: orderedIds } })
    : Job.find(query)
        .sort(
          sortBy === "newest"
            ? { createdAt: -1 }
            : sortBy === "oldest"
              ? { createdAt: 1 }
              : search
                ? { score: { $meta: "textScore" } }
                : { createdAt: -1 },
        )
        .skip(skip)
        .limit(limit);

  // Agent commissionRate / super-agent overrideRate are internal compensation
  // terms: only staff roles may read them. Employers (and seekers) get the
  // agent identity only — the employer UI never renders these fields.
  const seesCommissionTerms =
    ctx.role === "admin" || ctx.role === "agent" || ctx.role === "super_agent";

  const [jobs, total, statusAgg] = await Promise.all([
    baseJobQuery
      .populate("employerId", "companyName country industry logo")
      .populate({
        path: "agentId",
        select: seesCommissionTerms ? "commissionRate userId superAgentId" : "userId",
        populate: [
          { path: "userId", select: "name email" },
          { path: "superAgentId", select: seesCommissionTerms ? "overrideRate userId" : "userId", populate: { path: "userId", select: "name" } },
        ],
      })
      .lean()
      .then((docs) => {
        if (!orderedIds) return docs;
        // Restore the application-count ordering lost by the $in fetch.
        const orderMap = new Map(orderedIds.map((id, index) => [String(id), index]));
        return [...docs].sort(
          (a, b) => (orderMap.get(String(a._id)) ?? 0) - (orderMap.get(String(b._id)) ?? 0),
        );
      }),
    Job.countDocuments(query),
    // Status counts for stat cards (use base query without status filter)
    canFilterManagedJobs
      ? Job.aggregate([
          { $match: { ...query, ...(status ? { status: { $exists: true } } : {}) } },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]).then((agg) => Object.fromEntries(agg.map((s) => [s._id, s.count])))
      : Promise.resolve(undefined),
  ]);
  // Aggregate real application counts from Application collection for managed job views
  let portfolioStats: { employerCount: number; totalApplicants: number } | undefined;
  let totalVacancies: number | undefined;
  if (canFilterManagedJobs && jobs.length > 0) {
    const jobIds = jobs.map((j) => j._id);
    const appCounts = await Application.aggregate([
      { $match: { jobId: { $in: jobIds } } },
      { $group: { _id: "$jobId", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(appCounts.map((c) => [String(c._id), c.count as number]));
    for (const job of jobs) {
      (job as Record<string, unknown>).applicationCount = countMap.get(String(job._id)) ?? 0;
    }
  }
  // Portfolio-wide employer + applicant totals for the stat cards (ignores the
  // status tab so the cards stay stable while filtering). Uses the full query
  // scope, not just the current page.
  if (canFilterManagedJobs) {
    const baseQuery = { ...query, ...(status ? { status: { $exists: true } } : {}) };
    const portfolioJobs = await Job.find(baseQuery).select("_id employerId vacancies").limit(1000).lean();
    const employerSet = new Set(
      portfolioJobs.map((j) => (j.employerId ? String(j.employerId) : null)).filter(Boolean),
    );
    const portfolioJobIds = portfolioJobs.map((j) => j._id);
    totalVacancies = portfolioJobs.reduce(
      (sum, j) => sum + ((j as { vacancies?: number }).vacancies ?? 0),
      0,
    );
    const totalApplicants = portfolioJobIds.length
      ? await Application.countDocuments({ jobId: { $in: portfolioJobIds } })
      : 0;
    portfolioStats = { employerCount: employerSet.size, totalApplicants };
  }

  return NextResponse.json({
    jobs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit), totalPages: Math.ceil(total / limit) },
    ...(statusAgg && { statusCounts: statusAgg }),
    ...(portfolioStats && { portfolioStats }),
    ...(totalVacancies !== undefined && { totalVacancies }),
  }, {
    headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
  });
}

// POST /api/jobs — create a new job
async function createHandler(req: NextRequest, ctx: AuthCtx) {
  const allowed: UserRole[] = ["employer", "agent", "admin"];
  if (!allowed.includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await validateBody(req, jobCreateSchema);

  await connectDB();

  const {
    title,
    description,
    category,
    location,
    requirements,
    salary,
    employmentType,
    workMode,
    responsibilities,
    qualifications,
    benefits,
    expiresAt,
    applicationMode,
    vacancies,
    maxApplicants,
    showSalary,
    tags,
    visibility,
    status,
  } = body;

  let employerId: string | undefined;
  let agentId: string | undefined;

  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId })
      .select("_id agentId")
      .lean();
    if (!emp) return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
    employerId = String(emp._id);

    // 8C.1: employer can assign agentId via body
    if (body.agentId) {
      const assignedAgent = await Agent.findById(body.agentId).select("assignedEmployerIds").lean();
      if (!assignedAgent || !assignedAgent.assignedEmployerIds?.map(String).includes(employerId)) {
        return NextResponse.json({ error: "This agent is not assigned to your account" }, { status: 403 });
      }
      agentId = body.agentId;
    }
    // T9: inside tenant view ctx.userId is the EMPLOYER's, so without this the
    // agent actually posting the job is invisible: credit fell through to the
    // employer's default agent, or to whichever agent autoAssignAgent scored
    // highest. agentId drives incrementAgentCounter("vacanciesPosted"), the
    // super-agent approval notification and recruitment invoicing — i.e.
    // commission. Ranked above Employer.agentId because that field is the
    // employer's *default* agent, not the human who actually posted this job;
    // an explicit body.agentId above still wins.
    else if (ctx.tenantView?.actorRole === "agent") {
      const actingAgent = await Agent.findOne({ userId: ctx.tenantView.actorId })
        .select("_id assignedEmployerIds")
        .lean();
      if (actingAgent?.assignedEmployerIds?.map(String).includes(employerId)) {
        agentId = String(actingAgent._id);
      } else if (emp.agentId) {
        agentId = String(emp.agentId);
      }
    }
    // 8C.4: auto-assign from Employer.agentId if not manually specified
    else if (emp.agentId) {
      agentId = String(emp.agentId);
    }
    // 8D.1: smart auto-assign fallback — pick best available agent for this employer
    else {
      const assigned = await autoAssignAgent({
        employerId,
        jobCity: (location as { city?: string } | undefined)?.city,
      });
      if (assigned) agentId = assigned;
    }
  } else if (ctx.role === "agent") {
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id assignedEmployerIds").lean();
    if (!agent) return NextResponse.json({ error: "Agent profile not found" }, { status: 404 });
    agentId = String(agent._id);
    employerId = body.employerId;
    if (!employerId) {
      return NextResponse.json({ error: "EMPLOYER_REQUIRED" }, { status: 400 });
    }
    if (!agent.assignedEmployerIds?.map(String).includes(employerId)) {
      return NextResponse.json(
        { error: "Forbidden — you are not assigned to this employer" },
        { status: 403 }
      );
    }
  } else if (ctx.role === "admin") {
    // An admin posts on behalf of an employer. Job.employerId is `required: true`,
    // so a missing/unknown id previously surfaced as an unhandled Mongoose
    // ValidationError — a 500 on Publish, and a silently dropped Save-as-Draft
    // (the draft row was never written, so it never reached the Draft list).
    // Answer with an actionable 4xx instead.
    if (!body.employerId) {
      return NextResponse.json({ error: "EMPLOYER_REQUIRED" }, { status: 400 });
    }
    const emp = await Employer.findById(body.employerId).select("_id").lean();
    if (!emp) {
      return NextResponse.json({ error: "Employer not found" }, { status: 404 });
    }
    employerId = String(emp._id);
    if (body.agentId) agentId = body.agentId;
  }

  // No approval queue: employers and agents publish directly. Admins and
  // super-agents oversee (edit / close / delete) via their job lists. A draft
  // stays private until the poster publishes it.
  const resolvedStatus: string = status ?? "active";

  // Advisory only, mirroring the UI panel: the platform cannot know an
  // employer's context (a genuine occupational requirement, positive action, or
  // a role-neutral use of a flagged word), so this never blocks a publish. It
  // exists because every wording check until now was client-side, leaving a
  // direct API call with no record at all.
  const wordingFindings = checkAdvert({ title, description, responsibilities, qualifications, benefits });
  if (wordingFindings.length > 0) {
    logger.warn(
      {
        userId: String(ctx.userId),
        role: ctx.role,
        employerId,
        characteristics: [...new Set(wordingFindings.map((f) => f.characteristic))],
        count: wordingFindings.length,
      },
      "[Compliance] job advert wording flagged"
    );
  }

  const jobDoc = new Job({
    title,
    description: sanitizeHtml(description),
    category,
    location: location ?? { country: "", city: "", isRemote: false },
    requirements: requirements ?? { skills: [], experienceMin: 0, experienceMax: 99 },
    salary: salary ?? { min: 0, max: 0, currency: "USD", period: "monthly" },
    employmentType,
    workMode,
    responsibilities: responsibilities ?? [],
    qualifications: qualifications ?? [],
    benefits: benefits ?? [],
    employerId,
    agentId,
    applicationMode: applicationMode ?? "manual",
    status: resolvedStatus,
    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    vacancies,
    maxApplicants,
    showSalary,
    tags: tags ?? [],
    visibility: visibility ?? "public",
    screeningQuestions: body.screeningQuestions ?? [],
  });

  // Drafts are intentionally partial — a user can save one before filling in
  // description/location, which are `required` on the schema. Skip validation for
  // them (same rule as /api/jobs/auto-draft); publishing re-validates in full.
  // For everything else, surface a schema violation as a 400 rather than letting
  // it bubble up to withAuth's generic 500.
  try {
    await jobDoc.save({ validateBeforeSave: resolvedStatus !== "draft" });
  } catch (err) {
    if (err instanceof MongooseError.ValidationError) {
      return NextResponse.json(
        { error: "VALIDATION_FAILED", fields: Object.keys(err.errors) },
        { status: 400 },
      );
    }
    throw err;
  }
  const job = jobDoc;

  await logActivity({
    ...actorFromCtx(ctx),
    action: "job.create",
    resource: "jobs",
    resourceId: String(job._id),
    changes: { after: { title, category, location } },
    req,
  });

  // Increment agent performance counter
  if (agentId) {
    const { incrementAgentCounter } = await import("@/lib/agentPerformance");
    incrementAgentCounter(String(agentId), "vacanciesPosted");
  }

  // Notify super agent when a new job is posted under their agent network
  if (agentId) {
    const { getSuperAgentUserId, notifySuperAgentNewJob } = await import("@/lib/notifications/trigger");
    const saUserId = await getSuperAgentUserId(agentId);
    if (saUserId) {
      const emp = employerId
        ? await Employer.findById(employerId).select("companyName").lean()
        : null;
      const empName = (emp as { companyName?: string })?.companyName ?? "An employer";
      notifySuperAgentNewJob(saUserId, empName, title, String(job._id), ctx.locale).catch((err) => logger.error({ err, jobId: String(job._id) }, "Failed to notify super agent of new job"));
    }
  }

  // ── Extraction draft write-back ─────────────────────────────────────────
  // When this job was created from an AI extraction draft, stamp the matching
  // draft entry as "posted" with the new jobId and auto-complete the draft if
  // no pending jobs remain. Best-effort: a failure here MUST NOT invalidate
  // the (already-saved) job; the draft simply stays in its previous state and
  // the user can still discard/skip from the extractor UI.
  const draftId = body.extractionDraftId;
  const draftIndex = body.extractionDraftIndex;
  if (draftId && typeof draftIndex === "number" && employerId) {
    try {
      // IDOR guard: scope the update by employerId so a forged draftId can
      // never stamp or mutate another employer's extraction. employerId is the
      // caller's employer (already used to create the job above).
      const stamped = await ExtractionDraft.findOneAndUpdate(
        { _id: draftId, employerId, "jobs.index": draftIndex },
        {
          $set: {
            "jobs.$.status": "posted",
            "jobs.$.postedJobId": job._id,
          },
        },
        { returnDocument: "after" }
      ).lean();

      // Auto-complete the draft when nothing is left pending.
      if (stamped && stamped.jobs.length > 0) {
        const pendingLeft = stamped.jobs.filter((j: { status: string }) => j.status === "pending").length;
        if (pendingLeft === 0) {
          await ExtractionDraft.findByIdAndUpdate(stamped._id, {
            status: "completed",
            completedAt: new Date(),
          });
        }
      }
    } catch (err) {
      logger.error({ err }, "[Jobs POST] ExtractionDraft write-back failed");
    }
  }

  return NextResponse.json({ job }, { status: 201 });
}

export { getHandler, createHandler };
