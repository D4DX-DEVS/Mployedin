import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import OfferLetter, { OfferLetterTemplate } from "@/models/OfferLetter";
import Employer from "@/models/Employer";
import Offer from "@/models/Offer";
import { logActivity } from "@/lib/audit/log";
import mongoose from "mongoose";

// --- Templates ---
async function getHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const url = new URL(req.url);
  const type = url.searchParams.get("type");

  if (type === "letters") {
    const letters = await OfferLetter.find({ employerId: employer._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return NextResponse.json({ letters });
  }

  const templates = await OfferLetterTemplate.find({ employerId: employer._id })
    .sort({ isDefault: -1, updatedAt: -1 })
    .lean();

  return NextResponse.json({ templates });
}

async function postHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const body = await req.json();

  // Create template
  if (body.type === "template") {
    const name = body.name?.trim();
    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

    const template = await OfferLetterTemplate.create({
      employerId: employer._id,
      name,
      content: body.content || "",
      variables: (body.variables || []).slice(0, 20).map((v: { key?: string; label?: string; defaultValue?: string }) => ({
        key: v.key || "",
        label: v.label || "",
        defaultValue: v.defaultValue ? v.defaultValue : undefined,
      })),
      isDefault: body.isDefault || false,
      createdBy: new mongoose.Types.ObjectId(ctx.userId),
    });

    return NextResponse.json({ template }, { status: 201 });
  }

  // Generate offer letter from template
  const { offerId, templateId, candidateName, candidateEmail, variableValues } = body;
  if (!offerId || !candidateName || !candidateEmail) {
    return NextResponse.json({ error: "offerId, candidateName, candidateEmail required" }, { status: 400 });
  }
  if (!mongoose.isValidObjectId(offerId)) {
    return NextResponse.json({ error: "Invalid offerId" }, { status: 400 });
  }

  // Ownership: the offer must belong to the caller's employer. Without this an
  // employer could attach a letter to another employer's offer (cross-tenant IDOR).
  const offer = await Offer.findById(offerId).select("employerId").lean();
  if (!offer || String((offer as { employerId?: unknown }).employerId) !== String(employer._id)) {
    return NextResponse.json({ error: "Offer not found or not yours" }, { status: 403 });
  }

  let content = body.content || "";
  if (templateId && mongoose.isValidObjectId(templateId)) {
    // Scope to this employer — never render another employer's private template.
    const template = await OfferLetterTemplate.findOne({ _id: templateId, employerId: employer._id }).lean();
    if (template) {
      content = template.content;
      // Replace variables
      if (variableValues) {
        Object.entries(variableValues).forEach(([key, value]) => {
          content = content.replace(new RegExp(`{{${key}}}`, "g"), String(value));
        });
      }
    }
  }

  const letter = await OfferLetter.create({
    offerId: new mongoose.Types.ObjectId(offerId),
    employerId: employer._id,
    templateId: templateId ? new mongoose.Types.ObjectId(templateId) : undefined,
    candidateName: candidateName,
    candidateEmail: candidateEmail,
    content,
    variableValues: variableValues || {},
    status: "draft",
    createdBy: new mongoose.Types.ObjectId(ctx.userId),
  });

  await logActivity({ action: "offer_letter.created", actorId: ctx.userId, resource: "OfferLetter", resourceId: letter._id.toString(), meta: { offerId, candidateName } });

  return NextResponse.json({ letter }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
