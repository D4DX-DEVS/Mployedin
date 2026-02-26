import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import Employer from "@/models/Employer";

interface MatchingWeights {
  skills: number;
  experience: number;
  education: number;
  location: number;
  salary: number;
  languages: number;
  availability: number;
}

const DEFAULT_WEIGHTS: MatchingWeights = {
  skills: 30,
  experience: 25,
  education: 15,
  location: 10,
  salary: 10,
  languages: 5,
  availability: 5,
};

async function GET(_req: NextRequest, ctx: { userId: string }) {
  await connectDB();
  const employer = await (Employer as unknown as {
    findOne: (q: object) => { select: (s: string) => { lean: () => Promise<{ matchingWeights?: MatchingWeights } | null> } }
  }).findOne({ userId: ctx.userId }).select("matchingWeights").lean();

  return NextResponse.json({ weights: employer?.matchingWeights ?? DEFAULT_WEIGHTS });
}

async function PATCH(req: NextRequest, ctx: { userId: string }) {
  await connectDB();
  const { weights } = await req.json();

  // Validate total = 100
  const total = Object.values(weights as Record<string, number>).reduce((a, b) => a + b, 0);
  if (Math.abs(total - 100) > 1) {
    return NextResponse.json({ error: `Weights must total 100 (got ${total})` }, { status: 400 });
  }

  await (Employer as unknown as {
    findOneAndUpdate: (q: object, update: object, opts: object) => Promise<unknown>
  }).findOneAndUpdate(
    { userId: ctx.userId },
    { $set: { matchingWeights: weights } },
    { upsert: true }
  );

  return NextResponse.json({ success: true });
}

export const GET_handler = withAuth(GET, { resource: "employers", action: "read" });
export const PATCH_handler = withAuth(PATCH, { resource: "employers", action: "update" });
export { GET_handler as GET, PATCH_handler as PATCH };
