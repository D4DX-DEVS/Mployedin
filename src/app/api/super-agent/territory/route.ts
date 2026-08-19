import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import Agent from "@/models/Agent";
import Employer from "@/models/Employer";
import Job from "@/models/Job";
import State from "@/models/State";
import City from "@/models/City";

async function handler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "super_agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const scope = await getSuperAgentScope(ctx.userId);
  if (!scope) {
    return NextResponse.json({ regions: [], stats: { totalRegions: 0, totalAgents: 0, totalEmployers: 0, totalJobs: 0 } });
  }

  const cityIds = scope.assignedCityIds;
  const stateIds = scope.assignedStateIds;
  const agentIds = scope.effectiveAgentIds;

  /* Fetch region names */
  const [cities, states] = await Promise.all([
    City.find({ _id: { $in: cityIds } }).select("name").lean(),
    State.find({ _id: { $in: stateIds } }).select("name").lean(),
  ]);

  /* Build region data with counts */
  const regions = [];

  for (const city of cities) {
    const c = city as Record<string, unknown>;
    const agentCount = await Agent.countDocuments({ _id: { $in: agentIds }, "assignedCityIds": c._id });
    regions.push({
      _id: String(c._id),
      name: c.name as string,
      type: "city" as const,
      agentCount,
      // ponytail: Employer model lacks city/state fields; schema mismatch prevents accurate counts
      employerCount: 0,
      jobCount: await Job.countDocuments({ city: c.name, status: "active" }),
      seekerCount: 0,
    });
  }

  for (const state of states) {
    const s = state as Record<string, unknown>;
    const agentCount = await Agent.countDocuments({ _id: { $in: agentIds }, "assignedStateIds": s._id });
    regions.push({
      _id: String(s._id),
      name: s.name as string,
      type: "state" as const,
      agentCount,
      // ponytail: Employer model lacks city/state fields; schema mismatch prevents accurate counts
      employerCount: 0,
      jobCount: await Job.countDocuments({ state: s.name, status: "active" }),
      seekerCount: 0,
    });
  }

  const totalAgents = agentIds.length;
  const totalEmployers = regions.reduce((sum, r) => sum + r.employerCount, 0);
  const totalJobs = regions.reduce((sum, r) => sum + r.jobCount, 0);

  return NextResponse.json({
    regions,
    stats: {
      totalRegions: regions.length,
      totalAgents,
      totalEmployers,
      totalJobs,
    },
  });
}

export const GET = withAuth(handler, { resource: "reports", action: "read" });
