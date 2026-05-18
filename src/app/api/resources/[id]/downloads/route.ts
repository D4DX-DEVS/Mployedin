import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import ResourceDownloadLog from "@/models/ResourceDownloadLog";

async function getHandler(req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const id = params?.id;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "30"));

  const [items, total] = await Promise.all([
    ResourceDownloadLog.find({ resourceId: id })
      .populate("userId", "name email")
      .sort({ downloadedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    ResourceDownloadLog.countDocuments({ resourceId: id }),
  ]);

  return NextResponse.json({ items, total, page, totalPages: Math.ceil(total / limit) });
}

export const GET = withAuth(getHandler, { resource: "resources", action: "read" });
