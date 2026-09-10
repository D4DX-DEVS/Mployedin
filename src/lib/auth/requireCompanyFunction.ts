import { notFound } from "next/navigation";
import { auth } from "@/lib/auth/config";
import type { ICompanyUserPermissions, PermissionFlag } from "@/models/CompanyUser";

/**
 * Server guard for an employer page that only some colleagues may open.
 *
 * The API is already default-deny, but without this a member reaching a
 * bookmarked URL would render a full page shell whose every request then
 * fails, which reads as a broken app rather than as a boundary.
 *
 * An owner has `companyOwnerUserId === their own id` and always passes.
 * That inequality is the ONLY signal that the caller is a member — every
 * other role (or an unauthenticated request) passes through untouched, since
 * they have their own access control elsewhere (e.g. an agent viewing this
 * workspace in tenant view must not be blocked here).
 *
 * Fails closed: a member whose session carries no `companyPermissions` at
 * all is treated the same as a member missing the flag.
 */
export async function requireCompanyFunction(flag: PermissionFlag): Promise<void> {
  const session = await auth();
  const user = session?.user as
    | {
        id?: string;
        role?: string;
        companyOwnerUserId?: string;
        companyPermissions?: ICompanyUserPermissions;
      }
    | undefined;

  if (!user || user.role !== "employer") return;

  const isMember = Boolean(user.companyOwnerUserId && user.companyOwnerUserId !== user.id);
  if (!isMember) return;

  if (user.companyPermissions?.[flag] !== true) notFound();
}
