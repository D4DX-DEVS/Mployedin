import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import { checkRateLimit } from "@/lib/security/rateLimit";
import mongoose from "mongoose";

// POST /api/jobs/[id]/track-view — public endpoint (no auth required)
// Increments view count; uses a cookie-based fingerprint for unique tracking.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown").split(",")[0].trim();
  const { allowed } = checkRateLimit(`track-view:${ip}`, { limit: 30, windowSec: 60, prefix: "tview" });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { id } = await params;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
  }

  await connectDB();

  const viewedCookie = req.cookies.get("jv")?.value ?? "";
  const viewedJobs = viewedCookie.split(",").filter(Boolean);
  const isUnique = !viewedJobs.includes(id);

  const inc: Record<string, number> = { views: 1 };
  if (isUnique) inc.uniqueViews = 1;

  await Job.updateOne({ _id: id, status: "active" }, { $inc: inc });

  const res = NextResponse.json({ ok: true });

  if (isUnique) {
    const updated = [...viewedJobs, id].slice(-100).join(",");
    res.cookies.set("jv", updated, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 86400, // 24 hours
      path: "/",
    });
  }

  return res;
}
