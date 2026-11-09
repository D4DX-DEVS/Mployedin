import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { commonSchemas, validateBody } from "@/lib/validators";
import MarketSuggestion from "@/models/MarketSuggestion";

const bodySchema = z
  .object({ status: z.enum(["done", "dismissed", "new"]), reason: z.string().trim().max(500).optional() })
  .refine((b) => b.status !== "dismissed" || (b.reason && b.reason.length > 0), { message: "A reason is required to dismiss", path: ["reason"] });

/** POST /api/admin/market-gaps/[id]/status — mark done, dismiss (with a reason) or reopen. */
export const POST = withAuth(async (req: NextRequest, ctx, params) => {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = (await params) as { id: string };
  if (!commonSchemas.objectId.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const body = await validateBody(req, bodySchema);
  await connectDB();
  const s = await MarketSuggestion.findById(id);
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 });
  s.status = body.status;
  s.history.push({
    at: new Date(),
    action: body.status === "new" ? "reopened" : body.status,
    by: new mongoose.Types.ObjectId(ctx.userId),
    note: body.reason ?? "",
  });
  await s.save();
  return NextResponse.json({ ok: true, status: s.status });
});
