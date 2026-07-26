"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  Plus, Trash2, RefreshCw, Copy, Check, Webhook as WebhookIcon,
  AlertCircle, CheckCircle2, XCircle, Search, Filter,
  ChevronDown, ChevronUp, RotateCcw, Activity, Inbox,
  Send, Eye, ToggleLeft, ToggleRight, KeyRound, Clock, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PageHero } from "@/components/shared/PageHero";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useConfirm } from "@/hooks/useConfirm";
import { toast } from "sonner";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";

const EVENTS = [
  "invoice.created",
  "invoice.paid",
  "invoice.credit_note",
  "commission.created",
  "commission.approved",
  "commission.paid",
  "commission.disputed",
  "commission.clawed_back",
] as const;

interface DeliveryLogEntry {
  event: string;
  status: "success" | "failed";
  statusCode?: number;
  responseTime?: number;
  error?: string;
  deliveredAt: string;
}

interface WebhookItem {
  _id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  retryCount: number;
  lastTriggeredAt?: string;
  lastStatus?: "success" | "failed";
  deliveryLog?: DeliveryLogEntry[];
  createdAt?: string;
}

export default function AdminWebhooksPage() {
  const t = useTranslations("webhooks");
  const {
    page, limit, total, totalPages,
    setPage, setLimit, updateTotal, resetPage, paginationParams,
  } = usePagination();
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [stats, setStats] = useState({ active: 0, inactive: 0, failed: 0, healthy: 0 });
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");

  // Delivery log drawer
  const [logDrawerOpen, setLogDrawerOpen] = useState(false);
  const [logWebhook, setLogWebhook] = useState<WebhookItem | null>(null);
  const [logEntries, setLogEntries] = useState<DeliveryLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);

  // Test ping
  const [testingId, setTestingId] = useState<string | null>(null);

  // Confirm dialog
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();

  // Form state
  const [form, setForm] = useState({
    name: "",
    url: "",
    events: [] as string[],
    isActive: true,
    retryCount: 3,
  });

  const fetchWebhooks = useCallback(async () => {
    setLoading(true);
    try {
      const params = paginationParams();
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (eventFilter !== "all") params.set("event", eventFilter);
      const res = await fetch(`/api/admin/webhooks?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setWebhooks(data.webhooks || []);
        setStats(data.stats ?? { active: 0, inactive: 0, failed: 0, healthy: 0 });
        updateTotal(data.total ?? 0);
      }
    } catch {
      toast.error(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, eventFilter, page, limit, paginationParams, updateTotal]);

  useEffect(() => { fetchWebhooks(); }, [fetchWebhooks]);
  useEffect(() => {
    resetPage();
  }, [search, statusFilter, eventFilter, resetPage]);

  const filteredWebhooks = webhooks;

  // Active filter count
  const activeFilterCount = [
    search !== "",
    statusFilter !== "all",
    eventFilter !== "all",
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setEventFilter("all");
  };

  // Stats
  const activeCount = stats.active;
  const inactiveCount = stats.inactive;
  const failedCount = stats.failed;
  const healthyCount = stats.healthy;

  const resetForm = () => {
    setForm({ name: "", url: "", events: [], isActive: true, retryCount: 3 });
    setEditId(null);
    setNewSecret(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (wh: WebhookItem) => {
    setForm({
      name: wh.name,
      url: wh.url,
      events: wh.events,
      isActive: wh.isActive,
      retryCount: wh.retryCount,
    });
    setEditId(wh._id);
    setNewSecret(null);
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const endpoint = editId
        ? `/api/admin/webhooks/${editId}`
        : "/api/admin/webhooks";
      const method = editId ? "PATCH" : "POST";

      const res = await csrfFetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        toast.error(err.error || t("saveFailed"));
        return;
      }

      const data = await res.json();

      // Show secret on creation
      if (!editId && data.webhook?.secret) {
        setNewSecret(data.webhook.secret);
        toast.success(t("createdWithSecretWarning"));
      } else {
        toast.success(editId ? t("updated") : t("created"));
        setDialogOpen(false);
        resetForm();
      }

      fetchWebhooks();
    } catch {
      toast.error(t("saveWebhookFailed"));
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog("Are you sure you want to delete this webhook? This action cannot be undone.");
    if (!ok) return;
    try {
      const res = await csrfFetch(`/api/admin/webhooks/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("deleted"));
        fetchWebhooks();
      }
    } catch {
      toast.error(t("deleteFailed"));
    }
  };

  const handleToggleActive = async (wh: WebhookItem) => {
    try {
      const res = await csrfFetch(`/api/admin/webhooks/${wh._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !wh.isActive }),
      });
      if (res.ok) {
        toast.success(wh.isActive ? t("disabled") : t("enabled"));
        fetchWebhooks();
      }
    } catch {
      toast.error(t("toggleFailed"));
    }
  };

  const handleTestPing = async (id: string) => {
    setTestingId(id);
    try {
      const res = await csrfFetch(`/api/admin/webhooks/${id}/test`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success(t("testDelivered", { statusCode: data.statusCode, responseTime: data.responseTime }));
      } else {
        toast.error(t("testFailedMessage", { message: data.message }));
      }
    } catch {
      toast.error(t("testRequestFailed"));
    } finally {
      setTestingId(null);
    }
  };

  const handleRotateSecret = async (id: string) => {
    const ok = await confirmDialog("Rotate the signing secret? The old secret will stop working immediately.");
    if (!ok) return;
    try {
      const res = await csrfFetch(`/api/admin/webhooks/${id}/rotate-secret`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setNewSecret(data.secret);
        setEditId(id);
        setDialogOpen(true);
        toast.success(t("secretRotated"));
      }
    } catch {
      toast.error(t("rotateSecretFailed"));
    }
  };

  const openDeliveryLog = async (wh: WebhookItem) => {
    setLogWebhook(wh);
    setLogDrawerOpen(true);
    setLogLoading(true);
    try {
      const res = await fetch(`/api/admin/webhooks/${wh._id}`);
      if (res.ok) {
        const data = await res.json();
        setLogEntries(data.webhook?.deliveryLog ?? []);
      }
    } catch {
      toast.error(t("loadLogFailed"));
    } finally {
      setLogLoading(false);
    }
  };

  const toggleEvent = (event: string) => {
    setForm((prev) => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter((e) => e !== event)
        : [...prev.events, event],
    }));
  };

  const copySecret = () => {
    if (newSecret) {
      navigator.clipboard.writeText(newSecret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  return (
    <div className="page-container space-y-6">

      <PageHero
        icon={WebhookIcon}
        eyebrow="Integration Hub"
        title="Webhooks"
        description="Manage outbound webhook integrations for your accounting system — track delivery status, retry failures, and monitor endpoint health."
        actions={
            <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) resetForm(); setDialogOpen(v); }}>
              <DialogTrigger asChild>
                <Button
                  onClick={openCreate}
                  className="h-11 gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 border-0"
                >
                  <Plus className="h-4 w-4" />
                  Add Webhook
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editId ? "Edit Webhook" : "New Webhook"}</DialogTitle>
                </DialogHeader>

                {/* Secret display (only on create success) */}
                {newSecret && (
                  <div className="rounded-lg border border-status-shortlisted/20 bg-status-shortlisted-bg dark:bg-amber-950/30 p-4 mb-4">
                    <p className="text-sm font-medium text-status-shortlisted dark:text-amber-200 mb-2">
                      <AlertCircle className="h-4 w-4 inline mr-1" />
                      Save this signing secret — it won&apos;t be shown again:
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs break-all font-mono bg-card dark:bg-black/40 p-2 rounded">
                        {newSecret}
                      </code>
                      <Button variant="ghost" size="sm" onClick={copySecret}>
                        {copiedSecret ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <Button
                      className="mt-3 w-full"
                      size="sm"
                      onClick={() => { setDialogOpen(false); resetForm(); }}
                    >
                      Done
                    </Button>
                  </div>
                )}

                {!newSecret && (
                  <div className="space-y-4 mt-2">
                    <div className="space-y-1.5">
                      <Label>Name</Label>
                      <Input
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="e.g. QuickBooks Integration"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Endpoint URL</Label>
                      <Input
                        value={form.url}
                        onChange={(e) => setForm({ ...form, url: e.target.value })}
                        placeholder="https://your-system.com/webhook"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Events</Label>
                      <div className="flex flex-wrap gap-2">
                        {EVENTS.map((ev) => (
                          <Badge
                            key={ev}
                            variant={form.events.includes(ev) ? "default" : "outline"}
                            className="cursor-pointer select-none"
                            onClick={() => toggleEvent(ev)}
                          >
                            {ev}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Retry Count</Label>
                      <Input
                        type="number"
                        min={0}
                        max={10}
                        value={form.retryCount}
                        onChange={(e) => setForm({ ...form, retryCount: Number(e.target.value) })}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isActive"
                        checked={form.isActive}
                        onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                        className="rounded"
                      />
                      <Label htmlFor="isActive">Active</Label>
                    </div>
                    <Button onClick={handleSubmit} className="w-full">
                      {editId ? "Update" : "Create"} Webhook
                    </Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>
        }
      />

      <section className="workspace-panel-surface overflow-hidden rounded-[20px] p-4">

        {/* Stats Row */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {([
            { label: "Active", value: activeCount, note: "Listening for events", icon: CheckCircle2, tone: "text-status-selected", chip: "bg-status-selected-bg dark:bg-emerald-950/30" },
            { label: "Inactive", value: inactiveCount, note: "Paused endpoints", icon: XCircle, tone: "text-muted-foreground", chip: "bg-muted/30" },
            { label: "Healthy", value: healthyCount, note: "Last delivery OK", icon: Activity, tone: "text-status-applied", chip: "bg-status-applied-bg dark:bg-sky-950/30" },
            { label: "Failed", value: failedCount, note: "Needs attention", icon: AlertCircle, tone: "text-red-500", chip: "bg-status-rejected-bg dark:bg-red-950/30" },
          ] as const).map(({ label, value, note, icon: Icon, tone, chip }) => (
            <div key={label} className="workspace-glass-panel rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
                  <p className="mt-3 text-4xl font-semibold tracking-tight text-foreground">{value}</p>
                </div>
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${chip}`}>
                  <Icon className={`h-5 w-5 ${tone}`} />
                </span>
              </div>
              <p className="mt-3 text-sm leading-5 text-muted-foreground">{note}</p>
            </div>
          ))}
        </div>

        {/* ─── Filter toggle bar ──────────────────────────────────────── */}
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-white/10 dark:hover:bg-white/5"
          >
            <Filter className="h-4 w-4 text-muted-foreground" />
            {showFilters ? "Hide Filters" : "Show Filters"}
            {activeFilterCount > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{activeFilterCount} active</Badge>}
            {showFilters ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="gap-1.5 text-xs text-muted-foreground">
                <RotateCcw className="h-3 w-3" />
                Clear {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={fetchWebhooks} disabled={loading} className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* ─── Expandable Filters ─────────────────────────────────────── */}
        {showFilters && (
          <div className="mt-4 space-y-3 rounded-[20px] border border-border/30 bg-background/40 p-4 backdrop-blur-sm dark:bg-background/20">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or URL…"
                className="h-11 w-full rounded-xl border border-border bg-card pl-9 pr-4 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:ring-offset-2"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <SearchableSelect
                id="webhook-status-filter"
                className="h-11 w-full rounded-xl border-border bg-card"
                options={[
                  { value: "all", label: "All statuses" },
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
                value={statusFilter}
                onValueChange={setStatusFilter}
                placeholder="All statuses"
              />
              <SearchableSelect
                id="webhook-event-filter"
                className="h-11 w-full rounded-xl border-border bg-card"
                options={[
                  { value: "all", label: "All events" },
                  ...EVENTS.map((ev) => ({ value: ev, label: ev })),
                ]}
                value={eventFilter}
                onValueChange={setEventFilter}
                placeholder="All events"
              />
            </div>
          </div>
        )}
      </section>

      {/* ─── Table ────────────────────────────────────────────────────── */}
      <section className="workspace-panel-surface overflow-hidden rounded-[28px]">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="min-w-[160px] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em]">Name</TableHead>
                <TableHead className="min-w-[200px] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em]">URL</TableHead>
                <TableHead className="min-w-[180px] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em]">Events</TableHead>
                <TableHead className="min-w-[80px] px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.12em]">Status</TableHead>
                <TableHead className="min-w-[110px] px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.12em]">Last Fired</TableHead>
                <TableHead className="min-w-[180px] px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.12em]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j} className="px-4 py-3">
                        <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filteredWebhooks.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="h-44 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-muted/50">
                        <Inbox className="h-7 w-7 opacity-40" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">No webhooks found</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {activeFilterCount > 0 ? "Try adjusting the filters above." : "Webhooks will appear here once configured."}
                        </p>
                      </div>
                      {activeFilterCount > 0 && (
                        <Button variant="outline" size="sm" onClick={clearAllFilters} className="mt-1 h-8 rounded-lg text-xs">
                          Clear filters
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredWebhooks.map((wh) => (
                <TableRow key={wh._id} className="group transition-colors">
                  <TableCell className="px-4 py-3 font-medium">{wh.name}</TableCell>
                  <TableCell className="max-w-[200px] truncate px-4 py-3 text-xs font-mono text-muted-foreground">
                    {wh.url}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {wh.events.map((ev) => (
                        <Badge key={ev} variant="secondary" className="text-[10px]">
                          {ev}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(wh)}
                      className="inline-flex items-center gap-1 text-xs"
                      title={wh.isActive ? "Click to disable" : "Click to enable"}
                    >
                      {wh.isActive ? (
                        <ToggleRight className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                      )}
                    </button>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center text-xs text-muted-foreground">
                    {wh.lastTriggeredAt
                      ? new Date(wh.lastTriggeredAt).toLocaleDateString()
                      : "—"}
                    {wh.lastStatus && (
                      <span className={`ml-1 ${wh.lastStatus === "success" ? "text-status-selected" : "text-red-500"}`}>
                        ({wh.lastStatus})
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTestPing(wh._id)}
                        disabled={testingId === wh._id}
                        title={t("a11ySendTestPing")}
                        className="h-8 w-8 p-0"
                      >
                        <Send className={`h-3.5 w-3.5 ${testingId === wh._id ? "animate-pulse" : ""}`} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDeliveryLog(wh)}
                        title={t("a11yViewDeliveryLog")}
                        className="h-8 w-8 p-0"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRotateSecret(wh._id)}
                        title={t("a11yRotateSecret")}
                        className="h-8 w-8 p-0"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(wh)} className="h-8 px-2 text-xs">
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(wh._id)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
      <PaginationControls
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={setLimit}
      />

      {ConfirmDialogNode}

      {/* ─── Delivery Log Drawer ──────────────────────────────────────── */}
      {logDrawerOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex justify-end">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={() => setLogDrawerOpen(false)}
          />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-border/50 bg-background shadow-2xl animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-sky-500 shrink-0" />
                  <h2 className="text-base font-semibold truncate">Delivery Log</h2>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{logWebhook?.name}</p>
                <p className="truncate text-[10px] font-mono text-muted-foreground">{logWebhook?.url}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setLogDrawerOpen(false)} className="h-8 w-8 shrink-0 rounded-lg p-0">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Summary bar */}
            {!logLoading && logEntries.length > 0 && (
              <div className="flex items-center gap-4 border-b border-border/40 px-5 py-2.5 text-xs">
                <span className="flex items-center gap-1.5 text-status-selected">
                  <CheckCircle2 className="h-3 w-3" />
                  {logEntries.filter((e) => e.status === "success").length} success
                </span>
                <span className="flex items-center gap-1.5 text-red-500">
                  <XCircle className="h-3 w-3" />
                  {logEntries.filter((e) => e.status === "failed").length} failed
                </span>
                <span className="ml-auto text-muted-foreground">{logEntries.length} total</span>
              </div>
            )}

            {/* Log entries */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {logLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-[72px] animate-shimmer rounded-2xl bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                  ))}
                </div>
              ) : logEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-muted/50 mb-4">
                    <Clock className="h-7 w-7 opacity-40" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">No deliveries yet</p>
                  <p className="mt-1 text-xs">Deliveries will appear here after events fire.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {[...logEntries].reverse().map((entry, i) => (
                    <div key={i} className="rounded-2xl border border-border/50 bg-card p-3.5 space-y-2 transition-colors hover:bg-muted/30">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {entry.status === "success" ? (
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-status-selected-bg dark:bg-emerald-950/30">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                            </span>
                          ) : (
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-status-rejected-bg dark:bg-red-950/30">
                              <XCircle className="h-3.5 w-3.5 text-red-500" />
                            </span>
                          )}
                          <Badge variant="secondary" className="text-[10px] font-medium">{entry.event}</Badge>
                        </div>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {new Date(entry.deliveredAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 pl-8 text-xs text-muted-foreground">
                        {entry.statusCode && (
                          <span className={entry.statusCode < 400 ? "text-status-selected" : "text-red-500"}>
                            HTTP {entry.statusCode}
                          </span>
                        )}
                        {entry.responseTime != null && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {entry.responseTime}ms
                          </span>
                        )}
                      </div>
                      {entry.error && (
                        <p className="pl-8 text-xs text-red-500/90 leading-relaxed">{entry.error}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
