"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { validatePasswordForForm, PASSWORD_MIN_LENGTH } from "@/lib/security/passwordPolicy";
import { FormError, formErrorFromResponse } from "@/lib/errors/form-error";
import { PageHero } from "@/components/shared/PageHero";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { SortableTableHeader, TableSortControl } from "@/components/shared/TableSortControl";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { TableBodySkeleton } from "@/components/ui/loading";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { usePagination } from "@/hooks/usePagination";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Inbox, ShieldCheck, ShieldOff, FileText, ExternalLink, Ban, LogIn, Loader2, UserCog, MoreHorizontal, Building2, MapPin, Mail, UserRoundCheck, UserRoundX } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AssignAgentDialog } from "./_components/AssignAgentDialog";
import type { EmployerAgentSummary } from "@/lib/agents/employerAssignment";
import { useConfirm } from "@/hooks/useConfirm";
import { formatDate } from "@/lib/ui/intlFormat";

interface Employer {
  _id: string;
  name?: string;
  companyName: string;
  email?: string;
  contactEmail?: string;
  industry?: string;
  location?: string;
  phone?: string;
  status?: string;
  isActive?: boolean;
  createdAt: string;
  verificationLevel?: "basic" | "company" | "premium";
  domainVerified?: boolean;
  verificationDocs?: string[];
  employerProfileId?: string;
  /** The agent running this account (null = none), with their super-agent. */
  assignedAgent?: EmployerAgentSummary | null;
}

export default function AdminEmployersPage() {
  const { can } = usePermissions();
  const router = useRouter();
  const t = useTranslations("adminEmployers");
  const tf = useTranslations("formErrors");
  const locale = useLocale();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /* The search term addresses the view: an admin notification, a ⌘K people
     hit and the system-health panel all link here with `?search=<name>`,
     and a filter kept only in component state would silently ignore it. */
  const [search, setSearch] = useUrlFilter("search", "", { debounceMs: 400 });
  // "none" surfaces employers waiting for an agent — e.g. super-agent link signups.
  const [agentFilter, setAgentFilter] = useUrlFilter("agent", "all", { allow: ["all", "none", "any"] });
  const [sortBy, setSortBy] = useUrlFilter("sortBy", "companyName", { allow: ["companyName", "industry", "createdAt"] });
  const [sortOrder, setSortOrder] = useUrlFilter("sortOrder", "asc", { allow: ["asc", "desc"] });
  const order = sortOrder === "desc" ? "desc" : "asc";
  const [assignItem, setAssignItem] = useState<Employer | null>(null);
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<Employer | null>(null);
  const [verifyItem, setVerifyItem] = useState<Employer | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyOverride, setVerifyOverride] = useState(false);
  const [verifyReason, setVerifyReason] = useState("");
  const [switchingEmployerId, setSwitchingEmployerId] = useState<string | null>(null);

  const getLocalePrefix = () => {
    const pathParts = window.location.pathname.split('/');
    return `/${pathParts[1] || 'en'}`;
  };

  const handleSwitchToEmployerView = async (employerId: string) => {
    setSwitchingEmployerId(employerId);
    try {
      const res = await fetch("/api/tenant/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employerId }),
      });
      if (res.ok) {
        const localePrefix = getLocalePrefix();
        router.push(`${localePrefix}/employer`);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? t("switchViewErrorFallback"));
      }
    } catch {
      toast.error(t("switchViewNetworkError"));
    } finally {
      setSwitchingEmployerId(null);
    }
  };

  const exportColumns: ExportColumn<Employer>[] = [
    { header: t("exportColumnCompany"), key: "companyName" },
    { header: t("exportColumnEmail"), key: "email" },
    { header: t("exportColumnIndustry"), key: "industry" },
    { header: t("exportColumnAgent"), key: "assignedAgent", formatter: (v, r) => r.assignedAgent?.name ?? "—" },
    { header: t("exportColumnStatus"), key: "status", formatter: (v, r) => r.status ?? (r.isActive !== false ? "active" : "inactive") },
    { header: t("exportColumnJoined"), key: "createdAt", formatter: (v) => v ? formatDate(new Date(String(v))) : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: employers as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "employers",
    title: t("exportTitle"),
  });

  const visibleStats = useMemo(() => ({
    active: employers.filter((employer) => employer.isActive !== false).length,
    assigned: employers.filter((employer) => Boolean(employer.assignedAgent)).length,
    verified: employers.filter((employer) => Boolean(employer.domainVerified)).length,
  }), [employers]);

  const fetchEmployers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    if (agentFilter !== "all") params.set("agentId", agentFilter);
    params.set("status", "all");
    params.set("sortBy", sortBy);
    params.set("sortOrder", sortOrder);
    try {
      const res = await fetch(`/api/employers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEmployers(data.items ?? data.employers ?? []);
        updateTotal(data.total ?? data.totalCount ?? data.pagination?.total ?? ((data.totalPages ?? data.pagination?.pages ?? 1) * limit));
      } else {
        setError(t("requestFailed"));
        toast.error(t("requestFailed"));
      }
    } catch {
      setError(t("requestFailed"));
      toast.error(t("requestFailed"));
    } finally {
      setLoading(false);
    }
  }, [search, agentFilter, sortBy, sortOrder, page, limit, t]);

  useEffect(() => { fetchEmployers(); }, [fetchEmployers]);

  /* Hoisted (not rebuilt in JSX) so the same array feeds both the modal and
     the field-label map that names rejected fields in error copy. */
  const fields: CrudField[] = useMemo(() => [
    { name: "name", label: t("fieldContactName"), type: "text", required: true },
    { name: "email", label: t("fieldEmail"), type: "email", required: true },
    { name: "password", label: t("fieldPassword"), type: "password", required: true, placeholder: tf("passwordPlaceholder", { min: PASSWORD_MIN_LENGTH }), hint: tf("passwordHint", { min: PASSWORD_MIN_LENGTH }) },
    { name: "companyName", label: t("fieldCompanyName"), type: "text", required: true },
    { name: "industry", label: t("fieldIndustry"), type: "text" },
    { name: "location", label: t("fieldLocation"), type: "text" },
    { name: "phone", label: t("fieldPhone"), type: "phone" },
  ], [t, tf]);
  const editFields = useMemo(() => fields.filter((f) => f.name !== "password"), [fields]);

  const handleCreate = async (values: Record<string, string>) => {
    /* Same rules the API enforces (strongPasswordSchema), explained in the
       admin's language and all at once — "at least 12 characters, this one
       has 8, and it needs an uppercase letter and a symbol" — instead of one
       English rule per attempt. The server still re-validates. */
    const passwordError = validatePasswordForForm(values.password ?? "", { locale, t: tf });
    if (passwordError) {
      throw new FormError(passwordError);
    }

    const res = await fetch("/api/employers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      throw await formErrorFromResponse(res, { t: tf, locale, fieldLabels: fields, conflict: tf("emailInUse") });
    }
    fetchEmployers();
  };

  const handleEdit = async (values: Record<string, string>) => {
    const res = await fetch(`/api/employers/${editItem!._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      throw await formErrorFromResponse(res, { t: tf, locale, fieldLabels: editFields, conflict: tf("emailInUse") });
    }
    setEditItem(null);
    fetchEmployers();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ message: t("deactivateConfirmMessage"), confirmLabel: t("deactivateConfirmLabel") });
    if (!ok) return;
    try {
      const res = await fetch(`/api/employers/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? t("requestFailed"));
        return;
      }
      toast.success(t("toastDeactivated"));
    } catch {
      toast.error(t("requestFailed"));
      return;
    }
    fetchEmployers();
  };

  const handlePermanentDelete = async (id: string) => {
    const ok = await confirmDialog({ title: t("permanentDeleteTitle"), message: t("permanentDeleteMessage"), confirmLabel: t("permanentDeleteLabel") });
    if (!ok) return;
    try {
      const res = await fetch(`/api/employers/${id}?permanent=true`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? t("requestFailed"));
        return;
      }
      toast.success(t("toastDeletedPermanently"));
    } catch {
      toast.error(t("requestFailed"));
      return;
    }
    fetchEmployers();
  };

  const handleVerify = async () => {
    if (!verifyItem) return;
    setVerifyLoading(true);
    setVerifyError(null);
    const res = await fetch(`/api/employers/${verifyItem._id}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ override: verifyOverride, reason: verifyReason || undefined }),
    });
    if (res.ok) {
      await res.json();
      setVerifyItem((prev) => prev ? { ...prev, domainVerified: true, verificationLevel: "company" } : prev);
      setEmployers((prev) => prev.map((e) => e._id === verifyItem._id
        ? { ...e, domainVerified: true, verificationLevel: "company" }
        : e));
      setVerifyOverride(false);
      setVerifyReason("");
    } else {
      const data = await res.json();
      setVerifyError(data.error ?? t("toastVerificationFailed"));
    }
    setVerifyLoading(false);
  };

  const handleRevoke = async () => {
    if (!verifyItem) return;
    const ok = await confirmDialog({ message: t("revokeConfirmMessage"), confirmLabel: t("revokeButtonLabel") });
    if (!ok) return;
    setVerifyLoading(true);
    try {
      const res = await fetch(`/api/employers/${verifyItem._id}/verify`, { method: "DELETE" });
      if (res.ok) {
        setVerifyItem((prev) => prev ? { ...prev, domainVerified: false, verificationLevel: "basic" } : prev);
        setEmployers((prev) => prev.map((e) => e._id === verifyItem._id
          ? { ...e, domainVerified: false, verificationLevel: "basic" }
          : e));
      } else {
        const err = await res.json().catch(() => ({}));
        setVerifyError(err.error ?? t("requestFailed"));
      }
    } catch {
      setVerifyError(t("requestFailed"));
    }
    setVerifyLoading(false);
  };

  const canManageRows = can("employers", "update") || can("employers", "delete") || can("employers", "approve");
  const tableColumnCount = canManageRows ? 5 : 4;

  return (
    <div className="page-container">
      {ConfirmDialogNode}

      <PageHero
        compactMetrics
        compactOnMobile
        icon={Building2}
        title={t("pageTitle")}
        description={t("pageDescription")}
        actions={can("employers", "create") ? (
          <Button onClick={() => setShowAdd(true)} size="sm" className="h-9 rounded-xl shadow-sm">
            <Plus className="h-4 w-4" />
            {t("addEmployerButton")}
          </Button>
        ) : undefined}
        metrics={[
          {
            label: t("metricTotal"),
            value: loading ? "—" : total,
            note: t("metricTotalNote"),
            icon: Building2,
            iconSurfaceClassName: "bg-primary/10",
            iconClassName: "text-primary",
          },
          {
            label: t("metricActive"),
            value: loading ? "—" : visibleStats.active,
            note: t("metricPageNote"),
            icon: UserRoundCheck,
            iconSurfaceClassName: "bg-emerald-500/10",
            iconClassName: "text-emerald-600",
          },
          {
            label: t("metricAssigned"),
            value: loading ? "—" : visibleStats.assigned,
            note: t("metricPageNote"),
            icon: UserCog,
            iconSurfaceClassName: "bg-sky-500/10",
            iconClassName: "text-sky-600",
          },
          {
            label: t("metricVerified"),
            value: loading ? "—" : visibleStats.verified,
            note: t("metricPageNote"),
            icon: ShieldCheck,
            iconSurfaceClassName: "bg-violet-500/10",
            iconClassName: "text-violet-600",
          },
        ]}
      />

      <TableToolbar
        title={t("directoryTitle")}
        description={t("directoryDescription")}
        search={search}
        onSearchChange={(value) => { setSearch(value); resetPage(); }}
        searchPlaceholder={t("searchPlaceholder")}
        filterLabel={t("agentFilterLabel")}
        hasActiveFilters={agentFilter !== "all"}
        filterContent={(
          <div className="grid gap-2 sm:max-w-xs">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground" htmlFor="employer-agent-filter">
              {t("agentFilterLabel")}
            </label>
            <Select value={agentFilter} onValueChange={(value) => { setAgentFilter(value); resetPage(); }}>
              <SelectTrigger id="employer-agent-filter" className="h-10 rounded-xl bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("agentFilterAll")}</SelectItem>
                <SelectItem value="none">{t("agentFilterNone")}</SelectItem>
                <SelectItem value="any">{t("agentFilterAny")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
        right={(
          <TableSortControl
            value={sortBy}
            onValueChange={(value) => { setSortBy(value); resetPage(); }}
            options={[
              { value: "companyName", label: t("tableHeaderCompany") },
              { value: "industry", label: t("tableHeaderIndustry") },
              { value: "createdAt", label: t("tableHeaderJoined") },
            ]}
            order={order}
            onOrderChange={(value) => { setSortOrder(value); resetPage(); }}
            compact
          />
        )}
      />

      <section className="workspace-panel-surface overflow-hidden rounded-3xl">
        {error ? (
          <div className="p-6">
            <ErrorState onRetry={fetchEmployers} />
          </div>
        ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="min-w-[260px]"><SortableTableHeader label={t("tableHeaderCompany")} active={sortBy === "companyName"} order={order} onClick={() => { setSortBy("companyName"); setSortOrder(sortBy === "companyName" && order === "asc" ? "desc" : "asc"); resetPage(); }} /></TableHead>
              <TableHead className="min-w-[180px]"><SortableTableHeader label={t("tableHeaderIndustry")} active={sortBy === "industry"} order={order} onClick={() => { setSortBy("industry"); setSortOrder(sortBy === "industry" && order === "asc" ? "desc" : "asc"); resetPage(); }} /></TableHead>
              <TableHead className="min-w-[180px]">{t("tableHeaderAgent")}</TableHead>
              <TableHead className="whitespace-nowrap"><SortableTableHeader label={t("tableHeaderJoined")} active={sortBy === "createdAt"} order={order} onClick={() => { setSortBy("createdAt"); setSortOrder(sortBy === "createdAt" && order === "asc" ? "desc" : "asc"); resetPage(); }} /></TableHead>
              {canManageRows && (
                <TableHead>{t("tableHeaderActions")}</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableBodySkeleton rows={5} cols={tableColumnCount} />
            ) : employers.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={tableColumnCount} className="py-16">
                  <EmptyState title={t("noEmployersFound")} icon={Inbox} />
                </TableCell>
              </TableRow>
            ) : employers.map((emp) => (
              <TableRow key={emp._id} className="group">
                <TableCell className="py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="h-10 w-10 rounded-xl bg-primary/10 ring-0">
                      <AvatarFallback className="rounded-xl bg-primary/10 text-xs font-bold text-primary">
                        {(emp.companyName || emp.name || "?")
                          .split(/\s+/)
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join("")
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold text-foreground">{emp.companyName || emp.name}</span>
                        {emp.domainVerified && (
                          <Badge className="gap-1 rounded-full border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                            <ShieldCheck className="h-3 w-3" />
                            {t("verifiedBadge")}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{emp.email ?? emp.contactEmail ?? "—"}</span>
                      </div>
                      <div className="mt-2">
                        <StatusBadge status={emp.status ?? (emp.isActive !== false ? "active" : "inactive")} />
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">{emp.industry ?? "—"}</p>
                    {emp.location && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{emp.location}</span>
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {emp.assignedAgent ? (
                    <div className="flex min-w-0 items-start gap-2">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600">
                        <UserRoundCheck className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{emp.assignedAgent.name}</p>
                        {emp.assignedAgent.superAgentName && (
                          <p className="truncate text-xs text-muted-foreground">{t("underSuperAgent", { name: emp.assignedAgent.superAgentName })}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <Badge variant="outline" className="gap-1.5 rounded-full border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-800">
                      <UserRoundX className="h-3 w-3" />
                      {t("noAgentBadge")}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(new Date(emp.createdAt))}</TableCell>
                {canManageRows && (
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="iconDense" className="opacity-70 transition-opacity group-hover:opacity-100" aria-label={t("rowActions")}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuLabel className="max-w-[190px] truncate">{emp.companyName || emp.name}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {can("employers", "approve") && (
                          <DropdownMenuItem onClick={() => setVerifyItem(emp)}>
                            <ShieldCheck className={emp.domainVerified ? "text-emerald-600" : ""} />
                            {emp.domainVerified ? t("verifiedButtonTitle") : t("verifyButtonTitle")}
                          </DropdownMenuItem>
                        )}
                        {can("employers", "update") && (
                          <DropdownMenuItem onClick={() => setAssignItem(emp)}>
                            <UserCog className={emp.assignedAgent ? "text-primary" : "text-amber-600"} />
                            {emp.assignedAgent ? t("changeAgentTitle") : t("assignAgentTitle")}
                          </DropdownMenuItem>
                        )}
                        {can("employers", "update") && (
                          <DropdownMenuItem onClick={() => setEditItem(emp)}>
                            <Pencil className="text-primary" />
                            {t("editButtonTitle")}
                          </DropdownMenuItem>
                        )}
                        {can("employers", "delete") && (
                          <DropdownMenuItem onClick={() => handleDelete(emp._id)}>
                            <Ban className="text-amber-500" />
                            {t("deactivateButtonTitle")}
                          </DropdownMenuItem>
                        )}
                        {can("employers", "delete") && (
                          <DropdownMenuItem onClick={() => handlePermanentDelete(emp._id)} className="text-destructive focus:text-destructive">
                            <Trash2 className="text-destructive" />
                            {t("deleteButtonTitle")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => handleSwitchToEmployerView(emp.employerProfileId ?? emp._id)}
                          disabled={switchingEmployerId === (emp.employerProfileId ?? emp._id) || emp.isActive === false}
                        >
                          {switchingEmployerId === (emp.employerProfileId ?? emp._id) ? (
                            <Loader2 className="animate-spin text-sky-600" />
                          ) : (
                            <LogIn className="text-sky-600" />
                          )}
                          {t("switchViewTitle")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        )}
      </section>

      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />

      <AssignAgentDialog
        employer={assignItem ? { userId: assignItem._id, companyName: assignItem.companyName || assignItem.name || "" } : null}
        onClose={() => setAssignItem(null)}
        onAssigned={(userId, agent) => {
          setEmployers((prev) => prev.map((e) => (e._id === userId ? { ...e, assignedAgent: agent } : e)));
          // Under a "No agent"/"Has agent" filter the row may no longer belong.
          if (agentFilter !== "all") fetchEmployers();
        }}
      />

      <CrudModal open={showAdd} onClose={() => setShowAdd(false)} title={t("addEmployerTitle")} fields={fields} onSubmit={handleCreate} />
      <CrudModal open={!!editItem} onClose={() => setEditItem(null)} title={t("editEmployerTitle")} fields={editFields}
        initialValues={editItem ? { name: editItem.name ?? "", email: editItem.email ?? editItem.contactEmail ?? "", companyName: editItem.companyName ?? "", industry: editItem.industry ?? "", location: editItem.location ?? "", phone: editItem.phone ?? "" } : undefined}
        onSubmit={handleEdit} />

      {/* Verification Modal */}
      <Dialog open={!!verifyItem} onOpenChange={(open) => { if (!open) { setVerifyItem(null); setVerifyError(null); setVerifyOverride(false); setVerifyReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("verificationDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("verificationDialogDescription", { companyName: verifyItem?.companyName || "" })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Current status */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t("verificationStatusLabel")}</span>
              {verifyItem?.domainVerified ? (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">{t("verifiedBadge")}</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">{t("verificationUnverified")}</Badge>
              )}
              {verifyItem?.verificationLevel && verifyItem.verificationLevel !== "basic" && (
                <Badge variant="secondary" className="capitalize">{t("verificationLevel", { level: verifyItem.verificationLevel })}</Badge>
              )}
            </div>

            {/* Documents */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">{t("uploadedDocumentsLabel")}</p>
              {(verifyItem?.verificationDocs?.length ?? 0) === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 rounded-lg bg-muted/30">
                  <FileText className="w-4 h-4" />
                  {t("noDocumentsUploaded")}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {verifyItem?.verificationDocs?.map((url) => {
                    const name = url.split("/").pop() ?? url;
                    return (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-xs text-primary rounded-lg border border-border/40 hover:bg-muted/30 transition-colors chip-pad"
                      >
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate flex-1">{name}</span>
                        <ExternalLink className="w-3 h-3 shrink-0 opacity-50" />
                      </a>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Error message */}
            {verifyError && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg chip-pad">
                <ShieldOff className="w-4 h-4 shrink-0" />
                <span>{verifyError}</span>
              </div>
            )}

            {/* KYC override (only when no documents and not yet verified) */}
            {!verifyItem?.domainVerified && (verifyItem?.verificationDocs?.length ?? 0) === 0 && (
              <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 chip-pad">
                <label className="flex items-start gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={verifyOverride}
                    onChange={(e) => setVerifyOverride(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    {t("noDocumentsOverrideLabel")}
                    <span className="text-muted-foreground"> {t("overrideAuditNote")}</span>
                  </span>
                </label>
                {verifyOverride && (
                  <Input
                    value={verifyReason}
                    onChange={(e) => setVerifyReason(e.target.value)}
                    placeholder={t("overridePlaceholder")}
                    className="h-9 text-sm"
                  />
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              {verifyItem?.domainVerified ? (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={verifyLoading}
                  onClick={handleRevoke}
                  className="flex-1"
                >
                  <ShieldOff className="w-3.5 h-3.5 me-1.5" />
                  {verifyLoading ? t("revokeButtonLoading") : t("revokeButtonLabel")}
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={verifyLoading || ((verifyItem?.verificationDocs?.length ?? 0) === 0 && !verifyOverride)}
                  onClick={handleVerify}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <ShieldCheck className="w-3.5 h-3.5 me-1.5" />
                  {verifyLoading ? t("verifyButtonLoading") : t("verifyButtonLabel")}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setVerifyItem(null)}>
                {t("closeButtonLabel")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
