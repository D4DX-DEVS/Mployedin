import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Types ──────────────────────────────────────────────────────────
export type CompanyRole = "owner" | "admin" | "hiring_manager" | "viewer";
export type MemberStatus = "pending" | "active" | "deactivated";

export interface TeamMember {
  _id: string;
  email: string;
  companyRole: CompanyRole;
  jobAccess: string[];
  permissions: {
    canCreateJobs: boolean;
    canManageTeam: boolean;
    canViewAnalytics: boolean;
    canExportData: boolean;
  };
  status: MemberStatus;
  invitedAt: string;
  acceptedAt?: string;
  user?: { name: string; email: string; avatar?: string } | null;
}

interface TeamResponse {
  members: TeamMember[];
}

// ── Query Keys ─────────────────────────────────────────────────────
export const teamKeys = {
  all: ["team"] as const,
  list: () => [...teamKeys.all, "list"] as const,
};

// ── Fetcher ────────────────────────────────────────────────────────
async function fetchTeam(): Promise<TeamMember[]> {
  const res = await fetch("/api/employers/team");
  if (!res.ok) throw new Error("Failed to fetch team members");
  const data: TeamResponse = await res.json();
  return data.members ?? [];
}

// ── Hooks ──────────────────────────────────────────────────────────

/** Fetch team members list */
export function useTeam() {
  return useQuery({
    queryKey: teamKeys.list(),
    queryFn: fetchTeam,
    staleTime: 60 * 1000,
  });
}

/** Invite a new team member */
export function useInviteTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inviteData: { email: string; companyRole: CompanyRole }) => {
      const res = await fetch("/api/employers/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inviteData),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to send invite");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.list() });
    },
  });
}

/** Update a team member's role */
export function useUpdateTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, companyRole }: { memberId: string; companyRole: CompanyRole }) => {
      const res = await fetch(`/api/employers/team/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyRole }),
      });
      if (!res.ok) throw new Error("Failed to update team member role");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.list() });
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
      qc.invalidateQueries({ queryKey: teamKeys.list() });
    },
  });
}
