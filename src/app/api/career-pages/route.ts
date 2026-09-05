import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { withSubscription } from "@/lib/subscription/withSubscription";
import CareerPage from "@/models/CareerPage";
import Employer from "@/models/Employer";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import mongoose from "mongoose";

async function getHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const page = await CareerPage.findOne({ employerId: employer._id }).lean();

  return NextResponse.json({ page: page || null });
}

async function postHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const existing = await CareerPage.findOne({ employerId: employer._id });
  if (existing) return NextResponse.json({ error: "Career page already exists. Use PATCH to update." }, { status: 409 });

  const body = await req.json();
  const slug = body.slug?.trim().toLowerCase().replace(/[^a-z0-9-]/g, "") || "";
  if (!slug || slug.length < 3) return NextResponse.json({ error: "Slug required (min 3 chars, alphanumeric)" }, { status: 400 });

  const slugTaken = await CareerPage.findOne({ slug });
  if (slugTaken) return NextResponse.json({ error: "Slug already taken" }, { status: 409 });

  const page = await CareerPage.create({
    employerId: employer._id,
    slug,
    title: body.title?.trim() || employer.companyName || "Careers",
    metaDescription: body.metaDescription?.trim() || "",
    logoUrl: body.logoUrl || "",
    coverImageUrl: body.coverImageUrl || "",
    theme: body.theme || {},
    sections: (body.sections || []).slice(0, 12).map((s: { type?: string; title?: string; content?: string; order?: number; items?: unknown[] }, i: number) => ({
      type: s.type || "custom",
      title: s.title || "",
      content: s.content || "",
      order: s.order ?? i,
      items: Array.isArray(s.items) ? s.items.slice(0, 10) : [],
      isVisible: true,
    })),
    isPublished: false,
    createdBy: new mongoose.Types.ObjectId(ctx.userId),
  });

  await logActivity({ action: "career_page.created", ...actorFromCtx(ctx), resource: "CareerPage", resourceId: page._id.toString(), meta: { slug } });

  return NextResponse.json({ page }, { status: 201 });
}

async function patchHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const page = await CareerPage.findOne({ employerId: employer._id });
  if (!page) return NextResponse.json({ error: "No career page found. Create one first." }, { status: 404 });

  const body = await req.json();

  if (body.title) page.title = body.title.trim();
  if (body.metaDescription !== undefined) page.metaDescription = body.metaDescription.trim();
  if (body.logoUrl !== undefined) page.logoUrl = body.logoUrl;
  if (body.coverImageUrl !== undefined) page.coverImageUrl = body.coverImageUrl;
  if (body.theme) page.theme = { ...page.theme, ...body.theme };
  if (body.sections) {
    page.sections = body.sections.slice(0, 12).map((s: { type?: string; title?: string; content?: string; imageUrl?: string; order?: number; items?: unknown[]; isVisible?: boolean }, i: number) => ({
      type: s.type || "custom",
      title: s.title || "",
      content: s.content || "",
      imageUrl: s.imageUrl || "",
      order: s.order ?? i,
      items: Array.isArray(s.items) ? s.items.slice(0, 10) : [],
      isVisible: s.isVisible !== false,
    }));
  }
  if (body.isPublished !== undefined) page.isPublished = body.isPublished;
  if (body.socialLinks) page.socialLinks = body.socialLinks;

  await page.save();

  return NextResponse.json({ page });
}

export const GET = withAuth(getHandler);
// Building or editing the branded page is the `brandedCompanyPage` entitlement.
// Reading it, and the public /[slug] render of an already-published page, stay open.
const BRANDED_PAGE_GATE = { type: "toggle", feature: "brandedCompanyPage" } as const;
export const POST = withAuth(withSubscription(postHandler, BRANDED_PAGE_GATE), { resource: "employers", action: "update" });
export const PATCH = withAuth(withSubscription(patchHandler, BRANDED_PAGE_GATE), { resource: "employers", action: "update" });
