import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { getSuperAgentScope, getSuperAgentTerritory, seekerRegionMatch } from "@/lib/auth/agentRestrictions";
import { seekerInRegion, type RegionInfo } from "@/lib/auth/regionMatch";
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
  const search = url.searchParams.get("search")?.trim() ?? "";
  const country = url.searchParams.get("country") ?? "";
  const experienceMin = url.searchParams.get("experienceMin") ?? "";
  const availability = url.searchParams.get("availability") ?? "";
  // ?view=area: only seekers whose own area is in the territory, the same tab
  // agents have ("In my area").
  const areaOnly = url.searchParams.get("view") === "area";
  // ?premium=1: only Premium seekers (badges[] — what referral sign-ups get).
  const premiumOnly = url.searchParams.get("premium") === "1";
  // ?agent=<Agent id>: only the seekers that team agent brought in.
  const agentFilter = url.searchParams.get("agent") ?? "";

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
  let territory: RegionInfo | null = null;
  let areaAssigned = false;
  /** Team agents by Agent id: name + the seekers assigned to them. */
  let teamAgents: Array<{ id: string; name: string; assigned: Set<string> }> = [];

  if (ctx.role !== "admin") {
    const scope = await getSuperAgentScope(ctx.userId);
    const agentIds = scope?.effectiveAgentIds ?? [];

    /* Seekers assigned to these agents, seekers those agents referred, and
       seekers this super-agent referred through their own link. A referral is
       provenance, not an assignment, so it never writes `agentId` and has to
       be unioned in here. An empty team and no own link matches nothing. */
    const agents = await Agent.find({ _id: { $in: agentIds } })
      .select("assignedJobSeekerIds userId")
      .populate("userId", "name email")
      .lean();
    const seekerIds = agents.flatMap((a: Record<string, unknown>) => (a.assignedJobSeekerIds as string[]) ?? []);
    teamAgents = agents.map((a: Record<string, unknown>) => {
      const user = a.userId as { name?: string; email?: string } | null;
      return {
        id: String(a._id),
        name: user?.name || user?.email || "",
        assigned: new Set(((a.assignedJobSeekerIds as unknown[]) ?? []).map(String)),
      };
    });
    const sa = await SuperAgent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (sa?._id) selfSuperAgentId = String(sa._id);
    // Plus visible seekers whose area is in the territory (client report
    // 2026-09-30, #5) — hidden profiles never match.
    territory = await getSuperAgentTerritory(ctx.userId, scope);
    const areaMatch = territory ? seekerRegionMatch(territory) : null;
    areaAssigned = Boolean(areaMatch);

    scopeCondition = {
      $or: [
        { _id: { $in: seekerIds } },
        // Seekers a team agent added themselves (as /api/job-seekers counts them).
        { agentId: { $in: agentIds } },
        { "referral.agentId": { $in: agentIds } },
        ...(sa?._id ? [{ "referral.superAgentId": sa._id }] : []),
        ...(areaMatch ? [areaMatch] : []),
      ],
    };
    conditions.push(scopeCondition);
    // No territory: the area tab is empty, never everyone.
    if (areaOnly) conditions.push(areaMatch ?? { _id: { $in: [] } });
    // One team agent's seekers; an id outside the team narrows to nothing.
    if (agentFilter) {
      const agent = teamAgents.find((a) => a.id === agentFilter);
      conditions.push(agent
        // ObjectIds, not strings: the stats aggregate does not cast.
        ? (() => {
            const id = new mongoose.Types.ObjectId(agent.id);
            const assigned = [...agent.assigned].map((x) => new mongoose.Types.ObjectId(x));
            return { $or: [{ agentId: id }, { "referral.agentId": id }, { _id: { $in: assigned } }] };
          })()
        : { _id: { $in: [] } });
    }
  }
  if (premiumOnly) conditions.push({ badges: "premium" });

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
      .select("country currentLocation headline experience totalExperienceYears profileCompleteness skills referral userId createdAt regionCityId regionStateId profileVisibility badges agentId")
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
          premium: { $sum: { $cond: [{ $in: ["premium", { $ifNull: ["$badges", []] }] }, 1, 0] } },
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
      // Lives in the super agent's territory (their own area is set there).
      inArea: seekerInRegion(s as { regionCityId?: unknown; regionStateId?: unknown; profileVisibility?: string }, territory),
      premium: ((s.badges as string[] | undefined) ?? []).includes("premium"),
      // The team agent the seeker came in through when it was not a referral
      // (the referral chip names that one): added by them, or assigned to them.
      agent: (() => {
        if (s.referral) return undefined;
        const added = teamAgents.find((a) => a.id === String(s.agentId ?? ""));
        if (added) return { name: added.name, via: "added" as const };
        const assigned = teamAgents.find((a) => a.assigned.has(String(s._id)));
        return assigned ? { name: assigned.name, via: "assigned" as const } : undefined;
      })(),
    };
  });

  const scopeStats = (statsRows as Array<Record<string, number>>)[0];
  const scopeTotal = scopeStats?.total ?? 0;

  return NextResponse.json({
    items: mapped,
    total,
    countries,
    areaAssigned,
    // The super agent's team, for the "Agent" filter.
    agents: teamAgents.map((a) => ({ id: a.id, name: a.name })).sort((x, y) => x.name.localeCompare(y.name)),
    stats: {
      premium: scopeStats?.premium ?? 0,
      total,
      active: scopeStats?.active ?? 0,
      avgCompletion: scopeTotal > 0 ? Math.round((scopeStats.completionSum ?? 0) / scopeTotal) : 0,
      withExperience: scopeStats?.experienced ?? 0,
    },
  });
}

export const GET = withAuth(handler, { resource: "job_seekers", action: "read" });
