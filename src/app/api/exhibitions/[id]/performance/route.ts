import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import ExhibitionPerformance from "@/models/ExhibitionPerformance";
import ExhibitionRequest from "@/models/ExhibitionRequest";

/**
 * GET /api/exhibitions/[id]/performance — get performance data
 */
async function getHandler(_req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  await connectDB();
  const perf = await ExhibitionPerformance.findOne({ exhibitionId: params?.id })
    .populate("reportedBy", "name")
    .lean();

  return NextResponse.json(perf ?? null);
}

/**
 * PUT /api/exhibitions/[id]/performance — create or update performance data (admin only)
 */
async function putHandler(req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  await connectDB();
  const exhibitionId = params?.id;

  const exhibition = await ExhibitionRequest.findById(exhibitionId).lean();
  if (!exhibition) {
    return NextResponse.json({ error: "Exhibition not found" }, { status: 404 });
  }

  const body = await req.json();
  const {
    leadsGenerated, employersContacted, candidatesSourced, hiresGenerated,
    revenue, actualCost, resourcesUsed, notes,
  } = body;

  const actualCostNum = Number(actualCost) || 0;
  const revenueNum = Number(revenue) || 0;
  const roi = actualCostNum > 0 ? Math.round(((revenueNum - actualCostNum) / actualCostNum) * 100) : 0;

  const perf = await ExhibitionPerformance.findOneAndUpdate(
    { exhibitionId },
    {
      exhibitionId,
      leadsGenerated: Number(leadsGenerated) || 0,
      employersContacted: Number(employersContacted) || 0,
      candidatesSourced: Number(candidatesSourced) || 0,
      hiresGenerated: Number(hiresGenerated) || 0,
      revenue: revenueNum,
      actualCost: actualCostNum,
      roi,
      resourcesUsed: resourcesUsed?.trim(),
      notes: notes?.trim(),
      reportedBy: ctx.userId,
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  // Also update actualSpend on the exhibition itself
  await ExhibitionRequest.findByIdAndUpdate(exhibitionId, { actualSpend: actualCostNum });

  return NextResponse.json(perf);
}

export const GET = withAuth(getHandler, { resource: "exhibitions", action: "read" });
export const PUT = withAuth(putHandler, { resource: "exhibitions", action: "update" });
