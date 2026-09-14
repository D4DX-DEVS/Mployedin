import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { enforceFeatureGate } from "@/lib/subscription/featureGate";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import Job from "@/models/Job";
import { Application } from "@/models/Application";
import { Agent } from "@/models/Agent";
import { Employer } from "@/models/Employer";
import { Placement } from "@/models/Placement";
import { Commission } from "@/models/Commission";
import JobSeeker from "@/models/JobSeeker";
import { routeGenerate } from "@/lib/ai/router";
import { resolveReportScope } from "@/lib/ai/reportScope";
import { sanitizeAIInput, redactPII } from "@/lib/ai/sanitize";
import { validateBody } from "@/lib/validators";
import { aiReportSchema } from "@/lib/validators/ai";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

const LEADING_REPORT_PHRASES = [
  "here is the analytics report based on the live platform data",
  "here's the analytics report based on the live platform data",
  "here is the analytics report",
  "here's the analytics report",
  "of course",
  "sure",
  "certainly",
  "absolutely",
] as const;

function stripLeadingReportPhrases(line: string): string {
  let nextLine = line.trimStart();

  while (nextLine.length > 0) {
    const lowered = nextLine.toLowerCase();
    const matchedPhrase = LEADING_REPORT_PHRASES.find((phrase) => lowered.startsWith(phrase));

    if (!matchedPhrase) {
      return nextLine;
    }

    nextLine = nextLine.slice(matchedPhrase.length).trimStart();

    while (nextLine.startsWith(".") || nextLine.startsWith("!") || nextLine.startsWith(":")) {
      nextLine = nextLine.slice(1).trimStart();
    }
  }

  return nextLine;
}

function normalizeReportOutput(report: string): string {
  const lines = report.split(/\r?\n/);

  while (lines.length > 0) {
    if (lines[0].trim() === "") {
      lines.shift();
      continue;
    }

    const normalizedFirstLine = stripLeadingReportPhrases(lines[0]);

    if (normalizedFirstLine === "") {
      lines.shift();
      continue;
    }

    if (normalizedFirstLine !== lines[0].trimStart()) {
      lines[0] = normalizedFirstLine;
    }

    break;
  }

  return lines.join("\n").trim();
}

/**
 * POST /api/ai/report
 * Body: { query: string }
 *
 * Generates a natural-language analytics report based on current platform data
 * and the user's query. Agents, super-agents and admins can use this.
 *
 * All figures sent to the AI come directly from the database. The AI is
 * explicitly instructed NOT to invent numbers that were not supplied.
 *
 * Every figure is bounded by the caller's place in the hierarchy, resolved
 * server-side in resolveReportScope: an admin sees the platform, a super-agent
 * sees their territory, an agent sees their own book. The `scope` field on the
 * body chooses the prompt ("market" vs the standard report) and has no say in
 * what data is read.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const gateErr = await enforceFeatureGate(ctx.userId, ctx.role, { type: "ai", feature: "ai_hiring_reports" });
  if (gateErr) return gateErr;

  const rl = await checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  await connectDB();
  const { query, scope, context } = await validateBody(req, aiReportSchema);
  const safeQuery = sanitizeAIInput(String(query), 500);
  const safeContext = context ? sanitizeAIInput(String(context), 300) : "Gulf region — UAE, KSA, Qatar, Oman, Kuwait, Bahrain";

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo  = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const startOfMonth  = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const startOfQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);

  // ── 0. Data boundary ─────────────────────────────────────────────────────
  // `empMatch` is `{}` for an admin and an ownership filter for everyone else,
  // so spreading it into a query either widens nothing or narrows to the
  // caller's own book. An empty book matches no documents, which is the
  // intended answer for an account with nothing assigned.
  const dataScope = await resolveReportScope(ctx);
  const empMatch: Record<string, unknown> = dataScope.ownershipMatch ?? {};

  // ── 1. Coverage counts ───────────────────────────────────────────────────
  let usersSection: string;

  if (dataScope.isPlatform) {
    const [
      totalUsers, totalAdmins, totalAgents, totalSuperAgents,
      totalEmployers, totalJobSeekers,
      newUsersThisMonth, newUsersLastMonth,
      newSeekersThisMonth, newEmployersThisMonth,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "admin" }),
      User.countDocuments({ role: "agent" }),
      User.countDocuments({ role: "super_agent" }),
      User.countDocuments({ role: "employer" }),
      User.countDocuments({ role: "job_seeker" }),
      User.countDocuments({ createdAt: { $gte: startOfMonth } }),
      User.countDocuments({ createdAt: { $gte: startOfLastMonth, $lt: startOfMonth } }),
      User.countDocuments({ role: "job_seeker", createdAt: { $gte: startOfMonth } }),
      User.countDocuments({ role: "employer",   createdAt: { $gte: startOfMonth } }),
    ]);
    usersSection = `## Users
- Total users: ${totalUsers}
- Admins: ${totalAdmins} | Agents: ${totalAgents} | Super-Agents: ${totalSuperAgents}
- Employers: ${totalEmployers} | Job-Seekers: ${totalJobSeekers}
- New users this month: ${newUsersThisMonth} (last month: ${newUsersLastMonth})
- New job-seekers this month: ${newSeekersThisMonth}
- New employers this month: ${newEmployersThisMonth}`;
  } else {
    // Platform-wide role counts mean nothing inside a territory, and quoting
    // them is exactly the leak. Report the caller's own book instead: the
    // candidates counted are those who applied to employers in scope.
    const scopedEmployerIds = dataScope.employerIds ?? [];
    const [newEmployersThisMonth, seekerIds, seekerIdsThisMonth] = await Promise.all([
      Employer.countDocuments({ _id: { $in: scopedEmployerIds }, createdAt: { $gte: startOfMonth } }),
      Application.distinct("jobSeekerId", empMatch),
      Application.distinct("jobSeekerId", { ...empMatch, createdAt: { $gte: startOfMonth } }),
    ]);
    usersSection = `## Coverage (${dataScope.label})
- Agents in scope: ${(dataScope.agentIds ?? []).length}
- Employers in scope: ${scopedEmployerIds.length}
- New employers this month: ${newEmployersThisMonth}
- Candidates who applied to these employers: ${seekerIds.length}
- Candidates who applied this month: ${seekerIdsThisMonth.length}`;
  }

  // ── 2. Job stats ─────────────────────────────────────────────────────────
  const [
    totalJobs, activeJobs, closedJobs,
    jobsThisMonth, jobsLastMonth,
  ] = await Promise.all([
    Job.countDocuments({ ...empMatch }),
    Job.countDocuments({ ...empMatch, status: "active" }),
    Job.countDocuments({ ...empMatch, status: "closed" }),
    Job.countDocuments({ ...empMatch, createdAt: { $gte: startOfMonth } }),
    Job.countDocuments({ ...empMatch, createdAt: { $gte: startOfLastMonth, $lt: startOfMonth } }),
  ]);

  // Jobs grouped by category (top 10)
  const jobsByCategory = await Job.aggregate([
    { $match: { ...empMatch, status: "active", category: { $exists: true, $nin: [null, ""] } } },
    { $group: { _id: "$category", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);

  // Jobs grouped by country (top 10)
  const jobsByCountry = await Job.aggregate([
    { $match: { ...empMatch, status: "active" } },
    { $group: { _id: "$location.country", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);

  // ── 3. Application stats ─────────────────────────────────────────────────
  const [
    totalApplications, appsThisMonth, appsLastMonth,
    appsHired, appsInterview, appsOffer,
  ] = await Promise.all([
    Application.countDocuments({ ...empMatch }),
    Application.countDocuments({ ...empMatch, createdAt: { $gte: startOfMonth } }),
    Application.countDocuments({ ...empMatch, createdAt: { $gte: startOfLastMonth, $lt: startOfMonth } }),
    Application.countDocuments({ ...empMatch, status: "hired" }),
    // "interview" is not in the Application.status enum — this counted nothing and
    // always reported 0. The stored value is "interview_scheduled".
    Application.countDocuments({ ...empMatch, status: "interview_scheduled" }),
    Application.countDocuments({ ...empMatch, status: "offer" }),
  ]);

  // Applications per job category (top 10)
  const appsByCategory = await Application.aggregate([
    ...(dataScope.ownershipMatch ? [{ $match: empMatch }] : []),
    {
      $lookup: {
        from: "jobs",
        localField: "jobId",
        foreignField: "_id",
        as: "job",
      },
    },
    { $unwind: "$job" },
    { $match: { "job.category": { $exists: true, $nin: [null, ""] } } },
    { $group: { _id: "$job.category", applications: { $sum: 1 } } },
    { $sort: { applications: -1 } },
    { $limit: 10 },
  ]);

  // ── 4. Placement stats ───────────────────────────────────────────────────
  const [
    totalPlacements, placementsThisMonth, placementsThisQuarter,
  ] = await Promise.all([
    Placement.countDocuments({ ...empMatch }),
    Placement.countDocuments({ ...empMatch, placedAt: { $gte: startOfMonth } }),
    Placement.countDocuments({ ...empMatch, placedAt: { $gte: startOfQuarter } }),
  ]);

  // ── 5. Commission stats ──────────────────────────────────────────────────
  // A commission belongs to the agent who earned it. A super-agent additionally
  // earns their own override lines — `superAgentId` alone marks them as the
  // overseer of someone else's commission, not the earner, so only
  // type:"override" rows are added.
  const commissionMatch: Record<string, unknown> | null = dataScope.isPlatform
    ? null
    : {
        $or: [
          { agentId: { $in: dataScope.agentIds ?? [] } },
          ...(dataScope.superAgentProfileId
            ? [{ superAgentId: dataScope.superAgentProfileId, type: "override" }]
            : []),
        ],
      };

  const commissionAgg = await Commission.aggregate([
    ...(commissionMatch ? [{ $match: commissionMatch }] : []),
    {
      $group: {
        _id: "$status",
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);
  const commissionByStatus: Record<string, { total: number; count: number }> = {};
  for (const row of commissionAgg) {
    commissionByStatus[row._id as string] = { total: row.total, count: row.count };
  }
  const commPaid    = commissionByStatus["paid"]    ?? { total: 0, count: 0 };
  const commPending = commissionByStatus["pending"] ?? { total: 0, count: 0 };
  const commApproved= commissionByStatus["approved"]?? { total: 0, count: 0 };

  // ── 6. Top agents by placements (this quarter) ───────────────────────────
  const topAgentsRaw = await Agent.find(dataScope.agentIds ? { _id: { $in: dataScope.agentIds } } : {})
    .select("userId performance commissionRate")
    .sort({ "performance.placementsCompleted": -1 })
    .limit(10)
    .lean();

  const agentUserIds = topAgentsRaw.map((a) => a.userId);
  const agentUsers   = await User.find({ _id: { $in: agentUserIds } })
    .select("_id name")
    .lean();
  const agentNameMap: Record<string, string> = {};
  for (const u of agentUsers) agentNameMap[String(u._id)] = u.name;

  const topAgents = topAgentsRaw.map((a, i) => ({
    rank: i + 1,
    name: agentNameMap[String(a.userId)] ?? "Unknown",
    placements: a.performance.placementsCompleted,
    leadsGenerated: a.performance.leadsGenerated,
  }));


  // ── 7. Top employers by jobs + applications ───────────────────────────────
  const topEmployersRaw = await Job.aggregate([
    { $match: { ...empMatch, status: "active" } },
    { $group: { _id: "$employerId", jobCount: { $sum: 1 } } },
    { $sort: { jobCount: -1 } },
    { $limit: 10 },
  ]);

  const empIds = topEmployersRaw.map((e) => e._id);
  const empDocs = await Employer.find({ _id: { $in: empIds } })
    .select("_id companyName industry")
    .lean();
  const empNameMap: Record<string, string> = {};
  const empIndustryMap: Record<string, string> = {};
  for (const e of empDocs) {
    empNameMap[String(e._id)] = e.companyName;
    empIndustryMap[String(e._id)] = e.industry ?? "—";
  }

  const topEmployers = topEmployersRaw.map((e, i) => ({
    rank: i + 1,
    name: empNameMap[String(e._id)] ?? "Unknown",
    industry: empIndustryMap[String(e._id)],
    activeJobs: e.jobCount,
  }));

  // ── 8. Geographic distribution: users by nationality ─────────────────────
  // Outside an admin report the candidate pool is not "everyone on the
  // platform" — it is the people who applied to employers in scope.
  const scopedSeekerIds = dataScope.ownershipMatch
    ? await Application.distinct("jobSeekerId", empMatch)
    : null;

  const seekersByNationality = await JobSeeker.aggregate([
      {
        $match: {
          ...(scopedSeekerIds ? { _id: { $in: scopedSeekerIds } } : {}),
          nationality: { $exists: true, $nin: [null, ""] },
        },
      },
      { $group: { _id: "$nationality", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

  // ── Build prompt ─────────────────────────────────────────────────────────
  const dataBlock = `
=== LIVE DATA (pulled from database at ${now.toISOString()}) ===
COVERAGE: ${dataScope.label}
Every figure below is already filtered to that coverage. Describe it as such —
never call it platform-wide unless the coverage line says so.

${usersSection}

## Jobs
- Total jobs ever: ${totalJobs}
- Active: ${activeJobs} | Closed: ${closedJobs}
- Posted this month: ${jobsThisMonth} (last month: ${jobsLastMonth})
- Active jobs by category (top 10):
${jobsByCategory.map((c) => `  • ${c._id}: ${c.count}`).join("\n") || "  No category data"}
- Active jobs by country (top 10):
${jobsByCountry.map((c) => `  • ${c._id || "Unknown"}: ${c.count}`).join("\n") || "  No country data"}

## Applications
- Total all-time: ${totalApplications}
- This month: ${appsThisMonth} (last month: ${appsLastMonth})
- Currently at interview stage: ${appsInterview}
- Currently at offer stage: ${appsOffer}
- Hired (all-time): ${appsHired}
- Applications by job category (top 10):
${appsByCategory.map((c) => `  • ${c._id}: ${c.applications} applications`).join("\n") || "  No category data"}

## Placements
- Total all-time: ${totalPlacements}
- This month: ${placementsThisMonth}
- This quarter: ${placementsThisQuarter}

## Commissions
- Paid: ${commPaid.count} commissions totalling ${commPaid.total} AED
- Pending: ${commPending.count} commissions totalling ${commPending.total} AED
- Approved (awaiting payment): ${commApproved.count} totalling ${commApproved.total} AED

## Agents in scope (by lifetime placements completed)
${topAgents.map((a) => `  ${a.rank}. ${a.name} — ${a.placements} placements, ${a.leadsGenerated} leads`).join("\n") || "  No agent data"}

## Employers in scope (by active jobs)
${topEmployers.map((e) => `  ${e.rank}. ${e.name} (${e.industry}) — ${e.activeJobs} active jobs`).join("\n") || "  No employer data"}

## Candidate nationalities in scope (top 10)
${seekersByNationality.map((n: {_id: string; count: number}) => `  • ${n._id}: ${n.count}`).join("\n") || "  No nationality data"}

=== END OF DATA ===`;

  const systemContext = scope === "market"
    ? `You are a recruitment market analyst for MPLOYEDIN, specialising in the following region: ${safeContext}.

CRITICAL RULES:
- Only use the numbers in the LIVE DATA block below when answering data questions.
- The COVERAGE line names whose data this is. Do not describe it as the whole platform unless it says so, and never imply knowledge of territories outside it.
- If a metric is not in the data, say "Data not available" — do NOT estimate or invent platform figures.
- You MAY use your knowledge of the specified region (${safeContext}) for salary benchmarks, visa trends, nationality demand, and sector insights when the query goes beyond platform data.
- Always answer specifically about the country or region the user asks about — do NOT default to UAE only.

${dataBlock}

USER QUERY: "${safeQuery}"

Respond ONLY with a single valid JSON object — no markdown fences, no prose before or after.
Use this exact shape:
{
  "summary": "<2–4 sentence direct answer to the query>",
  "insights": [
    { "title": "<metric label>", "value": "<key figure or range>", "trend": "<optional short trend note>", "category": "<salary|demand|jobs|placements|nationality>" }
  ],
  "recommendations": ["<actionable recommendation 1>", "<actionable recommendation 2>"],
  "generatedAt": "${now.toISOString()}"
}
- Include 2–5 insight objects relevant to the query.
- Include 2–4 recommendation strings.
- Start the output with { and end with } — nothing else.`
    : `You are an analytics AI for MPLOYEDIN, a Gulf-region recruitment platform. You have been given the exact figures pulled live from the platform database right now.

CRITICAL RULES:
- Only use the numbers shown in the LIVE DATA block above.
- The COVERAGE line names whose data this is. Do not describe it as the whole platform unless it says so, and never imply knowledge of territories outside it.
- If a specific metric is not in the data block, say "Data not available" — do NOT estimate, assume, or invent figures.
- Do not reference external market data unless the user explicitly asks for market context.
- Flag clearly when a section has no data (e.g. empty category fields).

${dataBlock}

USER QUERY: "${safeQuery}"

Generate a professional, structured analytics report using ONLY the data above. Include:
1. Direct answer to the query using exact numbers from the data
2. Key insights derived from the data
3. Recommendations based on what the data shows
4. Action items where applicable

Formatting rules:
- Start directly with # Analytics Report. Do not add conversational filler such as "Of course", "Sure", or similar openings.
- Use these exact section headings: ## Direct Answer, ## Key Insights, ## Recommendations, ## Action Items.
- Use markdown bullet lists for findings and action items.
- If a section has no supporting data, state "Data not available" or "No immediate action items from current data." instead of inventing details.
- Keep the report detailed enough for an admin briefing, but only use the live data provided above.`;

  const aiOutput = await routeGenerate(systemContext, "report");

  if (scope === "market") {
    // Return raw AI text so the market page's JSON.parse can handle the structured output
    const cleaned = normalizeReportOutput(redactPII(aiOutput));
    return new NextResponse(cleaned, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const report = normalizeReportOutput(redactPII(aiOutput));

  await logActivity({
    ...actorFromCtx(ctx),
    action: "ai.report_generate",
    resource: "ai",
    meta: { query: safeQuery },
    req,
  });

  return NextResponse.json({
    query: safeQuery,
    report,
    generatedAt: new Date().toISOString(),
    dataAsOf: now.toISOString(),
  });
}, { resource: "reports", action: "read", aiQuota: true });
