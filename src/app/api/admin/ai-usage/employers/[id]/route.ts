import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { commonSchemas, validateQuery } from "@/lib/validators";
import { MONTH_RE, currentMonth, getEmployerUsage } from "@/lib/admin/aiUsage";

const querySchema = z.object({ month: z.string().regex(MONTH_RE).optional() });

/** GET /api/admin/ai-usage/employers/[id] — one employer's AI usage for a month. */
export const GET = withAuth(async (req: NextRequest, ctx, params) => {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = (await params) as { id: string };
  if (!commonSchemas.objectId.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const q = validateQuery(req.nextUrl.searchParams, querySchema);
  await connectDB();
  const data = await getEmployerUsage(id, q.month ?? currentMonth());
  if (!data) return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  return NextResponse.json(data);
});
