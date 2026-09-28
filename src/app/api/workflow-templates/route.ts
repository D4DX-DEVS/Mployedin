import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import { getScopedEmployerIds } from "@/lib/auth/agentRestrictions";
import { loadWorkflowTemplatesFor, resolveWorkflowForJob } from "@/lib/hiring/jobWorkflow";
import { serializeWorkflowTemplate } from "@/lib/hiring/workflowTemplateStore";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

const POSTING_ROLES = new Set<UserRole>(["employer", "agent", "super_agent", "admin"]);

/**
 * The employer a job is being posted for. Employers post for themselves;
 * staff name the employer and must be allowed to see it. Null = no employer
 * known yet (platform templates only).
 */
async function employerFor(ctx: AuthCtx, requested: string | null): Promise<mongoose.Types.ObjectId | null> {
  const scoped = await getScopedEmployerIds(ctx);
  if (ctx.role === "employer") return scoped?.[0] ?? null;
  if (!requested || !mongoose.isValidObjectId(requested)) return null;
  if (scoped === null) return new mongoose.Types.ObjectId(requested);
  return scoped.find((id) => String(id) === requested) ?? null;
}

/**
 * GET /api/workflow-templates — what the job form offers: the active templates
 * a job for this employer can run on and, with `resolve=1`, the one it would
 * get automatically from the details typed so far.
 */
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (!POSTING_ROLES.has(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await connectDB();
  const sp = new URL(req.url).searchParams;
  const employerId = await employerFor(ctx, sp.get("employerId"));

  const templates = await loadWorkflowTemplatesFor(employerId);
  const body: Record<string, unknown> = {
    templates: templates
      .map((t) => serializeWorkflowTemplate(t))
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name)),
  };

  if (sp.get("resolve") === "1") {
    const experienceMin = Number(sp.get("experienceMin"));
    const resolved = await resolveWorkflowForJob({
      employerId,
      title: sp.get("title") ?? "",
      category: sp.get("category") || null,
      employmentType: sp.get("employmentType") || null,
      workMode: sp.get("workMode") || null,
      requirements: { experienceMin: Number.isFinite(experienceMin) ? experienceMin : null },
    });
    body.resolved = {
      templateId: resolved.template ? String(resolved.template._id) : null,
      name: resolved.template?.name ?? "",
      reason: resolved.reason,
      stages: resolved.stages,
    };
  }

  return NextResponse.json(body);
}

export const GET = withAuth(getHandler);
