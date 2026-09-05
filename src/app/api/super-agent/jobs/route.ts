import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import Job from "@/models/Job";
import Agent from "@/models/Agent";
import { routeGenerate } from "@/lib/ai/router";
import logger from "@/lib/logger";
import { escapeRegex } from "@/lib/security/sanitize";

interface AuthCtx {
  userId: string;
  role: string;
  locale: string;
}

/**
 * Parse an AI natural-language query into structured MongoDB filters.
 * Returns a partial filter object that gets merged with standard filters.
 */
async function parseAIQuery(
  nlQuery: string
): Promise<Record<string, unknown>> {
  const prompt = `You are a job search query parser for a recruitment platform. Convert this natural language query into a JSON filter object.

Available filter fields:
- "status": one of "draft", "active", "paused", "closed", "expired"
- "employmentType": one of "full_time", "part_time", "contract", "internship", "freelance"
- "workMode": one of "onsite", "hybrid", "remote"
- "location.country": country name
- "location.city": city name
- "requirements.skills": array of skill keywords
- "salary.min": minimum salary number
- "salary.max": maximum salary number
- "salary.currency": currency code (e.g. "AED", "INR", "USD")
- "titleSearch": keywords to search in job title
- "descriptionSearch": keywords to search in description
- "experienceMax": max years experience (to find entry level jobs)
- "experienceMin": min years experience

Rules:
- Return ONLY valid JSON, no markdown or explanation
- Only include fields that the query clearly implies
- For "remote jobs" set workMode to "remote"
- For salary ranges, convert to numbers
- For "entry level" set experienceMax to 2
- For "senior" set experienceMin to 5
- If user mentions a skill (e.g. "React", "Node.js"), put it in requirements.skills array

Query: "${nlQuery}"

JSON:`;

  try {
    const raw = await routeGenerate(prompt, "nl_search");
    const cleaned = raw.replace(/```json\n?|```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch (err) {
    logger.warn({ err, nlQuery }, "AI query parse failed");
    return {};
  }
}

async function handler(req: NextRequest, ctx: AuthCtx) {
  // The route guard is `jobs:read`, which EVERY role holds — without this the
  // endpoint is reachable by employers and job seekers.
  if (ctx.role !== "super_agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  // Dual-scoping: team agents + region-based agents
  const scope = await getSuperAgentScope(ctx.userId);
  const agentDocIds = scope?.effectiveAgentIds ?? [];
  const agentDocs =
    agentDocIds.length > 0
      ? await Agent.find({ _id: { $in: agentDocIds } })
          .select("assignedEmployerIds")
          .lean()
      : [];
  const employerIds = agentDocs.flatMap((a) => a.assignedEmployerIds ?? []);

  const { searchParams } = new URL(req.url);

  // Standard filters
  const status = searchParams.get("status");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20")));
  const skip = (page - 1) * limit;
  const search = searchParams.get("search")?.trim();
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const employmentType = searchParams.get("employmentType");
  const workMode = searchParams.get("workMode");
  const country = searchParams.get("country");
  const city = searchParams.get("city");
  const skills = searchParams.get("skills"); // comma-separated
  const salaryMin = searchParams.get("salaryMin");
  const salaryMax = searchParams.get("salaryMax");
  const currency = searchParams.get("currency");
  const experienceMin = searchParams.get("experienceMin");
  const experienceMax = searchParams.get("experienceMax");
  const agentId = searchParams.get("agentId");
  const employerId = searchParams.get("employerId");
  const sortBy = searchParams.get("sortBy") ?? "createdAt";
  const sortOrder = searchParams.get("sortOrder") === "asc" ? 1 : -1;

  // AI natural-language search
  const aiQuery = searchParams.get("aiQuery")?.trim();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = { deletedAt: null };

  // Scope to agents managed by this super agent
  if (agentDocIds.length > 0) {
    query.$or = [
      { agentId: { $in: agentDocIds } },
      ...(employerIds.length > 0
        ? [{ employerId: { $in: employerIds } }]
        : []),
    ];
  } else if (employerIds.length > 0) {
    query.employerId = { $in: employerIds };
  } else if (ctx.role === "super_agent") {
    // Default-deny: an unscoped super-agent sees nothing, not everything.
    query._id = { $in: [] };
  }

  // Status filter
  const validStatuses = [
    "active",
    "draft",
    "closed",
    "expired",
    "paused",
  ];
  if (status && validStatuses.includes(status)) {
    query.status = status;
  }

  // Text search on title/description
  if (search) {
    query.$and = [
      ...(query.$and ?? []),
      {
        $or: [
          { title: { $regex: escapeRegex(search), $options: "i" } },
          { description: { $regex: escapeRegex(search), $options: "i" } },
          { tags: { $regex: escapeRegex(search), $options: "i" } },
        ],
      },
    ];
  }

  // Date range filter
  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      query.createdAt.$lte = to;
    }
  }

  // Employment type
  const validEmploymentTypes = [
    "full_time",
    "part_time",
    "contract",
    "internship",
    "freelance",
  ];
  if (employmentType && validEmploymentTypes.includes(employmentType)) {
    query.employmentType = employmentType;
  }

  // Work mode
  const validWorkModes = ["onsite", "hybrid", "remote"];
  if (workMode && validWorkModes.includes(workMode)) {
    query.workMode = workMode;
  }

  // Location
  if (country) {
    query["location.country"] = { $regex: escapeRegex(country), $options: "i" };
  }
  if (city) {
    query["location.city"] = { $regex: escapeRegex(city), $options: "i" };
  }

  // Skills
  if (skills) {
    const skillList = skills
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (skillList.length > 0) {
      query["requirements.skills"] = {
        $all: skillList.map((s) => new RegExp(escapeRegex(s), "i")),
      };
    }
  }

  // Salary range
  if (salaryMin) {
    query["salary.min"] = { $gte: parseInt(salaryMin) };
  }
  if (salaryMax) {
    query["salary.max"] = { $lte: parseInt(salaryMax) };
  }
  if (currency) {
    query["salary.currency"] = currency.toUpperCase();
  }

  // Experience range
  if (experienceMin) {
    query["requirements.experienceMin"] = {
      $gte: parseInt(experienceMin),
    };
  }
  if (experienceMax) {
    query["requirements.experienceMax"] = {
      $lte: parseInt(experienceMax),
    };
  }

  // Specific agent filter
  if (agentId) {
    query.agentId = agentId;
  }

  // Specific employer filter
  if (employerId) {
    query.employerId = employerId;
  }

  // AI-powered natural language filter
  if (aiQuery) {
    const aiFilters = await parseAIQuery(aiQuery);

    // Merge AI-parsed filters
    if (aiFilters.status && !status) {
      query.status = aiFilters.status;
    }
    if (aiFilters.employmentType && !employmentType) {
      query.employmentType = aiFilters.employmentType;
    }
    if (aiFilters.workMode && !workMode) {
      query.workMode = aiFilters.workMode;
    }
    if (
      aiFilters["location.country"] &&
      !country
    ) {
      query["location.country"] = {
        $regex: escapeRegex(aiFilters["location.country"] as string),
        $options: "i",
      };
    }
    if (aiFilters["location.city"] && !city) {
      query["location.city"] = {
        $regex: escapeRegex(aiFilters["location.city"] as string),
        $options: "i",
      };
    }
    if (
      Array.isArray(aiFilters["requirements.skills"]) &&
      !skills
    ) {
      query["requirements.skills"] = {
        $all: (aiFilters["requirements.skills"] as string[]).map(
          (s) => new RegExp(escapeRegex(s), "i")
        ),
      };
    }
    if (aiFilters.titleSearch && !search) {
      query.$and = [
        ...(query.$and ?? []),
        { title: { $regex: escapeRegex(aiFilters.titleSearch as string), $options: "i" } },
      ];
    }
    if (aiFilters.descriptionSearch && !search) {
      query.$and = [
        ...(query.$and ?? []),
        {
          description: {
            $regex: escapeRegex(aiFilters.descriptionSearch as string),
            $options: "i",
          },
        },
      ];
    }
    if (
      aiFilters["salary.min"] &&
      !salaryMin
    ) {
      query["salary.min"] = { $gte: aiFilters["salary.min"] };
    }
    if (
      aiFilters["salary.max"] &&
      !salaryMax
    ) {
      query["salary.max"] = { $lte: aiFilters["salary.max"] };
    }
    if (
      aiFilters["salary.currency"] &&
      !currency
    ) {
      query["salary.currency"] = (
        aiFilters["salary.currency"] as string
      ).toUpperCase();
    }
    if (aiFilters.experienceMin && !experienceMin) {
      query["requirements.experienceMin"] = {
        $gte: aiFilters.experienceMin,
      };
    }
    if (aiFilters.experienceMax && !experienceMax) {
      query["requirements.experienceMax"] = {
        $lte: aiFilters.experienceMax,
      };
    }
  }

  // Sort options
  const validSortFields: Record<string, string> = {
    createdAt: "createdAt",
    title: "title",
    salary: "salary.min",
    views: "views",
    status: "status",
  };
  const sortField = validSortFields[sortBy] ?? "createdAt";

  // Build scope filter (without status) for cross-status counts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scopeFilter: Record<string, any> = { ...query };
  delete scopeFilter.status;

  const [
    jobs,
    total,
    activeCount,
    draftCount,
    closedCount,
    expiredCount,
    pausedCount,
    employerAgg,
    agentAgg,
  ] = await Promise.all([
    Job.find(query)
      .populate("employerId", "companyName name country industry")
      .populate("agentId", "userId")
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit)
      .select(
        "title status location category createdAt employerId agentId employmentType workMode salary requirements tags views"
      )
      .lean(),
    Job.countDocuments(query),
    Job.countDocuments({ ...scopeFilter, status: "active" }),
    Job.countDocuments({ ...scopeFilter, status: "draft" }),
    Job.countDocuments({ ...scopeFilter, status: "closed" }),
    Job.countDocuments({ ...scopeFilter, status: "expired" }),
    Job.countDocuments({ ...scopeFilter, status: "paused" }),
    Job.distinct("employerId", scopeFilter),
    Job.distinct("agentId", scopeFilter),
  ]);

  const totalAll =
    activeCount +
    draftCount +
    closedCount +
    expiredCount +
    pausedCount;

  return NextResponse.json({
    jobs,
    counts: {
      total: totalAll,
      active: activeCount,
      draft: draftCount,
      closed: closedCount,
      expired: expiredCount,
      paused: pausedCount,
      employers: employerAgg.length,
      agents: agentAgg.length,
    },
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    aiParsed: aiQuery ? true : undefined,
  });
}

export const GET = withAuth(handler, { resource: "jobs", action: "read" });
