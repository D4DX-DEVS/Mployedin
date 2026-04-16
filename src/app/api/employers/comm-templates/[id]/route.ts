import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { validateBody } from "@/lib/validators";
import { commTemplateUpdateSchema } from "@/lib/validators/employers";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { Employer } from "@/models/Employer";
import CommTemplate from "@/models/CommTemplate";
import type { UserRole } from "@/models/User";
import { isValidObjectId } from "@/lib/security/sanitize";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const templateId = params?.id;
  if (!isValidObjectId(templateId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  await connectDB();

  // Get employer for this user
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) {
    return NextResponse.json(
      { error: "Employer profile not found" },
      { status: 404 }
    );
  }

  // Fetch template and verify ownership
  const template = await CommTemplate.findById(templateId).lean();
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  if (String(template.employerId) !== String(employer._id)) {
    return NextResponse.json(
      { error: "Not authorized to access this template" },
      { status: 403 }
    );
  }

  return NextResponse.json({ template });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const templateId = params?.id;
  if (!isValidObjectId(templateId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  await connectDB();

  // Get employer for this user
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) {
    return NextResponse.json(
      { error: "Employer profile not found" },
      { status: 404 }
    );
  }

  // Fetch template and verify ownership
  const template = await CommTemplate.findById(templateId);
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  if (String(template.employerId) !== String(employer._id)) {
    return NextResponse.json(
      { error: "Not authorized to access this template" },
      { status: 403 }
    );
  }

  const body = await validateBody(req, commTemplateUpdateSchema);
  const { name, type, subject, body: templateBody, isDefault } = body;

  const allowedUpdates = ["name", "type", "subject", "body", "isDefault"];
  const update: Record<string, unknown> = {};

  if (name !== undefined) update.name = name;
  if (type !== undefined) update.type = type;
  if (subject !== undefined) update.subject = subject;
  if (templateBody !== undefined) update.body = templateBody;
  if (isDefault !== undefined) update.isDefault = isDefault;

  Object.assign(template, update);
  await template.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "template.update",
    resource: "employers",
    resourceId: String(employer._id),
    changes: { after: update },
    req,
  });

  return NextResponse.json({ template });
}

async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const templateId = params?.id;
  if (!isValidObjectId(templateId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  await connectDB();

  // Get employer for this user
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) {
    return NextResponse.json(
      { error: "Employer profile not found" },
      { status: 404 }
    );
  }

  // Fetch template and verify ownership
  const template = await CommTemplate.findById(templateId);
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  if (String(template.employerId) !== String(employer._id)) {
    return NextResponse.json(
      { error: "Not authorized to access this template" },
      { status: 403 }
    );
  }

  await CommTemplate.deleteOne({ _id: templateId });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "template.delete",
    resource: "employers",
    resourceId: String(employer._id),
    req,
  });

  return NextResponse.json({ message: "Template deleted" });
}

export const GET = withAuth(getHandler, { resource: "employers", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "employers", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "employers", action: "update" });
