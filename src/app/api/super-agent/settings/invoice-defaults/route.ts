import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import SuperAgent from "@/models/SuperAgent";
import { validateBody } from "@/lib/validators";
import { invoiceDefaultsUpdateSchema } from "@/lib/validators/settings";
import type { UserRole } from "@/models/User";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "super_agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const profile = await SuperAgent.findOne({ userId: ctx.userId })
    .select("invoiceDefaults country currencyCode")
    .lean();

  const defaults = profile?.invoiceDefaults ?? {};

  return NextResponse.json({
    invoiceDefaults: {
      defaultCurrency: defaults.defaultCurrency ?? profile?.currencyCode ?? "AED",
      defaultPaymentTerms: defaults.defaultPaymentTerms ?? "net_30",
      customPaymentDays: defaults.customPaymentDays ?? 30,
      defaultTaxType: defaults.defaultTaxType ?? "none",
      defaultTaxPercent: defaults.defaultTaxPercent ?? 0,
      defaultCategory: defaults.defaultCategory ?? "recruitment",
      defaultNotes: defaults.defaultNotes ?? "",
      billingCompanyName: defaults.billingCompanyName ?? "",
      billingContactPerson: defaults.billingContactPerson ?? "",
      billingEmail: defaults.billingEmail ?? "",
      billingPhone: defaults.billingPhone ?? "",
      billingAddress: defaults.billingAddress ?? "",
      billingCountry: defaults.billingCountry ?? profile?.country ?? "",
      billingTaxId: defaults.billingTaxId ?? "",
    },
  });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "super_agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const body = await validateBody(req, invoiceDefaultsUpdateSchema);

  const updates: Record<string, unknown> = {};
  const fields = [
    "defaultCurrency", "defaultPaymentTerms", "customPaymentDays",
    "defaultTaxType", "defaultTaxPercent", "defaultCategory", "defaultNotes",
    "billingCompanyName", "billingContactPerson", "billingEmail",
    "billingPhone", "billingAddress", "billingCountry", "billingTaxId",
  ] as const;

  for (const key of fields) {
    if (body[key] != null) {
      updates[`invoiceDefaults.${key}`] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const profile = await SuperAgent.findOneAndUpdate(
    { userId: ctx.userId },
    { $set: updates },
    { returnDocument: "after" },
  )
    .select("invoiceDefaults country currencyCode")
    .lean();

  if (!profile) {
    return NextResponse.json({ error: "Super agent profile not found" }, { status: 404 });
  }

  const defaults = profile.invoiceDefaults ?? {};

  return NextResponse.json({
    invoiceDefaults: {
      defaultCurrency: defaults.defaultCurrency ?? profile.currencyCode ?? "AED",
      defaultPaymentTerms: defaults.defaultPaymentTerms ?? "net_30",
      customPaymentDays: defaults.customPaymentDays ?? 30,
      defaultTaxType: defaults.defaultTaxType ?? "none",
      defaultTaxPercent: defaults.defaultTaxPercent ?? 0,
      defaultCategory: defaults.defaultCategory ?? "recruitment",
      defaultNotes: defaults.defaultNotes ?? "",
      billingCompanyName: defaults.billingCompanyName ?? "",
      billingContactPerson: defaults.billingContactPerson ?? "",
      billingEmail: defaults.billingEmail ?? "",
      billingPhone: defaults.billingPhone ?? "",
      billingAddress: defaults.billingAddress ?? "",
      billingCountry: defaults.billingCountry ?? profile.country ?? "",
      billingTaxId: defaults.billingTaxId ?? "",
    },
  });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
