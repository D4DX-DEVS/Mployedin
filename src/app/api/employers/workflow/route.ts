import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import Employer from "@/models/Employer";

interface WorkflowStage {
  id: string;
  label: string;
  enabled: boolean;
  autoProgress: boolean;
  order: number;
}

interface WorkflowSettings {
  aiAutoScreen: boolean;
  notifyOnStageChange: boolean;
  autoRejectBelow: number;
}

async function GET(_req: NextRequest, ctx: { userId: string }) {
  await connectDB();
  const employer = await (Employer as unknown as {
    findOne: (q: object) => { select: (s: string) => { lean: () => Promise<{ workflow?: { stages: WorkflowStage[]; settings: WorkflowSettings } } | null> } }
  }).findOne({ userId: ctx.userId }).select("workflow").lean();

  return NextResponse.json({
    stages: employer?.workflow?.stages ?? [],
    settings: employer?.workflow?.settings ?? { aiAutoScreen: true, notifyOnStageChange: true, autoRejectBelow: 40 },
  });
}

async function PATCH(req: NextRequest, ctx: { userId: string }) {
  await connectDB();
  const { stages, settings } = await req.json();

  await (Employer as unknown as {
    findOneAndUpdate: (q: object, update: object, opts: object) => Promise<unknown>
  }).findOneAndUpdate(
    { userId: ctx.userId },
    { $set: { workflow: { stages, settings } } },
    { upsert: true }
  );

  return NextResponse.json({ success: true });
}

export const GET_handler = withAuth(GET, { resource: "employers", action: "read" });
export const PATCH_handler = withAuth(PATCH, { resource: "employers", action: "update" });
export { GET_handler as GET, PATCH_handler as PATCH };
