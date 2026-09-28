import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TargetProfile from "@/models/TargetProfile";
import User from "@/models/User";
import { enrichProfiles, expectedProgressPct, type EnrichedProfile } from "@/lib/targets/profileAchievementCalculator";
import { targetPace } from "@/lib/admin/dashboard/people.server";
import { financeTotals } from "@/lib/targets/financeTotals";

interface AuthCtx { userId: string; role: string; locale: string; }

/** The TargetProfile schema's own bounds. */
const MIN_YEAR = 2020;
const MAX_YEAR = 2100;

interface Progress { target: number; achieved: number }

function sum(profiles: EnrichedProfile[], target: "employerTarget" | "employeeTarget", achieved: "employerAchieved" | "employeeAchieved"): Progress {
  return {
    target: profiles.reduce((total, profile) => total + profile[target], 0),
    achieved: profiles.reduce((total, profile) => total + profile[achieved], 0),
  };
}

/* ------------------------------------------------------------------ */
/*  GET  /api/admin/target-report?year=                                */
/*  One year of targets against what was achieved: totals, the month   */
/*  by month line, and every person's progress and pace.               */
/* ------------------------------------------------------------------ */
async function handler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const now = new Date();
  const currentYear = now.getFullYear();
  const requested = Number.parseInt(new URL(req.url).searchParams.get("year") ?? "", 10);
  const year = Number.isInteger(requested) && requested >= MIN_YEAR && requested <= MAX_YEAR ? requested : currentYear;

  const [profiles, yearsWithTargets] = await Promise.all([
    TargetProfile.find({ year, status: "active" }).lean(),
    TargetProfile.distinct("year", { status: "active" }) as Promise<number[]>,
  ]);

  const [enriched, users] = await Promise.all([
    profiles.length > 0 ? enrichProfiles(profiles as unknown as Record<string, unknown>[]) : Promise.resolve([]),
    User.find({ _id: { $in: profiles.map((profile) => profile.assigneeId) } }).select("_id name email").lean(),
  ]);
  const userById = new Map(users.map((user) => [String(user._id), user]));

  /* Totals count each target once. A super agent's target already covers its
     agents, so only top-level profiles add up — an agent whose parent plan is
     not active this year stands on its own. The month-by-month line used to
     add parents and children together, doubling every team. */
  const activeIds = new Set(enriched.map((profile) => profile._id));
  const topLevel = enriched.filter((profile) => !profile.parentProfileId || !activeIds.has(profile.parentProfileId));
  const finance = financeTotals(topLevel);
  const mainCurrency = finance.currency;

  const pace = { achieved: 0, onPace: 0, behind: 0 };
  for (const profile of enriched) pace[targetPace(profile)] += 1;

  const monthly = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const point = {
      month: `${year}-${String(month).padStart(2, "0")}`,
      employers: { target: 0, achieved: 0 },
      employees: { target: 0, achieved: 0 },
      // The main currency only: a line cannot mix two currencies either.
      finance: { target: 0, achieved: 0 },
    };
    for (const profile of topLevel) {
      const row = profile.monthlyAchievements.find((entry) => entry.month === month);
      if (!row) continue;
      point.employers.target += row.employerTarget;
      point.employers.achieved += row.employerAchieved;
      point.employees.target += row.employeeTarget;
      point.employees.achieved += row.employeeAchieved;
      if (profile.currency === mainCurrency) {
        point.finance.target += row.financeTarget;
        point.finance.achieved += row.financeAchieved;
      }
    }
    return point;
  });

  const people = enriched
    .map((profile) => {
      const user = userById.get(profile.assigneeId);
      return {
        id: profile._id,
        name: user?.name ?? "",
        email: user?.email ?? "",
        role: profile.assigneeRole as "agent" | "super_agent",
        region: profile.region ?? null,
        employers: { target: profile.employerTarget, achieved: profile.employerAchieved },
        employees: { target: profile.employeeTarget, achieved: profile.employeeAchieved },
        finance: { currency: profile.currency, target: profile.financeTarget, achieved: profile.financeAchieved },
        progress: profile.overallProgress,
        pace: targetPace(profile),
      };
    })
    .sort((left, right) => right.progress - left.progress || left.name.localeCompare(right.name));

  return NextResponse.json({
    year,
    years: [...new Set([...yearsWithTargets, currentYear, year])].sort((left, right) => right - left),
    expectedProgress: expectedProgressPct(year, now),
    totals: {
      employers: sum(topLevel, "employerTarget", "employerAchieved"),
      employees: sum(topLevel, "employeeTarget", "employeeAchieved"),
      finance,
      people: { total: enriched.length, ...pace },
    },
    monthly,
    people,
  });
}

export const GET = withAuth(handler, { resource: "targets", action: "read" });
