import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { enforceDailyAiQuota } from "@/lib/ai/dailyQuota";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { routeGenerate } from "@/lib/ai/router";
import { connectDB } from "@/lib/db/mongoose";
import Lead from "@/models/Lead";
import logger from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as unknown as { role: string }).role;
    if (!["agent", "super_agent", "admin"].includes(userRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const ip =
      req.headers.get("x-forwarded-for") ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const userId = (session.user as unknown as { id: string }).id ?? ip;
    const { allowed, remaining, resetAt } = await checkRateLimit(
      `ai-lead-score:${userId}`,
      RATE_LIMIT_CONFIGS.ai
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    const __aiQuota = await enforceDailyAiQuota(session.user.id!, userRole);
    if (__aiQuota) return __aiQuota;

    const body = await req.json();
    const { leadId } = body as { leadId?: string };

    if (!leadId || !/^[a-f\d]{24}$/i.test(leadId)) {
      return NextResponse.json({ error: "Valid leadId is required" }, { status: 400 });
    }

    await connectDB();

    const lead = await Lead.findById(leadId).lean();
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Ownership: the role check above only proves the caller is *an* agent.
    // Without this, any agent could score another agent's lead and read its
    // contact PII back out of the prompt result.
    if (userRole === "agent") {
      const Agent = (await import("@/models/Agent")).default;
      const agent = await Agent.findOne({ userId: session.user.id }).select("_id").lean();
      if (!agent || String(lead.agentId) !== String(agent._id)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (userRole === "super_agent") {
      const { getSuperAgentScope } = await import("@/lib/auth/agentRestrictions");
      const scope = await getSuperAgentScope(session.user.id!);
      const inScope = Boolean(
        scope &&
          (String(lead.superAgentId ?? "") === String(scope.saProfileId) ||
            scope.effectiveAgentIds.map(String).includes(String(lead.agentId ?? "")))
      );
      if (!inScope) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const typedLead = lead as unknown as {
      companyName: string;
      contactPerson: string;
      contactEmail?: string;
      contactPhone?: string;
      country?: string;
      industry?: string;
      status: string;
      notes?: string;
      followUpAt?: Date;
      createdAt: Date;
      activityLog?: { action: string; note?: string; timestamp: Date }[];
    };

    const daysSinceCreated = Math.floor(
      (Date.now() - new Date(typedLead.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    const followUpOverdue = typedLead.followUpAt
      ? new Date(typedLead.followUpAt).getTime() < Date.now()
      : false;
    const activityCount = typedLead.activityLog?.length ?? 0;

    const prompt = `You are a recruitment agency lead scoring expert for the Gulf/MENA recruitment market.

Analyze this employer lead and provide scoring and next-step recommendations.

LEAD DATA:
- Company: ${typedLead.companyName}
- Contact: ${typedLead.contactPerson}
- Country: ${typedLead.country ?? "Unknown"}
- Industry: ${typedLead.industry ?? "Unknown"}
- Current Stage: ${typedLead.status}
- Days Since Created: ${daysSinceCreated}
- Activity Count: ${activityCount}
- Follow-up Overdue: ${followUpOverdue}
- Has Email: ${Boolean(typedLead.contactEmail)}
- Has Phone: ${Boolean(typedLead.contactPhone)}
- Notes: ${typedLead.notes?.slice(0, 300) ?? "None"}

Provide a JSON response with:
- score: 0-100 (hot=80+, warm=50-79, cold=<50)
- temperature: "hot" | "warm" | "cold"
- reasoning: one sentence explaining the score
- nextAction: specific recommended next step
- suggestedFollowUpDays: number of days from now to follow up
- draftMessage: a brief professional follow-up message draft (2-3 sentences)
- riskFactors: array of 1-2 risk factors (strings)

Output ONLY valid JSON, no markdown code blocks.`;

    const rawText = await routeGenerate(prompt, "chat");

    let parsed: unknown;
    try {
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { lead: { id: leadId, companyName: typedLead.companyName }, ...parsed as object },
      { headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  } catch (err) {
    logger.error({ err }, "[Lead Score Error]");
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
