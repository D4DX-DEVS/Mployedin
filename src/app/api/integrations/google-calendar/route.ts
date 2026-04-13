import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";

type AuthCtx = { userId: string; role: string };

/**
 * GET /api/integrations/google-calendar
 * Returns the Google Calendar connection status for the current user.
 */
async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const doc = await JobSeeker.findOne(
    { userId: ctx.userId },
    { "googleCalendar.connected": 1, "googleCalendar.email": 1 }
  ).lean();

  if (!doc) {
    return NextResponse.json({ connected: false });
  }

  const gc = (doc as { googleCalendar?: { connected?: boolean; email?: string } }).googleCalendar;
  return NextResponse.json({
    connected: gc?.connected ?? false,
    email: gc?.email ?? null,
  });
}

/**
 * DELETE /api/integrations/google-calendar
 * Revokes and removes the stored Google Calendar credentials.
 */
async function deleteHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  await JobSeeker.findOneAndUpdate(
    { userId: ctx.userId },
    {
      $set: {
        "googleCalendar.connected": false,
        "googleCalendar.email": null,
      },
      $unset: {
        "googleCalendar.accessToken": "",
        "googleCalendar.refreshToken": "",
        "googleCalendar.expiresAt": "",
      },
    },
    { upsert: false }
  );

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler);
export const DELETE = withAuth(deleteHandler);
