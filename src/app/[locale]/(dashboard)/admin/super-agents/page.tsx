"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { CascadingLocationPicker } from "@/components/shared/CascadingLocationPicker";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination } from "@/hooks/usePagination";
import { Plus, Pencil, Trash2, MapPin, Globe, Users } from "lucide-react";
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
import { Search, Inbox, AlertCircle, Loader2 } from "lucide-react";

interface AgentRef {
  _id: string;
  name: string;
}

interface SAProfile {
  _id: string;
  overrideCommissionRate?: number;
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
  const { can } = usePermissions();
  const [superAgents, setSuperAgents] = useState<SuperAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  // Available agents for assignment
  const [availableAgents, setAvailableAgents] = useState<AgentOption[]>([]);

  // Create modal
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", password: "", overrideCommissionRate: "0" });
  const [addCityIds, setAddCityIds] = useState<string[]>([]);
  const [addStateIds, setAddStateIds] = useState<string[]>([]);
  const [addAgentIds, setAddAgentIds] = useState<string[]>([]);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");

  // Edit modal
  const [editSA, setEditSA] = useState<SuperAgent | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", isActive: "true", overrideCommissionRate: "0" });
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

  const handleCreate = async () => {
    setAddError("");
    if (!addForm.name || !addForm.email || !addForm.password) {
      setAddError("Name, email, and password are required");
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
          assignedCityIds: addCityIds,
          assignedStateIds: addStateIds,
          agentIds: addAgentIds,
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        setAddError(e.error ?? "Failed to create");
        return;
      }
      setShowAdd(false);
      setAddForm({ name: "", email: "", password: "", overrideCommissionRate: "0" });
      setAddCityIds([]);
      setAddStateIds([]);
      setAddAgentIds([]);
      fetchSuperAgents();
    } catch {
      setAddError("Network error");
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
          assignedCityIds: editCityIds,
          assignedStateIds: editStateIds,
          agentIds: editAgentIds,
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        setEditError(e.error ?? "Failed to update");
        return;
      }
      setEditSA(null);
      fetchSuperAgents();
    } catch {
      setEditError("Network error");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deactivate this super agent?")) return;
    await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id }),
    });
    fetchSuperAgents();
  };

  const getLocationSummary = (profile: SAProfile | null) => {
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

  const toggleAgentId = (id: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const AgentCheckboxList = ({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) => (
    <div className="border rounded-lg max-h-48 overflow-y-auto p-2 space-y-1">
      {availableAgents.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2 text-center">No agents available</p>
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
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <PageHeader title="Super Agents" description="Manage super agents who oversee agent teams and regions" />
        {can("super_agents", "create") && (
          <Button onClick={() => setShowAdd(true)} size="sm">
            <Plus className="h-4 w-4" /> Add Super Agent
          </Button>
        )}
      </div>

      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
        <Input
          placeholder="Search …"
          value={search}
          onChange={(e) => { setSearch(e.target.value); resetPage(); }}
          className="pl-9 h-9"
        />
      </div>

      <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm shadow-black/[0.03]">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Agents</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Commission Override</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              {(can("super_agents", "update") || can("super_agents", "delete")) && (
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
            ) : superAgents.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 opacity-40" />
                    <span className="text-sm">No super agents found</span>
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
                      {sa.superAgentProfile?.agentCount ?? 0} agents
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
                    : "—"}
                </TableCell>
                <TableCell><StatusBadge status={sa.isActive !== false ? "active" : "inactive"} /></TableCell>
                <TableCell className="text-muted-foreground text-sm">{new Date(sa.createdAt).toLocaleDateString()}</TableCell>
                {(can("super_agents", "update") || can("super_agents", "delete")) && (
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {can("super_agents", "update") && (
                        <Button variant="ghost" size="xs" onClick={() => openEdit(sa)} title="Edit">
                          <Pencil className="h-3.5 w-3.5 text-primary" />
                        </Button>
                      )}
                      {can("super_agents", "delete") && (
                        <Button variant="ghost" size="xs" onClick={() => handleDelete(sa._id)} title="Deactivate">
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
      </div>

      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />

      {/* ── Add Super Agent Modal ──────────────────────────────── */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Super Agent</DialogTitle>
            <DialogDescription>Create a new super agent with region and agent assignment</DialogDescription>
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
                <Label>Override Commission Rate (%)</Label>
                <Input type="number" min="0" max="100" value={addForm.overrideCommissionRate} onChange={(e) => setAddForm((f) => ({ ...f, overrideCommissionRate: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Assign Agents</Label>
              <AgentCheckboxList selected={addAgentIds} onToggle={(id) => toggleAgentId(id, setAddAgentIds)} />
              {addAgentIds.length > 0 && (
                <p className="text-xs text-muted-foreground">{addAgentIds.length} agent(s) selected</p>
              )}
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
              {addLoading ? "Creating…" : "Create Super Agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Super Agent Modal ──────────────────────────────── */}
      <Dialog open={!!editSA} onOpenChange={(open) => { if (!open) setEditSA(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Super Agent</DialogTitle>
            <DialogDescription>{editSA?.name} — {editSA?.email}</DialogDescription>
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
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={editForm.isActive}
                  onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.value }))}
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Override Commission Rate (%)</Label>
                <Input type="number" min="0" max="100" value={editForm.overrideCommissionRate} onChange={(e) => setEditForm((f) => ({ ...f, overrideCommissionRate: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Assign Agents</Label>
              <AgentCheckboxList selected={editAgentIds} onToggle={(id) => toggleAgentId(id, setEditAgentIds)} />
              {editAgentIds.length > 0 && (
                <p className="text-xs text-muted-foreground">{editAgentIds.length} agent(s) selected</p>
              )}
            </div>

            <CascadingLocationPicker
              selectedCityIds={editCityIds}
              selectedStateIds={editStateIds}
              onChange={(cities, states) => { setEditCityIds(cities); setEditStateIds(states); }}
              label="Assigned Region"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setEditSA(null)} disabled={editLoading}>Cancel</Button>
            <Button onClick={handleEdit} disabled={editLoading}>
              {editLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {editLoading ? "Saving…" : "Update Super Agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
