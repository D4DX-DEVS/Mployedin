"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { CascadingLocationPicker } from "@/components/shared/CascadingLocationPicker";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination } from "@/hooks/usePagination";
import { Plus, Pencil, Trash2, MapPin, Globe, Users, Ban } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  isActive: boolean;
  createdAt: string;
  superAgentProfile: SAProfile | null;
}

interface AgentOption {
  _id: string; // Agent doc _id
  userId: string;
  name: string;
}

export default function AdminSuperAgentsPage() {
  const t = useTranslations("adminSuperAgents");
  const { can } = usePermissions();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const [superAgents, setSuperAgents] = useState<SuperAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  // Available agents for assignment
  const [availableAgents, setAvailableAgents] = useState<AgentOption[]>([]);

  // Create modal
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", password: "", overrideCommissionRate: "0", defaultAgentCommissionRate: "0" });
  const [addCityIds, setAddCityIds] = useState<string[]>([]);
  const [addStateIds, setAddStateIds] = useState<string[]>([]);
  const [addAgentIds, setAddAgentIds] = useState<string[]>([]);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");

  // Edit modal
  const [editSA, setEditSA] = useState<SuperAgent | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", isActive: "true", overrideCommissionRate: "0", defaultAgentCommissionRate: "0" });
  const [editCityIds, setEditCityIds] = useState<string[]>([]);
  const [editStateIds, setEditStateIds] = useState<string[]>([]);
  const [editAgentIds, setEditAgentIds] = useState<string[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  // Fetch available agents (Agent doc _ids)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/agents?limit=200");
        if (!res.ok) return;
        const data = await res.json();
        const agents = (data.agents ?? []).map((a: { _id: string; name: string; agentProfile?: { _id?: string } }) => ({
          _id: a.agentProfile?._id ?? a._id, // prefer Agent doc _id
          userId: a._id,
          name: a.name,
        }));
        setAvailableAgents(agents);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const fetchSuperAgents = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    const res = await fetch(`/api/admin/super-agents?${params}`);
    if (res.ok) {
      const data = await res.json();
      setSuperAgents(data.superAgents ?? []);
      updateTotal(data.pagination?.total ?? 0);
    }
    setLoading(false);
  }, [search, page, limit, updateTotal]);

  useEffect(() => { fetchSuperAgents(); }, [fetchSuperAgents]);

  const exportColumns: ExportColumn<SuperAgent>[] = [
    { header: t("exportHeaderName"), key: "name" },
    { header: t("exportHeaderEmail"), key: "email" },
    { header: t("exportHeaderAgents"), key: "superAgentProfile" as keyof SuperAgent, formatter: (_v, r) => String((r as unknown as SuperAgent).superAgentProfile?.agentCount ?? 0) },
    { header: t("exportHeaderOverridePercent"), key: "superAgentProfile" as keyof SuperAgent, formatter: (_v, r) => String((r as unknown as SuperAgent).superAgentProfile?.overrideCommissionRate ?? 0) },
    { header: t("exportHeaderStatus"), key: "isActive", formatter: (v) => v !== false ? t("exportStatusActive") : t("exportStatusInactive") },
    { header: t("exportHeaderJoined"), key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : t("exportDashCharacter") },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: superAgents as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "super-agents",
    title: "Super Agents",
  });

  const handleCreate = async () => {
    setAddError("");
    if (!addForm.name || !addForm.email || !addForm.password) {
      setAddError(t("validationNameEmailPasswordRequired"));
      return;
    }
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
        const e = await res.json();
        setAddError(e.error ?? t("validationNetworkError"));
        return;
      }
      setShowAdd(false);
      setAddForm({ name: "", email: "", password: "", overrideCommissionRate: "0", defaultAgentCommissionRate: "0" });
      setAddCityIds([]);
      setAddStateIds([]);
      setAddAgentIds([]);
      fetchSuperAgents();
    } catch {
      setAddError(t("validationNetworkError"));
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
  };

  const handleEdit = async () => {
    if (!editSA) return;
    setEditError("");
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
        const e = await res.json();
        setEditError(e.error ?? t("validationNetworkError"));
        return;
      }
      setEditSA(null);
      fetchSuperAgents();
    } catch {
      setEditError(t("validationNetworkError"));
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ message: t("confirmDeactivateMessage"), confirmLabel: t("confirmDeactivateLabel") });
    if (!ok) return;
    await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id }),
    });
    fetchSuperAgents();
  };

  const handlePermanentDelete = async (id: string) => {
    const ok = await confirmDialog({ title: t("confirmDeleteTitle"), message: t("confirmDeleteMessage"), confirmLabel: t("confirmDeleteLabel") });
    if (!ok) return;
    await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id, permanent: true }),
    });
    fetchSuperAgents();
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

  const AgentCheckboxList = ({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) => (
    <div className="border rounded-lg max-h-48 overflow-y-auto p-2 space-y-1">
      {availableAgents.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2 text-center">{t("noAgentsAvailable")}</p>
      ) : availableAgents.map((agent) => (
        <label key={agent._id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm">
          <Checkbox
            checked={selected.includes(agent._id)}
            onCheckedChange={() => onToggle(agent._id)}
          />
          <span>{agent.name}</span>
        </label>
      ))}
    </div>
  );

  return (
    <div className="page-container space-y-4">
      {ConfirmDialogNode}
      <section className="workspace-panel-surface overflow-hidden rounded-[20px]">
        <div className="flex flex-col gap-3 border-b border-border/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{t("pageTitle")}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("pageSubtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                placeholder={t("searchPlaceholder")}
                className="h-8 w-52 rounded-lg pl-8 text-sm"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 rounded-lg border-border/80">
                  <Download className="h-3.5 w-3.5" /> {t("exportLabel")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>{t("exportLabel")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportCsv}><FileText className="h-4 w-4" />{t("csvFormat")}</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportExcel}><FileSpreadsheet className="h-4 w-4" />{t("excelFormat")}</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPdf}><FileText className="h-4 w-4" />{t("pdfFormat")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {can("super_agents", "create") && (
              <Button onClick={() => setShowAdd(true)} size="sm" className="h-8 rounded-lg">
                <Plus className="h-3.5 w-3.5" /> {t("addButtonLabel")}
              </Button>
            )}
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>{t("tableHeaderName")}</TableHead>
              <TableHead>{t("tableHeaderEmail")}</TableHead>
              <TableHead>{t("tableHeaderAgents")}</TableHead>
              <TableHead>{t("tableHeaderRegion")}</TableHead>
              <TableHead>{t("tableHeaderCommissionOverride")}</TableHead>
              <TableHead>{t("tableHeaderStatus")}</TableHead>
              <TableHead>{t("tableHeaderJoined")}</TableHead>
              {(can("super_agents", "update") || can("super_agents", "delete")) && (
                <TableHead>{t("tableHeaderActions")}</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : superAgents.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 opacity-40" />
                    <span className="text-sm">{t("noAgentsFound")}</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : superAgents.map((sa) => (
              <TableRow key={sa._id}>
                <TableCell className="font-medium">{sa.name}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{sa.email}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-primary" />
                    <Badge variant="secondary" className="text-xs">
                      {t("agentsBadge", { count: sa.superAgentProfile?.agentCount ?? 0 })}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-sm max-w-[200px]">
                  <div className="flex items-center gap-1 truncate">
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
                <TableCell><StatusBadge status={sa.isActive !== false ? "active" : "inactive"} /></TableCell>
                <TableCell className="text-muted-foreground text-sm">{new Date(sa.createdAt).toLocaleDateString()}</TableCell>
                {(can("super_agents", "update") || can("super_agents", "delete")) && (
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {can("super_agents", "update") && (
                        <Button variant="ghost" size="xs" onClick={() => openEdit(sa)} title={t("editTooltip")}>
                          <Pencil className="h-3.5 w-3.5 text-primary" />
                        </Button>
                      )}
                      {can("super_agents", "delete") && (
                        <Button variant="ghost" size="xs" onClick={() => handleDelete(sa._id)} title={t("deactivateTooltip")}>
                          <Ban className="h-3.5 w-3.5 text-amber-500" />
                        </Button>
                      )}
                      {can("super_agents", "delete") && (
                        <Button variant="ghost" size="xs" onClick={() => handlePermanentDelete(sa._id)} title={t("deletePermanentlyTooltip")}>
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

      {/* ── Add Super Agent Modal ──────────────────────────────── */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-none">
          <DialogHeader>
            <DialogTitle>{t("addModalTitle")}</DialogTitle>
            <DialogDescription>{t("addModalDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {addError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />{addError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("fullNameLabel")} <span className="text-destructive">{t("requiredField")}</span></Label>
                <Input value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("emailLabel")} <span className="text-destructive">{t("requiredField")}</span></Label>
                <Input type="email" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("passwordLabel")} <span className="text-destructive">{t("requiredField")}</span></Label>
                <Input type="password" value={addForm.password} onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))} placeholder={t("passwordPlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label>{t("overrideCommissionRateLabel")}</Label>
                <Input type="number" min="0" max="100" value={addForm.overrideCommissionRate} onChange={(e) => setAddForm((f) => ({ ...f, overrideCommissionRate: e.target.value }))} />
                <p className="text-xs text-muted-foreground">{t("overrideCommissionRateHint")}</p>
              </div>
              <div className="space-y-2">
                <Label>{t("defaultAgentCommissionRateLabel")}</Label>
                <Input type="number" min="0" max="100" value={addForm.defaultAgentCommissionRate} onChange={(e) => setAddForm((f) => ({ ...f, defaultAgentCommissionRate: e.target.value }))} />
                <p className="text-xs text-muted-foreground">{t("defaultAgentCommissionRateHint")}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("assignAgentsLabel")}</Label>
              <AgentCheckboxList selected={addAgentIds} onToggle={(id) => toggleAgentId(id, setAddAgentIds)} />
              {addAgentIds.length > 0 && (
                <p className="text-xs text-muted-foreground">{t("agentsSelectedCount", { count: addAgentIds.length })}</p>
              )}
            </div>

            <CascadingLocationPicker
              selectedCityIds={addCityIds}
              selectedStateIds={addStateIds}
              onChange={(cities, states) => { setAddCityIds(cities); setAddStateIds(states); }}
              label={t("assignedRegionLabel")}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setShowAdd(false)} disabled={addLoading}>{t("cancelButtonLabel")}</Button>
            <Button onClick={handleCreate} disabled={addLoading}>
              {addLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {addLoading ? t("creatingButtonLabel") : t("createButtonLabel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Super Agent Modal ──────────────────────────────── */}
      <Dialog open={!!editSA} onOpenChange={(open) => { if (!open) setEditSA(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-none">
          <DialogHeader>
            <DialogTitle>{t("editModalTitle")}</DialogTitle>
            <DialogDescription>{t("editModalDescriptionTemplate", { name: editSA?.name ?? "", email: editSA?.email ?? "" })}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {editError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />{editError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("fullNameLabel")}</Label>
                <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("emailLabel")}</Label>
                <Input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("statusLabel")}</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={editForm.isActive}
                  onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.value }))}
                >
                  <option value="true">{t("statusActive")}</option>
                  <option value="false">{t("statusInactive")}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t("overrideCommissionRateLabel")}</Label>
                <Input type="number" min="0" max="100" value={editForm.overrideCommissionRate} onChange={(e) => setEditForm((f) => ({ ...f, overrideCommissionRate: e.target.value }))} />
                <p className="text-xs text-muted-foreground">{t("overrideCommissionRateHint")}</p>
              </div>
              <div className="space-y-2">
                <Label>{t("defaultAgentCommissionRateLabel")}</Label>
                <Input type="number" min="0" max="100" value={editForm.defaultAgentCommissionRate} onChange={(e) => setEditForm((f) => ({ ...f, defaultAgentCommissionRate: e.target.value }))} />
                <p className="text-xs text-muted-foreground">{t("defaultAgentCommissionRateHintEdit")}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("assignAgentsLabel")}</Label>
              <AgentCheckboxList selected={editAgentIds} onToggle={(id) => toggleAgentId(id, setEditAgentIds)} />
              {editAgentIds.length > 0 && (
                <p className="text-xs text-muted-foreground">{t("agentsSelectedCount", { count: editAgentIds.length })}</p>
              )}
            </div>

            <CascadingLocationPicker
              selectedCityIds={editCityIds}
              selectedStateIds={editStateIds}
              onChange={(cities, states) => { setEditCityIds(cities); setEditStateIds(states); }}
              label={t("assignedRegionLabel")}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setEditSA(null)} disabled={editLoading}>{t("cancelButtonLabel")}</Button>
            <Button onClick={handleEdit} disabled={editLoading}>
              {editLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {editLoading ? t("savingButtonLabel") : t("updateButtonLabel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
