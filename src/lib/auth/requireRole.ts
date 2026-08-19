import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { getDashboardPath } from "@/lib/permissions/matrix";
import type { UserRole } from "@/models/User";

/**
 * Server-side role guard for dashboard section layouts.
 * Defense in depth behind the middleware role matrix (src/proxy.ts) so a
 * matcher regression can never expose a section to the wrong role.
 * Wrong-role users are redirected to their own dashboard (same behaviour
 * as the middleware).
 */
export async function requireRole(
  locale: string,
  allowed: UserRole[],
  opts?: { allowTenantView?: boolean }
) {
  const session = await auth();
  if (!session?.user) {
    redirect(`/${locale}/login`);
  }

  const role = (session.user as { role: UserRole }).role;
  if (allowed.includes(role)) return session;

  if (opts?.allowTenantView) {
    // x-tenant-* headers are only present after the middleware verified the
    // signed tenant-view cookie (client-supplied values are stripped first).
    const reqHeaders = await headers();
    const tenantEmployerId = reqHeaders.get("x-tenant-employer-id");
    if (tenantEmployerId) {
      // T10: middleware runs on the edge and only proves the cookie is authentic,
      // not that the actor is still assigned to this employer. Without this check
      // a de-assigned agent's XHRs 403 (withAuth re-checks) while the page shell
      // kept rendering the company's dashboard until the 4h cookie expired.
      const { verifyTenantViewStillEligible } = await import("@/lib/auth/withAuth");
      const stillEligible = await verifyTenantViewStillEligible(
        session.user.id ?? "",
        role,
        tenantEmployerId
      );
      if (stillEligible) return session;
    }
  }

  redirect(getDashboardPath(role, locale));
}
