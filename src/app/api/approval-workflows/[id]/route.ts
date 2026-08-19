import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import ApprovalWorkflow from "@/models/ApprovalWorkflow";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { approvalWorkflowDecisionSchema } from "@/lib/validators/approval-workflows";
import mongoose from "mongoose";

async function patchHandler(req: NextRequest, ctx: { userId: string; role: string }, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id || "";
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const workflow = await ApprovalWorkflow.findById(id);
  if (!workflow) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  if (workflow.status !== "pending") return NextResponse.json({ error: "Workflow is not pending" }, { status: 400 });

  const body = await validateBody(req, approvalWorkflowDecisionSchema);
  const { decision, comments } = body;

  // Find the approver
  const approver = workflow.approvers.find((a: any) => a.userId.toString() === ctx.userId && a.decision === "pending");
  if (!approver) return NextResponse.json({ error: "You are not a pending approver" }, { status: 403 });

  // In sequential mode, check if it's their turn
  if (workflow.isSequential && approver.order !== workflow.currentStep) {
    return NextResponse.json({ error: "Not your turn to approve" }, { status: 400 });
  }

  approver.decision = decision;
  approver.decidedAt = new Date();
  approver.comments = comments ? comments.trim() : undefined;

  if (decision === "rejected") {
    workflow.status = "rejected";
  } else {
    // Check if enough approvals
    const approvedCount = workflow.approvers.filter((a: any) => a.decision === "approved").length;

    if (workflow.isSequential) {
      if (approver.order >= workflow.approvers.length) {
        workflow.status = "approved";
      } else {
        workflow.currentStep = approver.order + 1;
      }
    } else {
      // Parallel mode
      if (approvedCount >= workflow.requiredApprovals) {
        workflow.status = "approved";
      }
    }
  }

  await workflow.save();

  await logActivity({
    action: `approval_workflow.${decision}`,
    ...actorFromCtx(ctx),
    resource: "ApprovalWorkflow",
    resourceId: id,
    meta: { type: workflow.type, resourceTitle: workflow.resourceTitle },
  });

  return NextResponse.json({ workflow, message: `Decision: ${decision}` });
}

async function deleteHandler(req: NextRequest, ctx: { userId: string; role: string }, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id || "";
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const workflow = await ApprovalWorkflow.findById(id);
  if (!workflow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (workflow.requestedBy.toString() !== ctx.userId) {
    return NextResponse.json({ error: "Only requester can cancel" }, { status: 403 });
  }

  workflow.status = "cancelled";
  await workflow.save();

  return NextResponse.json({ message: "Workflow cancelled" });
}

export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
