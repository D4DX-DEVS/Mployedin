/**
 * GET /api/admin/export/financial — Server-side financial data export.
 *
 * Query params:
 *   type: "invoices" | "commissions" | "both" (default: "both")
 *   dateFrom: ISO date string
 *   dateTo: ISO date string
 *   format: "json" | "csv" (default: "json")
 *
 * Returns JSON or CSV with all financial records matching the filters.
 * Suitable for importing into external accounting systems.
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Invoice from "@/models/Invoice";
import Commission from "@/models/Commission";
import "@/models/Employer";
import "@/models/Agent";
import "@/models/SuperAgent";

interface AuthCtx { userId: string; role: string; locale: string }

async function handler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "both";
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const format = searchParams.get("format") ?? "json";

  const dateFilter: Record<string, unknown> = {};
  if (dateFrom) dateFilter.$gte = new Date(dateFrom);
  if (dateTo) {
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
    dateFilter.$lte = end;
  }

  let invoices: Record<string, unknown>[] = [];
  let commissions: Record<string, unknown>[] = [];

  if (type === "invoices" || type === "both") {
    const query: Record<string, unknown> = {};
    if (Object.keys(dateFilter).length > 0) query.issuedAt = dateFilter;

    invoices = await Invoice.find(query)
      .populate("employerId", "companyName")
      .populate("agentId", "userId")
      .sort({ issuedAt: -1 })
      .lean();
  }

  if (type === "commissions" || type === "both") {
    const query: Record<string, unknown> = {};
    if (Object.keys(dateFilter).length > 0) query.createdAt = dateFilter;

    commissions = await Commission.find(query)
      .populate("agentId", "userId commissionRate")
      .populate("superAgentId", "userId overrideRate")
      .sort({ createdAt: -1 })
      .lean();
  }

  // Summary
  const invoiceTotal = invoices.reduce(
    (sum, inv) => sum + ((inv.amount as number) ?? 0),
    0,
  );
  const commissionTotal = commissions.reduce(
    (sum, c) => sum + ((c.amount as number) ?? 0),
    0,
  );

  if (format === "csv") {
    const lines: string[] = [];

    if (type === "invoices" || type === "both") {
      lines.push("--- INVOICES ---");
      lines.push("InvoiceNumber,Category,Type,Amount,Currency,Status,IssuedAt,Employer,Description");
      for (const inv of invoices) {
        const employer = inv.employerId as { companyName?: string } | undefined;
        lines.push(
          [
            inv.invoiceNumber,
            inv.category,
            inv.type,
            inv.amount,
            inv.currency,
            inv.status,
            inv.issuedAt ? new Date(inv.issuedAt as string).toISOString() : "",
            csvEscape(employer?.companyName ?? ""),
            csvEscape((inv.description as string) ?? ""),
          ].join(","),
        );
      }
      lines.push(`Total Invoice Amount,${invoiceTotal}`);
      lines.push("");
    }

    if (type === "commissions" || type === "both") {
      lines.push("--- COMMISSIONS ---");
      lines.push("Type,Amount,Currency,Rate,Status,CreatedAt,PaidAt,PaymentRef,Notes");
      for (const c of commissions) {
        lines.push(
          [
            c.type,
            c.amount,
            c.currency,
            c.rate ?? "",
            c.status,
            c.createdAt ? new Date(c.createdAt as string).toISOString() : "",
            c.paidAt ? new Date(c.paidAt as string).toISOString() : "",
            csvEscape((c.paymentRef as string) ?? ""),
            csvEscape((c.notes as string) ?? ""),
          ].join(","),
        );
      }
      lines.push(`Total Commission Amount,${commissionTotal}`);
    }

    return new NextResponse(lines.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="financial-export-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  }

  // JSON format (default)
  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    filters: { type, dateFrom, dateTo },
    summary: {
      invoiceCount: invoices.length,
      invoiceTotal,
      commissionCount: commissions.length,
      commissionTotal,
    },
    invoices: type === "commissions" ? undefined : invoices,
    commissions: type === "invoices" ? undefined : commissions,
  });
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export const GET = withAuth(handler, { resource: "reports", action: "export" });
