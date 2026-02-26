import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Application from "@/models/Application";
import { Employer } from "@/models/Employer";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import Job from "@/models/Job";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();

  const application = await Application.findById(params?.id).populate("jobId", "employerId");
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  // Ownership check for employers
  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    const job = application.jobId as unknown as { employerId: string };
    if (!emp || String(job.employerId) !== String(emp._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (!["agent", "super_agent", "admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { status, note } = body;

  const validStatuses = ["applied", "shortlisted", "interview_scheduled", "selected", "rejected"];
  if (status && !validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  if (status && status !== application.status) {
    application.status = status;
    application.statusHistory.push({
      status,
      changedAt: new Date(),
      changedBy: ctx.userId,
      note: note ?? `Status updated to ${status}`,
    });
  }

  await application.save();

  if (status) {
    await logActivity({
      ...actorFromCtx(ctx),
      action: "application.status_change",
      resource: "applications",
      resourceId: params?.id,
      changes: { before: { status: application.status }, after: { status } },
      req,
    });
  }

  return NextResponse.json({ application });
}

async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const application = await Application.findById(params?.id)
    .populate("jobId", "title location salary employerId")
    .populate("jobSeekerId", "name email phone skills")
    .lean();

  if (!application) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Ownership / role check
  const appJobSeeker = String((application as unknown as { jobSeekerId?: { _id?: unknown } }).jobSeekerId?._id ?? (application as unknown as { jobSeekerId?: unknown }).jobSeekerId ?? "");
  const appEmployer = String((application as unknown as { jobId?: { employerId?: unknown } }).jobId?.employerId ?? "");

  if (ctx.role === "job_seeker" && appJobSeeker !== ctx.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp || appEmployer !== String(emp._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  // Agents / super_agents / admins can view any

  return NextResponse.json({ application });
}

export const GET = withAuth(getHandler, { resource: "applications", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "applications", action: "update" });
