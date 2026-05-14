import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { verifyCronRequest } from "@/lib/security/cron-auth";
import TargetProfile from "@/models/TargetProfile";
import Notification from "@/models/Notification";
import { enrichProfile } from "@/lib/targets/profileAchievementCalculator";
import { notifyTargetAtRisk, notifyTargetMilestone } from "@/lib/notifications/trigger";

const BATCH_SIZE = 20;

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, index * size + size)
  );
}

export async function GET(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) return authError;

  await connectDB();

  const now = new Date();
  const year = now.getFullYear();
  const expectedProgress = Math.round(((now.getMonth() + 1) / 12) * 100);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const profiles = await TargetProfile.find({
    year,
    status: "active",
  }).lean();

  let processed = 0;
  let atRiskAlerted = 0;
  let milestoneAlerted = 0;
  const errors: string[] = [];

  for (const batch of chunk(profiles, BATCH_SIZE)) {
    const enrichedBatch = await Promise.all(
      batch.map((profile) => enrichProfile(profile as unknown as Record<string, unknown>))
    );

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
              profile.overallProgress,
              expectedProgress
            );
            atRiskAlerted += 1;
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
              profile.overallProgress
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