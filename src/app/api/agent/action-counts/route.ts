import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import {
  EMPTY_AGENT_COUNTS,
  getAgentActionCounts,
  resolveAgentScope,
  type AgentActionCounts,
} from "@/lib/agents/workQueue";

export type { AgentActionCounts };

/**
 * GET /api/agent/action-counts — what is waiting on this agent right now.
 *
 * Every one of these numbers already existed somewhere as a client-side slice
 * of one page of rows, which meant nothing outside that page could use it: the
 * nav could not badge, and the dashboard could not rank. Counted server-side
 * through the same module the Today queue uses, so a badge and the list it
 * links to can never disagree.
 *
 * Failure is not fatal upstream — the hook falls back to zeroes, because a
 * missing badge is a much smaller problem than a navigation bar that throws.
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  if (ctx.role !== "agent") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const scope = await resolveAgentScope(ctx.userId);
  if (!scope) return NextResponse.json(EMPTY_AGENT_COUNTS);

  return NextResponse.json(await getAgentActionCounts(scope));
});
