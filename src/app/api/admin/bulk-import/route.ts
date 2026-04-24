import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import Job from "@/models/Job";
import Employer from "@/models/Employer";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

/* ------------------------------------------------------------------ */
/*  POST /api/admin/bulk-import — Bulk import records                  */
/* ------------------------------------------------------------------ */

async function handler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const body = await req.json();
  const { type, rows } = body as { type: string; rows: Record<string, string>[] };

  if (!type || !rows || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (rows.length > 500) {
    return NextResponse.json({ error: "Maximum 500 rows per import" }, { status: 400 });
  }

  let success = 0;
  let failed = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    try {
      const row = rows[i];

      switch (type) {
        case "users": {
          const exists = await User.findOne({ email: row.email?.toLowerCase() });
          if (exists) {
            errors.push({ row: i + 1, message: "Email already exists" });
            failed++;
            continue;
          }
          await User.create({
            fullName: row.fullName,
            email: row.email?.toLowerCase(),
            phone: row.phone,
            role: row.role || "job_seeker",
            country: row.country,
            isActive: true,
            needsOnboarding: true,
          });
          success++;
          break;
        }
        case "jobs": {
          await Job.create({
            title: row.title,
            companyName: row.company,
            location: row.location,
            employmentType: row.type || "full_time",
            salary: row.salary ? Number(row.salary) : undefined,
            description: row.description,
            status: "draft",
            createdBy: ctx.userId,
          });
          success++;
          break;
        }
        case "employers": {
          const exists = await Employer.findOne({ "contactInfo.email": row.email?.toLowerCase() });
          if (exists) {
            errors.push({ row: i + 1, message: "Employer email already exists" });
            failed++;
            continue;
          }
          await Employer.create({
            companyName: row.companyName,
            industry: row.industry,
            contactInfo: { email: row.email?.toLowerCase(), phone: row.phone },
            country: row.country,
            website: row.website,
            verificationLevel: "basic",
          });
          success++;
          break;
        }
        default:
          errors.push({ row: i + 1, message: "Unknown import type" });
          failed++;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      errors.push({ row: i + 1, message });
      failed++;
    }
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "bulk_import",
    resource: type,
    meta: { type, success, failed, totalRows: rows.length },
    req,
  });

  return NextResponse.json({ success, failed, errors });
}

export const POST = withAuth(handler, { resource: "users", action: "create" });
