import type { AuthContext } from "@/lib/auth/withAuth";

/** One AI app the user approved, as the Connected apps card shows it. */
export interface ConnectedApp {
  id: string;
  clientName: string;
  scopes: string[];
  connectedAt: string;
  lastUsedAt: string;
  expiresAt: string;
}

/**
 * The person signed in, never a workspace they borrow: an employer's colleague
 * runs on the owner's id, and listing the owner's grants would let them see and
 * disconnect apps they never approved.
 */
export function connectedAppsOwnerId(ctx: AuthContext): string {
  return ctx.member?.actorId ?? ctx.userId;
}
