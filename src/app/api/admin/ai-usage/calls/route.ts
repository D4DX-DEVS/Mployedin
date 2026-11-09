import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { commonSchemas, validateQuery } from "@/lib/validators";
import { AI_FEATURES } from "@/lib/ai/usageContext";
import { MONTH_RE, currentMonth, getCallLog } from "@/lib/admin/aiUsage";

const querySchema = z.object({
  month: z.string().regex(MONTH_RE).optional(),
  employerId: commonSchemas.objectId.optional(),
  userId: commonSchemas.objectId.optional(),
  feature: z.enum(AI_FEATURES as unknown as [string, ...string[]]).optional(),
  result: z.enum(["ok", "failed"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().refine((n) => [10, 20, 50, 100].includes(n)).default(20),
});

/** GET /api/admin/ai-usage/calls — the raw call log behind the totals. */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const q = validateQuery(req.nextUrl.searchParams, querySchema);
  await connectDB();
  const data = await getCallLog({
    month: q.month ?? currentMonth(),
    employerId: q.employerId,
    userId: q.userId,
    feature: q.feature,
    ok: q.result ? q.result === "ok" : undefined,
    page: q.page,
    pageSize: q.pageSize,
  });
  return NextResponse.json(data);
});
