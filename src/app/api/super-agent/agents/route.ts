import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import Lead from "@/models/Lead";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search");
  const performance = searchParams.get("performance"); // high_performer | needs_attention | slow_response | no_activity
  const leadsMin = searchParams.get("leadsMin");
  const leadsMax = searchParams.get("leadsMax");
  const convRateMin = searchParams.get("convRateMin");
  const convRateMax = searchParams.get("convRateMax");
  const sortBy = searchParams.get("sortBy") || "name"; // name | leadsCount | conversions | placements | conversionRate | avgResponseHours
  const sortOrder = searchParams.get("sortOrder") || "asc";
  const distinct = searchParams.get("distinct"); // return facets when "true"

  // Find the SuperAgent profile for the logged-in user
  const saProfile = await SuperAgent.findOne({ userId: ctx.userId }).select("agentIds").lean();
  const assignedAgentDocIds = saProfile?.agentIds ?? [];

  // Find the Agent documents for the assigned agents to get userIds
  let agentUserIds: string[] = [];
  if (assignedAgentDocIds.length > 0) {
    const agentDocs = await Agent.find({ _id: { $in: assignedAgentDocIds } }).select("userId").lean();
    agentUserIds = agentDocs.map((a) => a.userId.toString());
  }

  // Build user filter — only agents that belong to this super agent
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: any = { role: "agent", _id: { $in: agentUserIds } };
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const users = await User.find(filter).select("name email createdAt").lean();

  // Get lead stats per agent
  const userIds = users.map((u) => u._id);
  const leads = await Lead.find({ agentId: { $in: userIds } })
    .select("agentId status convertedAt activityLog createdAt")
    .lean();

  let items = users.map((u) => {
    const agentLeads = leads.filter((l) => l.agentId?.toString() === u._id.toString());
    const converted = agentLeads.filter((l) => l.status === "converted").length;

    // Compute average response time (hours) from lead creation to first activity
    const responseTimes = agentLeads
      .filter((l) => l.activityLog && l.activityLog.length > 0)
      .map((l) => {
        const first = l.activityLog![0];
        return (new Date(first.timestamp).getTime() - new Date(l.createdAt).getTime()) / (1000 * 60 * 60);
      })
      .filter((h) => h > 0 && h < 720);
    const avgResponseHours = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : -1;

    return {
      _id: u._id,
      name: u.name,
      email: u.email,
      leadsCount: agentLeads.length,
      conversions: converted,
      placements: 0, // would come from Placement model
      conversionRate: agentLeads.length > 0 ? Math.round((converted / agentLeads.length) * 100) : 0,
      avgResponseHours,
    };
  });

  // ── Performance filter ──
  if (performance) {
    items = items.filter((a) => {
      switch (performance) {
        case "high_performer": return a.conversionRate >= 50;
        case "needs_attention": return a.conversionRate < 15 && a.leadsCount > 0;
        case "slow_response": return a.avgResponseHours > 48 && a.leadsCount > 0;
        case "no_activity": return a.leadsCount === 0;
        default: return true;
      }
    });
  }

  // ── Leads range filter ──
  if (leadsMin) items = items.filter((a) => a.leadsCount >= parseInt(leadsMin));
  if (leadsMax) items = items.filter((a) => a.leadsCount <= parseInt(leadsMax));

  // ── Conversion rate range filter ──
  if (convRateMin) items = items.filter((a) => a.conversionRate >= parseInt(convRateMin));
  if (convRateMax) items = items.filter((a) => a.conversionRate <= parseInt(convRateMax));

  // ── Sorting ──
  const VALID_SORT_FIELDS = new Set(["name", "leadsCount", "conversions", "placements", "conversionRate", "avgResponseHours"]);
  const sortField = VALID_SORT_FIELDS.has(sortBy) ? sortBy : "name";
  const dir = sortOrder === "desc" ? -1 : 1;
  items.sort((a, b) => {
    const va = (a as Record<string, unknown>)[sortField];
    const vb = (b as Record<string, unknown>)[sortField];
    if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * dir;
    return ((va as number) - (vb as number)) * dir;
  });

  // ── Facets (for filter dropdowns) ──
  const facets = distinct === "true" ? {
    performanceLevels: ["high_performer", "needs_attention", "slow_response", "no_activity"],
  } : undefined;

  return NextResponse.json({ items, total: items.length, ...(facets ? { facets } : {}) });
}, { resource: "users", action: "read" });
