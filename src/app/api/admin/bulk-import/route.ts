import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import Job from "@/models/Job";
import Employer from "@/models/Employer";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { bulkImportSchema } from "@/lib/validators/bulk-import";

/* ------------------------------------------------------------------ */
/*  POST /api/admin/bulk-import — Bulk import records                  */
/* ------------------------------------------------------------------ */

async function handler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const { type, rows } = await validateBody(req, bulkImportSchema);

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
            name: row.fullName,
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
          const companyEmail = (row.email ?? "").toString().trim().toLowerCase();
          const companyName = (row.companyName ?? "").toString().trim();
          if (!companyEmail || !companyName) {
            errors.push({ row: i + 1, message: "companyName and email are required" });
            failed++;
            continue;
          }
          // De-dup by the Employer's required companyEmail (schema has unique on
          // userId; the email uniqueness is enforced at the User layer below via
          // duplicate-key 11000 handling in the catch).
          const existingEmployer = await Employer.findOne({ companyEmail }).lean();
          if (existingEmployer) {
            errors.push({ row: i + 1, message: "Employer email already exists" });
            failed++;
            continue;
          }

          // M5: create the User record FIRST (Employer.userId is required+unique).
          // Generate a random high-entropy placeholder password & force a password
          // setup via the existing reset-token flow so the admin / employer owner
          // sets their real password on first login.
          const crypto = await import("crypto");
          const bcrypt = await import("bcryptjs");
          const placeholderPassword = crypto.randomBytes(32).toString("base64url");
          const passwordHash = await bcrypt.hash(placeholderPassword, 12);
          const contactName = (row.contactName ?? "").toString().trim() || companyName;
          const createdUser = await User.create({
            name: contactName,
            email: companyEmail,
            passwordHash,
            role: "employer",
            isActive: true,
            isEmailVerified: true,
            phone: (row.phone ?? "").toString().trim() || undefined,
            country: (row.country ?? "").toString().trim() || undefined,
          });

          // Issue a one-time password-setup token (24h) so the employer can set
          // their own password on first sign-in — never email the placeholder.
          const rawSetupToken = crypto.randomBytes(32).toString("hex");
          const hashedSetupToken = crypto.createHash("sha256").update(rawSetupToken).digest("hex");
          await User.findByIdAndUpdate(createdUser._id, {
            passwordResetToken: hashedSetupToken,
            passwordResetExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
          });

          await Employer.create({
            userId: createdUser._id,
            companyName,
            companyEmail,
            phone: (row.phone ?? "").toString().trim() || undefined,
            industry: (row.industry ?? "").toString().trim() || undefined,
            country: (row.country ?? "").toString().trim() || undefined,
            website: (row.website ?? "").toString().trim() || undefined,
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
      const isDupKey = (err as { code?: number })?.code === 11000;
      errors.push({ row: i + 1, message: isDupKey ? "Duplicate record" : "Import failed" });
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
