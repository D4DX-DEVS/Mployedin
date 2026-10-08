import { connectDB } from "@/lib/db/mongoose";
import { escapeRegex } from "@/lib/security/sanitize";
import User from "@/models/User";
import Employer from "@/models/Employer";
import Job from "@/models/Job";
import Lead from "@/models/Lead";
import { badRequest } from "./errors";
import { sanitizeOutput } from "./redact";
import type { InsightsAccess } from "./types";

const PER_ENTITY = 10;

/**
 * Cross-entity name lookup: job titles, employer and lead company names, and —
 * only with pii:read — user names / e-mails. Use it to turn a name the user
 * typed into ids for the list / query endpoints.
 */
export async function searchAll(q: string | null | undefined, access: InsightsAccess) {
  const term = (q ?? "").trim();
  if (term.length < 2) throw badRequest("invalid_param", "q must be at least 2 characters");
  if (term.length > 200) throw badRequest("invalid_param", "q must be ≤ 200 characters");
  const rx = { $regex: escapeRegex(term), $options: "i" };

  await connectDB();
  const [jobs, employers, leads, users] = await Promise.all([
    Job.find({ deletedAt: null, title: rx })
      .select("title status employerId location.country location.city createdAt")
      .sort({ createdAt: -1 })
      .limit(PER_ENTITY)
      .lean(),
    Employer.find({ companyName: rx })
      .select("companyName country city industry verificationLevel isActive createdAt")
      .sort({ createdAt: -1 })
      .limit(PER_ENTITY)
      .lean(),
    Lead.find({ companyName: rx })
      .select("companyName status agentId country createdAt")
      .sort({ createdAt: -1 })
      .limit(PER_ENTITY)
      .lean(),
    access.pii
      ? User.find({ $or: [{ name: rx }, { email: rx }] })
          .select("name email role isActive createdAt")
          .sort({ createdAt: -1 })
          .limit(PER_ENTITY)
          .lean()
      : Promise.resolve(null),
  ]);

  return sanitizeOutput(
    {
      q: term,
      jobs,
      employers,
      leads,
      users: users ?? { skipped: true, reason: "User search requires the pii:read scope" },
    },
    access.pii,
  ) as Record<string, unknown>;
}
