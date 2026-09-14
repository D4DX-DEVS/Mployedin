import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { getSuperAgentScope, getSuperAgentBook } from "@/lib/auth/agentRestrictions";
import mongoose from "mongoose";
import Agent from "@/models/Agent";
import Employer from "@/models/Employer";
import Job from "@/models/Job";
import { Application } from "@/models/Application";
import State from "@/models/State";
import City from "@/models/City";

/**
 * GET /api/super-agent/territory
 *
 * The regions an admin handed this super-agent, each with what is actually in
 * it. "In it" follows the ownership chain — region → the agents assigned there
 * → their employers → those employers' jobs and applicants — because that is
 * the only path that exists in the schema. Employer carries no city or state of
 * its own, and Job stores its city under `location.city`, never at the top
 * level; an earlier version queried a bare `city` field and so reported zero
 * jobs for every region, no matter how busy.
 *
 * Totals are counted once over the whole territory rather than summed across
 * regions, because an agent assigned to two cities would otherwise have their
 * employers counted twice.
 */
async function handler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "super_agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const scope = await getSuperAgentScope(ctx.userId);
  if (!scope) {
    return NextResponse.json({ regions: [], stats: { totalRegions: 0, totalAgents: 0, totalEmployers: 0, totalJobs: 0, totalSeekers: 0 } });
  }

  const cityIds = scope.assignedCityIds;
  const stateIds = scope.assignedStateIds;
  const agentIds = scope.effectiveAgentIds;

  const [cities, states, agents] = await Promise.all([
    City.find({ _id: { $in: cityIds } }).select("name").lean(),
    State.find({ _id: { $in: stateIds } }).select("name").lean(),
    Agent.find({ _id: { $in: agentIds } }).select("assignedCityIds assignedStateIds assignedEmployerIds").lean(),
  ]);

  // One definition of "the employers in this territory", shared with the
  // dashboard and the AI report so the three screens cannot disagree.
  const book = await getSuperAgentBook(ctx.userId);
  const employerIds = book?.employerIds ?? [];
  const employers = employerIds.length
    ? await Employer.find({ _id: { $in: employerIds } }).select("_id agentId").lean()
    : [];

  /*
   * Employers grouped by the agent who holds them — read from both ends of the
   * link, the same way getSuperAgentBook builds the territory. Reading only
   * Employer.agentId drops every employer that sits on an agent's list without
   * the pointer back, and those are exactly the ones the dashboard counts.
   */
  const employersByAgent = new Map<string, Set<string>>();
  const inBook = new Set(employerIds.map(String));
  function link(agentKey: string, employerKey: string) {
    const bucket = employersByAgent.get(agentKey);
    if (bucket) bucket.add(employerKey);
    else employersByAgent.set(agentKey, new Set([employerKey]));
  }
  for (const agent of agents) {
    for (const employerId of (agent.assignedEmployerIds as mongoose.Types.ObjectId[]) ?? []) {
      if (inBook.has(String(employerId))) link(String(agent._id), String(employerId));
    }
  }
  for (const employer of employers) {
    if (employer.agentId) link(String(employer.agentId), String(employer._id));
  }

  /* One pass each for jobs and applicants, keyed by employer. */
  const [jobRows, applicantRows] = await Promise.all([
    employerIds.length
      ? Job.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
          { $match: { employerId: { $in: employerIds }, status: "active" } },
          { $group: { _id: "$employerId", count: { $sum: 1 } } },
        ])
      : Promise.resolve([]),
    employerIds.length
      ? Application.aggregate<{ _id: mongoose.Types.ObjectId; seekers: mongoose.Types.ObjectId[] }>([
          { $match: { employerId: { $in: employerIds } } },
          { $group: { _id: "$employerId", seekers: { $addToSet: "$jobSeekerId" } } },
        ])
      : Promise.resolve([]),
  ]);

  const jobsByEmployer = new Map<string, number>();
  for (const row of jobRows) jobsByEmployer.set(String(row._id), row.count);

  const seekersByEmployer = new Map<string, string[]>();
  for (const row of applicantRows) {
    seekersByEmployer.set(String(row._id), row.seekers.map(String));
  }

  /** Roll the ownership chain up from a set of agents to region-level counts. */
  function summarise(regionAgentIds: string[]) {
    const seekers = new Set<string>();
    let employerCount = 0;
    let jobCount = 0;
    const counted = new Set<string>();
    for (const agentKey of regionAgentIds) {
      for (const employerKey of employersByAgent.get(agentKey) ?? []) {
        // Two agents in the same region can share an employer; count it once.
        if (counted.has(employerKey)) continue;
        counted.add(employerKey);
        employerCount += 1;
        jobCount += jobsByEmployer.get(employerKey) ?? 0;
        for (const seekerKey of seekersByEmployer.get(employerKey) ?? []) seekers.add(seekerKey);
      }
    }
    return { employerCount, jobCount, seekerCount: seekers.size };
  }

  const regions = [];

  for (const city of cities) {
    const c = city as Record<string, unknown>;
    const regionAgents = agents
      .filter((a) => ((a.assignedCityIds as mongoose.Types.ObjectId[]) ?? []).some((id) => String(id) === String(c._id)))
      .map((a) => String(a._id));
    regions.push({
      _id: String(c._id),
      name: c.name as string,
      type: "city" as const,
      agentCount: regionAgents.length,
      ...summarise(regionAgents),
    });
  }

  for (const state of states) {
    const s = state as Record<string, unknown>;
    const regionAgents = agents
      .filter((a) => ((a.assignedStateIds as mongoose.Types.ObjectId[]) ?? []).some((id) => String(id) === String(s._id)))
      .map((a) => String(a._id));
    regions.push({
      _id: String(s._id),
      name: s.name as string,
      type: "state" as const,
      agentCount: regionAgents.length,
      ...summarise(regionAgents),
    });
  }

  const allSeekers = new Set<string>();
  for (const seekerKeys of seekersByEmployer.values()) {
    for (const seekerKey of seekerKeys) allSeekers.add(seekerKey);
  }

  return NextResponse.json({
    regions,
    stats: {
      totalRegions: regions.length,
      totalAgents: agentIds.length,
      totalEmployers: employers.length,
      totalJobs: [...jobsByEmployer.values()].reduce((sum, n) => sum + n, 0),
      totalSeekers: allSeekers.size,
    },
  });
}

export const GET = withAuth(handler, { resource: "reports", action: "read" });
