import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Types ──────────────────────────────────────────────────────────
export type CompanyRole = "owner" | "admin" | "hiring_manager" | "accounting" | "finance_viewer" | "viewer";
export type MemberStatus = "pending" | "active" | "deactivated";

export interface TeamMember {
  _id: string;
  email: string;
  companyRole: CompanyRole;
  companyRoles: CompanyRole[];
  jobAccess: string[];
  permissions: {
    canCreateJobs: boolean;
    canManageTeam: boolean;
    canViewAnalytics: boolean;
    canExportData: boolean;
    canManageBilling: boolean;
    canViewReports: boolean;
    canApproveInvoices: boolean;
    canViewCommissions: boolean;
  };
  status: MemberStatus;
  invitedAt: string;
  acceptedAt?: string;
  user?: { name: string; email: string; avatar?: string } | null;
}

interface TeamResponse {
  members: TeamMember[];
  total: number;
  page: number;
  totalPages: number;
  stats: { active: number; pending: number; total: number };
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
    stats: data.stats ?? { active: 0, pending: 0, total: 0 },
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

/** Invite a new team member */
export function useInviteTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inviteData: { email: string; companyRoles: CompanyRole[]; jobAccess?: string[] }) => {
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
      qc.invalidateQueries({ queryKey: teamKeys.all });
    },
  });
}

/** Update a team member's role and/or job access */
export function useUpdateTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { memberId: string; companyRole?: CompanyRole; jobAccess?: string[] }) => {
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
