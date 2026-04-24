import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import mongoose from "mongoose";

const JobTemplateSchema = new mongoose.Schema({
  employerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true },
  title: { type: String, required: true },
  description: String,
  requirements: String,
  jobType: { type: String, default: "full_time" },
  experienceLevel: { type: String, default: "mid" },
  skills: [String],
  usageCount: { type: Number, default: 0 },
}, { timestamps: true });

const JobTemplate = mongoose.models.JobTemplate || mongoose.model("JobTemplate", JobTemplateSchema);

async function getHandler(req: NextRequest, ctx: AuthContext) {
  await connectDB();
  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? "";

  const filter: Record<string, unknown> = { employerId: ctx.userId };
  if (search) filter.name = { $regex: search, $options: "i" };

  const items = await JobTemplate.find(filter).sort({ updatedAt: -1 }).limit(100).lean();

  return NextResponse.json({
    items: items.map((t: Record<string, unknown>) => ({
      _id: String(t._id),
      name: t.name,
      title: t.title,
      description: t.description,
      requirements: t.requirements,
      jobType: t.jobType,
      experienceLevel: t.experienceLevel,
      skills: t.skills,
      usageCount: t.usageCount,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
  });
}

async function postHandler(req: NextRequest, ctx: AuthContext) {
  await connectDB();
  const body = await req.json();
  const { name, title, description, requirements, jobType, experienceLevel, skills } = body;

  if (!name || !title) {
    return NextResponse.json({ error: "Name and title required" }, { status: 400 });
  }

  const tmpl = await JobTemplate.create({
    employerId: ctx.userId,
    name: String(name).trim(),
    title: String(title).trim(),
    description: description?.trim(),
    requirements: requirements?.trim(),
    jobType,
    experienceLevel,
    skills: Array.isArray(skills) ? skills.map((s: string) => String(s).trim()) : [],
  });

  return NextResponse.json({ success: true, template: tmpl });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
