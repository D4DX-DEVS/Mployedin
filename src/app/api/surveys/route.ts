import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { SurveyTemplate, SurveyResponse } from "@/models/CandidateSurvey";
import Employer from "@/models/Employer";
import Application from "@/models/Application";
import { logActivity } from "@/lib/audit/log";
import mongoose from "mongoose";

// GET: Employer gets templates + aggregated results
async function getHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();

  const url = new URL(req.url);
  const type = url.searchParams.get("type");

  // Candidate fetching survey to fill
  if (type === "pending" && ctx.role === "job_seeker") {
    const applicationId = url.searchParams.get("applicationId");
    if (!applicationId) return NextResponse.json({ error: "applicationId required" }, { status: 400 });

    const application = await Application.findById(applicationId).lean();
    if (!application || application.candidateId?.toString() !== ctx.userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Find matching templates
    const templates = await SurveyTemplate.find({
      employerId: application.employerId,
      isActive: true,
    }).lean();

    return NextResponse.json({ templates });
  }

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  if (type === "responses") {
    const responses = await SurveyResponse.find({ employerId: employer._id })
      .sort({ submittedAt: -1 })
      .limit(100)
      .lean();

    // Aggregate stats
    const avgRating = responses.length > 0
      ? responses.reduce((sum, r) => sum + (r.overallRating || 0), 0) / responses.filter((r) => r.overallRating).length
      : 0;

    return NextResponse.json({ responses, stats: { total: responses.length, avgRating: Math.round(avgRating * 10) / 10 } });
  }

  const templates = await SurveyTemplate.find({ employerId: employer._id }).sort({ createdAt: -1 }).lean();

  return NextResponse.json({ templates });
}

// POST: Create template or submit response
async function postHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();

  const body = await req.json();

  // Candidate submitting a survey response
  if (body.type === "response") {
    const { surveyTemplateId, applicationId, answers, overallRating, comment } = body;
    if (!surveyTemplateId || !applicationId) {
      return NextResponse.json({ error: "surveyTemplateId and applicationId required" }, { status: 400 });
    }

    const application = await Application.findById(applicationId).lean();
    if (!application || application.candidateId?.toString() !== ctx.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const template = await SurveyTemplate.findById(surveyTemplateId).lean();
    if (!template) return NextResponse.json({ error: "Survey not found" }, { status: 404 });

    const response = await SurveyResponse.create({
      surveyTemplateId: new mongoose.Types.ObjectId(surveyTemplateId),
      applicationId: new mongoose.Types.ObjectId(applicationId),
      employerId: template.employerId,
      candidateId: new mongoose.Types.ObjectId(ctx.userId),
      answers: answers || [],
      overallRating: overallRating ? Math.min(5, Math.max(1, overallRating)) : undefined,
      comment: comment ? comment.trim() : undefined,
      trigger: template.trigger,
    });

    return NextResponse.json({ response, message: "Thank you for your feedback!" }, { status: 201 });
  }

  // Employer creating a survey template
  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const { name, trigger, questions, sendDelayHours } = body;
  if (!name || !trigger) return NextResponse.json({ error: "name and trigger required" }, { status: 400 });

  const template = await SurveyTemplate.create({
    employerId: employer._id,
    name: name.trim(),
    trigger,
    questions: (questions || []).slice(0, 20).map((q: { text?: string; type?: string; options?: string[]; required?: boolean }, i: number) => ({
      id: `q_${i + 1}`,
      text: q.text || "",
      type: q.type || "rating",
      options: q.options?.slice(0, 10).map((o: string) => o) || [],
      required: q.required !== false,
      order: i + 1,
    })),
    isActive: true,
    sendDelayHours: sendDelayHours || 24,
    createdBy: new mongoose.Types.ObjectId(ctx.userId),
  });

  await logActivity({ action: "survey_template.created", actorId: ctx.userId, resource: "SurveyTemplate", resourceId: template._id.toString(), meta: { name, trigger } });

  return NextResponse.json({ template }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
