import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Application from "@/models/Application";
import { Employer } from "@/models/Employer";
import Agent from "@/models/Agent";
import User from "@/models/User";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import { validateBody } from "@/lib/validators";
import { noteCreateSchema } from "@/lib/validators/applications";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { notifyMention } from "@/lib/notifications/trigger";
import { isValidObjectId } from "@/lib/security/sanitize";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

interface StoredNote {
  _id?: unknown;
  authorId?: unknown;
  authorName?: string;
  content?: string;
  mentions?: unknown[];
  createdAt?: Date | string;
}

/**
 * Both verbs answer the same question — may this caller see this application's
 * private notes — so the scope rules live in one place. A note history that
 * read more widely than the composer wrote would be an IDOR by omission.
 */
async function authorizeNoteAccess(
  applicationId: string,
  ctx: AuthCtx,
): Promise<{ application: Record<string, unknown> } | { error: NextResponse }> {
  const application = await Application.findById(applicationId).populate("jobSeekerId", "name").lean();
  if (!application) return { error: NextResponse.json({ error: "Application not found" }, { status: 404 }) };

  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp || String(application.employerId) !== String(emp._id))
      return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  } else if (ctx.role === "agent") {
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id assignedEmployerIds").lean();
    const ok = Boolean(
      agent && (
        String(application.agentId) === String(agent._id) ||
        ((agent.assignedEmployerIds as unknown[]) ?? []).some((e) => String(e) === String(application.employerId))
      )
    );
    if (!ok) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  } else if (ctx.role === "super_agent") {
    const scope = await getSuperAgentScope(ctx.userId);
    const ok = Boolean(application.agentId && scope?.effectiveAgentIds.some((id) => String(id) === String(application.agentId)));
    if (!ok) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  } else if (ctx.role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { application: application as unknown as Record<string, unknown> };
}

async function getHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();

  const access = await authorizeNoteAccess(params!.id, ctx);
  if ("error" in access) return access.error;

  const stored = ((access.application.notes as StoredNote[] | undefined) ?? []).map((note, index) => ({
    _id: note._id ? String(note._id) : `note-${index}`,
    authorName: note.authorName ?? "Team member",
    content: note.content ?? "",
    createdAt: note.createdAt ? new Date(note.createdAt).toISOString() : null,
  }));

  // Newest first: the panel shows the last few, and the last thing written is
  // the one a recruiter is looking for.
  stored.reverse();
  return NextResponse.json({ notes: stored });
}

async function postHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const applicationId = params!.id;

  const access = await authorizeNoteAccess(applicationId, ctx);
  if ("error" in access) return access.error;
  const application = access.application;

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

export const GET = withAuth(getHandler, { resource: "applications", action: "read" });
export const POST = withAuth(postHandler, { resource: "applications", action: "update" });
