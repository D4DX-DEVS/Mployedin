import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { commonSchemas, validateQuery } from "@/lib/validators";
import { GAP_KINDS, GAP_PRIORITIES, GAP_SORTS, GAP_STATUS_FILTERS, listMarketGaps } from "@/lib/admin/marketGaps";

const querySchema = z.object({
  kind: z.enum(GAP_KINDS).optional(),
  status: z.enum(GAP_STATUS_FILTERS).default("open"),
  priority: z.enum(GAP_PRIORITIES).optional(),
  territory: commonSchemas.objectId.optional(),
  area: commonSchemas.objectId.optional(),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(GAP_SORTS).default("seekers"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().refine((n) => [10, 20, 50, 100].includes(n)).default(20),
});

/** GET /api/admin/market-gaps — marketing suggestions from unplaced seekers and unfilled jobs. */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const q = validateQuery(req.nextUrl.searchParams, querySchema);
  await connectDB();
  return NextResponse.json(await listMarketGaps(q));
});
