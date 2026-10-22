import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/lib/auth/config";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";
import { markOnce } from "@/lib/security/markOnce";
import logger from "@/lib/logger";

/**
 * What getClientIp answers when no trusted proxy is configured: one shared key
 * for every visitor. A per-visitor limit keyed on it would cap the whole site at
 * 30 views a minute and silently drop the rest.
 */
const UNKNOWN_CLIENT = "direct";

const PER_CLIENT_LIMIT = { limit: 30, windowSec: 60, prefix: "tview" };
/** Keyed on UNKNOWN_CLIENT: a flood guard for the whole site, not a per-visitor cap. */
const GLOBAL_LIMIT = { limit: 600, windowSec: 60, prefix: "tview-global" };

/** A signed-in viewer counts once per job per day. */
const UNIQUE_WINDOW_SEC = 86_400;

// POST /api/jobs/[id]/track-view — public endpoint (no auth required)
//
// Every call for an active job adds one to `views`. `uniqueViews` counts distinct
// *signed-in* viewers: one per user per job per 24 hours, remembered server-side
// by user id (Redis key with a TTL, written only once the job matched). Nothing
// is stored on the visitor's device and no IP is stored, so an anonymous visitor
// is only ever counted in `views`.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = getClientIp(req.headers);
  const { allowed } = await checkRateLimit(client, client === UNKNOWN_CLIENT ? GLOBAL_LIMIT : PER_CLIENT_LIMIT);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { id } = await params;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
  }

  await connectDB();

  // The view counts first, and only for a job that exists and is active. An id
  // that matched nothing never reaches the dedupe store, so a well-formed
  // ObjectId can't be used to create keys there.
  const { matchedCount } = await Job.updateOne({ _id: id, status: "active" }, { $inc: { views: 1 } });
  if (matchedCount === 0) return NextResponse.json({ ok: true });

  // Optional session: only a signed-in viewer can be counted as a unique viewer.
  const session = await auth().catch(() => null);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ ok: true });

  let firstVisitToday = false;
  try {
    firstVisitToday = await markOnce(`jobview:${id}:${userId}`, UNIQUE_WINDOW_SEC);
  } catch (err) {
    // The view is already counted; this visit just isn't added to the unique total.
    logger.warn({ err }, "[track-view] couldn't check whether this viewer was already counted");
  }
  if (firstVisitToday) await Job.updateOne({ _id: id }, { $inc: { uniqueViews: 1 } });

  return NextResponse.json({ ok: true });
}
