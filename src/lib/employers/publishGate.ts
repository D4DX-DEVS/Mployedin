/**
 * Publishing gate for admin-converted employer accounts.
 *
 * When an admin converts an account into an employer, the Employer profile is
 * created automatically with no company details — `companyName` is `required`,
 * so it is seeded from the person's own name. Without a gate that account could
 * immediately put a job on the public board advertised under a personal name,
 * with no company email, industry or website behind it.
 *
 * The gate is deliberately scoped to `createdVia: "role_conversion"` profiles.
 * Employers who registered themselves, and employers an admin created through
 * the full create-user form, are untouched — they already supplied their
 * company details, and widening the rule would block live accounts mid-flow.
 *
 * It clears when the employer saves a company profile carrying a name, an email
 * and an industry (`PATCH /api/employers/me` stamps `profileConfirmedAt`) —
 * the same definition of "profile complete" the employer Setup Guide uses.
 */
import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";

/** Returned to the client so the UI can point at the company profile page. */
export const PUBLISH_GATE_ERROR = "EMPLOYER_PROFILE_INCOMPLETE" as const;

export interface PublishGateFields {
  createdVia?: string | null;
  profileConfirmedAt?: Date | null;
}

/** Fields a caller must `.select()` for `isPublishGated` to judge correctly. */
export const PUBLISH_GATE_SELECT = "createdVia profileConfirmedAt" as const;

/**
 * A profile that is missing the fields entirely (every employer created before
 * this gate existed) is NOT gated — `createdVia` defaults to "self".
 */
export function isPublishGated(employer: PublishGateFields | null | undefined): boolean {
  if (!employer) return false;
  return employer.createdVia === "role_conversion" && !employer.profileConfirmedAt;
}

/** Same judgement for callers that hold only the employer id. */
export async function isEmployerPublishGated(employerId: string): Promise<boolean> {
  await connectDB();
  const employer = await Employer.findById(employerId)
    .select(PUBLISH_GATE_SELECT)
    .lean<PublishGateFields | null>();
  return isPublishGated(employer);
}

/**
 * True when the company profile carries everything the gate asks for. Mirrors
 * `hasProfile` in /api/employers/setup-status so an employer cannot be told
 * "profile complete" by the Setup Guide and still be blocked from publishing.
 */
export function meetsProfileRequirements(employer: {
  companyName?: string | null;
  companyEmail?: string | null;
  industry?: string | null;
} | null | undefined): boolean {
  if (!employer) return false;
  return (
    Boolean(employer.companyName?.trim()) &&
    Boolean(employer.companyEmail?.trim()) &&
    Boolean(employer.industry?.trim())
  );
}
