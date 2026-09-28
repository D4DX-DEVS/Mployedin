import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import Job from "@/models/Job";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

const LIMIT = 50;

interface JobRow {
  _id: unknown;
  title?: string;
  status?: string;
  employerId?: { _id?: unknown; companyName?: string } | null;
  workflow?: { template?: { version?: number; source?: string; appliedAt?: Date } };
}

/** GET — the jobs that run on one template (newest first), for "Used by N jobs". */
async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = params?.id;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();

  const filter = { "workflow.template.templateId": new mongoose.Types.ObjectId(id), deletedAt: null };
  const [rows, total] = await Promise.all([
    Job.find(filter)
      .sort({ createdAt: -1 })
      .limit(LIMIT)
      .select("title status employerId workflow.template")
      .populate("employerId", "companyName")
      .lean<JobRow[]>(),
    Job.countDocuments(filter),
  ]);

  return NextResponse.json({
    total,
    jobs: rows.map((job) => ({
      _id: String(job._id),
      title: job.title ?? "",
      status: job.status ?? "",
      companyName: job.employerId?.companyName ?? "",
      version: job.workflow?.template?.version ?? 1,
      source: job.workflow?.template?.source ?? "auto",
      appliedAt: job.workflow?.template?.appliedAt ?? null,
    })),
  });
}

export const GET = withAuth(getHandler, { resource: "users", action: "read" });
