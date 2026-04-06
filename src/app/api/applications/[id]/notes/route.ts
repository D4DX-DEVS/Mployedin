import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Application from "@/models/Application";
import { Employer } from "@/models/Employer";
import User from "@/models/User";
import { validateBody } from "@/lib/validators";
import { noteCreateSchema } from "@/lib/validators/applications";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { notifyMention } from "@/lib/notifications/trigger";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function postHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const applicationId = params?.id;
  if (!applicationId) return NextResponse.json({ error: "Missing application ID" }, { status: 400 });

  const application = await Application.findById(applicationId).populate("jobSeekerId", "name").lean();
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp || String(application.employerId) !== String(emp._id))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else if (!["agent", "super_agent", "admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await validateBody(req, noteCreateSchema);
  const { content, mentions = [] } = body;

  const author = await User.findById(ctx.userId).select("name").lean();
  const authorName = (author as { name?: string } | null)?.name ?? "Team member";
  const note = { authorId: ctx.userId, authorName, content, mentions, createdAt: new Date() };

  await Application.findByIdAndUpdate(applicationId, { $push: { notes: note } });

  if (mentions.length > 0) {
    const candidateName = (application.jobSeekerId as unknown as { name?: string } | null)?.name ?? "a candidate";
    await Promise.allSettled(mentions.map((id: string) => notifyMention(id, authorName, applicationId, candidateName)));
  }

  await logActivity({ ...actorFromCtx(ctx), action: "note.create", resource: "applications", resourceId: applicationId, meta: { note: content.slice(0, 100), mentions } });
  return NextResponse.json({ success: true, note }, { status: 201 });
}

export const POST = withAuth(postHandler, { resource: "applications", action: "update" });
