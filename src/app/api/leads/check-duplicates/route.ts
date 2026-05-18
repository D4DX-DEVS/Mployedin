import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Agent from "@/models/Agent";
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

  // Scope to agent's leads
  let agentId: string | undefined;
  if (ctx.role === "agent") {
    const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (agentDoc) agentId = String(agentDoc._id);
  }

  const duplicates = await checkLeadDuplicates({
    companyName,
    contactEmail,
    contactPhone,
    excludeId,
    agentId,
  });

  return NextResponse.json({ duplicates });
}, { resource: "leads", action: "read" });
