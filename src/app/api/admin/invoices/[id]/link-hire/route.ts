/**
 * Link an invoice line to the hire it bills (lineItems[].placementId).
 *
 * GET  — the invoice's lines and the hires each unlinked line could be linked
 *        to: the employer's placements, the line's own job first. Placements
 *        already billed on another line are marked, never offered as free.
 * POST — { lineIndex, placementId, reason? } links one line. Only that line
 *        changes; a linked line is never relinked here. Audited.
 *
 * Admin only. Until linked, a line is left out of revenue targets
 * (lib/targets/kpiCalculator).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import Invoice from "@/models/Invoice";
import Placement from "@/models/Placement";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

const linkSchema = z.object({
  lineIndex: z.number().int().min(0).max(49),
  placementId: z.string().refine((v) => mongoose.isValidObjectId(v), "Invalid hire"),
  reason: z.string().trim().max(500).optional(),
});

interface LeanLine { description: string; amount: number; jobId?: mongoose.Types.ObjectId; placementId?: mongoose.Types.ObjectId }
interface LeanPlacement {
  _id: mongoose.Types.ObjectId;
  jobId: { _id: mongoose.Types.ObjectId; title?: string } | null;
  jobSeekerId: { userId?: { name?: string } } | null;
  placedAt?: Date;
  startDate?: Date;
  status: string;
}

async function billedPlacementIds(placementIds: mongoose.Types.ObjectId[], exceptInvoiceId: string): Promise<Set<string>> {
  if (!placementIds.length) return new Set();
  const others = await Invoice.find({
    _id: { $ne: exceptInvoiceId },
    "lineItems.placementId": { $in: placementIds },
    status: { $nin: ["void", "cancelled", "refunded", "credit_note"] },
  })
    .select("lineItems.placementId")
    .lean();
  return new Set(others.flatMap((inv) => (inv.lineItems ?? []).flatMap((li: { placementId?: unknown }) => (li.placementId ? [String(li.placementId)] : []))));
}

async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = params?.id;
  if (!id || !mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid invoice" }, { status: 400 });
  await connectDB();

  const invoice = await Invoice.findById(id).select("invoiceNumber employerId jobId lineItems category").lean();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (!invoice.employerId) return NextResponse.json({ lines: [], hires: [] });

  const placements = (await Placement.find({ employerId: invoice.employerId })
    .populate("jobId", "title")
    .populate({ path: "jobSeekerId", select: "userId", populate: { path: "userId", select: "name" } })
    .select("jobId jobSeekerId placedAt startDate status")
    .sort({ placedAt: -1 })
    .limit(200)
    .lean()) as unknown as LeanPlacement[];
  const billed = await billedPlacementIds(placements.map((p) => p._id), id);
  const ownLinked = new Set((invoice.lineItems ?? []).flatMap((li: LeanLine) => (li.placementId ? [String(li.placementId)] : [])));

  return NextResponse.json({
    invoiceNumber: invoice.invoiceNumber,
    lines: (invoice.lineItems ?? []).map((li: LeanLine, index: number) => ({
      index,
      description: li.description,
      amount: li.amount,
      jobId: li.jobId ? String(li.jobId) : invoice.jobId ? String(invoice.jobId) : null,
      placementId: li.placementId ? String(li.placementId) : null,
    })),
    hires: placements.map((p) => ({
      id: String(p._id),
      jobId: p.jobId?._id ? String(p.jobId._id) : null,
      jobTitle: p.jobId?.title ?? null,
      candidateName: p.jobSeekerId?.userId?.name ?? null,
      startDate: p.startDate ?? p.placedAt ?? null,
      status: p.status,
      billedElsewhere: billed.has(String(p._id)) || ownLinked.has(String(p._id)),
    })),
  });
}

async function postHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = params?.id;
  if (!id || !mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid invoice" }, { status: 400 });
  await connectDB();
  const body = await validateBody(req, linkSchema);

  const invoice = await Invoice.findById(id).select("invoiceNumber employerId jobId lineItems status").lean();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  const line = (invoice.lineItems ?? [])[body.lineIndex] as LeanLine | undefined;
  if (!line) return NextResponse.json({ error: "That line is not on this invoice" }, { status: 400 });
  if (line.placementId) return NextResponse.json({ error: "This line is already linked to a hire" }, { status: 409 });

  const placement = await Placement.findById(body.placementId).select("employerId jobId").lean();
  if (!placement || String(placement.employerId) !== String(invoice.employerId)) {
    return NextResponse.json({ error: "That hire is not with this invoice's employer" }, { status: 400 });
  }
  const lineJob = line.jobId ?? invoice.jobId;
  if (lineJob && String(lineJob) !== String(placement.jobId)) {
    return NextResponse.json({ error: "That hire is on a different job than this line" }, { status: 400 });
  }
  const sameInvoice = (invoice.lineItems ?? []).some((li: LeanLine) => li.placementId && String(li.placementId) === body.placementId);
  const billed = await billedPlacementIds([new mongoose.Types.ObjectId(body.placementId)], id);
  if (sameInvoice || billed.size) {
    return NextResponse.json({ error: "That hire is already billed on another line" }, { status: 409 });
  }

  // Only this line, and only while it is still unlinked (no lost update).
  const path = `lineItems.${body.lineIndex}`;
  const now = new Date();
  const res = await Invoice.updateOne(
    { _id: id, [`${path}.placementId`]: null },
    {
      $set: {
        [`${path}.placementId`]: new mongoose.Types.ObjectId(body.placementId),
        [`${path}.placementLinkedBy`]: new mongoose.Types.ObjectId(ctx.userId),
        [`${path}.placementLinkedAt`]: now,
      },
    },
  );
  if (!res.modifiedCount) return NextResponse.json({ error: "This line is already linked to a hire" }, { status: 409 });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "invoice.line_hire_linked",
    resource: "invoices",
    resourceId: id,
    changes: { before: { placementId: null }, after: { placementId: body.placementId } },
    meta: { invoiceNumber: invoice.invoiceNumber, lineIndex: body.lineIndex, reason: body.reason },
    req,
  });

  return NextResponse.json({ success: true, lineIndex: body.lineIndex, placementId: body.placementId, linkedAt: now });
}

export const GET = withAuth(getHandler, { resource: "invoices", action: "read" });
export const POST = withAuth(postHandler, { resource: "invoices", action: "update" });
