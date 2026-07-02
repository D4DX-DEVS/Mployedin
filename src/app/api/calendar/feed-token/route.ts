import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import User from "@/models/User";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

function feedUrl(req: NextRequest, token: string): string {
  return `${new URL(req.url).origin}/api/calendar/feed/${token}`;
}

/** Return the user's calendar feed URL, creating the token on first request. */
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();
  const user = await User.findById(ctx.userId).select("+calendarFeedToken").lean<{ calendarFeedToken?: string } | null>();
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let token = user.calendarFeedToken;
  if (!token) {
    token = newToken();
    await User.updateOne({ _id: ctx.userId }, { $set: { calendarFeedToken: token } });
  }
  return NextResponse.json({ url: feedUrl(req, token) });
}

/** Rotate the token — the old feed URL stops working immediately. */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();
  const token = newToken();
  const res = await User.updateOne({ _id: ctx.userId }, { $set: { calendarFeedToken: token } });
  if (res.matchedCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ url: feedUrl(req, token) });
}

export const GET = withAuth(getHandler, { resource: "interviews", action: "read" });
export const POST = withAuth(postHandler, { resource: "interviews", action: "read" });
