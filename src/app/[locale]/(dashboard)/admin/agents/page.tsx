"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { PageHero } from "@/components/shared/PageHero";
import { toast } from "sonner";
import { formErrorFromResponse } from "@/lib/errors/form-error";
import { accountFieldsError } from "@/lib/errors/account-fields";
import { PASSWORD_MIN_LENGTH } from "@/lib/security/passwordPolicy";
import { StepFormDialog } from "@/components/shared/StepFormDialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableBodySkeleton } from "@/components/ui/loading";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { CascadingLocationPicker } from "@/components/shared/CascadingLocationPicker";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { usePermissions } from "@/hooks/usePermissions";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { usePagination } from "@/hooks/usePagination";
import { Plus, Pencil, Trash2, MapPin, Globe, Ban, CheckCircle2 } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { InlineSearchSelect } from "@/components/shared/InlineSearchSelect";
import { InlineFilterBar, InlineFilterSearch } from "@/components/shared/InlineFilterBar";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { SortableTableHeader, TableSortControl } from "@/components/shared/TableSortControl";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import { Inbox } from "lucide-react";
import { formatDate } from "@/lib/ui/intlFormat";
import { UserAvatar } from "@/components/shared/UserAvatar";

interface AgentProfile {
  _id: string;
  superAgentId?: string;
  superAgentName?: string;
  commissionRate?: number;
  assignedCityIds?: { _id: string; name: string }[];
  assignedStateIds?: { _id: string; name: string }[];
}

interface Agent {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
  isActive: boolean;
  createdAt: string;
  agentProfile: AgentProfile | null;
}

interface SARegion {
  cityIds: { _id: string; name: string }[];
  stateIds: { _id: string; name: string }[];
}

interface SuperAgentOption {
  _id: string;
  saProfileId: string;
  userId: string;
  name: string;
  region: SARegion;
}

export default function AdminAgentsPage() {
  const tr = useTranslations("adminAgents");
  const tf = useTranslations("formErrors");
  const tc = useTranslations("common");
  const locale = useLocale();
  // Field name → on-screen label, so a server rejection can say "Check these
  // fields: Email" instead of echoing zod's English path/message.
  const agentFieldLabels = {
    name: tr("fullName"),
    email: tr("email"),
    password: tr("password"),
    commissionRate: tr("commissionRate"),
    superAgentId: tr("assignedSuperAgent"),
  };
  const { can } = usePermissions();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const [agents, setAgents] = useState<Agent[]>([]);
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

  // Super agent options for dropdown
  const [superAgents, setSuperAgents] = useState<SuperAgentOption[]>([]);

  // Create modal
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", password: "", superAgentId: "", commissionRate: "0" });
  const [addCityIds, setAddCityIds] = useState<string[]>([]);
  const [addStateIds, setAddStateIds] = useState<string[]>([]);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");
  // Step the banner belongs to: a taken email (409) sends the admin back to Account.
  const [addErrorStep, setAddErrorStep] = useState<number | undefined>();

  // Edit modal
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", isActive: "true", superAgentId: "", commissionRate: "0" });
  const [editCityIds, setEditCityIds] = useState<string[]>([]);
  const [editStateIds, setEditStateIds] = useState<string[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [editErrorStep, setEditErrorStep] = useState<number | undefined>();

  const exportColumns: ExportColumn<Agent>[] = [
    { header: tr("exportName"), key: "name" },
    { header: tr("exportEmail"), key: "email" },
    { header: tr("exportSuperAgent"), key: "agentProfile" as keyof Agent, formatter: (_v, r) => (r as unknown as Agent).agentProfile?.superAgentName ?? "—" },
    { header: tr("exportCommission"), key: "agentProfile" as keyof Agent, formatter: (_v, r) => String((r as unknown as Agent).agentProfile?.commissionRate ?? 0) },
    { header: tr("exportStatus"), key: "isActive", formatter: (v) => v !== false ? tr("active") : tr("inactive") },
    { header: tr("exportJoined"), key: "createdAt", formatter: (v) => v ? formatDate(new Date(String(v))) : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: agents as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "agents",
    title: tr("agents"),
  });

  // Fetch super agents with region data for dropdown + auto-fill
  useEffect(() => {
    fetch("/api/admin/super-agents?limit=200")
      .then((r) => r.json())
      .then((data) => {
        const items = (data.superAgents ?? []).map((sa: {
          _id: string; name: string;
          superAgentProfile?: {
            _id?: string;
            assignedCityIds?: { _id: string; name: string }[];
            assignedStateIds?: { _id: string; name: string }[];
          } | null;
        }) => ({
          _id: sa._id,
          saProfileId: sa.superAgentProfile?._id ?? "",
          userId: sa._id,
          name: sa.name,
          region: {
            cityIds: sa.superAgentProfile?.assignedCityIds ?? [],
            stateIds: sa.superAgentProfile?.assignedStateIds ?? [],
          },
        }));
        setSuperAgents(items);
      })
      .catch(console.error);
  }, []);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    if (statusFilter !== "all") params.set("status", statusFilter);
    params.set("sortBy", sortBy);
    params.set("sortOrder", sortOrder);
    try {
      const res = await fetch(`/api/admin/agents?${params}`);
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents ?? []);
        updateTotal(data.pagination?.total ?? 0);
      } else {
        setError(tr("toastFailedLoadAgents"));
        toast.error(tr("toastFailedLoadAgents"));
      }
    } catch {
      setError(tr("toastFailedLoadAgents"));
      toast.error(tr("toastFailedLoadAgents"));
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, sortBy, sortOrder, page, limit, updateTotal, tr]);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const toggleSort = (col: "name" | "createdAt") => {
    if (sortBy === col) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortOrder(col === "name" ? "asc" : "desc");
    }
    resetPage();
  };

  const handleActivate = async (id: string) => {
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id, isActive: true }),
      });
      if (res.ok) {
        toast.success(tr("toastAgentActivated"));
        fetchAgents();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || tr("toastFailedActivateAgent"));
      }
    } catch (error) {
      toast.error(tr("toastFailedActivateAgent"));
    }
  };

  const applySARegion = (
    saId: string,
    setCities: (ids: string[]) => void,
    setStates: (ids: string[]) => void,
  ) => {
    if (!saId) return;
    const sa = superAgents.find((s) => s.saProfileId === saId || s._id === saId);
    if (!sa) return;
    setCities(sa.region.cityIds.map((c) => c._id));
    setStates(sa.region.stateIds.map((s) => s._id));
  };

  /* Once a super agent is chosen, the region picker lists only that super
     agent's territory: the API rejects an agent region outside it, so a
     full-catalogue picker let the admin fill the form and then fail on save. */
  const regionPickerScope = (saUserId: string) => {
    if (!saUserId) return {};
    const sa = superAgents.find((s) => s._id === saUserId);
    return {
      locationsEndpoint: `/api/admin/super-agents/${saUserId}/territory/locations`,
      emptyMessage: tr("superAgentNoTerritory", { name: sa?.name ?? "" }),
    };
  };

  // Name / email / password are checked by the Account step before the dialog
  // lets the admin leave it, and again on submit (StepFormDialog).
  const handleCreate = async () => {
    setAddError("");
    setAddErrorStep(undefined);
    setAddLoading(true);
    try {
      const saProfile = superAgents.find((s) => s._id === addForm.superAgentId);
      const res = await fetch("/api/admin/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addForm.name,
          email: addForm.email,
          password: addForm.password,
          superAgentId: saProfile?.saProfileId || undefined,
          commissionRate: parseFloat(addForm.commissionRate) || 0,
          assignedCityIds: addCityIds,
          assignedStateIds: addStateIds,
        }),
      });
      if (!res.ok) {
        const { message } = await formErrorFromResponse(res, { t: tf, locale, fieldLabels: agentFieldLabels, conflict: tf("emailInUse") });
        setAddErrorStep(res.status === 409 ? 0 : undefined);
        setAddError(message);
        toast.error(message);
        return;
      }
      setShowAdd(false);
      setAddForm({ name: "", email: "", password: "", superAgentId: "", commissionRate: "0" });
      setAddCityIds([]);
      setAddStateIds([]);
      toast.success(tr("toastAgentCreated"));
      fetchAgents();
    } catch {
      setAddError(tr("networkError"));
    } finally {
      setAddLoading(false);
    }
  };

  const openEdit = (agent: Agent) => {
    setEditAgent(agent);
    const saProfileId = agent.agentProfile?.superAgentId?.toString() ?? "";
    const matchedSA = superAgents.find((sa) => sa.saProfileId === saProfileId);
    setEditForm({
      name: agent.name,
      email: agent.email,
      isActive: String(agent.isActive !== false),
      superAgentId: matchedSA?._id ?? "",
      commissionRate: String(agent.agentProfile?.commissionRate ?? 0),
    });

    const ownCities = agent.agentProfile?.assignedCityIds?.map((c) => c._id) ?? [];
    const ownStates = agent.agentProfile?.assignedStateIds?.map((s) => s._id) ?? [];

    if (ownCities.length === 0 && ownStates.length === 0 && matchedSA) {
      setEditCityIds(matchedSA.region.cityIds.map((c) => c._id));
      setEditStateIds(matchedSA.region.stateIds.map((s) => s._id));
    } else {
      setEditCityIds(ownCities);
      setEditStateIds(ownStates);
    }
    setEditError("");
    setEditErrorStep(undefined);
  };

  const handleEdit = async () => {
    if (!editAgent) return;
    setEditError("");
    setEditErrorStep(undefined);
    setEditLoading(true);
    try {
      const saProfile = superAgents.find((s) => s._id === editForm.superAgentId);
      const res = await fetch("/api/admin/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: editAgent._id,
          name: editForm.name,
          email: editForm.email,
          isActive: editForm.isActive === "true",
          superAgentId: saProfile?.saProfileId || null,
          commissionRate: parseFloat(editForm.commissionRate) || 0,
          assignedCityIds: editCityIds,
          assignedStateIds: editStateIds,
        }),
      });
      if (!res.ok) {
        const { message } = await formErrorFromResponse(res, { t: tf, locale, fieldLabels: agentFieldLabels, conflict: tf("emailInUse") });
        setEditErrorStep(res.status === 409 ? 0 : undefined);
        setEditError(message);
        toast.error(message);
        return;
      }
      setEditAgent(null);
      toast.success(tr("toastAgentUpdated"));
      fetchAgents();
    } catch {
      setEditError(tr("networkError"));
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ message: tr("deactivateConfirm"), confirmLabel: tr("deactivate") });
    if (!ok) return;
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        toast.error(e.error ?? tr("toastFailedDeactivateAgent"));
        return;
      }
      toast.success(tr("toastAgentDeactivated"));
    } catch {
      toast.error(tr("toastFailedDeactivateAgent"));
    }
    fetchAgents();
  };

  const handlePermanentDelete = async (id: string) => {
    const ok = await confirmDialog({ title: tr("deleteForeverTitle"), message: tr("deleteForeverConfirm"), confirmLabel: tr("deleteForever") });
    if (!ok) return;
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id, permanent: true }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        toast.error(e.error ?? tr("toastFailedDeleteAgent"));
        return;
      }
      toast.success(tr("toastAgentDeletedPermanently"));
    } catch {
      toast.error(tr("toastFailedDeleteAgent"));
    }
    fetchAgents();
  };

  const getLocationSummary = (profile: AgentProfile | null) => {
    if (!profile) return "—";
    const stateCount = profile.assignedStateIds?.length ?? 0;
    const cityCount = profile.assignedCityIds?.length ?? 0;
    if (stateCount === 0 && cityCount === 0) return "—";
    const parts: string[] = [];
    if (stateCount > 0) {
      const names = profile.assignedStateIds!.slice(0, 2).map((s) => s.name);
      parts.push(names.join(", ") + (stateCount > 2 ? ` +${stateCount - 2}` : "") + ` (${tr("state")})`);
    }
    if (cityCount > 0) {
      const names = profile.assignedCityIds!.slice(0, 2).map((c) => c.name);
      parts.push(names.join(", ") + (cityCount > 2 ? ` +${cityCount - 2}` : ""));
    }
    return parts.join(", ");
  };

  const rowActionsFor = (agent: Agent): { quick: RowAction[]; menu: RowAction[] } => {
    const menu: RowAction[] = [];

    if (can("agents", "delete")) {
      if (agent.isActive !== false) {
        menu.push({
          key: "deactivate",
          label: tr("deactivate"),
          icon: Ban,
          onSelect: () => handleDelete(agent._id),
          destructive: true,
        });
      } else {
        menu.push({
          key: "activate",
          label: tr("activate"),
          icon: CheckCircle2,
          onSelect: () => handleActivate(agent._id),
        });
      }
      menu.push({
        key: "delete",
        label: tr("deletePermanently"),
        icon: Trash2,
        onSelect: () => handlePermanentDelete(agent._id),
        destructive: true,
      });
    }

    const quick = can("agents", "update") ? {
      key: "edit",
      label: tr("edit"),
      icon: Pencil,
      iconOnly: true,
      onSelect: () => openEdit(agent),
    } : null;

    return { quick: quick ? [quick] : [], menu };
  };

  return (
    <div className="page-container">
      {ConfirmDialogNode}

      <PageHero
        compact
        compactOnMobile
        title={tr("agents")}
        description={tr("heroDescription")}
        actions={can("agents", "create") ? (
          <Button onClick={() => setShowAdd(true)} size="sm" className="h-9 rounded-xl shadow-sm">
            <Plus className="h-4 w-4" />
            {tr("addAgent")}
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
          placeholder={tr("searchAgentPlaceholder")}
        />
        <InlineSearchSelect
          options={[
            { value: "all", label: tr("statusFilterAll") },
            { value: "active", label: tr("active") },
            { value: "inactive", label: tr("inactive") },
          ]}
          value={statusFilter}
          onValueChange={(v) => { setStatusFilter(v); resetPage(); }}
          placeholder={tr("statusFilterAll")}
          className="h-11 w-32 rounded-lg text-xs sm:h-9 sm:text-sm"
        />
        <TableSortControl
          value={sortBy}
          onValueChange={(v) => { setSortBy(v === "name" ? "name" : "createdAt"); resetPage(); }}
          options={[
            { value: "createdAt", label: tr("joined") },
            { value: "name", label: tr("name") },
          ]}
          order={sortOrder}
          onOrderChange={(next) => { setSortOrder(next); resetPage(); }}
          compact
        />
      </InlineFilterBar>

      <section className="workspace-panel-surface overflow-hidden rounded-2xl">
        {error ? (
          <div className="p-6">
            <ErrorState onRetry={fetchAgents} />
          </div>
        ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>
                <SortableTableHeader label={tr("name")} active={sortBy === "name"} order={sortOrder} onClick={() => toggleSort("name")} />
              </TableHead>
              <TableHead>{tr("superAgent")}</TableHead>
              <TableHead>{tr("region")}</TableHead>
              <TableHead>{tr("commission")}</TableHead>
              <TableHead>
                <SortableTableHeader label={tr("joined")} active={sortBy === "createdAt"} order={sortOrder} onClick={() => toggleSort("createdAt")} />
              </TableHead>
              {(can("agents", "update") || can("agents", "delete")) && (
                <TableHead className="text-right">{tr("actions")}</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableBodySkeleton rows={5} cols={6} />
            ) : agents.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-12">
                  <EmptyState title={tr("noAgentsFound")} icon={Inbox} />
                </TableCell>
              </TableRow>
            ) : agents.map((agent) => (
              <TableRow key={agent._id} className="group">
                <TableCell>
                  <div className="flex items-start gap-3">
                    <UserAvatar name={agent.name} email={agent.email} src={agent.avatar} className="h-9 w-9" colorful />
                    <div className="flex min-w-0 flex-col items-start gap-1.5">
                      <span className="font-medium">{agent.name}</span>
                      <span className="text-xs text-muted-foreground">{agent.email}</span>
                      <StatusBadge status={agent.isActive !== false ? "active" : "inactive"} />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  {agent.agentProfile?.superAgentName ? (
                    <Badge variant="outline" className="text-xs">
                      {agent.agentProfile.superAgentName}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm max-w-[200px]">
                  <div className="flex items-center gap-1 truncate">
                    {(agent.agentProfile?.assignedStateIds?.length ?? 0) > 0 && (
                      <Globe className="h-3 w-3 text-primary shrink-0" />
                    )}
                    {(agent.agentProfile?.assignedCityIds?.length ?? 0) > 0 && (
                      <MapPin className="h-3 w-3 text-primary shrink-0" />
                    )}
                    <span className="truncate text-xs">{getLocationSummary(agent.agentProfile)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  {agent.agentProfile?.commissionRate != null ? `${agent.agentProfile.commissionRate}%` : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{formatDate(new Date(agent.createdAt), { day: "2-digit", month: "short", year: "numeric" })}</TableCell>
                {(can("agents", "update") || can("agents", "delete")) && (
                  <TableCell className="text-right">
                    <RowActions name={agent.name} {...rowActionsFor(agent)} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        )}
      </section>

      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />

      {/* ── Add Agent: Account → Assignment, on the Add Employer frame ── */}
      <StepFormDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        title={tr("addAgent")}
        description={tr("addAgentDescription")}
        error={addError}
        errorStep={addErrorStep}
        onErrorDismiss={() => setAddError("")}
        submitLabel={tr("createAgent")}
        submittingLabel={tr("creating")}
        submitting={addLoading}
        onSubmit={handleCreate}
        steps={[
          {
            label: tc("stepAccount"),
            validate: () => accountFieldsError(addForm, { t: tf, locale }),
            content: (
              <div className="grid gap-4">
                <div className="field">
                  <Label htmlFor="add-agent-name">{tr("fullName")} <span className="text-destructive">*</span></Label>
                  <Input id="add-agent-name" value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="field">
                  <Label htmlFor="add-agent-email">{tr("email")} <span className="text-destructive">*</span></Label>
                  <Input id="add-agent-email" type="email" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="field">
                  <Label htmlFor="add-agent-password">{tr("password")} <span className="text-destructive">*</span></Label>
                  <PasswordInput id="add-agent-password" value={addForm.password} onChange={(password) => setAddForm((f) => ({ ...f, password }))} placeholder={tf("passwordPlaceholder", { min: PASSWORD_MIN_LENGTH })} aria-describedby="add-agent-password-hint" />
                  <p id="add-agent-password-hint" className="text-xs text-muted-foreground">{tf("passwordHint", { min: PASSWORD_MIN_LENGTH })}</p>
                </div>
                <div className="field">
                  <Label htmlFor="add-agent-commission">{tr("commissionRate")}</Label>
                  <Input id="add-agent-commission" type="number" min="0" max="100" value={addForm.commissionRate} onChange={(e) => setAddForm((f) => ({ ...f, commissionRate: e.target.value }))} aria-describedby="add-agent-commission-help" />
                  <p id="add-agent-commission-help" className="text-xs text-muted-foreground">{tr("commissionRateHelp")}</p>
                </div>
              </div>
            ),
          },
          {
            label: tc("stepAssignment"),
            content: (
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="add-agent-super-agent">{tr("assignedSuperAgent")}</Label>
                  <InlineSearchSelect
                    id="add-agent-super-agent"
                    options={[
                      { value: "none", label: tr("none") },
                      ...superAgents.map((sa) => ({ value: sa._id, label: sa.name })),
                    ]}
                    value={addForm.superAgentId || "none"}
                    onValueChange={(v) => {
                      const id = v === "none" ? "" : v;
                      setAddForm((f) => ({ ...f, superAgentId: id }));
                      if (id) applySARegion(id, setAddCityIds, setAddStateIds);
                      else { setAddCityIds([]); setAddStateIds([]); }
                    }}
                    placeholder={tr("selectSuperAgentPlaceholder")}
                  />
                  {addForm.superAgentId && (() => {
                    const sa = superAgents.find((s) => s._id === addForm.superAgentId);
                    const regionCount = (sa?.region.stateIds.length ?? 0) + (sa?.region.cityIds.length ?? 0);
                    return regionCount > 0 ? (
                      <p className="text-xs text-primary flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {tr("regionAutoFilled", { name: sa?.name || "", count: regionCount })}
                      </p>
                    ) : null;
                  })()}
                </div>

                <CascadingLocationPicker
                  key={addForm.superAgentId || "catalogue"}
                  selectedCityIds={addCityIds}
                  selectedStateIds={addStateIds}
                  onChange={(cities, states) => { setAddCityIds(cities); setAddStateIds(states); }}
                  label={tr("assignedRegion")}
                  alwaysOpen
                  {...regionPickerScope(addForm.superAgentId)}
                />
              </div>
            ),
          },
        ]}
      />

      {/* ── Edit Agent: Account → Assignment ──────────────────────────── */}
      <StepFormDialog
        open={!!editAgent}
        onOpenChange={(open) => { if (!open) setEditAgent(null); }}
        title={tr("editAgent")}
        description={editAgent ? `${editAgent.name} — ${editAgent.email}` : undefined}
        error={editError}
        errorStep={editErrorStep}
        onErrorDismiss={() => setEditError("")}
        submitLabel={tr("updateAgent")}
        submittingLabel={tr("saving")}
        submitting={editLoading}
        onSubmit={handleEdit}
        steps={[
          {
            label: tc("stepAccount"),
            validate: () => accountFieldsError(editForm, { t: tf, locale }),
            content: (
              <div className="grid gap-4">
                <div className="field">
                  <Label htmlFor="edit-agent-name">{tr("fullName")}</Label>
                  <Input id="edit-agent-name" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="field">
                  <Label htmlFor="edit-agent-email">{tr("email")}</Label>
                  <Input id="edit-agent-email" type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="field">
                  <Label htmlFor="edit-agent-status">{tr("status")}</Label>
                  <InlineSearchSelect
                    id="edit-agent-status"
                    options={[
                      { value: "true", label: tr("active") },
                      { value: "false", label: tr("inactive") },
                    ]}
                    value={editForm.isActive}
                    onValueChange={(v) => setEditForm((f) => ({ ...f, isActive: v }))}
                  />
                </div>
                <div className="field">
                  <Label htmlFor="edit-agent-commission">{tr("commissionRate")}</Label>
                  <Input id="edit-agent-commission" type="number" min="0" max="100" value={editForm.commissionRate} onChange={(e) => setEditForm((f) => ({ ...f, commissionRate: e.target.value }))} aria-describedby="edit-agent-commission-help" />
                  <p id="edit-agent-commission-help" className="text-xs text-muted-foreground">{tr("commissionRateEditHelp")}</p>
                </div>
              </div>
            ),
          },
          {
            label: tc("stepAssignment"),
            content: (
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-agent-super-agent">{tr("assignedSuperAgent")}</Label>
                  <InlineSearchSelect
                    id="edit-agent-super-agent"
                    options={[
                      { value: "none", label: tr("none") },
                      ...superAgents.map((sa) => ({ value: sa._id, label: sa.name })),
                    ]}
                    value={editForm.superAgentId || "none"}
                    onValueChange={(v) => {
                      const id = v === "none" ? "" : v;
                      setEditForm((f) => ({ ...f, superAgentId: id }));
                      if (id) applySARegion(id, setEditCityIds, setEditStateIds);
                    }}
                    placeholder={tr("selectSuperAgentPlaceholder")}
                  />
                  {editForm.superAgentId && (() => {
                    const sa = superAgents.find((s) => s._id === editForm.superAgentId);
                    const regionCount = (sa?.region.stateIds.length ?? 0) + (sa?.region.cityIds.length ?? 0);
                    return regionCount > 0 ? (
                      <p className="text-xs text-primary flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {tr("regionFromTerritory", { name: sa?.name || "", count: regionCount })}
                      </p>
                    ) : null;
                  })()}
                </div>

                <CascadingLocationPicker
                  key={editForm.superAgentId || "catalogue"}
                  selectedCityIds={editCityIds}
                  selectedStateIds={editStateIds}
                  onChange={(cities, states) => { setEditCityIds(cities); setEditStateIds(states); }}
                  label={tr("assignedRegion")}
                  alwaysOpen
                  {...regionPickerScope(editForm.superAgentId)}
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
