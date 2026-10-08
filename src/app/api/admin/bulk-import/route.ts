import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import Job from "@/models/Job";
import Employer from "@/models/Employer";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { bulkImportSchema } from "@/lib/validators/bulk-import";
import { CompanyUser, getDefaultPermissions } from "@/models/CompanyUser";
import { autoAssignDefaultPlan } from "@/lib/subscription/autoAssign";
import { sendEmail, EmailTemplates } from "@/lib/communications/email";
import { isValidObjectId } from "@/lib/security/sanitize";
import logger from "@/lib/logger";

const EMPLOYMENT_TYPES = new Set(["full_time", "part_time", "contract", "internship", "freelance", "walk_in"]);

/** "Dubai, UAE" → { city, country }; explicit city/country columns win. */
function parseJobLocation(row: Record<string, string>): { city: string; country: string } | null {
  const city = (row.city ?? "").trim();
  const country = (row.country ?? "").trim();
  if (city && country) return { city, country };
  const parts = (row.location ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return { city: parts.slice(0, -1).join(", "), country: parts[parts.length - 1] };
}

/** "5000" or "5000-8000" (commas allowed) → { min, max, currency }; blank → null. */
function parseJobSalary(
  row: Record<string, string>,
): { min: number; max: number; currency?: string } | null | "invalid" {
  const raw = (row.salary ?? "").replace(/,/g, "").trim();
  if (!raw) return null;
  const nums = raw.split(/\s*[-–]\s*/).map(Number);
  if (nums.length > 2 || nums.some((n) => !Number.isFinite(n) || n < 0)) return "invalid";
  const [min, max = nums[0]] = nums;
  if (max < min) return "invalid";
  const currency = (row.currency ?? "").trim().toUpperCase();
  return { min, max, ...(currency.length === 3 ? { currency } : {}) };
}

/* ------------------------------------------------------------------ */
/*  POST /api/admin/bulk-import — Bulk import records                  */
/* ------------------------------------------------------------------ */

async function handler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const { type, rows } = await validateBody(req, bulkImportSchema);

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXTAUTH_URL ?? "https://mployedin.com";
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
          // AD-3: every job belongs to an employer (Employer.employerId is
          // required) — the old branch never set it, so every row failed.
          const employerIdCol = (row.employerId ?? "").toString().trim();
          const employerEmail = (row.employerEmail ?? "").toString().trim().toLowerCase();
          const employer = employerIdCol && isValidObjectId(employerIdCol)
            ? await Employer.findById(employerIdCol).select("_id agentId").lean()
            : employerEmail
              ? await Employer.findOne({ companyEmail: employerEmail }).select("_id agentId").lean()
              : null;
          if (!employer) {
            errors.push({
              row: i + 1,
              message: employerIdCol || employerEmail
                ? "Employer not found for employerId / employerEmail"
                : "employerEmail (or employerId) column is required",
            });
            failed++;
            continue;
          }
          const title = (row.title ?? "").toString().trim();
          const description = (row.description ?? "").toString().trim();
          const location = parseJobLocation(row);
          if (!title || !description) {
            errors.push({ row: i + 1, message: "title and description are required" });
            failed++;
            continue;
          }
          if (!location) {
            errors.push({ row: i + 1, message: "location must be \"City, Country\" (or provide city and country columns)" });
            failed++;
            continue;
          }
          const salary = parseJobSalary(row);
          if (salary === "invalid") {
            errors.push({ row: i + 1, message: "salary must be a number or a range like 5000-8000" });
            failed++;
            continue;
          }
          const employmentType = (row.type || "full_time").toString().trim();
          if (!EMPLOYMENT_TYPES.has(employmentType)) {
            errors.push({ row: i + 1, message: `type must be one of: ${[...EMPLOYMENT_TYPES].join(", ")}` });
            failed++;
            continue;
          }
          await Job.create({
            employerId: employer._id,
            ...(employer.agentId ? { agentId: employer.agentId } : {}),
            title,
            location,
            employmentType,
            ...(salary ? { salary } : {}),
            description,
            status: "draft",
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
          // A random placeholder password nobody knows + a one-time setup token
          // (24h) that is EMAILED to the employer (EC-1) — the old code minted
          // the token and never sent it, so imported employers could not log in.
          const crypto = await import("crypto");
          const bcrypt = await import("bcryptjs");
          const placeholderPassword = crypto.randomBytes(32).toString("base64url");
          const passwordHash = await bcrypt.hash(placeholderPassword, 12);
          const contactName = (row.contactName ?? "").toString().trim() || companyName;
          const rawSetupToken = crypto.randomBytes(32).toString("hex");
          const hashedSetupToken = crypto.createHash("sha256").update(rawSetupToken).digest("hex");
          const createdUser = await User.create({
            name: contactName,
            email: companyEmail,
            passwordHash,
            role: "employer",
            isActive: true,
            isEmailVerified: true,
            phone: (row.phone ?? "").toString().trim() || undefined,
            country: (row.country ?? "").toString().trim() || undefined,
            passwordResetToken: hashedSetupToken,
            passwordResetExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
          });

          // Same shape as POST /api/employers: Employer + owner CompanyUser,
          // rolled back together if either fails.
          try {
            const employer = await Employer.create({
              userId: createdUser._id,
              companyName,
              companyEmail,
              phone: (row.phone ?? "").toString().trim() || undefined,
              industry: (row.industry ?? "").toString().trim() || undefined,
              country: (row.country ?? "").toString().trim() || undefined,
              website: (row.website ?? "").toString().trim() || undefined,
              verificationLevel: "basic",
              createdVia: "admin",
            });
            await CompanyUser.create({
              companyId: employer._id,
              userId: createdUser._id,
              email: companyEmail,
              companyRole: "owner",
              permissions: getDefaultPermissions("owner"),
              invitedBy: createdUser._id,
              invitedAt: new Date(),
              acceptedAt: new Date(),
              status: "active",
            });
          } catch (creationErr) {
            await Promise.allSettled([
              CompanyUser.deleteMany({ userId: createdUser._id }),
              Employer.deleteOne({ userId: createdUser._id }),
              User.deleteOne({ _id: createdUser._id }),
            ]);
            throw creationErr;
          }

          autoAssignDefaultPlan(createdUser._id.toString(), "employer").catch((err) =>
            logger.error({ err, row: i + 1 }, "[Bulk Import] Failed to auto-assign subscription"),
          );

          const setupUrl = `${baseUrl}/${ctx.locale === "ar" ? "ar" : "en"}/reset-password?token=${rawSetupToken}`;
          await sendEmail({
            to: companyEmail,
            ...EmailTemplates.employerAccountSetup(contactName, companyEmail, setupUrl, "MPLOYEDIN Admin"),
            userId: createdUser._id.toString(),
            source: "bulk-import",
            category: "onboarding",
          }).catch((err) => logger.error({ err, row: i + 1 }, "[Bulk Import] Failed to send setup email"));

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
