import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { escapeRegex } from "@/lib/security/sanitize";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import FAQ from "@/models/FAQ";
import type { UserRole } from "@/models/User";
import { validateBody } from "@/lib/validators";
import { faqCreateSchema } from "@/lib/validators/cms";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function getHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "";
  const category = searchParams.get("category") ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "10")));
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = {};
  if (status === "active") query.isActive = true;
  else if (status === "inactive") query.isActive = false;
  if (category) query.category = category;

  if (search) {
    const safe = escapeRegex(search);
    query.$or = [
      { question: { $regex: safe, $options: "i" } },
      { questionAr: { $regex: safe, $options: "i" } },
      { answer: { $regex: safe, $options: "i" } },
    ];
  }

  const [items, total] = await Promise.all([
    FAQ.find(query).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    FAQ.countDocuments(query),
  ]);

  return NextResponse.json({
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();
  const body = await validateBody(req, faqCreateSchema);

  const { question, questionAr, answer, answerAr, category, sortOrder, isActive } = body;
  if (!question || !answer) {
    return NextResponse.json({ error: "Question and answer are required" }, { status: 400 });
  }

  const item = await FAQ.create({
    question: question.trim(),
    questionAr: (questionAr ?? "").trim(),
    answer: answer.trim(),
    answerAr: (answerAr ?? "").trim(),
    category: (category ?? "general").trim(),
    sortOrder: sortOrder ?? 0,
    isActive: isActive !== false,
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "faq.create",
    resource: "cms",
    resourceId: item._id?.toString(),
    changes: { after: { question, category } },
    req,
  });

  return NextResponse.json({ item }, { status: 201 });
}

export const GET = withAuth(getHandler, { resource: "cms", action: "read" });
export const POST = withAuth(postHandler, { resource: "cms", action: "create" });
