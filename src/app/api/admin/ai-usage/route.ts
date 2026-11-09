import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { validateQuery } from "@/lib/validators";
import { AI_USAGE_GROUPS, MONTH_RE, currentMonth, getUsageSummary } from "@/lib/admin/aiUsage";

const querySchema = z.object({
  month: z.string().regex(MONTH_RE).optional(),
  group: z.enum(AI_USAGE_GROUPS).default("employer"),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().refine((n) => [10, 20, 50, 100].includes(n)).default(20),
});

/** GET /api/admin/ai-usage — AI spend for a month, by employer / super agent / agent / seeker feature. */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const q = validateQuery(req.nextUrl.searchParams, querySchema);
  await connectDB();
  const data = await getUsageSummary({ ...q, month: q.month ?? currentMonth() });
  return NextResponse.json(data);
});
