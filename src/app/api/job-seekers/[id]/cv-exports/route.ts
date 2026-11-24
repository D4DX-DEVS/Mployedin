import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import type { AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import logger from "@/lib/logger";
import { seekerCvExportHistory } from "@/lib/cv/cvExportHistory.server";

/**
 * GET /api/job-seekers/[id]/cv-exports
 *
 * Every bulk CV export that included this seeker, newest first, with the job
 * it was for and who did it (admin profile page). Admin only: the history
 * names people and jobs across every client.
 */
async function getHandler(_req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = params?.id ?? "";
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await connectDB();
    const items = await seekerCvExportHistory(id);
    return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    logger.error({ err }, "[job-seekers] cv export history failed");
    return NextResponse.json({ error: "Couldn't load the CV export history. Please try again." }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, { resource: "job_seekers", action: "read" });
