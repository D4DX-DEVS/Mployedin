import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { canAccess } from "@/lib/permissions/matrix";
import type { UserRole, PermissionMode, CustomPermissions } from "@/types/user";
import type { CompanyRole } from "@/models/CompanyUser";

type Resource = Parameters<typeof canAccess>[1];
type Action = Parameters<typeof canAccess>[2];

interface AuthContext {
  userId: string;
  role: UserRole;
  locale: string;
  permissionMode: PermissionMode;
  customPermissions?: CustomPermissions;
  companyUserRole?: CompanyRole;
  companyId?: string;
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
  guard?: { resource: Resource; action: Action }
) {
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

    if (guard) {
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
      throw err;
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
