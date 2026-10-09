"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { formErrorFromResponse } from "@/lib/errors/form-error";
import { accountFieldsError } from "@/lib/errors/account-fields";
import { PASSWORD_MIN_LENGTH } from "@/lib/security/passwordPolicy";
import { StepFormDialog } from "@/components/shared/StepFormDialog";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableBodySkeleton } from "@/components/ui/loading";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { CascadingLocationPicker } from "@/components/shared/CascadingLocationPicker";
import { TerritoryOverlapNotice } from "@/components/shared/TerritoryOverlapNotice";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { usePermissions } from "@/hooks/usePermissions";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { useOpenFromUrl } from "@/hooks/useOpenFromUrl";
import { usePagination } from "@/hooks/usePagination";
import { Plus, Pencil, Trash2, MapPin, Globe, Users, Ban, CheckCircle2 } from "lucide-react";
import { InlineSearchSelect } from "@/components/shared/InlineSearchSelect";
import { InlineFilterBar, InlineFilterSearch } from "@/components/shared/InlineFilterBar";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { SortableTableHeader, TableSortControl } from "@/components/shared/TableSortControl";
import { useConfirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Inbox } from "lucide-react";
import { formatListDate } from "@/lib/ui/intlFormat";
import { UserAvatar } from "@/components/shared/UserAvatar";

interface AgentRef {
  _id: string;
  name: string;
}

interface SAProfile {
  _id: string;
  overrideCommissionRate?: number;
  defaultAgentCommissionRate?: number;
  assignedCityIds?: { _id: string; name: string }[];
  assignedStateIds?: { _id: string; name: string }[];
  agents: AgentRef[];
  agentCount: number;
}

interface SuperAgent {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
  isActive: boolean;
  createdAt: string;
  superAgentProfile: SAProfile | null;
}

interface AgentOption {
  _id: string; // Agent doc _id
  userId: string;
  name: string;
  /** SuperAgent doc _id the agent already belongs to, if any. */
  superAgentId: string | null;
}

export default function AdminSuperAgentsPage() {
  const t = useTranslations("adminSuperAgents");
  const tf = useTranslations("formErrors");
  const tc = useTranslations("common");
  const locale = useLocale();
  // Field name → on-screen label for "Check these fields: …" copy.
  const superAgentFieldLabels = {
    name: t("fullNameLabel"),
    email: t("emailLabel"),
    password: t("passwordLabel"),
    overrideCommissionRate: t("overrideCommissionRateLabel"),
    defaultAgentCommissionRate: t("defaultAgentCommissionRateLabel"),
    agentIds: t("assignAgentsLabel"),
  };
  const { can } = usePermissions();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const [superAgents, setSuperAgents] = useState<SuperAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /* The search term addresses the view: an admin notification, a ⌘K people
     hit and the system-health panel all link here with `?search=<name>`,
     and a filter kept only in component state would silently ignore it. */
  const [search, setSearch] = useUrlFilter("search", "", { debounceMs: 400 });
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"createdAt" | "name">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  // Available agents for assignment
  const [availableAgents, setAvailableAgents] = useState<AgentOption[]>([]);

  // Create modal
  const [showAdd, setShowAdd] = useState(false);
  // User Management's "Create user" sends new super agents here with ?add=1.
  const [addParam, setAddParam] = useUrlFilter("add", "");
  useEffect(() => {
    if (addParam !== "1") return;
    setShowAdd(true);
    setAddParam("");
  }, [addParam, setAddParam]);
  const [addForm, setAddForm] = useState({ name: "", email: "", password: "", overrideCommissionRate: "0", defaultAgentCommissionRate: "0" });
  const [addCityIds, setAddCityIds] = useState<string[]>([]);
  const [addStateIds, setAddStateIds] = useState<string[]>([]);
  const [addAgentIds, setAddAgentIds] = useState<string[]>([]);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");
  // Step the banner belongs to: a taken email (409) sends the admin back to Account.
  const [addErrorStep, setAddErrorStep] = useState<number | undefined>();

  // Edit modal
  const [editSA, setEditSA] = useState<SuperAgent | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", isActive: "true", overrideCommissionRate: "0", defaultAgentCommissionRate: "0" });
  const [editCityIds, setEditCityIds] = useState<string[]>([]);
  const [editStateIds, setEditStateIds] = useState<string[]>([]);
  const [editAgentIds, setEditAgentIds] = useState<string[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [editErrorStep, setEditErrorStep] = useState<number | undefined>();

  // Fetch available agents (Agent doc _ids). Reloaded after every save, since
  // a save changes which super agent owns which agent.
  const loadAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/agents?limit=200");
      if (!res.ok) {
        toast.error(t("toastFailedLoadAgents"));
        return;
      }
      const data = await res.json();
      const agents = (data.agents ?? []).map((a: { _id: string; name: string; agentProfile?: { _id?: string; superAgentId?: string | null } }) => ({
        _id: a.agentProfile?._id ?? a._id, // prefer Agent doc _id
        userId: a._id,
        name: a.name,
        superAgentId: a.agentProfile?.superAgentId ?? null,
      }));
      setAvailableAgents(agents);
    } catch (e) {
      toast.error(t("toastFailedLoadAgents"));
    }
  }, []);

  useEffect(() => { loadAgents(); }, [loadAgents]);

  const fetchSuperAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search.trim()) params.set("search", search.trim());
    if (statusFilter !== "all") params.set("status", statusFilter);
    params.set("sortBy", sortBy);
    params.set("sortOrder", sortOrder);
    try {
      const res = await fetch(`/api/admin/super-agents?${params}`);
      if (res.ok) {
        const data = await res.json();
        setSuperAgents(data.superAgents ?? []);
        updateTotal(data.pagination?.total ?? 0);
      } else {
        setError(t("toastFailedLoadSuperAgents"));
        toast.error(t("toastFailedLoadSuperAgents"));
      }
    } catch (error) {
      setError(t("toastFailedLoadSuperAgents"));
      toast.error(t("toastFailedLoadSuperAgents"));
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, sortBy, sortOrder, page, limit, updateTotal, t]);

  const toggleSort = (col: "name" | "createdAt") => {
    if (sortBy === col) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortOrder(col === "name" ? "asc" : "desc");
    }
    resetPage();
  };

  useEffect(() => { fetchSuperAgents(); }, [fetchSuperAgents]);

  const exportColumns: ExportColumn<SuperAgent>[] = [
    { header: t("exportHeaderName"), key: "name" },
    { header: t("exportHeaderEmail"), key: "email" },
    { header: t("exportHeaderAgents"), key: "superAgentProfile" as keyof SuperAgent, formatter: (_v, r) => String((r as unknown as SuperAgent).superAgentProfile?.agentCount ?? 0) },
    { header: t("exportHeaderOverridePercent"), key: "superAgentProfile" as keyof SuperAgent, formatter: (_v, r) => String((r as unknown as SuperAgent).superAgentProfile?.overrideCommissionRate ?? 0) },
    { header: t("exportHeaderStatus"), key: "isActive", formatter: (v) => v !== false ? t("exportStatusActive") : t("exportStatusInactive") },
    { header: t("exportHeaderJoined"), key: "createdAt", formatter: (v) => v ? formatListDate(new Date(String(v))) : t("exportDashCharacter") },
  ];
  // BUG-004: export the full filtered result set, not just the visible page.
  const fetchAllSuperAgents = useCallback(async () => {
    const base = new URLSearchParams();
    if (search.trim()) base.set("search", search.trim());
    if (statusFilter !== "all") base.set("status", statusFilter);
    base.set("sortBy", sortBy);
    base.set("sortOrder", sortOrder);
    return fetchAllPaginated<Record<string, unknown>>(
      (page, limit) => `/api/admin/super-agents?${new URLSearchParams({ ...Object.fromEntries(base), page: String(page), limit: String(limit) })}`,
      (json) => ({
        rows: ((json.superAgents ?? []) as Record<string, unknown>[]),
        total: Number((json.pagination as { total?: number } | undefined)?.total ?? 0),
      }),
    );
  }, [search, statusFilter, sortBy, sortOrder]);
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: superAgents as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "super-agents",
    title: t("exportTitle"),
    fetchAll: fetchAllSuperAgents,
  });

  // Name / email / password are checked by the Account step before the dialog
  // lets the admin leave it, and again on submit (StepFormDialog).
  const handleCreate = async () => {
    setAddError("");
    setAddErrorStep(undefined);
    setAddLoading(true);
    try {
      const res = await fetch("/api/admin/super-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addForm.name,
          email: addForm.email,
          password: addForm.password,
          overrideCommissionRate: parseFloat(addForm.overrideCommissionRate) || 0,
          defaultAgentCommissionRate: parseFloat(addForm.defaultAgentCommissionRate) || 0,
          assignedCityIds: addCityIds,
          assignedStateIds: addStateIds,
          agentIds: addAgentIds,
        }),
      });
      if (!res.ok) {
        // Inline banner only — a toast repeating the same sentence was noise.
        const { message } = await formErrorFromResponse(res, { t: tf, locale, fieldLabels: superAgentFieldLabels, conflict: tf("emailInUse") });
        setAddErrorStep(res.status === 409 ? 0 : undefined);
        setAddError(message);
        return;
      }
      setShowAdd(false);
      setAddForm({ name: "", email: "", password: "", overrideCommissionRate: "0", defaultAgentCommissionRate: "0" });
      setAddCityIds([]);
      setAddStateIds([]);
      setAddAgentIds([]);
      toast.success(t("toastSuperAgentCreated"));
      fetchSuperAgents();
      loadAgents();
    } catch (error) {
      const msg = t("toastFailedCreateSuperAgent");
      setAddError(msg);
      toast.error(msg);
    } finally {
      setAddLoading(false);
    }
  };

  const openEdit = (sa: SuperAgent) => {
    setEditSA(sa);
    setEditForm({
      name: sa.name,
      email: sa.email,
      isActive: String(sa.isActive !== false),
      overrideCommissionRate: String(sa.superAgentProfile?.overrideCommissionRate ?? 0),
      defaultAgentCommissionRate: String(sa.superAgentProfile?.defaultAgentCommissionRate ?? 0),
    });
    setEditCityIds(sa.superAgentProfile?.assignedCityIds?.map((c) => c._id) ?? []);
    setEditStateIds(sa.superAgentProfile?.assignedStateIds?.map((s) => s._id) ?? []);
    setEditAgentIds(sa.superAgentProfile?.agents?.map((a) => a._id) ?? []);
    setEditError("");
    setEditErrorStep(undefined);
  };

  // User Management's "Assign team & territory" lands here with ?open=<userId>.
  useOpenFromUrl(superAgents, openEdit);

  const handleEdit = async () => {
    if (!editSA) return;
    setEditError("");
    setEditErrorStep(undefined);
    setEditLoading(true);
    try {
      const res = await fetch("/api/admin/super-agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: editSA._id,
          name: editForm.name,
          email: editForm.email,
          isActive: editForm.isActive === "true",
          overrideCommissionRate: parseFloat(editForm.overrideCommissionRate) || 0,
          defaultAgentCommissionRate: parseFloat(editForm.defaultAgentCommissionRate) || 0,
          assignedCityIds: editCityIds,
          assignedStateIds: editStateIds,
          agentIds: editAgentIds,
        }),
      });
      if (!res.ok) {
        const { message } = await formErrorFromResponse(res, { t: tf, locale, fieldLabels: superAgentFieldLabels, conflict: tf("emailInUse") });
        setEditErrorStep(res.status === 409 ? 0 : undefined);
        setEditError(message);
        return;
      }
      setEditSA(null);
      toast.success(t("toastSuperAgentUpdated"));
      fetchSuperAgents();
      loadAgents();
    } catch (error) {
      const msg = t("toastFailedUpdateSuperAgent");
      setEditError(msg);
      toast.error(msg);
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ message: t("confirmDeactivateMessage"), confirmLabel: t("confirmDeactivateLabel") });
    if (!ok) return;
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id }),
      });
      if (res.ok) {
        toast.success(t("toastSuperAgentDeactivated"));
        fetchSuperAgents();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t("toastFailedDeactivateSuperAgent"));
      }
    } catch (error) {
      toast.error(t("toastFailedDeactivateSuperAgent"));
    }
  };

  const handleActivate = async (id: string) => {
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id, isActive: true }),
      });
      if (res.ok) {
        toast.success(t("toastSuperAgentActivated"));
        fetchSuperAgents();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t("toastFailedActivateSuperAgent"));
      }
    } catch (error) {
      toast.error(t("toastFailedActivateSuperAgent"));
    }
  };

  const handlePermanentDelete = async (id: string) => {
    const ok = await confirmDialog({ title: t("confirmDeleteTitle"), message: t("confirmDeleteMessage"), confirmLabel: t("confirmDeleteLabel") });
    if (!ok) return;
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id, permanent: true }),
      });
      if (res.ok) {
        toast.success(t("toastSuperAgentDeletedPermanently"));
        fetchSuperAgents();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t("toastFailedDeleteSuperAgent"));
      }
    } catch (error) {
      toast.error(t("toastFailedDeleteSuperAgent"));
    }
  };

  const getLocationSummary = (profile: SAProfile | null) => {
    if (!profile) return t("locationSummaryDashCharacter");
    const stateCount = profile.assignedStateIds?.length ?? 0;
    const cityCount = profile.assignedCityIds?.length ?? 0;
    if (stateCount === 0 && cityCount === 0) return t("locationSummaryDashCharacter");
    const parts: string[] = [];
    if (stateCount > 0) {
      const names = profile.assignedStateIds!.slice(0, 2).map((s) => s.name);
      parts.push(names.join(", ") + (stateCount > 2 ? ` +${stateCount - 2}` : "") + ` ${t("locationStateLabel")}`);
    }
    if (cityCount > 0) {
      const names = profile.assignedCityIds!.slice(0, 2).map((c) => c.name);
      parts.push(names.join(", ") + (cityCount > 2 ? ` +${cityCount - 2}` : ""));
    }
    return parts.join(", ");
  };

  const toggleAgentId = (id: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  /* Only agents nobody owns yet, plus this super agent's own. An agent under
     another super agent is moved from Admin → Agents → Edit, which keeps both
     super agents' teams in step; offering it here silently took it away. */
  /* A render function, not a component declared in here: a nested component
     is a new type on every render, so React remounted the list on each tick
     and its scroll jumped back to the top after every checkbox. */
  const renderAgentList = ({ selected, onToggle, ownSuperAgentId }: { selected: string[]; onToggle: (id: string) => void; ownSuperAgentId: string | null }) => {
    const assignable = availableAgents.filter((a) => !a.superAgentId || a.superAgentId === ownSuperAgentId);
    const ownedElsewhere = availableAgents.length - assignable.length;
    return (
      <>
        <div className="relative border rounded-lg max-h-72 overflow-y-auto space-y-1 chip-pad">
          {assignable.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2 text-center">{t("noAgentsAvailable")}</p>
          ) : assignable.map((agent) => (
            <label key={agent._id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm">
              <Checkbox
                checked={selected.includes(agent._id)}
                onCheckedChange={() => onToggle(agent._id)}
              />
              <span>{agent.name}</span>
            </label>
          ))}
        </div>
        {ownedElsewhere > 0 && (
          <p className="text-xs text-muted-foreground">{t("agentsOwnedElsewhereHint", { count: ownedElsewhere })}</p>
        )}
      </>
    );
  };

  const rowActionsFor = (sa: SuperAgent): { quick: RowAction[]; menu: RowAction[] } => {
    const menu: RowAction[] = [];

    if (can("super_agents", "delete")) {
      if (sa.isActive !== false) {
        menu.push({
          key: "deactivate",
          label: t("deactivateTooltip"),
          icon: Ban,
          onSelect: () => handleDelete(sa._id),
          destructive: true,
        });
      } else {
        menu.push({
          key: "activate",
          label: t("activateTooltip"),
          icon: CheckCircle2,
          onSelect: () => handleActivate(sa._id),
        });
      }
      menu.push({
        key: "delete",
        label: t("deletePermanentlyTooltip"),
        icon: Trash2,
        onSelect: () => handlePermanentDelete(sa._id),
        destructive: true,
      });
    }

    const quick = can("super_agents", "update") ? {
      key: "edit",
      label: t("editTooltip"),
      icon: Pencil,
      iconOnly: true,
      onSelect: () => openEdit(sa),
    } : null;

    return { quick: quick ? [quick] : [], menu };
  };

  return (
    <div className="page-container">
      {ConfirmDialogNode}

      {/* Page Header */}
      <DashboardPageHeader
        compact
        title={t("pageTitle")}
        description={t("pageSubtitle")}
        compactOnMobile
        actions={can("super_agents", "create") ? (
          <Button onClick={() => setShowAdd(true)} size="sm" className="h-9 rounded-xl shadow-sm">
            <Plus className="h-4 w-4" />
            {t("addButtonLabel")}
          </Button>
        ) : undefined}
      />

      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
      >
        <InlineFilterSearch
          value={search}
          onChange={(value) => { setSearch(value); resetPage(); }}
          placeholder={t("searchPlaceholder")}
        />
        <InlineSearchSelect
          options={[
            { value: "all", label: t("statusFilterAll") },
            { value: "active", label: t("statusFilterActive") },
            { value: "inactive", label: t("statusFilterInactive") },
          ]}
          value={statusFilter}
          onValueChange={(v) => { setStatusFilter(v); resetPage(); }}
          placeholder={t("statusFilterAll")}
          className="h-11 w-32 rounded-lg text-xs sm:h-9 sm:text-sm"
        />
        <TableSortControl
          value={sortBy}
          onValueChange={(v) => { setSortBy(v === "name" ? "name" : "createdAt"); resetPage(); }}
          options={[
            { value: "createdAt", label: t("tableHeaderJoined") },
            { value: "name", label: t("tableHeaderName") },
          ]}
          order={sortOrder}
          onOrderChange={(next) => { setSortOrder(next); resetPage(); }}
          compact
        />
      </InlineFilterBar>

      <section className="workspace-panel-surface overflow-hidden rounded-2xl">
        {error ? (
          <div className="p-6">
            <ErrorState onRetry={fetchSuperAgents} />
          </div>
        ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>
                <SortableTableHeader label={t("tableHeaderName")} active={sortBy === "name"} order={sortOrder} onClick={() => toggleSort("name")} />
              </TableHead>
              <TableHead>{t("tableHeaderAgents")}</TableHead>
              <TableHead>{t("tableHeaderRegion")}</TableHead>
              <TableHead>{t("tableHeaderCommissionOverride")}</TableHead>
              <TableHead>
                <SortableTableHeader label={t("tableHeaderJoined")} active={sortBy === "createdAt"} order={sortOrder} onClick={() => toggleSort("createdAt")} />
              </TableHead>
              {(can("super_agents", "update") || can("super_agents", "delete")) && (
                <TableHead className="text-right">{t("tableHeaderActions")}</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableBodySkeleton rows={5} cols={6} />
            ) : superAgents.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-12">
                  <EmptyState title={t("noAgentsFound")} icon={Inbox} />
                </TableCell>
              </TableRow>
            ) : superAgents.map((sa) => (
              <TableRow key={sa._id} className="group">
                <TableCell>
                  <div className="flex items-start gap-3">
                    <UserAvatar name={sa.name} email={sa.email} src={sa.avatar} className="h-9 w-9" colorful />
                    <div className="flex min-w-0 flex-col items-start gap-1.5">
                      <span className="font-medium">{sa.name}</span>
                      <span className="text-xs text-muted-foreground">{sa.email}</span>
                      <StatusBadge status={sa.isActive !== false ? "active" : "inactive"} />
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-primary" />
                    <Badge variant="secondary" className="text-xs">
                      {t("agentsBadge", { count: sa.superAgentProfile?.agentCount ?? 0 })}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-sm max-w-[200px]">
                  <div className="flex items-center gap-1 truncate" title={getLocationSummary(sa.superAgentProfile)}>
                    {(sa.superAgentProfile?.assignedStateIds?.length ?? 0) > 0 && (
                      <Globe className="h-3 w-3 text-primary shrink-0" />
                    )}
                    {(sa.superAgentProfile?.assignedCityIds?.length ?? 0) > 0 && (
                      <MapPin className="h-3 w-3 text-primary shrink-0" />
                    )}
                    <span className="truncate text-xs">{getLocationSummary(sa.superAgentProfile)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  {sa.superAgentProfile?.overrideCommissionRate != null
                    ? `${sa.superAgentProfile.overrideCommissionRate}%`
                    : t("exportDashCharacter")}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{formatListDate(new Date(sa.createdAt), locale)}</TableCell>
                {(can("super_agents", "update") || can("super_agents", "delete")) && (
                  <TableCell className="text-right">
                    <RowActions name={sa.name} {...rowActionsFor(sa)} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        )}
      </section>

      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />

      {/* ── Add Super Agent: Account → Agents → Region, on the Add Employer frame.
             Three steps because the agent list plus an open region picker
             alone fill a laptop screen. ── */}
      <StepFormDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        title={t("addModalTitle")}
        description={t("addModalDescription")}
        error={addError}
        errorStep={addErrorStep}
        onErrorDismiss={() => setAddError("")}
        submitLabel={t("createButtonLabel")}
        submittingLabel={t("creatingButtonLabel")}
        submitting={addLoading}
        onSubmit={handleCreate}
        steps={[
          {
            label: tc("stepAccount"),
            validate: () => accountFieldsError(addForm, { t: tf, locale }),
            content: (
              <div className="grid gap-4">
                <div className="field">
                  <Label htmlFor="add-sa-name">{t("fullNameLabel")} <span className="text-destructive">{t("requiredField")}</span></Label>
                  <Input id="add-sa-name" value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="field">
                  <Label htmlFor="add-sa-email">{t("emailLabel")} <span className="text-destructive">{t("requiredField")}</span></Label>
                  <Input id="add-sa-email" type="email" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="field">
                  <Label htmlFor="add-sa-password">{t("passwordLabel")} <span className="text-destructive">{t("requiredField")}</span></Label>
                  <PasswordInput id="add-sa-password" value={addForm.password} onChange={(password) => setAddForm((f) => ({ ...f, password }))} placeholder={tf("passwordPlaceholder", { min: PASSWORD_MIN_LENGTH })} aria-describedby="add-super-agent-password-hint" />
                  <p id="add-super-agent-password-hint" className="text-xs text-muted-foreground">{tf("passwordHint", { min: PASSWORD_MIN_LENGTH })}</p>
                </div>
                <div className="field">
                  <Label htmlFor="add-sa-override-rate">{t("overrideCommissionRateLabel")}</Label>
                  <Input id="add-sa-override-rate" type="number" min="0" max="100" value={addForm.overrideCommissionRate} onChange={(e) => setAddForm((f) => ({ ...f, overrideCommissionRate: e.target.value }))} aria-describedby="add-sa-override-rate-hint" />
                  <p id="add-sa-override-rate-hint" className="text-xs text-muted-foreground">{t("overrideCommissionRateHint")}</p>
                </div>
              </div>
            ),
          },
          {
            label: tc("stepAgents"),
            content: (
              <div className="grid gap-4">
                <div className="field">
                  <Label htmlFor="add-sa-default-rate">{t("defaultAgentCommissionRateLabel")}</Label>
                  <Input id="add-sa-default-rate" type="number" min="0" max="100" value={addForm.defaultAgentCommissionRate} onChange={(e) => setAddForm((f) => ({ ...f, defaultAgentCommissionRate: e.target.value }))} aria-describedby="add-sa-default-rate-hint" />
                  <p id="add-sa-default-rate-hint" className="text-xs text-muted-foreground">{t("defaultAgentCommissionRateHint")}</p>
                </div>
                <div role="group" aria-labelledby="add-sa-agents-label" className="space-y-2">
                  <p id="add-sa-agents-label" className="text-sm font-medium">{t("assignAgentsLabel")}</p>
                  {renderAgentList({ selected: addAgentIds, onToggle: (id) => toggleAgentId(id, setAddAgentIds), ownSuperAgentId: null })}
                  {addAgentIds.length > 0 && (
                    <p className="text-xs text-muted-foreground">{t("agentsSelectedCount", { count: addAgentIds.length })}</p>
                  )}
                </div>
              </div>
            ),
          },
          {
            label: tc("stepRegion"),
            content: (
              <div className="space-y-3">
                <CascadingLocationPicker
                  selectedCityIds={addCityIds}
                  selectedStateIds={addStateIds}
                  onChange={(cities, states) => { setAddCityIds(cities); setAddStateIds(states); }}
                  label={t("assignedRegionLabel")}
                  alwaysOpen
                />
                <TerritoryOverlapNotice role="super_agent" cityIds={addCityIds} stateIds={addStateIds} />
              </div>
            ),
          },
        ]}
      />

      {/* ── Edit Super Agent: Account → Agents → Region ─────────────────── */}
      <StepFormDialog
        open={!!editSA}
        onOpenChange={(open) => { if (!open) setEditSA(null); }}
        title={t("editModalTitle")}
        description={t("editModalDescriptionTemplate", { name: editSA?.name ?? "", email: editSA?.email ?? "" })}
        error={editError}
        errorStep={editErrorStep}
        onErrorDismiss={() => setEditError("")}
        submitLabel={t("updateButtonLabel")}
        submittingLabel={t("savingButtonLabel")}
        submitting={editLoading}
        onSubmit={handleEdit}
        steps={[
          {
            label: tc("stepAccount"),
            validate: () => accountFieldsError(editForm, { t: tf, locale }),
            content: (
              <div className="grid gap-4">
                <div className="field">
                  <Label htmlFor="edit-sa-name">{t("fullNameLabel")}</Label>
                  <Input id="edit-sa-name" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="field">
                  <Label htmlFor="edit-sa-email">{t("emailLabel")}</Label>
                  <Input id="edit-sa-email" type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="field">
                  <Label htmlFor="edit-sa-status">{t("statusLabel")}</Label>
                  <Select value={editForm.isActive} onValueChange={(v) => setEditForm((f) => ({ ...f, isActive: v }))}>
                    <SelectTrigger id="edit-sa-status" className="h-10 w-full rounded-md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">{t("statusActive")}</SelectItem>
                      <SelectItem value="false">{t("statusInactive")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="field">
                  <Label htmlFor="edit-sa-override-rate">{t("overrideCommissionRateLabel")}</Label>
                  <Input id="edit-sa-override-rate" type="number" min="0" max="100" value={editForm.overrideCommissionRate} onChange={(e) => setEditForm((f) => ({ ...f, overrideCommissionRate: e.target.value }))} aria-describedby="edit-sa-override-rate-hint" />
                  <p id="edit-sa-override-rate-hint" className="text-xs text-muted-foreground">{t("overrideCommissionRateHint")}</p>
                </div>
              </div>
            ),
          },
          {
            label: tc("stepAgents"),
            content: (
              <div className="grid gap-4">
                <div className="field">
                  <Label htmlFor="edit-sa-default-rate">{t("defaultAgentCommissionRateLabel")}</Label>
                  <Input id="edit-sa-default-rate" type="number" min="0" max="100" value={editForm.defaultAgentCommissionRate} onChange={(e) => setEditForm((f) => ({ ...f, defaultAgentCommissionRate: e.target.value }))} aria-describedby="edit-sa-default-rate-hint" />
                  <p id="edit-sa-default-rate-hint" className="text-xs text-muted-foreground">{t("defaultAgentCommissionRateHintEdit")}</p>
                </div>
                <div role="group" aria-labelledby="edit-sa-agents-label" className="space-y-2">
                  <p id="edit-sa-agents-label" className="text-sm font-medium">{t("assignAgentsLabel")}</p>
                  {renderAgentList({ selected: editAgentIds, onToggle: (id) => toggleAgentId(id, setEditAgentIds), ownSuperAgentId: editSA?.superAgentProfile?._id ?? null })}
                  {editAgentIds.length > 0 && (
                    <p className="text-xs text-muted-foreground">{t("agentsSelectedCount", { count: editAgentIds.length })}</p>
                  )}
                </div>
              </div>
            ),
          },
          {
            label: tc("stepRegion"),
            content: (
              <div className="space-y-3">
                <CascadingLocationPicker
                  selectedCityIds={editCityIds}
                  selectedStateIds={editStateIds}
                  onChange={(cities, states) => { setEditCityIds(cities); setEditStateIds(states); }}
                  label={t("assignedRegionLabel")}
                  alwaysOpen
                />
                <TerritoryOverlapNotice
                  role="super_agent"
                  cityIds={editCityIds}
                  stateIds={editStateIds}
                  excludeUserId={editSA?._id}
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
