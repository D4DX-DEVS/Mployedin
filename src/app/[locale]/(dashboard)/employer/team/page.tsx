"use client";

import { useTranslations } from "next-intl";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Plus, UserX, Shield, Eye, Briefcase, Crown, Mail, Users, CheckCircle2, Clock, Pencil, Activity, Calculator, FileBarChart } from "lucide-react";
import Link from "next/link";
import { useConfirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHero } from "@/components/shared/PageHero";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { TableToolbar } from "@/components/shared/TableToolbar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useTeam, useInviteTeamMember, useUpdateTeamMember, useRemoveTeamMember } from "@/hooks/useTeam";
import { usePagination } from "@/hooks/usePagination";
import { useTableExport } from "@/hooks/useTableExport";
import type { CompanyRole, MemberStatus, TeamMember } from "@/hooks/useTeam";
import type { ExportColumn } from "@/lib/export";
import { useJobs } from "@/hooks/useJobs";
import { FormMultiSelect } from "@/components/shared/AppForm";

const ROLE_COLORS: Record<CompanyRole, string> = {
  owner: "bg-status-interview-bg text-status-interview border-status-interview/20 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30",
  admin: "bg-status-applied-bg text-status-applied border-status-applied/20 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",
  hiring_manager: "bg-status-shortlisted-bg text-status-shortlisted border-status-shortlisted/20 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  accounting: "bg-status-selected-bg text-emerald-700 border-status-selected/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  finance_viewer: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
  viewer: "bg-secondary/75 text-muted-foreground border-border dark:bg-slate-500/80 dark:text-muted-foreground dark:border-slate-700",
};

const STATUS_COLORS: Record<MemberStatus, string> = {
  active: "bg-status-selected-bg text-emerald-700 border-status-selected/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  pending: "bg-status-shortlisted-bg text-status-shortlisted border-status-shortlisted/20 dark:bg-amber-500/15 dark:text-yellow-300 dark:border-yellow-500/30",
  deactivated: "bg-status-rejected-bg text-status-rejected border-status-rejected/20 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
};

const ROLE_ICONS: Record<CompanyRole, React.ReactNode> = {
  owner: <Crown className="h-4 w-4" />,
  admin: <Shield className="h-4 w-4" />,
  hiring_manager: <Briefcase className="h-4 w-4" />,
  accounting: <Calculator className="h-4 w-4" />,
  finance_viewer: <FileBarChart className="h-4 w-4" />,
  viewer: <Eye className="h-4 w-4" />,
};

export default function TeamManagementPage() {
  const t = useTranslations("employerTeam");
  const tc = useTranslations("employerCommon");
  const roleLabel = (role: CompanyRole) => {
    const map: Record<CompanyRole, string> = { owner: t("owner"), admin: t("admin"), hiring_manager: t("hiringManager"), accounting: t("accounting"), finance_viewer: t("financeViewer"), viewer: t("viewer") };
    return map[role] ?? role;
  };
  const { locale } = useParams<{ locale: string }>();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal } = usePagination(10);
  const [search, setSearch] = useState("");
  const { data: teamData, isLoading: loading } = useTeam({ page, limit, search });
  const members = teamData?.members ?? [];
  const teamStats = teamData?.stats ?? { active: 0, pending: 0, total: 0 };
  const inviteMutation = useInviteTeamMember();
  const updateMutation = useUpdateTeamMember();
  const removeMutation = useRemoveTeamMember();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteData, setInviteData] = useState({ email: "", companyRoles: ["hiring_manager"] as CompanyRole[], jobAccess: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Job access edit modal
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editJobAccess, setEditJobAccess] = useState<string[]>([]);

  // Fetch employer's jobs for job assignment selector
  const { data: jobsData } = useJobs({ page: 1, limit: 200, myJobs: true });
  const jobOptions = (jobsData?.jobs ?? []).map((j) => ({
    value: j._id,
    label: `${j.title}${typeof j.location === "string" ? ` — ${j.location}` : j.location?.city ? ` — ${j.location.city}` : ""}`,
  }));

  const showJobAccess = (role: CompanyRole) => role === "hiring_manager" || role === "viewer" || role === "finance_viewer";
  const showJobAccessForRoles = (roles: CompanyRole[]) => roles.some(showJobAccess);

  const roleOptions = [
    { value: "admin", label: t("roleOptions.admin") },
    { value: "hiring_manager", label: t("roleOptions.hiringManager") },
    { value: "accounting", label: t("roleOptions.accounting") },
    { value: "finance_viewer", label: t("roleOptions.financeViewer") },
    { value: "viewer", label: t("roleOptions.viewer") },
  ];

  useEffect(() => {
    document.title = t("pageTitle");
  }, [t]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (inviteData.companyRoles.length === 0) {
      setError(t("selectAtLeastOneRole"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload: { email: string; companyRoles: CompanyRole[]; jobAccess?: string[] } = {
        email: inviteData.email,
        companyRoles: inviteData.companyRoles,
      };
      // Only send jobAccess for restricted roles
      if (showJobAccessForRoles(inviteData.companyRoles) && inviteData.jobAccess.length > 0) {
        payload.jobAccess = inviteData.jobAccess;
      }
      await inviteMutation.mutateAsync(payload);
      setShowInviteModal(false);
      setInviteData({ email: "", companyRoles: ["hiring_manager"], jobAccess: [] });
    } catch (err: unknown) {
      setError(t("failedToSendInvite"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(memberId: string) {
    const ok = await confirmDialog(t("deactivateConfirm"));
    if (!ok) return;
    await removeMutation.mutateAsync(memberId);
  }

  async function handleRoleChange(memberId: string, newRole: CompanyRole) {
    await updateMutation.mutateAsync({ memberId, companyRole: newRole });
  }

  function openJobAccessEditor(member: TeamMember) {
    setEditingMember(member);
    setEditJobAccess(member.jobAccess ?? []);
  }

  async function handleSaveJobAccess() {
    if (!editingMember) return;
    await updateMutation.mutateAsync({ memberId: editingMember._id, jobAccess: editJobAccess });
    setEditingMember(null);
    setEditJobAccess([]);
  }

  function getJobAccessLabel(member: TeamMember): string {
    if (member.companyRole === "owner" || member.companyRole === "admin" || member.companyRole === "accounting") return t("allJobs");
    if (!member.jobAccess || member.jobAccess.length === 0) return t("allJobs");
    return t("jobCount", { count: member.jobAccess.length });
  }

  function statusLabel(status: MemberStatus): string {
    const map: Record<MemberStatus, string> = {
      active: t("active"),
      pending: t("pending"),
      deactivated: t("deactivated"),
    };
    return map[status] ?? status;
  }

  const activeCount = teamStats.active;
  const pendingCount = teamStats.pending;
  const totalCount = teamStats.total;

  useEffect(() => { updateTotal(teamData?.total ?? 0); }, [teamData?.total, updateTotal]);
  useEffect(() => { setPage(1); }, [search, setPage]);

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("name"), key: "user", formatter: (_v, r) => (r as Record<string, any>).user?.name ?? t("pendingInvite") },
    { header: t("email"), key: "email", formatter: (v) => String(v ?? "—") },
    { header: t("role"), key: "companyRole", formatter: (v) => roleLabel(String(v) as CompanyRole) },
    { header: t("status"), key: "status", formatter: (v) => v ? statusLabel(String(v) as MemberStatus) : "—" },
    { header: t("joined"), key: "acceptedAt", formatter: (v, r) => v ? new Date(String(v)).toLocaleDateString(locale) : (r as Record<string, any>).invitedAt ? t("invited", { date: new Date(String((r as Record<string, any>).invitedAt)).toLocaleDateString(locale) }) : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: members as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "team-members",
    title: t("teamMembers"),
  });

  const stats = [
    { label: t("activeMembers", { count: activeCount }), value: activeCount, icon: CheckCircle2, color: "text-status-selected", bg: "bg-background border-border/60 dark:bg-card" },
    { label: t("pendingInvites"), value: pendingCount, icon: Clock, color: "text-status-shortlisted", bg: "bg-background border-border/60 dark:bg-card" },
    { label: t("teamMembers"), value: totalCount, icon: Users, color: "text-primary", bg: "bg-background border-border/60 dark:bg-card" },
  ];

  return (
    <div className="page-container">
      {ConfirmDialogNode}
      {/* Header */}
      <PageHero
        icon={Users}
        title={t("title")}
        description={pendingCount > 0 ? t("descriptionWithPending", { activeCount, pendingCount }) : t("descriptionActiveOnly", { activeCount })}
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/${locale}/employer/team/activity-logs`}>
              <Button variant="outline" size="sm">
                <Activity className="h-4 w-4 me-2" />
                <span className="hidden sm:inline">{t("activityLogs")}</span>
                <span className="sm:hidden">{t("activityLogs")}</span>
              </Button>
            </Link>
            <Button onClick={() => setShowInviteModal(true)}>
              <Plus className="h-4 w-4 me-2" />
              <span className="hidden sm:inline">{t("inviteMember")}</span>
              <span className="sm:hidden">{t("inviteMember")}</span>
            </Button>
          </div>
        }
      />

      {/* Stats Row */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className={`card-base p-4 flex sm:flex-col gap-3 sm:gap-2 border ${s.bg}`}>
              <div className={`p-2.5 rounded-xl border bg-background/80 shrink-0 self-start sm:self-auto w-fit`} style={{ borderColor: 'inherit' }}>
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
        <div className="card-base overflow-hidden">
          <div className="divide-y divide-border/60">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                <Skeleton className="h-9 w-9 rounded-full" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="ml-auto h-6 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ) : members.length === 0 ? (
        /* ── Empty State ── */
        <div className="card-base p-12 flex flex-col items-center justify-center gap-4 text-center">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Users className="h-8 w-8 text-primary/60" />
          </div>
          <div className="space-y-1 max-w-xs">
            <p className="font-semibold text-foreground">{t("empty.title")}</p>
            <p className="text-sm text-muted-foreground">
              {t("empty.description")}
            </p>
          </div>
          <Button onClick={() => setShowInviteModal(true)} className="mt-1">
            <Plus className="h-4 w-4 me-2" />
            {t("empty.cta")}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ── Search & Export Toolbar ── */}
          <TableToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={t("searchPlaceholder")}
            onExportCsv={handleExportCsv}
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
          />

        <div className="card-base overflow-hidden">
          {/* ── Desktop Table ── */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("name")}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("role")}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("jobAccess")}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("status")}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tc("edit")}</th>
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
                              <span className="text-muted-foreground italic">{t("pendingInvite")}</span>
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
                          {roleLabel(member.companyRole)}
                        </Badge>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {(member.companyRoles && member.companyRoles.length > 0 ? member.companyRoles : [member.companyRole]).map((role) => (
                            <Badge key={role} variant="outline" className={`gap-1 text-xs ${ROLE_COLORS[role]}`}>
                              {ROLE_ICONS[role]}
                              {roleLabel(role)}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-xs whitespace-nowrap">
                          {getJobAccessLabel(member)}
                        </Badge>
                        {showJobAccessForRoles(member.companyRoles && member.companyRoles.length > 0 ? member.companyRoles : [member.companyRole]) && member.status !== "deactivated" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openJobAccessEditor(member)}
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                            title={t("editJobAccess")}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge variant="outline" className={`gap-1 ${STATUS_COLORS[member.status]}`}>
                        {member.status === "pending" && <Mail className="h-3 w-3" />}
                        {statusLabel(member.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">
                      {member.acceptedAt
                        ? new Date(member.acceptedAt).toLocaleDateString(locale)
                        : member.invitedAt
                          ? t("invited", { date: new Date(member.invitedAt).toLocaleDateString(locale) })
                          : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {member.companyRole !== "owner" && member.status !== "deactivated" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeactivate(member._id)}
                          className="text-red-500 hover:text-status-rejected hover:bg-red-500/10 h-8 w-8 p-0 dark:hover:text-red-300"
                          title={t("deactivateMember")}
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
                          <span className="text-muted-foreground italic">{t("pendingInvite")}</span>
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
                      className="text-red-500 hover:text-status-rejected hover:bg-red-500/10 h-8 w-8 p-0 shrink-0 dark:hover:text-red-300"
                      title={t("deactivateMember")}
                    >
                      <UserX className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {/* Badges row */}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={`gap-1 ${STATUS_COLORS[member.status]}`}>
                    {member.status === "pending" && <Mail className="h-3 w-3" />}
                    {statusLabel(member.status)}
                  </Badge>
                  {member.companyRole === "owner" ? (
                    <Badge variant="outline" className={`gap-1 ${ROLE_COLORS[member.companyRole]}`}>
                      {ROLE_ICONS[member.companyRole]}
                      {roleLabel(member.companyRole)}
                    </Badge>
                  ) : (
                    (member.companyRoles && member.companyRoles.length > 0 ? member.companyRoles : [member.companyRole]).map((role) => (
                      <Badge key={role} variant="outline" className={`gap-1 text-xs ${ROLE_COLORS[role]}`}>
                        {ROLE_ICONS[role]}
                        {roleLabel(role)}
                      </Badge>
                    ))
                  )}
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-xs">
                      {getJobAccessLabel(member)}
                    </Badge>
                    {showJobAccessForRoles(member.companyRoles && member.companyRoles.length > 0 ? member.companyRoles : [member.companyRole]) && member.status !== "deactivated" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openJobAccessEditor(member)}
                        className="h-5 w-5 p-0 text-muted-foreground hover:text-primary"
                        title={t("editJobAccess")}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground ms-auto">
                    {member.acceptedAt
                      ? new Date(member.acceptedAt).toLocaleDateString(locale)
                      : member.invitedAt
                        ? t("invited", { date: new Date(member.invitedAt).toLocaleDateString(locale) })
                        : "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <PaginationControls
              page={page}
              totalPages={totalPages}
              total={total}
              limit={limit}
              onPageChange={setPage}
              onLimitChange={setLimit}
            />
          )}
        </div>
      )}

      {/* Invite Modal */}
      <Dialog open={showInviteModal} onOpenChange={setShowInviteModal}>
        <DialogContent className="w-full max-w-md mx-auto overflow-visible">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-4 w-4 text-primary" />
              </div>
              {t("inviteModal.title")}
            </DialogTitle>
            <DialogDescription className="sr-only">{t("inviteModal.description")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4 pt-1">
            <div className="space-y-2">
              <Label htmlFor="invite-email">{t("inviteModal.emailLabel")}</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder={t("inviteModal.emailPlaceholder")}
                value={inviteData.email}
                onChange={(e) => setInviteData({ ...inviteData, email: e.target.value })}
                required
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("inviteModal.rolesLabel")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("inviteModal.rolesDescription")}
              </p>
              <FormMultiSelect
                placeholder={t("inviteModal.rolesPlaceholder")}
                options={roleOptions}
                value={inviteData.companyRoles}
                onChange={(val) => setInviteData({ ...inviteData, companyRoles: val as CompanyRole[], jobAccess: [] })}
                maxSelections={5}
              />
            </div>

            {showJobAccessForRoles(inviteData.companyRoles) && (
              <div className="space-y-2">
                <Label>{t("jobAccessModal.assignedJobs")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("inviteModal.jobAccessDescription")}
                </p>
                <FormMultiSelect
                  placeholder={t("jobAccessModal.allJobsPlaceholder")}
                  options={jobOptions}
                  value={inviteData.jobAccess}
                  onChange={(val) => setInviteData({ ...inviteData, jobAccess: val })}
                  maxSelections={50}
                  searchable
                />
              </div>
            )}

            {error && (
              <div className="text-sm text-status-rejected bg-status-rejected-bg border border-status-rejected/20 px-3 py-2 rounded-md dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30">
                {error}
              </div>
            )}

            <DialogFooter className="gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setShowInviteModal(false)} className="flex-1 sm:flex-none">
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    {t("sending")}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    {t("sendInvite")}
                  </span>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Job Access Edit Modal */}
      <Dialog open={!!editingMember} onOpenChange={(open) => { if (!open) { setEditingMember(null); setEditJobAccess([]); } }}>
        <DialogContent className="w-full max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Briefcase className="h-4 w-4 text-primary" />
              </div>
              {t("jobAccessModal.title")}
            </DialogTitle>
            <DialogDescription>
              {editingMember?.user?.name ?? editingMember?.email} — {editingMember ? roleLabel(editingMember.companyRole) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-2">
              <Label>{t("jobAccessModal.assignedJobs")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("jobAccessModal.description")}
              </p>
              <FormMultiSelect
                placeholder={t("jobAccessModal.allJobsPlaceholder")}
                options={jobOptions}
                value={editJobAccess}
                onChange={setEditJobAccess}
                maxSelections={50}
                searchable
              />
            </div>
            <DialogFooter className="gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => { setEditingMember(null); setEditJobAccess([]); }} className="flex-1 sm:flex-none">
                {t("cancel")}
              </Button>
              <Button onClick={handleSaveJobAccess} disabled={updateMutation.isPending} className="flex-1 sm:flex-none">
                {updateMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    {t("saving")}
                  </span>
                ) : t("saveChanges")}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
