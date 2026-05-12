import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { canAccess } from "@/lib/permissions/matrix";
import { connectDB } from "@/lib/db/mongoose";
import TenantViewSession from "@/models/TenantViewSession";
import { verifyTenantCookie, TENANT_COOKIE_NAME } from "@/lib/security/tenantCookie";
import type { UserRole, PermissionMode, CustomPermissions } from "@/types/user";
import type { CompanyRole } from "@/models/CompanyUser";

type Resource = Parameters<typeof canAccess>[1];
type Action = Parameters<typeof canAccess>[2];

export interface AuthContext {
  userId: string;
  role: UserRole;
  locale: string;
  permissionMode: PermissionMode;
  customPermissions?: CustomPermissions;
  companyUserRole?: CompanyRole;
  companyId?: string;
  /** Set when the request is executing inside a tenant view session */
  tenantView?: {
    actorId: string;
    actorRole: UserRole;
    employerId: string;
  };
  [key: string]: unknown;
}

type RouteHandler = (
  req: NextRequest,
  ctx: AuthContext,
  params?: Record<string, string>
) => Promise<NextResponse>;

/**
 * Wraps a Next.js API route handler with authentication + optional RBAC check.
 *
 * Usage:
 *   export const GET = withAuth(handler);
 *   export const POST = withAuth(handler, { resource: "jobs", action: "create" });
 */
export function withAuth(
  handler: RouteHandler,
  guard?: { resource: Resource; action: Action; skipTenantView?: boolean } | { skipTenantView: boolean }
) {
  const skipTenantView = guard && "skipTenantView" in guard ? guard.skipTenantView : false;
  return async (
    req: NextRequest,
    context: { params: Promise<Record<string, string>> }
  ): Promise<NextResponse> => {
    // Next.js 15+ always passes params as a Promise
    const resolvedParams = await context.params;
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const role = (session.user as unknown as { role: UserRole }).role;
    const locale = (session.user as unknown as { locale: string }).locale ?? "en";
    const userId = session.user.id ?? "";
    const permissionMode = ((session.user as unknown as { permissionMode?: PermissionMode }).permissionMode) ?? "role_default";
    const customPermissions = (session.user as unknown as { customPermissions?: CustomPermissions }).customPermissions;
    const companyUserRole = (session.user as unknown as { companyUserRole?: CompanyRole }).companyUserRole;
    const companyId = (session.user as unknown as { companyId?: string }).companyId;

    // ── Tenant view: validate the tenant-view cookie to transparently proxy
    // the request as the employer user.
    //
    // SECURITY: We ALWAYS use the signed cookie as the source of truth for both
    // page routes and API routes. Headers (x-tenant-*) set by middleware are only
    // used by the layout/server components, never trusted here.
    //
    // Routes like /api/tenant/switch must use skipTenantView to avoid circular
    // proxying (e.g. "exit" call would fail because ctx.role becomes "employer").
    //
    // Admin API routes (/api/admin/*) are always exempt from tenant view so that
    // admins can browse employer workspaces without losing access to admin endpoints.
    let resolvedTenantEmployerId: string | null = null;
    let resolvedTenantEmployerUserId: string | null = null;

    const isAdminApi = req.nextUrl.pathname.startsWith("/api/admin");
    if (!skipTenantView && !isAdminApi && role !== "employer") {
      const cookieVal = req.cookies.get(TENANT_COOKIE_NAME)?.value;
      if (cookieVal) {
        const payload = await verifyTenantCookie(
          cookieVal,
          process.env.NEXTAUTH_SECRET ?? ""
        );
        if (payload && payload.actorId === userId) {
          resolvedTenantEmployerId = payload.employerId;
          resolvedTenantEmployerUserId = payload.employerUserId;
        }
      }
    }

    if (resolvedTenantEmployerId && resolvedTenantEmployerUserId && role !== "employer") {
      // Verify the session is still live in the DB
      await connectDB();
      const tenantSession = await TenantViewSession.findOne({
        actorId: userId,
        employerId: resolvedTenantEmployerId,
        expiresAt: { $gt: new Date() },
      }).lean();

      if (!tenantSession) {
        return NextResponse.json(
          { error: "Tenant view session expired — please switch again" },
          { status: 401 }
        );
      }

      // Build a tenant-view ctx: override userId and role so all employer API
      // lookups (Employer.findOne({ userId: ctx.userId })) work transparently.
      const tenantCtx: AuthContext = {
        userId: resolvedTenantEmployerUserId,
        role: "employer" as UserRole,
        locale,
        permissionMode: "role_default",
        tenantView: {
          actorId: userId,
          actorRole: role,
          employerId: resolvedTenantEmployerId,
        },
      };

      try {
        return await handler(req, tenantCtx, resolvedParams);
      } catch (err) {
        if (err instanceof NextResponse) return err;
        console.error("[withAuth:tenantView] Unhandled error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
      }
    }

    if (guard && "resource" in guard && "action" in guard) {
      const allowed = canAccess(role, guard.resource, guard.action, {
        permissionMode,
        customPermissions,
      });
      if (!allowed) {
        return NextResponse.json(
          { error: "Forbidden — insufficient permissions" },
          { status: 403 }
        );
      }

      // Enforce team-level restrictions for employer users
      if (role === "employer" && companyUserRole) {
        // Viewers cannot perform write operations
        const writeActions: Action[] = ["create", "update", "delete", "approve"];
        if (companyUserRole === "viewer" && writeActions.includes(guard.action)) {
          return NextResponse.json(
            { error: "Forbidden — viewer role is read-only" },
            { status: 403 }
          );
        }
      }
    }

    try {
      return await handler(req, { userId, role, locale, permissionMode, customPermissions, companyUserRole, companyId }, resolvedParams);
    } catch (err) {
      // validateBody() throws a NextResponse on validation failure — surface it directly
      if (err instanceof NextResponse) return err;
      console.error("[withAuth] Unhandled error in route handler:", err);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  };
}

/**
 * Simple role check helper for use inside route handlers.
 * Throws a 403 NextResponse if role is not allowed.
 */
export async function requireRole(
  roles: UserRole[],
  session: { user?: unknown } | null
): Promise<AuthContext> {
  if (!session?.user) {
    throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as unknown as {
    id?: string;
    role: UserRole;
    locale: string;
    permissionMode?: PermissionMode;
    customPermissions?: CustomPermissions;
    companyUserRole?: CompanyRole;
    companyId?: string;
  };

  if (!roles.includes(user.role)) {
    throw NextResponse.json(
      { error: "Forbidden — insufficient permissions" },
      { status: 403 }
    );
  }

  return {
    userId: user.id ?? "",
    role: user.role,
    locale: user.locale ?? "en",
    permissionMode: user.permissionMode ?? "role_default",
    customPermissions: user.customPermissions,
    companyUserRole: user.companyUserRole,
    companyId: user.companyId,
  };
}
