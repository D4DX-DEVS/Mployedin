"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageHero } from "@/components/shared/PageHero";
import { toast } from "sonner";
import { apiErrorMessage } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { CascadingLocationPicker } from "@/components/shared/CascadingLocationPicker";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination } from "@/hooks/usePagination";
import { Plus, Pencil, Trash2, MapPin, Globe, Ban, CheckCircle2, ArrowUpDown } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { InlineSearchSelect } from "@/components/shared/InlineSearchSelect";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, Inbox, AlertCircle, Loader2, Download, FileSpreadsheet, FileText } from "lucide-react";

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
  const { can } = usePermissions();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
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

  // Edit modal
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", isActive: "true", superAgentId: "", commissionRate: "0" });
  const [editCityIds, setEditCityIds] = useState<string[]>([]);
  const [editStateIds, setEditStateIds] = useState<string[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  const exportColumns: ExportColumn<Agent>[] = [
    { header: tr("exportName"), key: "name" },
    { header: tr("exportEmail"), key: "email" },
    { header: tr("exportSuperAgent"), key: "agentProfile" as keyof Agent, formatter: (_v, r) => (r as unknown as Agent).agentProfile?.superAgentName ?? "—" },
    { header: tr("exportCommission"), key: "agentProfile" as keyof Agent, formatter: (_v, r) => String((r as unknown as Agent).agentProfile?.commissionRate ?? 0) },
    { header: tr("exportStatus"), key: "isActive", formatter: (v) => v !== false ? tr("active") : tr("inactive") },
    { header: tr("exportJoined"), key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "—" },
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
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    if (statusFilter !== "all") params.set("status", statusFilter);
    params.set("sortBy", sortBy);
    params.set("sortOrder", sortOrder);
    const res = await fetch(`/api/admin/agents?${params}`);
    if (res.ok) {
      const data = await res.json();
      setAgents(data.agents ?? []);
      updateTotal(data.pagination?.total ?? 0);
    }
    setLoading(false);
  }, [search, statusFilter, sortBy, sortOrder, page, limit, updateTotal]);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const toggleSort = (col: "name" | "createdAt") => {
    if (sortBy === col) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortOrder(col === "name" ? "asc" : "desc");
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
        toast.success("Agent activated successfully");
        fetchAgents();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to activate agent");
      }
    } catch (error) {
      toast.error("Failed to activate agent");
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

  const handleCreate = async () => {
    setAddError("");
    if (!addForm.name || !addForm.email || !addForm.password) {
      setAddError(tr("requiredFieldsError"));
      return;
    }
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
        const e = await res.json().catch(() => ({}));
        const msg = apiErrorMessage(e, tr("createAgentFailed"));
        setAddError(msg);
        toast.error(msg);
        return;
      }
      setShowAdd(false);
      setAddForm({ name: "", email: "", password: "", superAgentId: "", commissionRate: "0" });
      setAddCityIds([]);
      setAddStateIds([]);
      toast.success("Agent created successfully");
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
  };

  const handleEdit = async () => {
    if (!editAgent) return;
    setEditError("");
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
        const e = await res.json().catch(() => ({}));
        const msg = apiErrorMessage(e, tr("updateAgentFailed"));
        setEditError(msg);
        toast.error(msg);
        return;
      }
      setEditAgent(null);
      toast.success("Agent updated successfully");
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
        toast.error(e.error ?? "Failed to deactivate agent");
        return;
      }
      toast.success("Agent deactivated successfully");
    } catch {
      toast.error("Failed to deactivate agent");
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
        toast.error(e.error ?? "Failed to permanently delete agent");
        return;
      }
      toast.success("Agent permanently deleted");
    } catch {
      toast.error("Failed to permanently delete agent");
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

  return (
    <div className="page-container space-y-3 sm:space-y-4">
      {ConfirmDialogNode}

      <PageHero
        title={tr("agents")}
        description={tr("heroDescription")}
        eyebrow={tr("adminWorkspace")}
      />

      <section className="workspace-panel-surface overflow-hidden rounded-[20px]">
        {/* data-table-toolbar opts this hand-rolled header into the shared
            mobile toolbar rules, same as pages built on <TableToolbar>. */}
        <div data-table-toolbar="compact-admin" className="flex flex-wrap items-center gap-2 border-b border-border/80 px-3 py-2.5 sm:px-5 sm:py-4">
            <div className="relative toolbar-search-field">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                placeholder={tr("searchAgentPlaceholder")}
                className="h-8 w-52 rounded-lg pl-8 text-sm"
              />
            </div>
            <div className="w-[120px]">
              <InlineSearchSelect
                options={[
                  { value: "all", label: tr("statusFilterAll") },
                  { value: "active", label: tr("active") },
                  { value: "inactive", label: tr("inactive") },
                ]}
                value={statusFilter}
                onValueChange={(v) => { setStatusFilter(v); resetPage(); }}
                placeholder={tr("statusFilterAll")}
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 rounded-lg border-border/80">
                  <Download className="h-3.5 w-3.5" /> {tr("export")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>{tr("export")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportCsv}><FileText className="h-4 w-4" />{tr("csv")}</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportExcel}><FileSpreadsheet className="h-4 w-4" />{tr("excel")}</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPdf}><FileText className="h-4 w-4" />{tr("pdf")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {can("agents", "create") && (
              <Button onClick={() => setShowAdd(true)} size="sm" className="h-8 rounded-lg">
                <Plus className="h-3.5 w-3.5" /> {tr("addAgent")}
              </Button>
            )}
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>
                <button type="button" onClick={() => toggleSort("name")} className="flex items-center gap-1 hover:text-foreground">
                  {tr("name")} <ArrowUpDown className={`h-3 w-3 ${sortBy === "name" ? "text-primary" : "opacity-50"}`} />
                </button>
              </TableHead>
              <TableHead>{tr("superAgent")}</TableHead>
              <TableHead>{tr("region")}</TableHead>
              <TableHead>{tr("commission")}</TableHead>
              <TableHead>
                <button type="button" onClick={() => toggleSort("createdAt")} className="flex items-center gap-1 hover:text-foreground">
                  {tr("joined")} <ArrowUpDown className={`h-3 w-3 ${sortBy === "createdAt" ? "text-primary" : "opacity-50"}`} />
                </button>
              </TableHead>
              {(can("agents", "update") || can("agents", "delete")) && (
                <TableHead>{tr("actions")}</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : agents.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 opacity-40" />
                    <span className="text-sm">{tr("noAgentsFound")}</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : agents.map((agent) => (
              <TableRow key={agent._id}>
                <TableCell>
                  <div className="flex flex-col items-start gap-1.5">
                    <span className="font-medium">{agent.name}</span>
                    <span className="text-xs text-muted-foreground">{agent.email}</span>
                    <StatusBadge status={agent.isActive !== false ? "active" : "inactive"} />
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
                <TableCell className="text-muted-foreground text-sm">{new Date(agent.createdAt).toLocaleDateString()}</TableCell>
                {(can("agents", "update") || can("agents", "delete")) && (
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {can("agents", "update") && (
                        <Button variant="ghost" size="xs" onClick={() => openEdit(agent)} title={tr("edit")}>
                          <Pencil className="h-3.5 w-3.5 text-primary" />
                        </Button>
                      )}
                      {can("agents", "delete") && (agent.isActive !== false ? (
                        <Button variant="ghost" size="xs" onClick={() => handleDelete(agent._id)} title={tr("deactivate")}>
                          <Ban className="h-3.5 w-3.5 text-amber-500" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="xs" onClick={() => handleActivate(agent._id)} title={tr("activate")}>
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        </Button>
                      ))}
                      {can("agents", "delete") && (
                        <Button variant="ghost" size="xs" onClick={() => handlePermanentDelete(agent._id)} title={tr("deletePermanently")}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />

      {/* ── Add Agent Modal ──────────────────────────────── */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-none">
          <DialogHeader>
            <DialogTitle>{tr("addAgent")}</DialogTitle>
            <DialogDescription>{tr("addAgentDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {addError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />{addError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{tr("fullName")} <span className="text-destructive">*</span></Label>
                <Input value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{tr("email")} <span className="text-destructive">*</span></Label>
                <Input type="email" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{tr("password")} <span className="text-destructive">*</span></Label>
                <Input type="text" value={addForm.password} onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))} placeholder={tr("passwordPlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label>{tr("commissionRate")}</Label>
                <Input type="number" min="0" max="100" value={addForm.commissionRate} onChange={(e) => setAddForm((f) => ({ ...f, commissionRate: e.target.value }))} />
                <p className="text-xs text-muted-foreground">{tr("commissionRateHelp")}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{tr("assignedSuperAgent")}</Label>
              <InlineSearchSelect
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
              selectedCityIds={addCityIds}
              selectedStateIds={addStateIds}
              onChange={(cities, states) => { setAddCityIds(cities); setAddStateIds(states); }}
              label={tr("assignedRegion")}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setShowAdd(false)} disabled={addLoading}>{tr("cancel")}</Button>
            <Button onClick={handleCreate} disabled={addLoading}>
              {addLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {addLoading ? tr("creating") : tr("createAgent")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Agent Modal ──────────────────────────────── */}
      <Dialog open={!!editAgent} onOpenChange={(open) => { if (!open) setEditAgent(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-none">
          <DialogHeader>
            <DialogTitle>{tr("editAgent")}</DialogTitle>
            <DialogDescription>{editAgent?.name} — {editAgent?.email}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {editError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />{editError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{tr("fullName")}</Label>
                <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{tr("email")}</Label>
                <Input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{tr("status")}</Label>
                <InlineSearchSelect
                  options={[
                    { value: "true", label: tr("active") },
                    { value: "false", label: tr("inactive") },
                  ]}
                  value={editForm.isActive}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, isActive: v }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{tr("commissionRate")}</Label>
                <Input type="number" min="0" max="100" value={editForm.commissionRate} onChange={(e) => setEditForm((f) => ({ ...f, commissionRate: e.target.value }))} />
                <p className="text-xs text-muted-foreground">{tr("commissionRateEditHelp")}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{tr("assignedSuperAgent")}</Label>
              <InlineSearchSelect
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
              selectedCityIds={editCityIds}
              selectedStateIds={editStateIds}
              onChange={(cities, states) => { setEditCityIds(cities); setEditStateIds(states); }}
              label={tr("assignedRegion")}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setEditAgent(null)} disabled={editLoading}>{tr("cancel")}</Button>
            <Button onClick={handleEdit} disabled={editLoading}>
              {editLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {editLoading ? tr("saving") : tr("updateAgent")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
