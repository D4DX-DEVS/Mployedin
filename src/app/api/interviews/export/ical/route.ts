import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { buildInterviewIcal } from "@/lib/interviews/icalFeed";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function handler(_req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const ical = await buildInterviewIcal(ctx.userId, ctx.role);
  if (ical === null) return new NextResponse("", { status: 404 });

  return new NextResponse(ical, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "attachment; filename=interviews.ics",
    },
  });
}

export const GET = withAuth(handler, { resource: "interviews", action: "read" });
