import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { commonSchemas } from "@/lib/validators";
import { getMarketGap } from "@/lib/admin/marketGaps";

/** GET /api/admin/market-gaps/[id] — one suggestion with its seekers, trend and history. */
export const GET = withAuth(async (_req: NextRequest, ctx, params) => {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = (await params) as { id: string };
  if (!commonSchemas.objectId.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  await connectDB();
  const data = await getMarketGap(id);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
});
