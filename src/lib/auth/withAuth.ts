import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { canAccess } from "@/lib/permissions/matrix";
import { connectDB } from "@/lib/db/mongoose";
import TenantViewSession from "@/models/TenantViewSession";
import { verifyTenantCookie, TENANT_COOKIE_NAME } from "@/lib/security/tenantCookie";
import { logActivity } from "@/lib/audit/log";
import { enforceDailyAiQuota } from "@/lib/ai/dailyQuota";
import type { UserRole, PermissionMode, CustomPermissions } from "@/types/user";
import type { CompanyRole } from "@/models/CompanyUser";

type Resource = Parameters<typeof canAccess>[1];
type Action = Parameters<typeof canAccess>[2];

/**
 * SECURITY (W2-2): re-check, on every tenant-view request, whether the actor
 * STILL satisfies the eligibility rule that allowed the switch. A valid signed
 * cookie + live TenantViewSession is not enough — a removed agent / de-scoped
 * super_agent must lose access immediately, not at session expiry. Mirrors the
 * access-control checks in POST /api/tenant/switch exactly.
 */
async function verifyTenantViewStillEligible(
  actorId: string,
  actorRole: UserRole,
  employerId: string
): Promise<boolean> {
  if (actorRole === "admin") return true;

  if (actorRole === "agent") {
    const { default: Agent } = await import("@/models/Agent");
    const agent = await Agent.findOne({ userId: actorId }).select("assignedEmployerIds").lean();
    return Boolean(
      agent && ((agent.assignedEmployerIds as unknown[]) ?? []).some((id) => String(id) === String(employerId))
    );
  }

  if (actorRole === "super_agent") {
    const { default: SuperAgent } = await import("@/models/SuperAgent");
    const { Employer } = await import("@/models/Employer");
    const sa = await SuperAgent.findOne({ userId: actorId }).select("agentIds").lean();
    if (!sa) return false;
    const employer = await Employer.findById(employerId).select("agentId").lean();
    const employerAgentId = employer?.agentId ? String(employer.agentId) : null;
    return Boolean(
      employerAgentId && ((sa.agentIds as unknown[]) ?? []).some((id) => String(id) === employerAgentId)
    );
  }

  return false;
}

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
  guard?:
    | { resource: Resource; action: Action; skipTenantView?: boolean; aiQuota?: boolean }
    | { skipTenantView?: boolean; aiQuota?: boolean }
) {
  const skipTenantView = guard && "skipTenantView" in guard ? guard.skipTenantView : false;
  const aiQuota = guard && "aiQuota" in guard ? guard.aiQuota === true : false;
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
    // Role-specific API routes are always exempt from tenant view so that
    // admins/super-agents/agents can browse employer workspaces without losing
    // access to their own dashboard endpoints.
    let resolvedTenantEmployerId: string | null = null;
    let resolvedTenantEmployerUserId: string | null = null;

    const pathname = req.nextUrl.pathname;
    const isRoleSpecificApi =
      pathname.startsWith("/api/admin") ||
      pathname.startsWith("/api/super-agent") ||
      pathname.startsWith("/api/agent");
    if (!skipTenantView && !isRoleSpecificApi && role !== "employer") {
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

      // ── Re-authorize the actor for THIS employer on every request (W2-2).
      // The signed cookie + live session prove the switch happened; they do not
      // prove the actor is still assigned. Re-check current eligibility so a
      // removed agent / de-scoped super_agent loses access immediately.
      const stillEligible = await verifyTenantViewStillEligible(
        userId,
        role,
        resolvedTenantEmployerId
      );
      if (!stillEligible) {
        return NextResponse.json(
          { error: "Tenant view access revoked — you are no longer assigned to this employer" },
          { status: 403 }
        );
      }

      // ── Write-scoping: all roles (admin, super_agent, agent) can write
      // during tenant view, except DELETE which is restricted to admins.
      const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
      const isWriteRequest = WRITE_METHODS.has(req.method);

      if (isWriteRequest && req.method === "DELETE" && role !== "admin") {
        return NextResponse.json(
          { error: "Only admins can delete resources in tenant view" },
          { status: 403 }
        );
      }

      // ── Enforce RBAC guard even during tenant view
      if (guard && "resource" in guard && "action" in guard) {
        const allowed = canAccess("employer" as UserRole, guard.resource, guard.action);
        if (!allowed) {
          return NextResponse.json(
            { error: "Forbidden — insufficient permissions" },
            { status: 403 }
          );
        }
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
        if (aiQuota) {
          const quota = await enforceDailyAiQuota(tenantCtx.userId, tenantCtx.role);
          if (quota) return quota;
        }
        const response = await handler(req, tenantCtx, resolvedParams);

        // ── Auto-audit: log all write actions performed on behalf of employer
        if (isWriteRequest && response.status >= 200 && response.status < 300) {
          const pathname = req.nextUrl.pathname;
          // Derive resource from URL path (e.g. /api/employers/jobs → "jobs")
          const pathParts = pathname.split("/").filter(Boolean);
          const resource = pathParts[pathParts.length - 1] ?? "unknown";
          const methodToAction: Record<string, string> = {
            POST: "create",
            PUT: "update",
            PATCH: "update",
            DELETE: "delete",
          };
          logActivity({
            actorId: userId,
            actorRole: role,
            action: `tenant_view.${methodToAction[req.method] ?? "write"}`,
            resource,
            resourceId: resolvedTenantEmployerId,
            meta: {
              onBehalfOf: resolvedTenantEmployerUserId,
              employerId: resolvedTenantEmployerId,
              method: req.method,
              path: pathname,
            },
            req,
          });
        }

        return response;
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
        // Viewers and finance_viewers cannot perform write operations
        const writeActions: Action[] = ["create", "update", "delete", "approve"];
        if ((companyUserRole === "viewer" || companyUserRole === "finance_viewer") && writeActions.includes(guard.action)) {
          return NextResponse.json(
            { error: "Forbidden — your role is read-only" },
            { status: 403 }
          );
        }
      }
    }

    try {
      if (aiQuota) {
        const quota = await enforceDailyAiQuota(userId, role);
        if (quota) return quota;
      }
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
