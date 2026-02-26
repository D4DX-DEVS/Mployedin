import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { canAccess } from "@/lib/permissions/matrix";
import type { UserRole } from "@/models/User";

type Resource = Parameters<typeof canAccess>[1];
type Action = Parameters<typeof canAccess>[2];

interface AuthContext {
  userId: string;
  role: UserRole;
  locale: string;
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
    { params }: { params?: Promise<Record<string, string>> | Record<string, string> } = {}
  ): Promise<NextResponse> => {
    // Next.js 16+ passes params as a Promise; resolve it if needed
    const resolvedParams = params instanceof Promise ? await params : params;
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

    if (guard) {
      const allowed = canAccess(role, guard.resource, guard.action);
      if (!allowed) {
        return NextResponse.json(
          { error: "Forbidden — insufficient permissions" },
          { status: 403 }
        );
      }
    }

    return handler(req, { userId, role, locale }, resolvedParams);
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
  };
}
