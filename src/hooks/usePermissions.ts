"use client";

import { useSession } from "next-auth/react";
import { useMemo } from "react";
import type { UserRole, PermissionMode, CustomPermissions, Resource, Action } from "@/types/user";
import { canAccess, getPermissions, ALL_RESOURCES, ALL_ACTIONS } from "@/lib/permissions/matrix";

export type { Resource, Action };
export { ALL_RESOURCES, ALL_ACTIONS };

interface SessionUser {
  role?: UserRole;
  permissionMode?: PermissionMode;
  customPermissions?: CustomPermissions;
}

/**
 * Client-side permission check hook.
 * Supports both role-based and custom per-user permissions.
 *
 * Usage:
 *   const { can, role } = usePermissions();
 *   if (can("jobs", "create")) { ... }
 */
export function usePermissions() {
  const { data: session } = useSession();
  const user = session?.user as unknown as SessionUser | undefined;
  const role = user?.role;
  const permissionMode = user?.permissionMode ?? "role_default";
  const customPermissions = user?.customPermissions;

  const can = useMemo(
    () => (resource: Resource, action: Action) => {
      if (!role) return false;
      return canAccess(role, resource, action, { permissionMode, customPermissions });
    },
    [role, permissionMode, customPermissions],
  );

  return { can, role, session };
}
