import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import Job from "@/models/Job";
import Application from "@/models/Application";
import { routeGenerate } from "@/lib/ai/router";

/**
 * POST /api/ai/report
 * Body: { query: string }
 *
 * Generates a natural-language analytics report based on current platform data
 * and the user's query. Agents, super-agents and admins can use this.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();
  const { query } = await req.json();
  if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });

  // Gather live stats for context
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [totalUsers, activeJobs, applicationsThisMonth] = await Promise.all([
    User.countDocuments(),
    Job.countDocuments({ status: "active" }),
    Application.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
  ]);

  const systemContext = `
You are an analytics AI for MPLOYEDIN, a Gulf-region recruitment platform.

LIVE PLATFORM DATA:
- Total registered users: ${totalUsers}
- Currently active job listings: ${activeJobs}
- Applications submitted in last 30 days: ${applicationsThisMonth}
- Current user role: ${ctx.role}
- Report requested by: ${ctx.userId}

USER QUERY: "${query}"

Generate a professional, structured analytics report based on the data above and your knowledge of Gulf region recruitment trends. Include:
1. Direct answer to the query
2. Key insights and metrics
3. Trends and recommendations
4. Action items if applicable

Format with clear sections using markdown. Be concise but comprehensive.`;

  const report = await routeGenerate(systemContext, "report");

  return NextResponse.json({
    query,
    report,
    generatedAt: new Date().toISOString(),
    dataAsOf: new Date().toISOString(),
  });
}, { resource: "reports", action: "read" });
