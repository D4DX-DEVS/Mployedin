import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Agent from "@/models/Agent";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import { checkLeadDuplicates } from "@/lib/leads/duplicateDetection";

/**
 * GET /api/leads/check-duplicates?companyName=X&contactEmail=Y&contactPhone=Z&excludeId=...
 * Returns potential duplicate leads for the current agent.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const companyName = searchParams.get("companyName") ?? undefined;
  const contactEmail = searchParams.get("contactEmail") ?? undefined;
  const contactPhone = searchParams.get("contactPhone") ?? undefined;
  const excludeId = searchParams.get("excludeId") ?? undefined;

  if (!companyName && !contactEmail && !contactPhone) {
    return NextResponse.json({ duplicates: [] });
  }

  // Scope to agent's leads; super_agents to their team/region (never platform-wide)
  let agentId: string | undefined;
  let superAgentScope: { saProfileId: string; agentIds: string[] } | undefined;
  if (ctx.role === "agent") {
    const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (agentDoc) agentId = String(agentDoc._id);
  } else if (ctx.role === "super_agent") {
    const scope = await getSuperAgentScope(ctx.userId);
    if (!scope) return NextResponse.json({ duplicates: [] });
    superAgentScope = {
      saProfileId: String(scope.saProfileId),
      agentIds: scope.effectiveAgentIds.map(String),
    };
  }

  const duplicates = await checkLeadDuplicates({
    companyName,
    contactEmail,
    contactPhone,
    excludeId,
    agentId,
    superAgentScope,
  });

  return NextResponse.json({ duplicates });
}, { resource: "leads", action: "read" });
