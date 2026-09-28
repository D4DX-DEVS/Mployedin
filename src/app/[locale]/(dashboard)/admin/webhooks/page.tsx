"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  Plus, Trash2, Copy, Check, Webhook as WebhookIcon,
  AlertCircle, CheckCircle2, XCircle,
  RotateCcw, Activity, Inbox,
  Send, Eye, ToggleLeft, ToggleRight, KeyRound, Clock, X, Info, Pencil,
} from "lucide-react";
import { formatActionCode } from "@/lib/admin/actionLabels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { TableSortControl, SortableTableHeader } from "@/components/shared/TableSortControl";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useConfirm } from "@/hooks/useConfirm";
import { toast } from "sonner";
import { TableBodySkeleton } from "@/components/ui/loading";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { usePagination } from "@/hooks/usePagination";
import { formatDate, formatDateTime } from "@/lib/ui/intlFormat";

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
  const ta = useTranslations("a11y");
  const {
    page, limit, total, totalPages,
    setPage, setLimit, updateTotal, resetPage, paginationParams,
  } = usePagination();
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [stats, setStats] = useState({ active: 0, inactive: 0, failed: 0, healthy: 0 });
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  // Filter state
  const [search, setSearch] = useState("");
  /* System Health and the "Failing webhooks" quick action both link here with
     ?status=failed; in component state that filter would be ignored on arrival. */
  const [statusFilter, setStatusFilter] = useUrlFilter("status", "all");
  const [eventFilter, setEventFilter] = useState("all");
  const [sortBy, setSortBy] = useUrlFilter("sortBy", "createdAt", { allow: ["createdAt", "name", "lastTriggeredAt"] });
  const [sortOrderParam, setSortOrder] = useUrlFilter("sortOrder", "desc", { allow: ["asc", "desc"] });
  const sortOrder: "asc" | "desc" = sortOrderParam === "asc" ? "asc" : "desc";
  const sortByColumn = (field: string) => {
    if (field === sortBy) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortOrder(field === "name" ? "asc" : "desc"); }
  };

  // Delivery log drawer
  const [logDrawerOpen, setLogDrawerOpen] = useState(false);
  const [logWebhook, setLogWebhook] = useState<WebhookItem | null>(null);
  const [logEntries, setLogEntries] = useState<DeliveryLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);

  // Test ping
  const [testingId, setTestingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

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
    setLoadError(null);
    try {
      const params = paginationParams();
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (eventFilter !== "all") params.set("event", eventFilter);
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);
      const res = await fetch(`/api/admin/webhooks?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setWebhooks(data.webhooks || []);
        setStats(data.stats ?? { active: 0, inactive: 0, failed: 0, healthy: 0 });
        updateTotal(data.total ?? 0);
      } else {
        setLoadError(t("loadFailed"));
      }
    } catch {
      setLoadError(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, eventFilter, sortBy, sortOrder, page, limit, paginationParams, updateTotal, t]);

  useEffect(() => { fetchWebhooks(); }, [fetchWebhooks]);
  useEffect(() => {
    resetPage();
  }, [search, statusFilter, eventFilter, sortBy, sortOrder, resetPage]);

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
        const err = await res.json().catch(() => ({ error: t("requestFailed") }));
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
    const ok = await confirmDialog(t("deleteConfirmPrompt"));
    if (!ok) return;
    try {
      const res = await csrfFetch(`/api/admin/webhooks/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("deleted"));
        fetchWebhooks();
      } else {
        toast.error(t("deleteFailed"));
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

  const [redeliveringId, setRedeliveringId] = useState<string | null>(null);

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

  /**
   * Replay the newest failed delivery. The page showed failures and a retry
   * count and offered nothing to do about them — an admin could see a broken
   * integration and had to ask an engineer to re-trigger the event.
   */
  const handleRedeliver = async (id: string) => {
    setRedeliveringId(id);
    try {
      const res = await csrfFetch(`/api/admin/webhooks/${id}/redeliver`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success(t("redeliverSucceeded", { event: data.event }));
        fetchWebhooks();
      } else {
        toast.error(data.message ?? t("redeliverFailed"));
      }
    } catch {
      toast.error(t("redeliverFailed"));
    } finally {
      setRedeliveringId(null);
    }
  };

  const handleRotateSecret = async (id: string) => {
    const ok = await confirmDialog(t("rotateSecretConfirm"));
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
    <div className="page-container">

      <DashboardPageHeader
        compact
        compactOnMobile
        icon={WebhookIcon}
        title={t("title")}
        description={t("description")}
        metrics={[
          { label: t("active"), value: activeCount, icon: CheckCircle2, iconClassName: "text-status-selected", iconSurfaceClassName: "bg-status-selected-bg" },
          { label: t("inactive"), value: inactiveCount, icon: XCircle, iconClassName: "text-muted-foreground", iconSurfaceClassName: "bg-muted/30" },
          { label: t("healthy"), value: healthyCount, icon: Activity, iconClassName: "text-status-selected", iconSurfaceClassName: "bg-status-selected-bg" },
          { label: t("failed"), value: failedCount, icon: AlertCircle, iconClassName: "text-status-rejected", iconSurfaceClassName: "bg-status-rejected-bg" },
        ]}
        actions={
          <>
            <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
              <DialogTrigger asChild>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="lg"
                        variant="outline"
                        className="w-11 rounded-xl p-0"
                        aria-label={t("howWebhooksWork")}
                      >
                        <Info className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {t("howWebhooksWork")}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Info className="h-4 w-4 text-sky-500" />
                    {t("helpDialogTitle")}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 text-sm leading-relaxed">
                  <p className="text-muted-foreground">
                    When a finance event happens in Mployedin (an invoice is created or paid, a
                    commission changes status), the platform sends a signed JSON POST to the URL
                    you register here — so an external system like your accounting software can
                    record it automatically. Nothing is received by Mployedin; this is outbound only.
                  </p>
                  <ol className="list-decimal space-y-2.5 pl-5">
                    <li>
                      <span className="font-medium text-foreground">{t("helpStep1Title")}</span>{" "}
                      {t("helpStep1Body")}
                    </li>
                    <li>
                      <span className="font-medium text-foreground">{t("helpStep2Title")}</span>{" "}
                      {t("helpStep2Body")}
                    </li>
                    <li>
                      <span className="font-medium text-foreground">{t("helpStep3Title")}</span>{" "}
                      {t("helpStep3Body")}
                    </li>
                    <li>
                      <span className="font-medium text-foreground">{t("helpStep4Title")}</span>{" "}
                      {t("helpStep4Body")}
                    </li>
                    <li>
                      <span className="font-medium text-foreground">{t("helpStep5Title")}</span>{" "}
                      {t("helpStep5Body")}
                    </li>
                  </ol>
                  <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                    {t("helpNote")}
                  </p>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) resetForm(); setDialogOpen(v); }}>
              <DialogTrigger asChild>
                <Button size="lg"
                  onClick={openCreate}
                  className="gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 border-0"
                >
                  <Plus className="h-4 w-4" />
                  {t("addWebhookButton")}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editId ? t("editWebhookDialog") : t("newWebhookDialog")}</DialogTitle>
                </DialogHeader>

                {/* Secret display (only on create success) */}
                {newSecret && (
                  <div className="rounded-lg border border-status-shortlisted/20 bg-status-shortlisted-bg mb-4 card-pad">
                    <p className="text-sm font-medium text-status-shortlisted mb-2">
                      <AlertCircle className="h-4 w-4 inline mr-1" />
                      {t("secretWarning")}
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs break-all font-mono bg-card p-2 rounded">
                        {newSecret}
                      </code>
                      <Button aria-label={ta("copy")} variant="ghost" size="sm" onClick={copySecret}>
                        {copiedSecret ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <Button
                      className="mt-3 w-full"
                      size="sm"
                      onClick={() => { setDialogOpen(false); resetForm(); }}
                    >
                      {t("doneButton")}
                    </Button>
                  </div>
                )}

                {!newSecret && (
                  <div className="space-y-4 mt-2">
                    <div className="field">
                      <Label htmlFor="webhook-name">{t("nameLabel")}</Label>
                      <Input
                        id="webhook-name"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder={t("namePlaceholderExample")}
                      />
                    </div>
                    <div className="field">
                      <Label htmlFor="webhook-url">{t("endpointUrlLabel")}</Label>
                      <Input
                        id="webhook-url"
                        value={form.url}
                        onChange={(e) => setForm({ ...form, url: e.target.value })}
                        placeholder="https://your-system.com/webhook"
                      />
                    </div>
                    <div className="space-y-1.5" role="group" aria-labelledby="webhook-events-label">
                      <Label id="webhook-events-label">{t("eventsLabel")}</Label>
                      <div className="flex flex-wrap gap-2">
                        {/* Toggle buttons, not clickable badges: a Badge is a
                            span, so keyboard users could not pick an event. */}
                        {EVENTS.map((ev) => {
                          const selected = form.events.includes(ev);
                          return (
                            <button
                              key={ev}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => toggleEvent(ev)}
                              className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 ${
                                selected
                                  ? "border-transparent bg-primary text-primary-foreground"
                                  : "border-border text-foreground hover:bg-muted"
                              }`}
                            >
                              {ev}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="field">
                      <Label htmlFor="webhook-retry-count">{t("retryCountLabel")}</Label>
                      <Input
                        id="webhook-retry-count"
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
                      <Label htmlFor="isActive">{t("activeLabel")}</Label>
                    </div>
                    <Button onClick={handleSubmit} className="w-full">
                      {editId ? t("editWebhookDialog") : t("addWebhookButton")}
                    </Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </>
        }
      />

      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        onClear={activeFilterCount > 0 ? clearAllFilters : undefined}
        clearLabel={t("clearNFilters", { count: activeFilterCount })}
      >
        <InlineFilterSearch
          value={search}
          onChange={(value) => { setSearch(value); resetPage(); }}
          placeholder={t("searchPlaceholder")}
        />
        <SearchableSelect
          id="webhook-status-filter"
          className={INLINE_FILTER_CONTROL}
          options={[
            { value: "all", label: t("allStatuses") },
            { value: "active", label: t("active") },
            { value: "inactive", label: t("inactive") },
            { value: "failing", label: t("failingStatus") },
          ]}
          value={statusFilter}
          onValueChange={(value) => { setStatusFilter(value); resetPage(); }}
          placeholder={t("allStatuses")}
        />
        <SearchableSelect
          id="webhook-event-filter"
          className={INLINE_FILTER_CONTROL}
          options={[
            { value: "all", label: t("allEvents") },
            ...EVENTS.map((ev) => ({ value: ev, label: ev })),
          ]}
          value={eventFilter}
          onValueChange={(value) => { setEventFilter(value); resetPage(); }}
          placeholder={t("allEvents")}
        />
        <TableSortControl
          value={sortBy}
          onValueChange={setSortBy}
          options={[
            { value: "createdAt", label: t("sortDateAdded") },
            { value: "lastTriggeredAt", label: t("lastTriggered") },
            { value: "name", label: t("name") },
          ]}
          order={sortOrder}
          onOrderChange={setSortOrder}
          compact
        />
      </InlineFilterBar>

      {/* ─── Table ────────────────────────────────────────────────────── */}
      <section className="workspace-panel-surface overflow-hidden rounded-2xl border-t-0 rounded-t-none">
        {loadError ? (
          <div className="p-6">
            <ErrorState onRetry={fetchWebhooks} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="min-w-[160px] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em]">
                    <SortableTableHeader label={t("name")} active={sortBy === "name"} order={sortOrder} onClick={() => sortByColumn("name")} />
                  </TableHead>
                  <TableHead className="min-w-[200px] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em]">{t("url")}</TableHead>
                  <TableHead className="min-w-[180px] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em]">{t("events")}</TableHead>
                  <TableHead className="min-w-[80px] px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.12em]">{t("active")}</TableHead>
                  <TableHead className="min-w-[110px] px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.12em]">
                    <SortableTableHeader label={t("lastTriggered")} active={sortBy === "lastTriggeredAt"} order={sortOrder} onClick={() => sortByColumn("lastTriggeredAt")} />
                  </TableHead>
                  <TableHead className="min-w-[180px] px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em]">{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableBodySkeleton rows={3} cols={6} />
                ) : filteredWebhooks.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="h-44 text-center">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-muted/50">
                          <Inbox className="h-7 w-7 opacity-40" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{t("noWebhooksFound")}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {activeFilterCount > 0 ? t("tryAdjustingFilters") : t("webhooksWillAppearWhenConfigured")}
                          </p>
                        </div>
                        {activeFilterCount > 0 && (
                          <Button variant="outline" size="dense" onClick={clearAllFilters} className="mt-1 rounded-lg text-xs">
                            {t("clearFiltersButton")}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredWebhooks.map((wh) => {
                  const rowActionsFor = (webhook: WebhookItem): { quick: RowAction[]; menu: RowAction[] } => {
                    const menu: RowAction[] = [];

                    // Send test ping
                    menu.push({
                      key: "test",
                      label: t("a11ySendTestPing"),
                      icon: Send,
                      onSelect: () => handleTestPing(webhook._id),
                      pending: testingId === webhook._id,
                    });

                    // Replay failed (only if last delivery failed)
                    if (webhook.lastStatus === "failed") {
                      menu.push({
                        key: "redeliver",
                        label: t("a11yRedeliver"),
                        icon: RotateCcw,
                        onSelect: () => handleRedeliver(webhook._id),
                        pending: redeliveringId === webhook._id,
                      });
                    }

                    // View delivery log - QUICK ACTION
                    const viewAction: RowAction = {
                      key: "view",
                      label: t("a11yViewDeliveryLog"),
                      icon: Eye,
                      onSelect: () => openDeliveryLog(webhook),
                    };

                    // Rotate secret
                    menu.push({
                      key: "rotate",
                      label: t("a11yRotateSecret"),
                      icon: KeyRound,
                      onSelect: () => handleRotateSecret(webhook._id),
                    });

                    // Edit
                    menu.push({
                      key: "edit",
                      label: t("edit"),
                      icon: Pencil,
                      onSelect: () => openEdit(webhook),
                    });

                    // Delete
                    menu.push({
                      key: "delete",
                      label: ta("delete"),
                      icon: Trash2,
                      onSelect: () => handleDelete(webhook._id),
                      destructive: true,
                    });

                    return { quick: [viewAction], menu };
                  };

                  return (
                    <TableRow key={wh._id} className="group transition-colors">
                      <TableCell className="px-4 py-3 font-medium">{wh.name}</TableCell>
                      <TableCell className="max-w-[200px] truncate px-4 py-3 text-xs font-mono text-muted-foreground">
                        {wh.url}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {wh.events.map((ev) => (
                            <Badge key={ev} variant="secondary" className="text-[11px]" title={ev}>
                              {formatActionCode(ev)}
                              {/* The raw code is what a receiver subscribes to; phones get it via title. */}
                              <span className="ml-1 hidden font-mono text-[10px] text-muted-foreground sm:inline">({ev})</span>
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-center">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => handleToggleActive(wh)}
                                className="inline-flex items-center gap-1 text-xs"
                                aria-label={wh.isActive ? t("clickToDisable") : t("clickToEnable")}
                              >
                                {wh.isActive ? (
                                  <ToggleRight className="h-5 w-5 text-emerald-500" />
                                ) : (
                                  <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                                )}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {wh.isActive ? t("clickToDisable") : t("clickToEnable")}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-center text-xs text-muted-foreground">
                        {wh.lastTriggeredAt
                          ? formatDate(new Date(wh.lastTriggeredAt), { day: "2-digit", month: "short", year: "numeric" })
                          : "—"}
                        {wh.lastStatus && (
                          <span className={`ml-1 ${wh.lastStatus === "success" ? "text-status-selected" : "text-red-500"}`}>
                            ({wh.lastStatus})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        <RowActions name={wh.name} labelsFrom="wide" {...rowActionsFor(wh)} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
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
            <div className="flex items-center justify-between bg-muted/20 panel-head">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-sky-500 shrink-0" />
                  <h2 className="heading-section font-semibold truncate">{t("deliveryLog")}</h2>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{logWebhook?.name}</p>
                <p className="truncate text-xs font-mono text-muted-foreground">{logWebhook?.url}</p>
              </div>
              <Button aria-label={ta("close")} variant="ghost" size="sm" onClick={() => setLogDrawerOpen(false)} className="h-8 w-8 shrink-0 rounded-lg p-0">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Summary bar */}
            {!logLoading && logEntries.length > 0 && (
              <div className="flex items-center gap-4 border-b border-border/40 text-xs panel-head">
                <span className="flex items-center gap-1.5 text-status-selected">
                  <CheckCircle2 className="h-3 w-3" />
                  {logEntries.filter((e) => e.status === "success").length} success
                </span>
                <span className="flex items-center gap-1.5 text-red-500">
                  <XCircle className="h-3 w-3" />
                  {t("failedCount", { count: logEntries.filter((e) => e.status === "failed").length })}
                </span>
                <span className="ml-auto text-muted-foreground">{t("totalCount", { count: logEntries.length })}</span>
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
                  <p className="text-sm font-semibold text-foreground">{t("noDeliveriesYet")}</p>
                  <p className="mt-1 text-xs">{t("deliveriesWillAppearAfterEventsFire")}</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {[...logEntries].reverse().map((entry, i) => (
                    <div key={i} className="rounded-2xl border border-border/50 bg-card p-3.5 space-y-2 transition-colors hover:bg-muted/30">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {entry.status === "success" ? (
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-status-selected-bg">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                            </span>
                          ) : (
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-status-rejected-bg">
                              <XCircle className="h-3.5 w-3.5 text-red-500" />
                            </span>
                          )}
                          <Badge variant="secondary" className="text-[11px] font-medium">{entry.event}</Badge>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(new Date(entry.deliveredAt))}
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
