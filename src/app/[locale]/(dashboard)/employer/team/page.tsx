"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Plus, UserX, Shield, Eye, Briefcase, Crown, Mail, Users, CheckCircle2, Clock } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useTeam, useInviteTeamMember, useUpdateTeamMember, useRemoveTeamMember } from "@/hooks/useTeam";
import type { CompanyRole, MemberStatus } from "@/hooks/useTeam";

const ROLE_LABELS: Record<CompanyRole, string> = {
  owner: "Owner",
  admin: "Admin",
  hiring_manager: "Hiring Manager",
  viewer: "Viewer",
};

const ROLE_COLORS: Record<CompanyRole, string> = {
  owner: "bg-purple-100 text-purple-700 border-purple-200",
  admin: "bg-blue-100 text-blue-700 border-blue-200",
  hiring_manager: "bg-amber-100 text-amber-700 border-amber-200",
  viewer: "bg-gray-100 text-gray-600 border-gray-200",
};

const STATUS_COLORS: Record<MemberStatus, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
  deactivated: "bg-red-100 text-red-700 border-red-200",
};

const ROLE_ICONS: Record<CompanyRole, React.ReactNode> = {
  owner: <Crown className="h-4 w-4" />,
  admin: <Shield className="h-4 w-4" />,
  hiring_manager: <Briefcase className="h-4 w-4" />,
  viewer: <Eye className="h-4 w-4" />,
};

export default function TeamManagementPage() {
  useParams<{ locale: string }>();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const { data: members = [], isLoading: loading } = useTeam();
  const inviteMutation = useInviteTeamMember();
  const updateMutation = useUpdateTeamMember();
  const removeMutation = useRemoveTeamMember();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteData, setInviteData] = useState({ email: "", companyRole: "hiring_manager" as CompanyRole });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Team Management · MPLOYEDIN";
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await inviteMutation.mutateAsync(inviteData);
      setShowInviteModal(false);
      setInviteData({ email: "", companyRole: "hiring_manager" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(memberId: string) {
    const ok = await confirmDialog("Are you sure you want to deactivate this team member?");
    if (!ok) return;
    await removeMutation.mutateAsync(memberId);
  }

  async function handleRoleChange(memberId: string, newRole: CompanyRole) {
    await updateMutation.mutateAsync({ memberId, companyRole: newRole });
  }

  const activeCount = members.filter((m) => m.status === "active").length;
  const pendingCount = members.filter((m) => m.status === "pending").length;
  const totalCount = members.length;

  const stats = [
    { label: "Active Members", value: activeCount, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100" },
    { label: "Pending Invites", value: pendingCount, icon: Clock, color: "text-amber-600", bg: "bg-amber-50 border-amber-100" },
    { label: "Total Members", value: totalCount, icon: Users, color: "text-primary", bg: "bg-primary/5 border-primary/10" },
  ];

  return (
    <div className="page-container">
      {ConfirmDialogNode}
      {/* Header */}
      <PageHeader
        title="Team Management"
        description={`${activeCount} active member${activeCount !== 1 ? "s" : ""}${pendingCount > 0 ? ` · ${pendingCount} pending invite${pendingCount !== 1 ? "s" : ""}` : ""}`}
        actions={
          <Button onClick={() => setShowInviteModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Invite Member</span>
            <span className="sm:hidden">Invite</span>
          </Button>
        }
      />

      {/* Stats Row */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className={`card-base p-4 flex sm:flex-col gap-3 sm:gap-2 border ${s.bg}`}>
              <div className={`p-2.5 rounded-xl border bg-white/80 shrink-0 self-start sm:self-auto w-fit`} style={{ borderColor: 'inherit' }}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div className="flex sm:flex-col items-center sm:items-start justify-between sm:justify-start gap-1 flex-1 min-w-0">
                <p className="text-sm font-medium text-muted-foreground truncate">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color} leading-none tabular-nums shrink-0`}>{s.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="card-base p-12 flex flex-col items-center justify-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Loading team members…</p>
        </div>
      ) : members.length === 0 ? (
        /* ── Empty State ── */
        <div className="card-base p-12 flex flex-col items-center justify-center gap-4 text-center">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Users className="h-8 w-8 text-primary/60" />
          </div>
          <div className="space-y-1 max-w-xs">
            <p className="font-semibold text-foreground">No team members yet</p>
            <p className="text-sm text-muted-foreground">
              Invite hiring managers, admins, and viewers to collaborate on your open roles.
            </p>
          </div>
          <Button onClick={() => setShowInviteModal(true)} className="mt-1">
            <Plus className="h-4 w-4 mr-2" />
            Invite Your First Member
          </Button>
        </div>
      ) : (
        <div className="card-base overflow-hidden">
          {/* ── Desktop Table ── */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Member</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Joined</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {members.map((member) => (
                  <tr key={member._id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                          {(member.user?.name ?? member.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">
                            {member.user?.name ?? (
                              <span className="text-muted-foreground italic">Pending Invite</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{member.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      {member.companyRole === "owner" ? (
                        <Badge variant="outline" className={`gap-1 ${ROLE_COLORS[member.companyRole]}`}>
                          {ROLE_ICONS[member.companyRole]}
                          {ROLE_LABELS[member.companyRole]}
                        </Badge>
                      ) : member.status === "active" ? (
                        <Select
                          value={member.companyRole}
                          onValueChange={(val) => handleRoleChange(member._id, val as CompanyRole)}
                        >
                          <SelectTrigger className="w-full sm:w-40 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="hiring_manager">Hiring Manager</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline" className={ROLE_COLORS[member.companyRole]}>
                          {ROLE_LABELS[member.companyRole]}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge variant="outline" className={`gap-1 ${STATUS_COLORS[member.status]}`}>
                        {member.status === "pending" && <Mail className="h-3 w-3" />}
                        {member.status.charAt(0).toUpperCase() + member.status.slice(1)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">
                      {member.acceptedAt
                        ? new Date(member.acceptedAt).toLocaleDateString()
                        : member.invitedAt
                          ? `Invited ${new Date(member.invitedAt).toLocaleDateString()}`
                          : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {member.companyRole !== "owner" && member.status !== "deactivated" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeactivate(member._id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0"
                          title="Deactivate member"
                        >
                          <UserX className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Mobile Card List ── */}
          <div className="md:hidden divide-y divide-border/40">
            {members.map((member) => (
              <div key={member._id} className="p-4 space-y-3">
                {/* Member info row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                      {(member.user?.name ?? member.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">
                        {member.user?.name ?? (
                          <span className="text-muted-foreground italic">Pending Invite</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{member.email}</div>
                    </div>
                  </div>
                  {member.companyRole !== "owner" && member.status !== "deactivated" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeactivate(member._id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0 shrink-0"
                      title="Deactivate member"
                    >
                      <UserX className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {/* Badges row */}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={`gap-1 ${STATUS_COLORS[member.status]}`}>
                    {member.status === "pending" && <Mail className="h-3 w-3" />}
                    {member.status.charAt(0).toUpperCase() + member.status.slice(1)}
                  </Badge>
                  {member.companyRole === "owner" || member.status !== "active" ? (
                    <Badge variant="outline" className={`gap-1 ${ROLE_COLORS[member.companyRole]}`}>
                      {ROLE_ICONS[member.companyRole]}
                      {ROLE_LABELS[member.companyRole]}
                    </Badge>
                  ) : (
                    <Select
                      value={member.companyRole}
                      onValueChange={(val) => handleRoleChange(member._id, val as CompanyRole)}
                    >
                      <SelectTrigger className="h-7 text-xs w-full sm:w-36 border-dashed">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="hiring_manager">Hiring Manager</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {member.acceptedAt
                      ? new Date(member.acceptedAt).toLocaleDateString()
                      : member.invitedAt
                        ? `Invited ${new Date(member.invitedAt).toLocaleDateString()}`
                        : "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite Modal */}
      <Dialog open={showInviteModal} onOpenChange={setShowInviteModal}>
        <DialogContent className="w-full max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-4 w-4 text-primary" />
              </div>
              Invite Team Member
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4 pt-1">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email Address</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@company.com"
                value={inviteData.email}
                onChange={(e) => setInviteData({ ...inviteData, email: e.target.value })}
                required
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">Role</Label>
              <Select
                value={inviteData.companyRole}
                onValueChange={(val) => setInviteData({ ...inviteData, companyRole: val as CompanyRole })}
              >
                <SelectTrigger id="invite-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2 py-0.5">
                      <Shield className="h-4 w-4 text-blue-600 shrink-0" />
                      <div>
                        <p className="font-medium text-sm">Admin</p>
                        <p className="text-xs text-muted-foreground">Full access, can manage team</p>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="hiring_manager">
                    <div className="flex items-center gap-2 py-0.5">
                      <Briefcase className="h-4 w-4 text-amber-600 shrink-0" />
                      <div>
                        <p className="font-medium text-sm">Hiring Manager</p>
                        <p className="text-xs text-muted-foreground">Manage assigned jobs only</p>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="viewer">
                    <div className="flex items-center gap-2 py-0.5">
                      <Eye className="h-4 w-4 text-gray-500 shrink-0" />
                      <div>
                        <p className="font-medium text-sm">Viewer</p>
                        <p className="text-xs text-muted-foreground">Read-only access</p>
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-md">
                {error}
              </div>
            )}

            <DialogFooter className="gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setShowInviteModal(false)} className="flex-1 sm:flex-none">
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Sending…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Send Invite
                  </span>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
