import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import ApplicationForm from "@/models/ApplicationForm";
import Employer from "@/models/Employer";
import { validateBody } from "@/lib/validators";
import { applicationFormUpdateSchema } from "@/lib/validators/application-forms";
import mongoose from "mongoose";

async function getHandler(req: NextRequest, ctx: { userId: string; role: string }, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id || "";
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await ApplicationForm.findOne({ _id: id, employerId: employer._id }).lean();
  if (!form) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ form });
}

async function patchHandler(req: NextRequest, ctx: { userId: string; role: string }, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id || "";
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const form = await ApplicationForm.findOne({ _id: id, employerId: employer._id });
  if (!form) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await validateBody(req, applicationFormUpdateSchema);

  if (body.name) form.name = body.name;
  if (body.description !== undefined) form.description = body.description;
  if (body.fields) {
    form.fields = body.fields.map((f, i) => ({
      label: f.label,
      key: f.key || `field_${i}`,
      type: f.type,
      required: f.required,
      placeholder: f.placeholder,
      helpText: f.helpText,
      options: f.options ?? [],
      order: f.order ?? i,
    }));
  }
  if (body.collectResume !== undefined) form.collectResume = body.collectResume;
  if (body.collectCoverLetter !== undefined) form.collectCoverLetter = body.collectCoverLetter;
  if (body.collectLinkedIn !== undefined) form.collectLinkedIn = body.collectLinkedIn;
  if (body.collectPortfolio !== undefined) form.collectPortfolio = body.collectPortfolio;
  if (body.isDefault !== undefined) form.isDefault = body.isDefault;

  await form.save();

  return NextResponse.json({ form });
}

async function deleteHandler(req: NextRequest, ctx: { userId: string; role: string }, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id || "";
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  await ApplicationForm.findOneAndDelete({ _id: id, employerId: employer._id });

  return NextResponse.json({ message: "Form deleted" });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
