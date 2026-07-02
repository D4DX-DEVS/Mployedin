import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withRateLimit } from "@/lib/security/rateLimit";
import { buildInterviewIcal } from "@/lib/interviews/icalFeed";
import User from "@/models/User";
import type { UserRole } from "@/models/User";

/**
 * Public subscribable iCal feed. Calendar apps (Google, Apple, Outlook) poll
 * this URL directly without session cookies, so auth is the secret token in
 * the path — generated per user via /api/calendar/feed-token and revocable
 * by rotating it there.
 */

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

async function handler(_req: NextRequest, ...args: unknown[]) {
  const { params } = args[0] as { params: Promise<{ token: string }> };
  const { token } = await params;

  if (!TOKEN_RE.test(token)) {
    return new NextResponse("Not found", { status: 404 });
  }

  await connectDB();
  const user = await User.findOne({ calendarFeedToken: token, isActive: true })
    .select("+calendarFeedToken role")
    .lean<{ _id: unknown; role: UserRole } | null>();
  if (!user) return new NextResponse("Not found", { status: 404 });

  const ical = await buildInterviewIcal(String(user._id), user.role);
  if (ical === null) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(ical, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // Subscription feed, not a download — let clients cache briefly
      "Cache-Control": "private, max-age=300",
    },
  });
}

export const GET = withRateLimit(handler, { limit: 30, windowSec: 60, prefix: "cal-feed" });
