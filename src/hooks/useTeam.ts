import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ICompanyUserPermissions, PermissionFlag } from "@/lib/permissions/companyRoles";

// ── Types ──────────────────────────────────────────────────────────
export type CompanyRole = "owner" | "admin" | "hiring_manager" | "accounting" | "finance_viewer" | "viewer";
export type MemberStatus = "pending" | "active" | "deactivated";
/** What the team page shows: a pending invite past its expiry reads "expired". */
export type DisplayStatus = MemberStatus | "expired";

export interface TeamMember {
  _id: string;
  email: string;
  companyRole: CompanyRole;
  companyRoles: CompanyRole[];
  jobAccess: string[];
  // Sourced from the model rather than hand-copied: the local copy had drifted
  // and was missing every function flag added since it was written.
  permissions: ICompanyUserPermissions;
  /** The employer's manual ticks on top of the roles. */
  permissionOverrides?: Partial<Record<PermissionFlag, boolean>>;
  status: MemberStatus;
  invitedAt: string;
  acceptedAt?: string;
  user?: { name: string; email: string; avatar?: string } | null;
  /** Pending invite whose link has run out; it can be resent, not accepted. */
  inviteExpired?: boolean;
}

export const displayStatus = (member: Pick<TeamMember, "status" | "inviteExpired">): DisplayStatus =>
  member.status === "pending" && member.inviteExpired ? "expired" : member.status;

export interface TeamStats {
  active: number;
  /** Invites that can still be accepted. */
  pending: number;
  expired: number;
  deactivated: number;
  /** Active members plus live invites. */
  total: number;
}

const EMPTY_STATS: TeamStats = { active: 0, pending: 0, expired: 0, deactivated: 0, total: 0 };

interface TeamResponse {
  members: TeamMember[];
  total: number;
  page: number;
  totalPages: number;
  stats: TeamStats;
}

// ── Query Keys ─────────────────────────────────────────────────────
export const teamKeys = {
  all: ["team"] as const,
  list: (params?: { page: number; limit: number; search: string }) => [...teamKeys.all, "list", params] as const,
};

// ── Fetcher ────────────────────────────────────────────────────────
async function fetchTeam(params: { page: number; limit: number; search: string }): Promise<TeamResponse> {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  if (params.search.trim()) query.set("search", params.search.trim());
  const res = await fetch(`/api/employers/team?${query}`);
  if (!res.ok) throw new Error("Failed to fetch team members");
  const data = await res.json() as Partial<TeamResponse>;
  return {
    members: data.members ?? [],
    total: data.total ?? 0,
    page: data.page ?? params.page,
    totalPages: data.totalPages ?? 1,
    stats: { ...EMPTY_STATS, ...data.stats },
  };
}

// ── Hooks ──────────────────────────────────────────────────────────

/** Fetch team members list */
export function useTeam(params: { page: number; limit: number; search: string }) {
  return useQuery({
    queryKey: teamKeys.list(params),
    queryFn: () => fetchTeam(params),
    staleTime: 60 * 1000,
  });
}

export interface TeamInvitePayload {
  email: string;
  companyRoles: CompanyRole[];
  jobAccess?: string[];
  permissionOverrides?: Partial<Record<PermissionFlag, boolean>>;
  /** `temp_password` creates the account now; `name` is required with it. */
  mode?: "invite" | "temp_password";
  name?: string;
}

export interface TeamInviteResult {
  member: TeamMember;
  /** Only for `temp_password`, and only in this one response. */
  credentials?: { email: string; password: string };
  emailSent?: boolean;
}

/** Carries the server's `code` (e.g. `email_in_use`) so the form can say why. */
export class TeamInviteError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "TeamInviteError";
  }
}

/** Invite a new team member */
export function useInviteTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inviteData: TeamInvitePayload): Promise<TeamInviteResult> => {
      const res = await fetch("/api/employers/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inviteData),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
          details?: { path?: string }[];
        };
        // A rejected address comes back as a generic validation failure; name it.
        const code = data.code ?? (data.details?.some((d) => d.path === "email") ? "invalid_email" : undefined);
        throw new TeamInviteError(data.error ?? "We couldn't send the invite", code);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.all });
    },
  });
}

/** Update a team member's role and/or job access */
export function useUpdateTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      memberId: string;
      companyRole?: CompanyRole;
      companyRoles?: CompanyRole[];
      jobAccess?: string[];
      permissionOverrides?: Record<string, boolean>;
    }) => {
      const { memberId, ...body } = payload;
      const res = await fetch(`/api/employers/team/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update team member");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.all });
    },
  });
}

/** Remove (deactivate) a team member */
export function useRemoveTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      const res = await fetch(`/api/employers/team/${memberId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove team member");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.all });
    },
  });
}

/** Send a fresh invite link to a pending, expired or cancelled row. */
export function useResendTeamInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      const res = await fetch(`/api/employers/team/${memberId}/resend`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        throw new TeamInviteError(data.error ?? "We couldn't resend the invite", data.code);
      }
      return res.json() as Promise<{ member: { _id: string; email: string; status: MemberStatus } }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.all });
    },
  });
}
