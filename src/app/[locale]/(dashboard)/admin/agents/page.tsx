"use client";

import { useState, useEffect, useCallback } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { CascadingLocationPicker } from "@/components/shared/CascadingLocationPicker";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination } from "@/hooks/usePagination";
import { Plus, Pencil, Trash2, MapPin, Globe, UserX } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
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

interface SuperAgentOption {
  _id: string;
  userId: string;
  name: string;
}

export default function AdminAgentsPage() {
  const { can } = usePermissions();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
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
    { header: "Name", key: "name" },
    { header: "Email", key: "email" },
    { header: "Super Agent", key: "agentProfile" as keyof Agent, formatter: (_v, r) => (r as unknown as Agent).agentProfile?.superAgentName ?? "—" },
    { header: "Commission %", key: "agentProfile" as keyof Agent, formatter: (_v, r) => String((r as unknown as Agent).agentProfile?.commissionRate ?? 0) },
    { header: "Status", key: "isActive", formatter: (v) => v !== false ? "Active" : "Inactive" },
    { header: "Joined", key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: agents as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "agents",
    title: "Agents",
  });

  // Fetch super agents for dropdown
  useEffect(() => {
    fetch("/api/admin/users?role=super_agent&limit=100")
      .then((r) => r.json())
      .then((data) => {
        const users = data.users ?? [];
        setSuperAgents(users.map((u: { _id: string; name: string }) => ({
          _id: u._id,
          userId: u._id,
          name: u.name,
        })));
      })
      .catch(console.error);
  }, []);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    const res = await fetch(`/api/admin/agents?${params}`);
    if (res.ok) {
      const data = await res.json();
      setAgents(data.agents ?? []);
      updateTotal(data.pagination?.total ?? 0);
    }
    setLoading(false);
  }, [search, page, limit, updateTotal]);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const handleCreate = async () => {
    setAddError("");
    if (!addForm.name || !addForm.email || !addForm.password) {
      setAddError("Name, email, and password are required");
      return;
    }
    setAddLoading(true);
    try {
      const res = await fetch("/api/admin/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addForm.name,
          email: addForm.email,
          password: addForm.password,
          superAgentId: addForm.superAgentId || undefined,
          commissionRate: parseFloat(addForm.commissionRate) || 0,
          assignedCityIds: addCityIds,
          assignedStateIds: addStateIds,
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        setAddError(e.error ?? "Failed to create agent");
        return;
      }
      setShowAdd(false);
      setAddForm({ name: "", email: "", password: "", superAgentId: "", commissionRate: "0" });
      setAddCityIds([]);
      setAddStateIds([]);
      fetchAgents();
    } catch {
      setAddError("Network error");
    } finally {
      setAddLoading(false);
    }
  };

  const openEdit = (agent: Agent) => {
    setEditAgent(agent);
    setEditForm({
      name: agent.name,
      email: agent.email,
      isActive: String(agent.isActive !== false),
      superAgentId: agent.agentProfile?.superAgentId?.toString() ?? "",
      commissionRate: String(agent.agentProfile?.commissionRate ?? 0),
    });
    setEditCityIds(agent.agentProfile?.assignedCityIds?.map((c) => c._id) ?? []);
    setEditStateIds(agent.agentProfile?.assignedStateIds?.map((s) => s._id) ?? []);
    setEditError("");
  };

  const handleEdit = async () => {
    if (!editAgent) return;
    setEditError("");
    setEditLoading(true);
    try {
      const res = await fetch("/api/admin/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: editAgent._id,
          name: editForm.name,
          email: editForm.email,
          isActive: editForm.isActive === "true",
          superAgentId: editForm.superAgentId || null,
          commissionRate: parseFloat(editForm.commissionRate) || 0,
          assignedCityIds: editCityIds,
          assignedStateIds: editStateIds,
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        setEditError(e.error ?? "Failed to update");
        return;
      }
      setEditAgent(null);
      fetchAgents();
    } catch {
      setEditError("Network error");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ message: "Deactivate this agent? They won't be able to log in.", confirmLabel: "Deactivate" });
    if (!ok) return;
    await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id }),
    });
    fetchAgents();
  };

  const handlePermanentDelete = async (id: string) => {
    const ok = await confirmDialog({ title: "Permanently Delete Agent", message: "This will permanently delete the agent and their profile. This cannot be undone.", confirmLabel: "Delete Forever" });
    if (!ok) return;
    await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id, permanent: true }),
    });
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
      parts.push(names.join(", ") + (stateCount > 2 ? ` +${stateCount - 2}` : "") + " (state)");
    }
    if (cityCount > 0) {
      const names = profile.assignedCityIds!.slice(0, 2).map((c) => c.name);
      parts.push(names.join(", ") + (cityCount > 2 ? ` +${cityCount - 2}` : ""));
    }
    return parts.join(", ");
  };

  return (
    <div className="page-container space-y-4">
      {ConfirmDialogNode}
      <section className="workspace-panel-surface overflow-hidden rounded-[20px]">
        <div className="flex flex-col gap-3 border-b border-border/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Agents</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Manage recruitment agents and their assigned regions.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                placeholder="Search agent…"
                className="h-8 w-52 rounded-lg pl-8 text-sm"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 rounded-lg border-border/80">
                  <Download className="h-3.5 w-3.5" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>Export</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportCsv}><FileText className="h-4 w-4" />CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportExcel}><FileSpreadsheet className="h-4 w-4" />Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPdf}><FileText className="h-4 w-4" />PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {can("agents", "create") && (
              <Button onClick={() => setShowAdd(true)} size="sm" className="h-8 rounded-lg">
                <Plus className="h-3.5 w-3.5" /> Add Agent
              </Button>
            )}
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Super Agent</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Commission</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              {(can("agents", "update") || can("agents", "delete")) && (
                <TableHead>Actions</TableHead>
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
            ) : agents.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 opacity-40" />
                    <span className="text-sm">No agents found</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : agents.map((agent) => (
              <TableRow key={agent._id}>
                <TableCell className="font-medium">{agent.name}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{agent.email}</TableCell>
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
                <TableCell><StatusBadge status={agent.isActive !== false ? "active" : "inactive"} /></TableCell>
                <TableCell className="text-muted-foreground text-sm">{new Date(agent.createdAt).toLocaleDateString()}</TableCell>
                {(can("agents", "update") || can("agents", "delete")) && (
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {can("agents", "update") && (
                        <Button variant="ghost" size="xs" onClick={() => openEdit(agent)} title="Edit">
                          <Pencil className="h-3.5 w-3.5 text-primary" />
                        </Button>
                      )}
                      {can("agents", "delete") && (
                        <Button variant="ghost" size="xs" onClick={() => handleDelete(agent._id)} title="Deactivate">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                      {can("agents", "delete") && (
                        <Button variant="ghost" size="xs" onClick={() => handlePermanentDelete(agent._id)} title="Delete permanently">
                          <UserX className="h-3.5 w-3.5 text-destructive" />
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
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Agent</DialogTitle>
            <DialogDescription>Create a new recruitment agent with region assignment</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {addError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />{addError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full Name <span className="text-destructive">*</span></Label>
                <Input value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Email <span className="text-destructive">*</span></Label>
                <Input type="email" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Password <span className="text-destructive">*</span></Label>
                <Input type="text" value={addForm.password} onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))} placeholder="Min 8 characters" />
              </div>
              <div className="space-y-2">
                <Label>Commission Rate (%)</Label>
                <Input type="number" min="0" max="100" value={addForm.commissionRate} onChange={(e) => setAddForm((f) => ({ ...f, commissionRate: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Assigned Super Agent</Label>
              <SearchableSelect
                options={[
                  { value: "none", label: "None" },
                  ...superAgents.map((sa) => ({ value: sa._id, label: sa.name })),
                ]}
                value={addForm.superAgentId || "none"}
                onValueChange={(v) => setAddForm((f) => ({ ...f, superAgentId: v === "none" ? "" : v }))}
                placeholder="Select super agent (optional)"
              />
            </div>

            <CascadingLocationPicker
              selectedCityIds={addCityIds}
              selectedStateIds={addStateIds}
              onChange={(cities, states) => { setAddCityIds(cities); setAddStateIds(states); }}
              label="Assigned Region"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setShowAdd(false)} disabled={addLoading}>Cancel</Button>
            <Button onClick={handleCreate} disabled={addLoading}>
              {addLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {addLoading ? "Creating…" : "Create Agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Agent Modal ──────────────────────────────── */}
      <Dialog open={!!editAgent} onOpenChange={(open) => { if (!open) setEditAgent(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Agent</DialogTitle>
            <DialogDescription>{editAgent?.name} — {editAgent?.email}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {editError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />{editError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <SearchableSelect
                  options={[
                    { value: "true", label: "Active" },
                    { value: "false", label: "Inactive" },
                  ]}
                  value={editForm.isActive}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, isActive: v }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Commission Rate (%)</Label>
                <Input type="number" min="0" max="100" value={editForm.commissionRate} onChange={(e) => setEditForm((f) => ({ ...f, commissionRate: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Assigned Super Agent</Label>
              <SearchableSelect
                options={[
                  { value: "none", label: "None" },
                  ...superAgents.map((sa) => ({ value: sa._id, label: sa.name })),
                ]}
                value={editForm.superAgentId || "none"}
                onValueChange={(v) => setEditForm((f) => ({ ...f, superAgentId: v === "none" ? "" : v }))}
                placeholder="Select super agent"
              />
            </div>

            <CascadingLocationPicker
              selectedCityIds={editCityIds}
              selectedStateIds={editStateIds}
              onChange={(cities, states) => { setEditCityIds(cities); setEditStateIds(states); }}
              label="Assigned Region"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setEditAgent(null)} disabled={editLoading}>Cancel</Button>
            <Button onClick={handleEdit} disabled={editLoading}>
              {editLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {editLoading ? "Saving…" : "Update Agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
