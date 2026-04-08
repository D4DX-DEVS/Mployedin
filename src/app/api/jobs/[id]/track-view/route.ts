import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";

// POST /api/jobs/[id]/track-view — public endpoint (no auth required)
// Increments view count; uses a cookie-based fingerprint for unique tracking.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || id.length !== 24) {
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
