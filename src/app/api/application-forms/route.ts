import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import ApplicationForm from "@/models/ApplicationForm";
import Employer from "@/models/Employer";
import { logActivity } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { applicationFormCreateSchema } from "@/lib/validators/application-forms";
import mongoose from "mongoose";

async function getHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");

  const filter: Record<string, unknown> = { employerId: employer._id };
  if (jobId && mongoose.isValidObjectId(jobId)) filter.jobId = new mongoose.Types.ObjectId(jobId);

  const forms = await ApplicationForm.find(filter).sort({ isDefault: -1, createdAt: -1 }).lean();

  return NextResponse.json({ forms });
}

async function postHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const body = await validateBody(req, applicationFormCreateSchema);

  const fields = body.fields.map((f, i) => ({
    label: f.label,
    key: f.key || `field_${i}`,
    type: f.type,
    required: f.required,
    placeholder: f.placeholder,
    helpText: f.helpText,
    options: f.options ?? [],
    order: f.order ?? i,
  }));

  const form = await ApplicationForm.create({
    employerId: employer._id,
    jobId: body.jobId ? new mongoose.Types.ObjectId(body.jobId) : undefined,
    name: body.name,
    description: body.description,
    fields,
    isDefault: body.isDefault,
    collectResume: body.collectResume,
    collectCoverLetter: body.collectCoverLetter,
    collectLinkedIn: body.collectLinkedIn,
    collectPortfolio: body.collectPortfolio,
    createdBy: new mongoose.Types.ObjectId(ctx.userId),
  });

  await logActivity({ action: "application_form.created", actorId: ctx.userId, resource: "ApplicationForm", resourceId: form._id.toString(), meta: { name: body.name, fieldCount: fields.length } });

  return NextResponse.json({ form }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
