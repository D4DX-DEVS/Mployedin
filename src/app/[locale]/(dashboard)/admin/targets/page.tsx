"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { usePagination } from "@/hooks/usePagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { csrfFetch } from "@/lib/security/csrf-client";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Plus, Building2, Users, DollarSign, Crosshair, SplitSquareVertical,
  Trash2, RotateCcw, Eye, Sparkles, ArrowRight, Target, TrendingUp,
  CalendarDays,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TargetItem {
  _id: string;
  assigneeId: string;
  assigneeName: string;
  assigneeEmail: string;
  assigneeRole: string;
  type: "employer" | "employee" | "finance";
  year: number;
  month?: number;
  targetValue: number;
  achieved: number;
  progress: number;
  currency?: string;
  status: string;
  createdAt: string;
}

const TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "employer", label: "Employer" },
  { value: "employee", label: "Employee" },
  { value: "finance", label: "Finance" },
];

const ROLE_OPTIONS = [
  { value: "all", label: "All roles" },
  { value: "super_agent", label: "Super Agent" },
  { value: "agent", label: "Agent" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const TYPE_ICONS: Record<string, React.ReactNode> = {
  employer: <Building2 className="h-4 w-4" />,
  employee: <Users className="h-4 w-4" />,
  finance: <DollarSign className="h-4 w-4" />,
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AdminTargetsPage() {
  const t = useTranslations("targets");
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "en";

  const [targets, setTargets] = useState<TargetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear());
  const [typeFilter, setTypeFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();

  // Create target dialog
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    assigneeId: "",
    assigneeRole: "super_agent" as "super_agent" | "agent",
    type: "employer" as "employer" | "employee" | "finance",
    year: new Date().getFullYear(),
    targetValue: 0,
    currency: "AED",
    notes: "",
  });

  // Super agents list for dropdown
  const [superAgents, setSuperAgents] = useState<{ value: string; label: string }[]>([]);

  // Distribute dialog
  const [showDistribute, setShowDistribute] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [distributeTargetId, setDistributeTargetId] = useState("");
  const [distributeTarget, setDistributeTarget] = useState<TargetItem | null>(null);
  const [distributeValues, setDistributeValues] = useState<number[]>(Array(12).fill(0));

  const hasActiveFilters = typeFilter !== "all" || roleFilter !== "all" || statusFilter !== "active";

  const fetchTargets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("year", String(yearFilter));
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (roleFilter !== "all") params.set("assigneeRole", roleFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/admin/targets?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTargets(data.targets ?? []);
        updateTotal(data.pagination?.total ?? 0);
      }
    } catch {
      toast.error("Failed to load targets");
    } finally {
      setLoading(false);
    }
  }, [yearFilter, typeFilter, roleFilter, statusFilter, page, limit, updateTotal]);

  const fetchSuperAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/super-agents?limit=100");
      if (res.ok) {
        const data = await res.json();
        const list = (data.superAgents ?? data.items ?? []).map(
          (sa: { userId?: string; _id?: string; name?: string; user?: { name?: string; _id?: string } }) => ({
            value: sa.userId ?? sa.user?._id ?? sa._id ?? "",
            label: sa.name ?? sa.user?.name ?? "Unknown",
          })
        );
        setSuperAgents(list);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchTargets(); }, [fetchTargets]);
  useEffect(() => { fetchSuperAgents(); }, [fetchSuperAgents]);

  const handleCreate = async () => {
    if (!form.assigneeId || form.targetValue <= 0) {
      toast.error("Please fill all required fields");
      return;
    }
    setCreating(true);
    try {
      const res = await csrfFetch("/api/admin/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast.success("Target created successfully");
        setShowCreate(false);
        setForm({ assigneeId: "", assigneeRole: "super_agent", type: "employer", year: new Date().getFullYear(), targetValue: 0, currency: "AED", notes: "" });
        fetchTargets();
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Failed to create target");
      }
    } catch {
      toast.error("Failed to create target");
    } finally {
      setCreating(false);
    }
  };

  const handleDistribute = async () => {
    setDistributing(true);
    try {
      const monthlyValues = distributeValues.map((v, i) => ({ month: i + 1, value: v }));
      const res = await csrfFetch("/api/admin/targets/distribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: distributeTargetId, monthlyValues }),
      });
      if (res.ok) {
        toast.success("Target distributed into monthly targets");
        setShowDistribute(false);
        fetchTargets();
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Failed to distribute target");
      }
    } catch {
      toast.error("Failed to distribute");
    } finally {
      setDistributing(false);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      const res = await csrfFetch(`/api/admin/targets/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Target cancelled");
        fetchTargets();
      } else {
        toast.error("Failed to cancel target");
      }
    } catch {
      toast.error("Failed to cancel target");
    }
  };

  const openDistribute = (tgt: TargetItem) => {
    setDistributeTargetId(tgt._id);
    setDistributeTarget(tgt);
    const perMonth = Math.floor(tgt.targetValue / 12);
    const remainder = tgt.targetValue - perMonth * 12;
    setDistributeValues(
      Array.from({ length: 12 }, (_, i) => perMonth + (i < remainder ? 1 : 0))
    );
    setShowDistribute(true);
  };

  const distributeSum = distributeValues.reduce((a, b) => a + b, 0);

  // Compute summary stats from current data
  const activeTargets = targets.filter((t) => t.status === "active").length;
  const avgProgress = targets.length > 0
    ? Math.round(targets.reduce((s, t) => s + t.progress, 0) / targets.length)
    : 0;
  const onTrack = targets.filter((t) => t.progress >= 50).length;

  const formatVal = (type: string, val: number, currency?: string) =>
    type === "finance" ? `${currency ?? "AED"} ${val.toLocaleString()}` : val.toLocaleString();

  return (
    <div className="page-container space-y-6">
      {/* Toolbar */}
      <TableToolbar
        title={t("title")}
        description={t("description")}
        search=""
        onSearchChange={() => {}}
        searchPlaceholder="Search targets…"
        left={
          <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Finance workspace
          </div>
        }
        right={
          <div className="workspace-muted-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
            <ArrowRight className="h-3.5 w-3.5 text-primary" />
            {total.toLocaleString()} target{total === 1 ? "" : "s"}
          </div>
        }
        actions={
          <Button
            onClick={() => setShowCreate(true)}
            className="h-9 gap-2 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700"
          >
            <Plus className="h-4 w-4" />
            {t("setTarget")}
          </Button>
        }
        filterContent={
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="sr-only">Year</label>
                <div className="relative">
                  <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="number"
                    value={yearFilter}
                    onChange={(e) => { setYearFilter(parseInt(e.target.value) || new Date().getFullYear()); resetPage(); }}
                    className="h-11 rounded-xl border-border bg-card pl-9 text-sm"
                    aria-label="Year"
                  />
                </div>
              </div>
              <div>
                <label className="sr-only">Filter by type</label>
                <SearchableSelect
                  className="h-11 w-full rounded-xl border-border bg-card"
                  options={TYPE_OPTIONS}
                  value={typeFilter}
                  onValueChange={(v) => { setTypeFilter(v); resetPage(); }}
                  placeholder="All types"
                />
              </div>
              <div>
                <label className="sr-only">Filter by role</label>
                <SearchableSelect
                  className="h-11 w-full rounded-xl border-border bg-card"
                  options={ROLE_OPTIONS}
                  value={roleFilter}
                  onValueChange={(v) => { setRoleFilter(v); resetPage(); }}
                  placeholder="All roles"
                />
              </div>
              <div>
                <label className="sr-only">Filter by status</label>
                <SearchableSelect
                  className="h-11 w-full rounded-xl border-border bg-card"
                  options={STATUS_OPTIONS}
                  value={statusFilter}
                  onValueChange={(v) => { setStatusFilter(v); resetPage(); }}
                  placeholder="All statuses"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setTypeFilter("all"); setRoleFilter("all"); setStatusFilter("active"); resetPage(); }}
                disabled={!hasActiveFilters}
                className="h-11 rounded-xl border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-50"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Clear filters
              </Button>
            </div>
          </div>
        }
        hasActiveFilters={hasActiveFilters}
      />

      {/* KPI Stat Cards */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Total Targets</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-primary">{total}</p>
              <p className="mt-1 text-xs text-muted-foreground">Targets matching current filters</p>
            </div>
            <div className="workspace-tone-sky rounded-2xl p-2.5">
              <Crosshair className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Active</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-primary">{activeTargets}</p>
              <p className="mt-1 text-xs text-muted-foreground">Currently active targets on this page</p>
            </div>
            <div className="workspace-tone-emerald rounded-2xl p-2.5">
              <Target className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Avg. Progress</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-primary">{avgProgress}%</p>
              <p className="mt-1 text-xs text-muted-foreground">Average achievement across targets</p>
            </div>
            <div className="workspace-tone-amber rounded-2xl p-2.5">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="workspace-glass-panel rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">On Track</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-primary">{onTrack}</p>
              <p className="mt-1 text-xs text-muted-foreground">Targets with ≥ 50% progress</p>
            </div>
            <div className="workspace-tone-violet rounded-2xl p-2.5">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
        </div>
      </section>

      {/* Table */}
      <div className="rounded-2xl border border-border/60 bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("assignee")}</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("role")}</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("type")}</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("year")}</TableHead>
              <TableHead className="text-right text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("target")}</TableHead>
              <TableHead className="text-right text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("achieved")}</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("progressLabel")}</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("status")}</TableHead>
              <TableHead className="text-right text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : targets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="rounded-2xl bg-muted/50 p-4">
                      <Crosshair className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t("noTargets")}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Create a target to get started</p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              targets.map((tgt) => (
                <TableRow key={tgt._id} className="group">
                  <TableCell>
                    <div>
                      <p className="font-medium">{tgt.assigneeName}</p>
                      <p className="text-xs text-muted-foreground">{tgt.assigneeEmail}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={tgt.assigneeRole === "super_agent" ? "Super Agent" : "Agent"} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-muted/60">
                        {TYPE_ICONS[tgt.type]}
                      </span>
                      <span className="text-sm capitalize">{tgt.type}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{tgt.year}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatVal(tgt.type, tgt.targetValue, tgt.currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatVal(tgt.type, tgt.achieved, tgt.currency)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Progress value={tgt.progress} className="h-2 w-24" />
                      <span className={`text-xs font-semibold tabular-nums ${
                        tgt.progress >= 75 ? "text-emerald-600 dark:text-emerald-400" :
                        tgt.progress >= 40 ? "text-amber-600 dark:text-amber-400" :
                        "text-muted-foreground"
                      }`}>
                        {tgt.progress}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={tgt.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                      <Link href={`/${locale}/admin/targets/${tgt._id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" title={t("viewDetails")}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                      {tgt.status === "active" && !tgt.month && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          onClick={() => openDistribute(tgt)}
                          title={t("distributeMonthly")}
                        >
                          <SplitSquareVertical className="h-4 w-4" />
                        </Button>
                      )}
                      {tgt.status === "active" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          onClick={() => handleCancel(tgt._id)}
                          title={t("cancel")}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PaginationControls
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={setLimit}
      />

      {/* ---- Create Target Dialog ---- */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md overflow-visible">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="workspace-tone-sky rounded-xl p-2">
                <Crosshair className="h-4 w-4" />
              </div>
              {t("setTarget")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("assignee")}</Label>
              <SearchableSelect
                options={superAgents}
                value={form.assigneeId}
                onValueChange={(v) => setForm((p) => ({ ...p, assigneeId: v }))}
                placeholder={t("selectSuperAgent")}
                className="h-11 rounded-xl border-border bg-card"
                modal
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("type")}</Label>
                <SearchableSelect
                  options={[
                    { value: "employer", label: "Employer" },
                    { value: "employee", label: "Employee" },
                    { value: "finance", label: "Finance" },
                  ]}
                  value={form.type}
                  onValueChange={(v) => setForm((p) => ({ ...p, type: v as typeof p.type }))}
                  className="h-11 rounded-xl border-border bg-card"
                  modal
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("year")}</Label>
                <Input
                  type="number"
                  value={form.year}
                  onChange={(e) => setForm((p) => ({ ...p, year: parseInt(e.target.value) || new Date().getFullYear() }))}
                  className="h-11 rounded-xl border-border bg-card"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("targetValue")}</Label>
              <Input
                type="number"
                value={form.targetValue || ""}
                onChange={(e) => setForm((p) => ({ ...p, targetValue: parseFloat(e.target.value) || 0 }))}
                placeholder={form.type === "finance" ? "e.g. 500000" : "e.g. 100"}
                className="h-11 rounded-xl border-border bg-card"
              />
            </div>
            {form.type === "finance" && (
              <div className="grid gap-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("currency")}</Label>
                <Input
                  value={form.currency}
                  onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value.toUpperCase().slice(0, 3) }))}
                  maxLength={3}
                  className="h-11 rounded-xl border-border bg-card"
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("notes")}</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder={t("optionalNotes")}
                className="h-11 rounded-xl border-border bg-card"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setShowCreate(false)}>{t("cancel")}</Button>
            <Button onClick={handleCreate} disabled={creating} className="rounded-xl bg-sky-600 hover:bg-sky-700">
              {creating ? t("creating") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Distribute Dialog ---- */}
      <Dialog open={showDistribute} onOpenChange={setShowDistribute}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="workspace-tone-amber rounded-xl p-2">
                <SplitSquareVertical className="h-4 w-4" />
              </div>
              {t("distributeMonthly")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {distributeTarget && (
              <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-4 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                  {TYPE_ICONS[distributeTarget.type]}
                </div>
                <div>
                  <p className="text-sm font-semibold">{distributeTarget.assigneeName}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {distributeTarget.type} · {distributeTarget.year} · Target: {formatVal(distributeTarget.type, distributeTarget.targetValue, distributeTarget.currency)}
                  </p>
                </div>
              </div>
            )}
            <p className="text-sm text-muted-foreground">{t("distributeDescription")}</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {MONTHS.map((m, i) => (
                <div key={m} className="grid gap-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{m}</Label>
                  <Input
                    type="number"
                    value={distributeValues[i] || ""}
                    onChange={(e) => {
                      const vals = [...distributeValues];
                      vals[i] = parseFloat(e.target.value) || 0;
                      setDistributeValues(vals);
                    }}
                    className="h-9 rounded-lg text-sm tabular-nums"
                  />
                </div>
              ))}
            </div>
            <div className={`flex items-center justify-between rounded-xl px-4 py-2.5 text-sm ${
              distributeTarget && distributeSum !== distributeTarget.targetValue
                ? "bg-red-500/10 border border-red-500/20"
                : "bg-emerald-500/10 border border-emerald-500/20"
            }`}>
              <span className="font-medium">{t("totalDistributed")}:</span>
              <span className="font-bold tabular-nums">{distributeSum.toLocaleString()}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setShowDistribute(false)}>{t("cancel")}</Button>
            <Button onClick={handleDistribute} disabled={distributing} className="rounded-xl bg-sky-600 hover:bg-sky-700">
              {distributing ? t("distributing") : t("distribute")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
