import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Application from "@/models/Application";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import { routeGenerate } from "@/lib/ai/router";

/**
 * GET /api/ai/daily-insights
 *
 * Returns personalized AI-generated daily insights for the current user
 * based on their role and recent platform activity.
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  await connectDB();

  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  let contextData = "";

  if (ctx.role === "job_seeker") {
    const [seeker, recentApps] = await Promise.all([
      JobSeeker.findOne({ userId: ctx.userId }).lean(),
      Application.find({ jobSeekerId: ctx.userId, createdAt: { $gte: yesterday } }).lean(),
    ]);

    contextData = `
Role: Job Seeker
Profile completeness: ${seeker?.profileCompleteness ?? 0}%
Skills: ${(seeker?.skills ?? []).slice(0, 5).join(", ")}
New applications today: ${recentApps.length}`;
  } else if (ctx.role === "employer") {
    const [activeJobs, newApps] = await Promise.all([
      Job.countDocuments({ employerId: ctx.userId, status: "active" }),
      Application.countDocuments({ createdAt: { $gte: yesterday } }),
    ]);

    contextData = `
Role: Employer
Active job listings: ${activeJobs}
New applications today: ${newApps}`;
  } else {
    contextData = `Role: ${ctx.role}`;
  }

  const prompt = `You are an AI assistant for MPLOYEDIN, a Gulf recruitment platform.

USER CONTEXT:
${contextData}
Current date: ${today.toLocaleDateString("en-AE")}

Generate 3 personalized, actionable daily insights for this user. Each insight should be:
- Specific and relevant to their role
- Actionable with a clear next step
- Professional and encouraging in tone

Return ONLY a JSON array (no markdown):
[
  { "type": "tip|alert|opportunity|metric", "title": "...", "message": "...", "action": "..." },
  ...
]`;

  const text = await routeGenerate(prompt, "chat");
  let insights;
  try {
    const cleaned = text.replace(/```json\n?|```\n?/g, "").trim();
    insights = JSON.parse(cleaned);
  } catch {
    insights = [{ type: "tip", title: "Get Started", message: text.slice(0, 200), action: "Check your dashboard" }];
  }

  return NextResponse.json({ insights, generatedAt: new Date().toISOString() });
});
