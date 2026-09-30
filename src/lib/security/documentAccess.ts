/**
 * Document access-control policy (M5).
 *
 * Candidate documents (résumés, certificates, government IDs) are stored as
 * PRIVATE objects and served only through authorized download routes that
 * consult this module. The policy is tiered:
 *
 *   STANDARD tier — résumé / CV, certificates, portfolio, other
 *     ✅ Job Seeker (owner)
 *     ✅ Employer        — only if the candidate applied to that employer's job
 *     ✅ Assigned Agent / Super Agent involved in that application
 *     ✅ Admin
 *
 *   STRICT tier — government ID / passport / national ID
 *     ✅ Job Seeker (owner)
 *     ✅ Admin
 *     ✅ Employer        — ONLY after the candidate reaches the Offer / Hired stage
 *     ✅ Assigned Agent / Super Agent — only at Offer / Hired (verification workflow)
 *     ❌ Employers / agents at application or screening stage
 *
 * The download routes always re-derive the object key from the database
 * (never from a client-supplied URL), so a leaked/guessed URL cannot be used
 * to bypass these checks once the underlying objects are private.
 */

import type { AuthContext } from "@/lib/auth/withAuth";

export type DocTier = "standard" | "strict";

/** Document type/category values that are treated as government identity documents. */
const STRICT_TYPES = new Set([
  "id_document",
  "id",
  "passport",
  "national_id",
  "government_id",
  "govt_id",
]);

/** Application stages at which an employer/agent may access strict-tier documents. */
const OFFER_OR_HIRED = new Set(["offer", "hired"]);

/** Classify a document by its stored `type`/`category` into an access tier. */
export function classifyDocumentTier(typeOrCategory?: string | null): DocTier {
  if (!typeOrCategory) return "standard";
  return STRICT_TYPES.has(typeOrCategory.toLowerCase()) ? "strict" : "standard";
}

/** True when the application has reached the Offer or Hired stage. */
export function isOfferOrHiredStage(status?: string | null): boolean {
  return !!status && OFFER_OR_HIRED.has(status);
}

export interface ApplicationDocumentContext {
  /** JobSeeker.userId of the document owner. */
  ownerUserId: string;
  /** Application.employerId (Employer._id). */
  employerId: string;
  /** Application.agentId (Agent._id), if any. */
  agentId?: string | null;
  /** Current application status. */
  status: string;
  /** Tier of the requested document. */
  tier: DocTier;
}

/**
 * Decide whether the requester may download a document that is attached to,
 * or justified by, a specific application. Performs the minimum DB lookups
 * needed to resolve the requester's relationship to the application.
 */
export async function canAccessApplicationDocument(
  ctx: AuthContext,
  app: ApplicationDocumentContext
): Promise<boolean> {
  const { role, userId } = ctx;

  // Admin — always.
  if (role === "admin") return true;

  // Owning job seeker — always, every tier.
  if (role === "job_seeker") {
    return String(userId) === String(app.ownerUserId);
  }

  // Employer — must own the application; strict tier gated to offer/hired.
  if (role === "employer") {
    const { Employer } = await import("@/models/Employer");
    const emp = await Employer.findOne({ userId }).select("_id").lean();
    let owns = !!emp && String(emp._id) === String(app.employerId);
    // Tenant-view proxying and company-scoped users.
    if (!owns && ctx.companyId && String(ctx.companyId) === String(app.employerId)) owns = true;
    if (!owns && ctx.tenantView && String(ctx.tenantView.employerId) === String(app.employerId)) owns = true;
    if (!owns) return false;
    return app.tier === "strict" ? isOfferOrHiredStage(app.status) : true;
  }

  // Agent — on the application, or the employer is one they see (assigned, or
  // registered in their region).
  if (role === "agent") {
    const { Agent } = await import("@/models/Agent");
    const { agentCanSeeEmployer } = await import("@/lib/auth/agentRestrictions");
    const agent = await Agent.findOne({ userId }).select("_id").lean();
    if (!agent) return false;
    const assigned =
      (app.agentId && String(app.agentId) === String(agent._id)) ||
      (await agentCanSeeEmployer(userId, app.employerId));
    if (!assigned) return false;
    return app.tier === "strict" ? isOfferOrHiredStage(app.status) : true;
  }

  // Super agent — the application is in their book: one of their agents is on
  // it, or its employer is (the same set their applications page lists).
  if (role === "super_agent") {
    const { getSuperAgentBook } = await import("@/lib/auth/agentRestrictions");
    const book = await getSuperAgentBook(userId);
    if (!book) return false;
    const involved =
      (!!app.agentId && book.agentIds.some((id) => String(id) === String(app.agentId))) ||
      book.employerIds.some((id) => String(id) === String(app.employerId));
    if (!involved) return false;
    return app.tier === "strict" ? isOfferOrHiredStage(app.status) : true;
  }

  return false;
}
