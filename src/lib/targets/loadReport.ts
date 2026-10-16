/**
 * Loads the data behind one profit target report. The role routes decide WHO
 * may see a profile; this builds what they see, so admin, super-agent and
 * agent reports cannot drift apart.
 */

import TargetProfile, { PROFIT_TARGET_FILTER } from "@/models/TargetProfile";
import User from "@/models/User";
import { getSuperAgentTeam } from "@/lib/auth/agentRestrictions";
import { enrichProfiles } from "./profileAchievementCalculator";
import { calculateProfits, profitOwnerKey } from "./profitCalculator";
import { buildTargetReport, type NamedProfile, type TargetReport } from "./profitReport";

interface ProfileDoc {
  _id: unknown;
  assigneeId: unknown;
  assigneeRole: string;
  year: number;
  currency?: string;
}

/**
 * What each profile's owner made the year before, in the profile's currency, keyed by profile id:
 * the baseline for growth. One aggregation for the whole set.
 */
export async function loadPreviousYearProfits(
  profiles: { _id: string; assigneeId: string; assigneeRole: string; currency?: string }[],
  year: number,
): Promise<Map<string, number>> {
  const previous = await calculateProfits(
    profiles.map((profile) => ({
      userId: String(profile.assigneeId),
      role: profile.assigneeRole as "agent" | "super_agent",
      currency: profile.currency ?? "AED",
    })),
    year - 1,
  );
  return new Map(
    profiles.map((profile) => [
      String(profile._id),
      previous.get(profitOwnerKey(profile.assigneeRole as "agent" | "super_agent", String(profile.assigneeId)))?.totals.profit ?? 0,
    ]),
  );
}

/** The agent profiles of a super agent's explicit team that were funded from this profile. */
async function loadTeamProfiles(profile: ProfileDoc) {
  const team = await getSuperAgentTeam(String(profile.assigneeId));
  if (!team || team.agentUserIds.length === 0) return [];
  return TargetProfile.find({
    ...PROFIT_TARGET_FILTER,
    year: profile.year,
    status: "active",
    parentProfileId: profile._id,
    assigneeId: { $in: team.agentUserIds },
  }).lean();
}

/**
 * One profile's report. Pass `includeTeam` for a super agent to add their
 * agents; an agent's report never carries anyone else.
 */
export async function loadTargetReport(
  profile: ProfileDoc,
  options: { includeTeam?: boolean } = {},
): Promise<TargetReport> {
  const teamDocs = options.includeTeam && profile.assigneeRole === "super_agent" ? await loadTeamProfiles(profile) : [];

  const docs = [profile, ...teamDocs] as unknown as Record<string, unknown>[];
  const [enriched, users, previous] = await Promise.all([
    enrichProfiles(docs),
    User.find({ _id: { $in: docs.map((doc) => doc.assigneeId) } }).select("_id name email").lean(),
    calculateProfits(
      [
        {
          userId: String(profile.assigneeId),
          role: profile.assigneeRole as "agent" | "super_agent",
          currency: profile.currency ?? "AED",
        },
      ],
      profile.year - 1,
    ),
  ]);

  const userById = new Map(users.map((user) => [String(user._id), user]));
  const named = (item: (typeof enriched)[number]): NamedProfile => {
    const user = userById.get(item.assigneeId);
    return { profile: item, name: user?.name ?? "", email: user?.email ?? "" };
  };

  const [subject, ...team] = enriched;
  const previousProfit =
    previous.get(profitOwnerKey(profile.assigneeRole as "agent" | "super_agent", String(profile.assigneeId)))?.totals.profit ?? 0;

  return buildTargetReport({
    subject: named(subject),
    previousYearProfit: previousProfit,
    team: options.includeTeam && profile.assigneeRole === "super_agent" ? team.map(named) : undefined,
  });
}
