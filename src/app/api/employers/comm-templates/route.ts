import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { withSubscription } from "@/lib/subscription/withSubscription";
import { validateBody } from "@/lib/validators";
import { commTemplateCreateSchema } from "@/lib/validators/employers";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { Employer } from "@/models/Employer";
import CommTemplate from "@/models/CommTemplate";
import type { UserRole } from "@/models/User";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

async function getHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");

  // Get employer for this user
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) {
    return NextResponse.json(
      { error: "Employer profile not found" },
      { status: 404 }
    );
  }

  const query: Record<string, unknown> = { employerId: employer._id };
  if (type && ["rejection", "invite", "followup", "offer"].includes(type)) {
    query.type = type;
  }

  const templates = await CommTemplate.find(query).sort({ createdAt: -1 }).lean();

  return NextResponse.json({ templates });
}

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  // Get employer for this user
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) {
    return NextResponse.json(
      { error: "Employer profile not found" },
      { status: 404 }
    );
  }

  const body = await validateBody(req, commTemplateCreateSchema);
  const { name, type, subject, body: templateBody, isDefault } = body;

  // Create the template
  const template = await CommTemplate.create({
    employerId: employer._id,
    name,
    type,
    subject,
    body: templateBody,
    isDefault: isDefault ?? false,
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "template.create",
    resource: "employers",
    resourceId: String(employer._id),
    req,
  });

  return NextResponse.json({ template }, { status: 201 });
}

// Communication templates are a plan entitlement (`commTemplates`). The page
// hides itself client-side; this is the server-side gate that actually holds.
const COMM_TEMPLATES_GATE = { type: "toggle", feature: "commTemplates" } as const;

export const GET = withAuth(withSubscription(getHandler, COMM_TEMPLATES_GATE), { resource: "employers", action: "read" });
export const POST = withAuth(withSubscription(postHandler, COMM_TEMPLATES_GATE), { resource: "employers", action: "update" });
