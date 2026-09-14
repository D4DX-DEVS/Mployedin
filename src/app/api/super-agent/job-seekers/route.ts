import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import Agent from "@/models/Agent";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";
import SuperAgent from "@/models/SuperAgent";
import { escapeRegex } from "@/lib/security/sanitize";
import { decorateReferralSummaries } from "@/lib/referrals/summary";
import { countriesInLocationText, locationCountryRegex } from "@/lib/i18n/locations";

/* ------------------------------------------------------------------ */
/*  GET /api/super-agent/job-seekers — Regional job seeker directory   */
/* ------------------------------------------------------------------ */

/** What the header's "Experienced" figure counts. */
const EXPERIENCED_MIN_YEARS = 3;

/** The page's availability options mapped onto `availabilityStatus`. */
const AVAILABILITY_FILTERS: Record<string, unknown> = {
  immediate: "immediately",
  notice_period: { $in: ["within_month", "within_3_months"] },
  unavailable: "not_available",
};

interface SeekerExperience {
  jobTitle?: string;
  isCurrent?: boolean;
}

/** The role a seeker holds now, else how they describe themselves, else the
 *  last role on record. `currentJobTitle` is not a field on JobSeeker. */
function currentRole(experience: SeekerExperience[] | undefined, headline: string | undefined): string {
  const current = experience?.find((e) => e.isCurrent)?.jobTitle;
  if (current) return current;
  if (headline) return headline;
  return experience?.[experience.length - 1]?.jobTitle ?? "";
}

async function handler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "super_agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 10)));
  const search = url.searchParams.get("search") ?? "";
  const country = url.searchParams.get("country") ?? "";
  const experienceMin = url.searchParams.get("experienceMin") ?? "";
  const availability = url.searchParams.get("availability") ?? "";

  /* Dual-scoping: team agents + region-based agents. Admin reads unscoped;
     a super_agent with an empty scope must see nothing. The previous
     `if (seekerIds.length > 0)` had no else, so an unscoped super-agent
     queried JobSeeker.find({}) — the whole seeker table, populated with
     name/email/phone. */
  /* Every clause goes into one `$and`. The scope clause and the search clause
     are both `$or`s, and two `$or` keys cannot share one object — the second
     would silently replace the first and widen the scope. */
  const conditions: Record<string, unknown>[] = [];
  let scopeCondition: Record<string, unknown> = {};
  let selfSuperAgentId: string | undefined;

  if (ctx.role !== "admin") {
    const scope = await getSuperAgentScope(ctx.userId);
    const agentIds = scope?.effectiveAgentIds ?? [];

    /* Seekers assigned to these agents, seekers those agents referred, and
       seekers this super-agent referred through their own link. A referral is
       provenance, not an assignment, so it never writes `agentId` and has to
       be unioned in here. An empty team and no own link matches nothing. */
    const agents = await Agent.find({ _id: { $in: agentIds } }).select("assignedJobSeekerIds").lean();
    const seekerIds = agents.flatMap((a: Record<string, unknown>) => (a.assignedJobSeekerIds as string[]) ?? []);
    const sa = await SuperAgent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (sa?._id) selfSuperAgentId = String(sa._id);

    scopeCondition = {
      $or: [
        { _id: { $in: seekerIds } },
        { "referral.agentId": { $in: agentIds } },
        ...(sa?._id ? [{ "referral.superAgentId": sa._id }] : []),
      ],
    };
    conditions.push(scopeCondition);
  }

  if (search) {
    const safe = escapeRegex(search);
    const matchingUsers = await User.find(
      { $or: [{ name: { $regex: safe, $options: "i" } }, { email: { $regex: safe, $options: "i" } }] },
      { _id: 1 }
    ).lean();
    const matchingUserIds = (matchingUsers as { _id: unknown }[]).map((u) => u._id);
    conditions.push({
      $or: [
        { userId: { $in: matchingUserIds } },
        { skills: { $regex: safe, $options: "i" } },
      ],
    });
  }

  /* A profile's country lives in the free text of `currentLocation`; the
     structured field is unset on real records, so a filter on it alone matched
     nothing and the dropdown behind it was empty. */
  if (country && country !== "all") {
    const pattern = locationCountryRegex(country);
    conditions.push({
      $or: [
        { country: { $regex: pattern, $options: "i" } },
        { currentLocation: { $regex: pattern, $options: "i" } },
      ],
    });
  }

  /* `totalExperienceYears`, not `experienceYears` — the latter is not a field
     on JobSeeker, so this filter used to match nothing at all. */
  const minYears = Number(experienceMin);
  if (experienceMin && experienceMin !== "all" && Number.isFinite(minYears)) {
    /* "Fresh (0 yrs)" is its own band, not a floor of zero: `$gte: 0` selected
       everyone. `$not` rather than `$lt` so a profile that predates the field
       counts as fresh instead of dropping out of every band. */
    conditions.push(
      minYears <= 0
        ? { totalExperienceYears: { $not: { $gte: 1 } } }
        : { totalExperienceYears: { $gte: minYears } },
    );
  }

  /* The page's three availability choices over the schema's four states. The
     parameter was sent from the first day and read by nobody. */
  const availabilityFilter = AVAILABILITY_FILTERS[availability];
  if (availabilityFilter !== undefined) conditions.push({ availabilityStatus: availabilityFilter });

  const filter: Record<string, unknown> = conditions.length > 0 ? { $and: conditions } : {};

  const [items, total, statsRows] = await Promise.all([
    JobSeeker.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("country currentLocation headline experience totalExperienceYears profileCompleteness skills referral userId createdAt")
      .populate("userId", "name email isActive")
      .lean(),
    JobSeeker.countDocuments(filter),
    /* The four header figures, over the whole scope. They were computed from
       `mapped` — the ten rows of the current page — so "Active Profiles" read
       back the page size and the two averages described page one only. */
    JobSeeker.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: "users",
          let: { uid: "$userId" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$uid"] } } },
            { $project: { isActive: 1 } },
          ],
          as: "account",
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: [{ $arrayElemAt: ["$account.isActive", 0] }, true] }, 1, 0] } },
          completionSum: { $sum: { $ifNull: ["$profileCompleteness", 0] } },
          experienced: {
            $sum: { $cond: [{ $gte: [{ $ifNull: ["$totalExperienceYears", 0] }, EXPERIENCED_MIN_YEARS] }, 1, 0] },
          },
        },
      },
    ]),
  ]);

  /* Collect distinct countries for facets */
  /* Same scope as the list. The old `: {}` fallback published a platform-wide
     country facet to a super-agent whose own scope was empty. */
  const facetScope = ctx.role === "admin" ? {} : scopeCondition;
  const [storedCountries, storedLocations] = await Promise.all([
    JobSeeker.distinct("country", facetScope),
    JobSeeker.distinct("currentLocation", facetScope),
  ]);
  const countries = [
    ...new Set(
      [...storedCountries, ...storedLocations].flatMap((value) => countriesInLocationText(value as string)),
    ),
  ].sort((a, b) => a.localeCompare(b));

  /* Staff see who referred a seeker; the raw sub-document never leaves here. */
  const decorated = await decorateReferralSummaries(
    items as unknown as Array<Record<string, unknown> & { referral?: unknown }>,
    { role: ctx.role === "admin" ? "admin" : "super_agent", selfSuperAgentId },
  );

  const mapped = decorated.map((s: Record<string, unknown>) => {
    const user = s.userId as Record<string, unknown> | null;
    /* Every field below is spelled the way the collection spells it. Four of
       them used to be spelled the way the page names its columns — `city`,
       `currentJobTitle`, `experienceYears`, `profileCompletion` — none of
       which exist, so every row rendered a dash, "0 yrs" and a 0% bar. */
    return {
      _id: String(s._id),
      fullName: user?.name ?? "Unknown",
      email: user?.email ?? "",
      country: s.country ?? "",
      location: s.currentLocation ?? "",
      currentJobTitle: currentRole(s.experience as SeekerExperience[] | undefined, s.headline as string | undefined),
      experienceYears: s.totalExperienceYears ?? 0,
      profileCompletion: s.profileCompleteness ?? 0,
      skills: (s.skills as string[])?.slice(0, 10) ?? [],
      createdAt: s.createdAt,
      isActive: user?.isActive ?? false,
      referralSummary: s.referralSummary,
    };
  });

  const scopeStats = (statsRows as Array<Record<string, number>>)[0];
  const scopeTotal = scopeStats?.total ?? 0;

  return NextResponse.json({
    items: mapped,
    total,
    countries,
    stats: {
      total,
      active: scopeStats?.active ?? 0,
      avgCompletion: scopeTotal > 0 ? Math.round((scopeStats.completionSum ?? 0) / scopeTotal) : 0,
      withExperience: scopeStats?.experienced ?? 0,
    },
  });
}

export const GET = withAuth(handler, { resource: "job_seekers", action: "read" });
