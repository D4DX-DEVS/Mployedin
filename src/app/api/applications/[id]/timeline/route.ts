import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Application from "@/models/Application";
import AuditLog from "@/models/AuditLog";
import { isValidObjectId } from "@/lib/security/sanitize";
import { verifyApplicationReadAccess } from "@/lib/applications/staffScope";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

// GET /api/applications/[id]/timeline
// Returns audit log entries for the given application, ordered newest-first.
async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();

  const application = await Application.findById(params?.id).select("jobId jobSeekerId").lean();
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  // Same readers as the application itself.
  const forbidden = await verifyApplicationReadAccess(application, ctx);
  if (forbidden) return forbidden;

  const entries = await AuditLog.find({
    resource: "applications",
    resourceId: params?.id,
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate("actorId", "name")
    .lean();

  // Shape entries into a user-friendly timeline format
  const timeline = entries.map((entry) => {
    const actor = entry.actorId as unknown as { name?: string } | null;
    return {
      id: entry._id,
      action: entry.action,
      actorName: actor?.name ?? entry.actorRole,
      actorRole: entry.actorRole,
      changes: entry.changes,
      createdAt: entry.createdAt,
    };
  });

  return NextResponse.json({ timeline });
}

export const GET = withAuth(getHandler);
