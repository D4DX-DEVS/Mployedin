import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { verifyCronRequest } from "@/lib/security/cron-auth";
import TargetProfile, { PROFIT_TARGET_FILTER } from "@/models/TargetProfile";
import Notification from "@/models/Notification";
import User from "@/models/User";
import { enrichProfiles } from "@/lib/targets/profileAchievementCalculator";
import { notifyTargetAtRisk, notifyTargetMilestone, notifyTeamTargetAtRisk } from "@/lib/notifications/trigger";

const BATCH_SIZE = 50;

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) return authError;

  await connectDB();

  const now = new Date();
  const year = now.getFullYear();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  let processed = 0;
  let atRiskAlerted = 0;
  let milestoneAlerted = 0;
  const errors: string[] = [];

  // Every active profile of the year, a page at a time: each page costs a fixed
  // number of queries, and nothing past the first N is silently skipped.
  let lastId: unknown = null;
  for (;;) {
    const batch = await TargetProfile.find({
      ...PROFIT_TARGET_FILTER,
      year,
      status: "active",
      ...(lastId ? { _id: { $gt: lastId } } : {}),
    })
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .lean();
    if (batch.length === 0) break;
    lastId = batch[batch.length - 1]._id;

    const enrichedBatch = await enrichProfiles(batch as unknown as Record<string, unknown>[]);

    // The super agent who funded each at-risk agent, told alongside the agent.
    const atRiskAgents = enrichedBatch.filter((p) => p.riskScore === "high" && p.assigneeRole === "agent" && p.parentProfileId);
    const parents = atRiskAgents.length
      ? await TargetProfile.find({ _id: { $in: atRiskAgents.map((p) => p.parentProfileId) } }).select("assigneeId").lean()
      : [];
    const supervisorByParent = new Map(parents.map((parent) => [String(parent._id), String(parent.assigneeId)]));
    const agentUsers = atRiskAgents.length
      ? await User.find({ _id: { $in: atRiskAgents.map((p) => p.assigneeId) } }).select("_id name").lean()
      : [];
    const agentNames = new Map(agentUsers.map((user) => [String(user._id), user.name as string]));

    for (const profile of enrichedBatch) {
      processed += 1;
      try {
        if (profile.riskScore === "high") {
          const existing = await Notification.findOne({
            userId: profile.assigneeId,
            type: "target_at_risk",
            "meta.profileId": profile._id,
            createdAt: { $gte: sevenDaysAgo },
          }).lean();

          if (!existing) {
            await notifyTargetAtRisk(
              profile.assigneeId,
              profile.assigneeRole as "agent" | "super_agent",
              profile._id,
              profile.profitProgress,
              profile.expectedProgress
            );
            atRiskAlerted += 1;
          }

          const supervisorId = profile.parentProfileId ? supervisorByParent.get(profile.parentProfileId) : undefined;
          if (supervisorId) {
            const told = await Notification.findOne({
              userId: supervisorId,
              type: "target_at_risk",
              "meta.profileId": profile._id,
              createdAt: { $gte: sevenDaysAgo },
            }).lean();

            if (!told) {
              await notifyTeamTargetAtRisk(
                supervisorId,
                agentNames.get(profile.assigneeId) ?? "An agent",
                profile._id,
                profile.profitProgress,
                profile.expectedProgress
              );
            }
          }
        }

        if (profile.incentiveTier === "platinum") {
          const existing = await Notification.findOne({
            userId: profile.assigneeId,
            type: "target_milestone",
            "meta.profileId": profile._id,
            createdAt: { $gte: thirtyDaysAgo },
          }).lean();

          if (!existing) {
            await notifyTargetMilestone(
              profile.assigneeId,
              profile.assigneeRole as "agent" | "super_agent",
              profile._id,
              "platinum",
              profile.profitProgress
            );
            milestoneAlerted += 1;
          }
        }
      } catch (error) {
        errors.push(`${profile._id}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
  }

  return NextResponse.json({
    processed,
    atRiskAlerted,
    milestoneAlerted,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
  });
}
