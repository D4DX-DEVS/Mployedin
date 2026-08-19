import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import ApprovalWorkflow from "@/models/ApprovalWorkflow";
import Employer from "@/models/Employer";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { approvalWorkflowCreateSchema } from "@/lib/validators/approval-workflows";
import mongoose from "mongoose";

async function getHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const pendingOnly = url.searchParams.get("pending") === "true";

  const filter: Record<string, unknown> = { employerId: employer._id };
  if (status) filter.status = status;
  if (pendingOnly) {
    filter["approvers.userId"] = new mongoose.Types.ObjectId(ctx.userId);
    filter["approvers.decision"] = "pending";
    filter.status = "pending";
  }

  const workflows = await ApprovalWorkflow.find(filter).sort({ createdAt: -1 }).limit(50).lean();

  return NextResponse.json({ workflows });
}

async function postHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const body = await validateBody(req, approvalWorkflowCreateSchema);

  const workflow = await ApprovalWorkflow.create({
    employerId: employer._id,
    type: body.type,
    resourceId: new mongoose.Types.ObjectId(body.resourceId),
    resourceTitle: body.resourceTitle,
    requestedBy: new mongoose.Types.ObjectId(ctx.userId),
    requestedByName: body.requestedByName || "",
    approvers: body.approvers.map((a, i) => ({
      userId: new mongoose.Types.ObjectId(a.userId),
      name: a.name,
      email: a.email,
      order: i + 1,
      decision: "pending",
    })),
    currentStep: 1,
    status: "pending",
    isSequential: body.isSequential,
    requiredApprovals: body.requiredApprovals,
    deadline: body.deadline ? new Date(body.deadline) : undefined,
    notes: body.notes,
  });

  await logActivity({ action: "approval_workflow.created", ...actorFromCtx(ctx), resource: "ApprovalWorkflow", resourceId: workflow._id.toString(), meta: { type: body.type, resourceTitle: body.resourceTitle } });

  return NextResponse.json({ workflow }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
