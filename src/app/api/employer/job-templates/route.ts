import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { escapeRegex } from "@/lib/security/sanitize";
import { validateBody } from "@/lib/validators";
import mongoose from "mongoose";
import { z } from "zod";

const jobTemplateInlineSchema = z.object({
  name: z.string().min(1, "Name is required").max(200).trim(),
  title: z.string().min(1, "Title is required").max(200).trim(),
  description: z.string().max(5000).trim().optional(),
  requirements: z.string().max(5000).trim().optional(),
  jobType: z.enum(["full_time", "part_time", "contract", "internship", "freelance"]).default("full_time"),
  experienceLevel: z.enum(["entry", "junior", "mid", "senior", "lead", "executive"]).default("mid"),
  skills: z.array(z.string().max(100).trim()).max(30).default([]),
});

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
  if (search) filter.name = { $regex: escapeRegex(search), $options: "i" };

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
  const body = await validateBody(req, jobTemplateInlineSchema);

  const tmpl = await JobTemplate.create({
    employerId: ctx.userId,
    name: body.name,
    title: body.title,
    description: body.description,
    requirements: body.requirements,
    jobType: body.jobType,
    experienceLevel: body.experienceLevel,
    skills: body.skills,
  });

  return NextResponse.json({ success: true, template: tmpl });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
