"use client";

import { useTranslations } from "next-intl";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Plus, UserX, Shield, Eye, Briefcase, Crown, Mail, Users, CheckCircle2, Clock, Pencil, Activity, Calculator, FileBarChart, Inbox } from "lucide-react";
import Link from "next/link";
import { useConfirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { InlineFilterBar, InlineFilterSearch } from "@/components/shared/InlineFilterBar";
import { RowActions } from "@/components/shared/RowActions";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatDate } from "@/lib/ui/intlFormat";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useTeam, useUpdateTeamMember, useRemoveTeamMember } from "@/hooks/useTeam";
import { TEAM_INVITE_ENABLED } from "@/lib/features/teamFeature";
import { usePagination } from "@/hooks/usePagination";
import { useTableExport } from "@/hooks/useTableExport";
import type { CompanyRole, MemberStatus, TeamMember } from "@/hooks/useTeam";
import type { ExportColumn } from "@/lib/export";
import { useJobs } from "@/hooks/useJobs";
import { FormMultiSelect } from "@/components/shared/AppForm";
import { CompanyFunctionChecklist } from "@/components/features/employer/team/CompanyFunctionChecklist";
import { InviteMemberDialog } from "@/components/features/employer/team/InviteMemberDialog";
import type { PermissionFlag } from "@/lib/permissions/companyRoles";

const ROLE_COLORS: Record<CompanyRole, string> = {
  owner: "bg-status-interview-bg text-status-interview border-status-interview/20",
  admin: "bg-status-applied-bg text-status-applied border-status-applied/20",
  hiring_manager: "bg-status-shortlisted-bg text-status-shortlisted border-status-shortlisted/20",
  accounting: "bg-status-selected-bg text-emerald-700 border-status-selected/20",
  finance_viewer: "bg-teal-100 text-teal-700 border-teal-200",
  viewer: "bg-secondary/75 text-muted-foreground border-border",
};

const STATUS_COLORS: Record<MemberStatus, string> = {
  active: "bg-status-selected-bg text-emerald-700 border-status-selected/20",
  pending: "bg-status-shortlisted-bg text-status-shortlisted border-status-shortlisted/20",
  deactivated: "bg-status-rejected-bg text-status-rejected border-status-rejected/20",
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
  const updateMutation = useUpdateTeamMember();
  const removeMutation = useRemoveTeamMember();
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Job access edit modal
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editJobAccess, setEditJobAccess] = useState<string[]>([]);
  const [editRole, setEditRole] = useState<CompanyRole | "">("");
  const [editPermissionOverrides, setEditPermissionOverrides] = useState<Partial<Record<PermissionFlag, boolean>>>({});

  // Fetch employer's jobs for job assignment selector
  const { data: jobsData } = useJobs({ page: 1, limit: 200, myJobs: true });
  const jobOptions = (jobsData?.jobs ?? []).map((j) => ({
    value: j._id,
    label: `${j.title}${typeof j.location === "string" ? ` — ${j.location}` : j.location?.city ? ` — ${j.location.city}` : ""}`,
  }));

  const showJobAccess = (role: CompanyRole) => role === "hiring_manager" || role === "viewer" || role === "finance_viewer";
  const showJobAccessForRoles = (roles: CompanyRole[]) => roles.some(showJobAccess);
  const rolesOf = (member: TeamMember) =>
    (member.companyRoles && member.companyRoles.length > 0 ? member.companyRoles : [member.companyRole]) as CompanyRole[];
  /** Pencil for every member but the owner: job access for job-scoped roles, else the role alone. */
  const editAction = (member: TeamMember) =>
    member.companyRole === "owner" || member.status === "deactivated"
      ? []
      : [{
          key: "access",
          label: showJobAccessForRoles(rolesOf(member)) ? t("editJobAccess") : t("editRole"),
          icon: Pencil,
          iconOnly: true,
          onSelect: () => openJobAccessEditor(member),
        }];

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

  async function handleDeactivate(memberId: string) {
    const ok = await confirmDialog(t("deactivateConfirm"));
    if (!ok) return;
    await removeMutation.mutateAsync(memberId);
  }

  async function handleRoleChange(memberId: string, newRole: CompanyRole) {
    await updateMutation.mutateAsync({ memberId, companyRole: newRole });
  }

  // The job list applies to job-scoped roles — including one just picked in the dialog.
  const editingScopesJobs = editingMember
    ? showJobAccessForRoles(editRole ? [editRole as CompanyRole] : rolesOf(editingMember))
    : false;

  function openJobAccessEditor(member: TeamMember) {
    setEditingMember(member);
    setEditJobAccess(member.jobAccess ?? []);
    setEditRole(member.companyRole);
    setEditPermissionOverrides((member.permissionOverrides ?? {}) as Partial<Record<PermissionFlag, boolean>>);
  }

  async function handleSaveJobAccess() {
    if (!editingMember) return;
    // The role dropdown lives in this dialog, so a role change saves together
    // with the job access it scopes (restricted roles fall back to all jobs
    // when their access list is empty, same as before).
    if (editRole && editRole !== editingMember.companyRole) {
      await handleRoleChange(editingMember._id, editRole);
    }
    await updateMutation.mutateAsync({
      memberId: editingMember._id,
      jobAccess: editJobAccess,
      // Always sent, including when emptied, so clearing every tick actually
      // resets the person back to their role defaults.
      permissionOverrides: editPermissionOverrides as Record<string, boolean>,
    });
    setEditingMember(null);
    setEditJobAccess([]);
    setEditRole("");
    setEditPermissionOverrides({});
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
    { header: t("joined"), key: "acceptedAt", formatter: (v, r) => v ? formatDate(String(v), { day: "2-digit", month: "short", year: "numeric" }, locale) : (r as Record<string, any>).invitedAt ? t("invited", { date: formatDate(String((r as Record<string, any>).invitedAt), { day: "2-digit", month: "short", year: "numeric" }, locale) }) : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: members as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "team-members",
    title: t("teamMembers"),
  });

  const stats = [
    // Plain "Active" label — "{count} active members" printed the count twice
    // next to the card's own value.
    { label: t("active"), value: activeCount, icon: CheckCircle2, color: "text-status-selected", bg: "bg-background border-border/60" },
    { label: t("pendingInvites"), value: pendingCount, icon: Clock, color: "text-status-shortlisted", bg: "bg-background border-border/60" },
    { label: t("teamMembers"), value: totalCount, icon: Users, color: "text-primary", bg: "bg-background border-border/60" },
  ];

  return (
    <div className="page-container">
      {ConfirmDialogNode}
      {/* Header */}
      {/* compactOnMobile: the description ("N active members") repeats the
          Active stat card right below the hero. */}
      {/* Pattern A (compact workspace): title, the member line, two actions
          that go icon-only on phones so they share the title row. */}
      <WorkspaceHeader
        title={t("title")}
        context={pendingCount > 0 ? t("descriptionWithPending", { activeCount, pendingCount }) : t("descriptionActiveOnly", { activeCount })}
        actions={
          <>
            <Button asChild variant="outline" className="rounded-xl px-3 sm:px-4">
              <Link href={`/${locale}/employer/team/activity-logs`} aria-label={t("activityLogs")}>
                <Activity className="h-4 w-4 sm:me-2" aria-hidden="true" />
                <span className="hidden sm:inline">{t("activityLogs")}</span>
              </Link>
            </Button>
            {TEAM_INVITE_ENABLED && (
              <Button onClick={() => setShowInviteModal(true)} aria-label={t("inviteMember")} className="rounded-xl px-3 sm:px-4">
                <Plus className="h-4 w-4 sm:me-2" aria-hidden="true" />
                <span className="hidden sm:inline">{t("inviteMember")}</span>
              </Button>
            )}
          </>
        }
      />

      {/* Stats Row — phones: three cards across one row (value over label,
          icon hidden) instead of three full-width stacked rows. */}
      {!loading && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {stats.map((s) => (
              <div key={s.label} className="flex items-center gap-3 rounded-xl border border-border bg-background/80 p-2 sm:p-2.5">
              <div className="hidden shrink-0 rounded-xl border border-border bg-background/80 chip-pad sm:block">
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div className="flex flex-col-reverse items-center gap-1 flex-1 min-w-0 sm:flex-col sm:items-start">
                <p className="text-[11px] font-medium text-muted-foreground truncate sm:text-sm">{s.label}</p>
                <p className={`text-lg sm:text-2xl font-bold ${s.color} leading-none tabular-nums shrink-0`}>{s.value}</p>
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
      ) : (
        <div className="space-y-4">
          {/* ── Search & Export Toolbar (always mounted: hiding it with the
              empty state stranded a search that returned 0 with no way back) ── */}
          <InlineFilterBar
            className="workspace-panel-surface rounded-2xl border-b-0"
            onExportCsv={handleExportCsv}
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
            onClear={search ? () => setSearch("") : undefined}
          >
            <InlineFilterSearch
              value={search}
              onChange={setSearch}
              placeholder={t("searchPlaceholder")}
            />
          </InlineFilterBar>

        {members.length === 0 && !search ? (
          /* ── Empty State (true empty keeps its invite CTA; a search with no
              hits renders the table empty row below instead) ── */
          <div className="workspace-panel-surface rounded-2xl p-12 flex flex-col items-center justify-center gap-4 text-center">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Users className="h-8 w-8 text-primary/60" />
            </div>
            <div className="space-y-1 max-w-xs">
              <p className="font-semibold text-foreground">{t("empty.title")}</p>
              <p className="text-sm text-muted-foreground">
                {t("empty.description")}
              </p>
            </div>
            {TEAM_INVITE_ENABLED && (
              <Button onClick={() => setShowInviteModal(true)} className="mt-1">
                <Plus className="h-4 w-4 me-2" />
                {t("empty.cta")}
              </Button>
            )}
          </div>
        ) : (
        <div className="workspace-panel-surface overflow-hidden rounded-2xl">
          {/* ── Desktop Table ── */}
          <div className="hidden overflow-x-auto md:block" tabIndex={0}>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("role")}</TableHead>
                  <TableHead>{t("jobAccess")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("joined")}</TableHead>
                  <TableHead className="text-right">{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
              {members.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-12">
                    <EmptyState title={t("empty.title")} description={t("empty.description")} icon={Inbox} />
                  </TableCell>
                </TableRow>
              ) : members.map((member) => (
                  <TableRow key={member._id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <UserAvatar name={member.user?.name} email={member.email} className="h-9 w-9" colorful />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-sm">
                            {member.user?.name ?? (
                              <span className="italic text-muted-foreground">{t("pendingInvite")}</span>
                            )}
                          </div>
                          <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                            <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                            <span className="truncate">{member.email}</span>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="whitespace-nowrap text-xs">
                        {getJobAccessLabel(member)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`gap-1 ${STATUS_COLORS[member.status]}`}>
                        {member.status === "pending" && <Mail className="h-3 w-3" />}
                        {statusLabel(member.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {member.acceptedAt
                        ? formatDate(member.acceptedAt, { day: "2-digit", month: "short", year: "numeric" }, locale)
                        : member.invitedAt
                          ? t("invited", { date: formatDate(member.invitedAt, { day: "2-digit", month: "short", year: "numeric" }, locale) })
                          : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        name={member.user?.name ?? member.email}
                        quick={editAction(member)}
                        menu={member.companyRole !== "owner" && member.status !== "deactivated"
                          ? [{ key: "deactivate", label: t("deactivateMember"), icon: UserX, destructive: true, onSelect: () => { void handleDeactivate(member._id); } }]
                          : []}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* ── Mobile Card List ── */}
          <div className="md:hidden divide-y divide-border/40">
            {members.length === 0 && (
              <div className="py-10">
                <EmptyState title={t("empty.title")} description={t("empty.description")} icon={Inbox} />
              </div>
            )}
            {members.map((member) => (
              <div key={member._id} className="p-4 space-y-3">
                {/* Member info row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <UserAvatar name={member.user?.name} email={member.email} className="h-10 w-10 shrink-0" colorful />
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">
                        {member.user?.name ?? (
                          <span className="text-muted-foreground italic">{t("pendingInvite")}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">{member.email}</span>
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                    <RowActions
                      name={member.user?.name ?? member.email}
                      quick={editAction(member)}
                      menu={member.companyRole !== "owner" && member.status !== "deactivated"
                        ? [{ key: "deactivate", label: t("deactivateMember"), icon: UserX, destructive: true, onSelect: () => { void handleDeactivate(member._id); } }]
                        : []}
                    />
                  </div>
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
                  </div>
                  <span className="text-xs text-muted-foreground ms-auto">
                    {member.acceptedAt
                      ? formatDate(member.acceptedAt, { day: "2-digit", month: "short", year: "numeric" }, locale)
                      : member.invitedAt
                        ? t("invited", { date: formatDate(member.invitedAt, { day: "2-digit", month: "short", year: "numeric" }, locale) })
                        : "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        )}

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
      <InviteMemberDialog
        open={showInviteModal}
        onOpenChange={setShowInviteModal}
        roleOptions={roleOptions}
        jobOptions={jobOptions}
        showJobAccessForRoles={showJobAccessForRoles}
      />

      {/* Job Access Edit Modal */}
      <Dialog open={!!editingMember} onOpenChange={(open) => { if (!open) { setEditingMember(null); setEditJobAccess([]); setEditRole(""); setEditPermissionOverrides({}); } }}>
        <DialogContent className="w-full max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Briefcase className="h-4 w-4 text-primary" />
              </div>
              {editingScopesJobs ? t("jobAccessModal.title") : t("editRole")}
            </DialogTitle>
            <DialogDescription>
              {editingMember?.user?.name ?? editingMember?.email} — {editingMember ? roleLabel(editingMember.companyRole) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {editingMember?.companyRole !== "owner" && (
              <div className="space-y-2">
                <Label>{t("role")}</Label>
                <FormMultiSelect
                  placeholder={t("role")}
                  options={roleOptions}
                  value={editRole ? [editRole] : []}
                  onChange={(val) => setEditRole((val[0] ?? "") as CompanyRole | "")}
                  maxSelections={1}
                />
              </div>
            )}
            {editingScopesJobs && (
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
            )}

            <CompanyFunctionChecklist
              roles={(editingMember?.companyRoles?.length ? editingMember.companyRoles : editingMember ? [editingMember.companyRole] : []) as CompanyRole[]}
              overrides={editPermissionOverrides}
              onChange={setEditPermissionOverrides}
            />

            <DialogFooter className="gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => { setEditingMember(null); setEditJobAccess([]); setEditRole(""); setEditPermissionOverrides({}); }} className="flex-1 sm:flex-none">
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
