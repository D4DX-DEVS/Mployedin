import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Banner from "@/models/Banner";
import type { UserRole } from "@/models/User";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const now = new Date();
  // An end date is a whole day: it shows until that day is over.
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);

  const query: Record<string, unknown> = {
    isActive: true,
    placement: "in-app-announcement",
    $or: [
      { audienceRoles: "all" },
      { audienceRoles: ctx.role },
    ],
    $and: [
      // `null` matches a missing field too.
      { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: null }, { endDate: { $gte: startOfToday } }] },
    ],
  };

  const announcements = await Banner.find(query)
    .select("title titleAr subtitle subtitleAr linkUrl linkText linkTextAr style dismissible")
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  return NextResponse.json({ announcements });
}

// Every signed-in role reads its own announcements; the query scopes by role.
export const GET = withAuth(getHandler);
