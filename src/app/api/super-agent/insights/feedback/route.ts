import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import mongoose, { Schema } from "mongoose";
import { validateBody } from "@/lib/validators";
import { insightFeedbackSchema } from "@/lib/validators/super-agent";

/* ────────────────────────────────────────────────────────
   Lightweight feedback model (inline — no separate file)
   ──────────────────────────────────────────────────────── */

interface IInsightFeedback {
  userId: mongoose.Types.ObjectId;
  insightTitle: string;
  insightSeverity: string;
  insightType: string;
  helpful: boolean;
  createdAt: Date;
}

const InsightFeedbackSchema = new Schema<IInsightFeedback>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    insightTitle: { type: String, required: true, maxlength: 200 },
    insightSeverity: { type: String, required: true, maxlength: 20 },
    insightType: { type: String, required: true, maxlength: 20 },
    helpful: { type: Boolean, required: true },
  },
  { timestamps: true }
);

const InsightFeedback =
  mongoose.models.InsightFeedback ??
  mongoose.model<IInsightFeedback>("InsightFeedback", InsightFeedbackSchema);

/* ────────────────────────────────────────────────────────
   POST /api/super-agent/insights/feedback
   ──────────────────────────────────────────────────────── */

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const body = await validateBody(req, insightFeedbackSchema);
  const { insightTitle, insightSeverity, insightType, helpful } = body;

  await connectDB();

  await InsightFeedback.create({
    userId: ctx.userId,
    insightTitle: insightTitle.slice(0, 200),
    insightSeverity: insightSeverity.slice(0, 20),
    insightType: insightType.slice(0, 20),
    helpful,
  });

  return NextResponse.json({ ok: true });
}, { resource: "users", action: "read" });
