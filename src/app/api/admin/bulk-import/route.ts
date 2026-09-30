import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import Job from "@/models/Job";
import Employer from "@/models/Employer";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { bulkImportSchema } from "@/lib/validators/bulk-import";
import { escapeRegex } from "@/lib/security/sanitize";
import { sanitizeHtml } from "@/lib/security/sanitize-html";
import { validateImportRow, jobDraftFromRow, type RowIssue } from "@/lib/admin/bulkImport";

/** A password nobody knows: imported people set their own with "Forgot password". */
async function unusablePasswordHash(): Promise<string> {
  const crypto = await import("crypto");
  const bcrypt = await import("bcryptjs");
  return bcrypt.hash(crypto.randomBytes(32).toString("base64url"), 12);
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

  let success = 0;
  let failed = 0;
  // `code` + `params` let the page say what went wrong in the admin's language;
  // `message` stays for API callers.
  const errors: { row: number; code: RowIssue["code"]; params?: Record<string, string>; message: string }[] = [];
  const reject = (row: number, issue: RowIssue, message: string) => {
    errors.push({ row, code: issue.code, ...(issue.params ? { params: issue.params } : {}), message });
    failed++;
  };

  for (let i = 0; i < rows.length; i++) {
    try {
      const row = rows[i];
      const issues = validateImportRow(type, row);
      if (issues.length > 0) {
        reject(i + 1, issues[0], `Row rejected: ${issues[0].code}`);
        continue;
      }

      switch (type) {
        case "users": {
          // Job seekers only (see BULK_IMPORT_TEMPLATES). The account needs a
          // JobSeeker profile like any other seeker, or its pages 404.
          const email = row.email.trim().toLowerCase();
          if (await User.findOne({ email })) {
            reject(i + 1, { code: "email_exists" }, "Email already exists");
            continue;
          }
          const user = await User.create({
            name: row.fullName.trim(),
            email,
            passwordHash: await unusablePasswordHash(),
            role: "job_seeker",
            phone: row.phone?.trim() || undefined,
            country: row.country?.trim() || undefined,
            isActive: true,
          });
          try {
            const JobSeeker = (await import("@/models/JobSeeker")).default;
            await JobSeeker.create({ userId: user._id, fullName: row.fullName.trim(), isOnboarded: false });
          } catch (profileErr) {
            await User.findByIdAndDelete(user._id);
            throw profileErr;
          }
          success++;
          break;
        }
        case "jobs": {
          // A job belongs to an employer; the company column names one, by
          // company email or by exact company name.
          const company = row.company.trim();
          const filter = company.includes("@")
            ? { companyEmail: company.toLowerCase() }
            : { companyName: { $regex: `^${escapeRegex(company)}$`, $options: "i" } };
          const matches = await Employer.find(filter).select("_id").limit(2).lean();
          if (matches.length === 0) {
            reject(i + 1, { code: "employer_not_found", params: { company } }, `No employer matches "${company}"`);
            continue;
          }
          if (matches.length > 1) {
            reject(i + 1, { code: "employer_ambiguous", params: { company } }, `More than one employer matches "${company}"`);
            continue;
          }
          const draft = jobDraftFromRow(row);
          const job = new Job({
            ...draft,
            description: sanitizeHtml(draft.description),
            employerId: matches[0]._id,
            status: "draft",
          });
          await job.save();
          success++;
          break;
        }
        case "employers": {
          const companyEmail = (row.email ?? "").toString().trim().toLowerCase();
          const companyName = (row.companyName ?? "").toString().trim();
          // De-dup by the Employer's required companyEmail (schema has unique on
          // userId; the email uniqueness is enforced at the User layer below via
          // duplicate-key 11000 handling in the catch).
          const existingEmployer = await Employer.findOne({ companyEmail }).lean();
          if (existingEmployer) {
            reject(i + 1, { code: "email_exists" }, "Employer email already exists");
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
          reject(i + 1, { code: "failed" }, "Unknown import type");
      }
    } catch (err: unknown) {
      const isDupKey = (err as { code?: number })?.code === 11000;
      reject(i + 1, { code: isDupKey ? "duplicate" : "failed" }, isDupKey ? "Duplicate record" : "Import failed");
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
