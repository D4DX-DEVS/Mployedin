"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageHero } from "@/components/shared/PageHero";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Inbox, Plus, X, Edit2, Trash2, UserCheck, MapPin } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

interface SuperAgentOption { _id: string; name: string; email: string; }

interface Territory {
  _id: string;
  name: string;
  superAgentId?: { _id?: string; name?: string; email?: string } | string | null;
  countries?: string[];
  createdAt?: string;
}

const GCC_COUNTRIES = ["UAE", "Saudi Arabia", "Qatar", "Kuwait", "Bahrain", "Oman", "Egypt", "Jordan", "Lebanon"];

export default function AdminTerritoryPage() {
  const tr = useTranslations("adminTerritory");
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", countries: [] as string[], superAgentId: "__none__" });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [superAgents, setSuperAgents] = useState<SuperAgentOption[]>([]);

  // Edit dialog
  const [editTerritory, setEditTerritory] = useState<Territory | null>(null);
  const [editForm, setEditForm] = useState({ name: "", countries: [] as string[], superAgentId: "__none__" });
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchTerritories = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    const res = await fetch(`/api/admin/territories?${params}`);
    if (res.ok) {
      const data = await res.json();
      setTerritories(data.items ?? []);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchTerritories(); }, [fetchTerritories]);

  // Fetch super-agents for assignment dropdown
  useEffect(() => {
    fetch("/api/admin/users?role=super_agent&limit=200")
      .then((r) => r.ok ? r.json() : { users: [] })
      .then((d) => setSuperAgents((d.users ?? d.items ?? []).map((u: { _id: string; name?: string; email?: string }) => ({ _id: u._id, name: u.name ?? "", email: u.email ?? "" }))))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload: Record<string, unknown> = { name: form.name, countries: form.countries };
    if (form.superAgentId && form.superAgentId !== "__none__") payload.superAgentId = form.superAgentId;
    const res = await fetch("/api/admin/territories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      toast.success(tr("toastTerritoryCreated"));
      setShowForm(false);
      setForm({ name: "", countries: [], superAgentId: "__none__" });
      fetchTerritories();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? tr("toastFailedToCreate"));
    }
    setSaving(false);
  };

  const toggleCountry = (country: string, target: "form" | "edit") => {
    const setter = target === "form" ? setForm : setEditForm;
    setter((prev) => ({
      ...prev,
      countries: prev.countries.includes(country)
        ? prev.countries.filter((c) => c !== country)
        : [...prev.countries, country],
    }));
  };

  const openEdit = (t: Territory) => {
    const saId = typeof t.superAgentId === "object" && t.superAgentId?._id ? t.superAgentId._id : "__none__";
    setEditTerritory(t);
    setEditForm({ name: t.name, countries: t.countries ?? [], superAgentId: saId });
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTerritory) return;
    setEditSaving(true);
    const payload: Record<string, unknown> = { name: editForm.name, countries: editForm.countries };
    payload.superAgentId = editForm.superAgentId === "__none__" ? null : editForm.superAgentId || null;
    const res = await fetch(`/api/admin/territories/${editTerritory._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      toast.success(tr("toastTerritoryUpdated"));
      setEditTerritory(null);
      fetchTerritories();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? tr("toastFailedToUpdate"));
    }
    setEditSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const res = await fetch(`/api/admin/territories/${deleteId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(tr("toastTerritoryDeleted"));
      setDeleteId(null);
      fetchTerritories();
    } else {
      toast.error(tr("toastFailedToDelete"));
    }
  };

  const getSaName = (sa: Territory["superAgentId"]) => {
    if (!sa) return tr("superAgentUnassigned");
    if (typeof sa === "string") return tr("superAgentAssigned");
    return sa.name ?? sa.email ?? tr("superAgentAssigned");
  };

  return (
    <div className="page-container">
      <PageHero
        icon={MapPin}
        eyebrow={tr("adminWorkspaceBadge")}
        title={tr("pageTitle")}
        description={tr("pageDescription")}
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={tr("searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-48 rounded-xl border-border/70 bg-background/90 pl-8 text-sm sm:w-56"
              />
            </div>
            <Button
              size="sm"
              onClick={() => setShowForm((v) => !v)}
              className="h-10 gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {showForm ? <><X className="h-3.5 w-3.5" /> {tr("cancelButtonLabel")}</> : <><Plus className="h-3.5 w-3.5" /> {tr("newTerritoryButtonLabel")}</>}
            </Button>
          </>
        }
      />

      <section className="workspace-panel-surface overflow-hidden rounded-3xl">
        {/* Inline create form */}
        {showForm && (
          <div className="border-b border-border/60 bg-secondary/30 px-5 py-4">
            <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
              <h3 className="text-sm font-semibold text-foreground">{tr("createTerritoryFormHeading")}</h3>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{tr("territoryNameLabel")} <span className="text-destructive">*</span></label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  required
                  placeholder={tr("territoryNamePlaceholder")}
                  className="h-9 rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">{tr("countriesLabel")}</label>
                <div className="flex flex-wrap gap-2">
                  {GCC_COUNTRIES.map((c) => (
                    <Button key={c} type="button" variant={form.countries.includes(c) ? "default" : "outline"} size="xs" onClick={() => toggleCountry(c, "form")} className="rounded-full">{c}</Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{tr("assignSuperAgentLabel")}</label>
                <Select value={form.superAgentId} onValueChange={(v) => setForm((p) => ({ ...p, superAgentId: v }))}>
                  <SelectTrigger className="h-9 w-full rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{tr("noAssignmentOption")}</SelectItem>
                    {superAgents.map((sa) => (
                      <SelectItem key={sa._id} value={sa._id}>{sa.name} ({sa.email})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" size="sm" disabled={saving} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                {saving ? tr("savingButtonText") : tr("createButtonText")}
              </Button>
            </form>
          </div>
        )}

        {/* Card grid */}
        <div className="p-5">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-28 animate-shimmer rounded-xl border border-border/50 bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
              ))}
            </div>
          ) : territories.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Inbox className="h-6 w-6 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">{tr("emptyStateTitle")}</p>
              <p className="text-xs text-muted-foreground">{tr("emptyStateDescription")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {territories.map((t) => (
                <div key={t._id} className="group rounded-xl border border-border/60 bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">{t.name}</h3>
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <UserCheck className="h-3 w-3" />
                        {getSaName(t.superAgentId)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button variant="ghost" size="xs" onClick={() => openEdit(t)} title={tr("editButtonTitle")}>
                        <Edit2 className="h-3.5 w-3.5 text-primary" />
                      </Button>
                      <Button variant="ghost" size="xs" onClick={() => setDeleteId(t._id)} title={tr("deleteButtonTitle")}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  {t.countries?.length ? (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {t.countries.map((c) => (
                        <span key={c} className="rounded-full bg-muted px-2 py-0.5 text-xs">{c}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground/50">{tr("noCountriesAssignedText")}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Edit Dialog */}
      <Dialog open={!!editTerritory} onOpenChange={(open) => { if (!open) setEditTerritory(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tr("editDialogTitle")}</DialogTitle>
            <DialogDescription>{tr("editDialogDescription")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{tr("nameLabel")}</label>
              <Input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} required className="h-9" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">{tr("countriesLabel")}</label>
              <div className="flex flex-wrap gap-2">
                {GCC_COUNTRIES.map((c) => (
                  <Button key={c} type="button" variant={editForm.countries.includes(c) ? "default" : "outline"} size="xs" onClick={() => toggleCountry(c, "edit")} className="rounded-full">{c}</Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{tr("assignSuperAgentLabel")}</label>
              <Select value={editForm.superAgentId} onValueChange={(v) => setEditForm((p) => ({ ...p, superAgentId: v }))}>
                <SelectTrigger className="h-9 w-full rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{tr("unassignedOption")}</SelectItem>
                  {superAgents.map((sa) => (
                    <SelectItem key={sa._id} value={sa._id}>{sa.name} ({sa.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTerritory(null)}>{tr("cancelButtonLabel")}</Button>
              <Button type="submit" disabled={editSaving}>{editSaving ? tr("savingButtonText") : tr("saveButtonText")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{tr("deleteDialogTitle")}</DialogTitle>
            <DialogDescription>{tr("deleteDialogDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>{tr("cancelButtonLabel")}</Button>
            <Button variant="destructive" onClick={handleDelete}>{tr("deleteButtonLabel")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
