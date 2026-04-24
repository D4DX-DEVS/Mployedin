"use client";

import { useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { usePagination } from "@/hooks/usePagination";
import { useConfirm } from "@/hooks/useConfirm";
import {
  useReferralLinks,
  useCreateReferralLink,
  useUpdateReferralLink,
  useDeleteReferralLink,
  ReferralLinkItem,
} from "@/hooks/useReferralLinks";
import {
  Building2,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Hash,
  Link2,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Tag,
  Users,
  X,
} from "lucide-react";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";

function formatDate(d: string | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function linkStatus(link: ReferralLinkItem): "active" | "expired" | "maxed" | "inactive" {
  if (!link.isActive) return "inactive";
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) return "expired";
  if (link.maxUses > 0 && link.usedCount >= link.maxUses) return "maxed";
  return "active";
}

function statusLabel(s: ReturnType<typeof linkStatus>): string {
  switch (s) {
    case "active": return "Active";
    case "expired": return "Expired";
    case "maxed": return "Limit Reached";
    case "inactive": return "Disabled";
  }
}

export default function AgentReferralLinksPage() {
  const { locale } = useParams<{ locale: string }>();
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const pagination = usePagination();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [copyMap, setCopyMap] = useState<Record<string, boolean>>({});

  // Create form state
  const [newLabel, setNewLabel] = useState("");
  const [newMaxUses, setNewMaxUses] = useState("");
  const [newExpiresAt, setNewExpiresAt] = useState("");

  const filters = { page: pagination.page, limit: pagination.limit, search };

  const { data, isLoading } = useReferralLinks(filters);
  const createMutation = useCreateReferralLink();
  const updateMutation = useUpdateReferralLink();
  const deleteMutation = useDeleteReferralLink();

  const links = data?.links ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 0;

  const baseUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/${locale || "en"}/employer-register?ref=`
      : "";

  const handleCopy = useCallback((code: string) => {
    navigator.clipboard.writeText(`${baseUrl}${code}`);
    setCopyMap((m) => ({ ...m, [code]: true }));
    setTimeout(() => setCopyMap((m) => ({ ...m, [code]: false })), 2000);
  }, [baseUrl]);

  const handleCreate = async () => {
    await createMutation.mutateAsync({
      label: newLabel || undefined,
      maxUses: newMaxUses ? parseInt(newMaxUses) : undefined,
      expiresAt: newExpiresAt || undefined,
    });
    setCreateOpen(false);
    setNewLabel("");
    setNewMaxUses("");
    setNewExpiresAt("");
  };

  const handleToggleActive = async (link: ReferralLinkItem) => {
    await updateMutation.mutateAsync({ id: link._id, isActive: !link.isActive });
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog("Deactivate this referral link?");
    if (!ok) return;
    await deleteMutation.mutateAsync(id);
  };

  // Stats
  const activeLinks = links.filter((l) => linkStatus(l) === "active").length;
  const totalRegistrations = links.reduce((s, l) => s + l.usedCount, 0);

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: "Code", key: "code" },
    { header: "Label", key: "label" },
    { header: "Active", key: "isActive", formatter: (v) => v ? "Yes" : "No" },
    { header: "Used", key: "usedCount" },
    { header: "Max Uses", key: "maxUses" },
    { header: "Created", key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "" },
    { header: "Expires", key: "expiresAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: links as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "agent-referral-links",
    title: "Agent Referral Links",
  });

  return (
    <div className="page-container agent-legacy-surface space-y-6">
      {ConfirmDialogNode}

      {/* Hero */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Agent workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              Referral Links
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Create and manage referral links to onboard new employers. Track who registered through each link and monitor usage.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Overview</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{total} referral links</p>
              <p className="text-xs text-muted-foreground">{totalRegistrations} total registrations</p>
            </div>
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-sky-700"
            >
              <Plus className="h-4 w-4" />
              New Referral Link
            </button>
          </div>
        </div>

        {/* Stats grid */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Total Links</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{total}</p>
                <p className="mt-1 text-xs text-muted-foreground">Links created overall</p>
              </div>
              <div className="workspace-tone-sky rounded-2xl p-2.5"><Link2 className="h-5 w-5" /></div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Active</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{activeLinks}</p>
                <p className="mt-1 text-xs text-muted-foreground">Currently accepting registrations</p>
              </div>
              <div className="workspace-tone-emerald rounded-2xl p-2.5"><Check className="h-5 w-5" /></div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Registrations</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{totalRegistrations}</p>
                <p className="mt-1 text-xs text-muted-foreground">Employers onboarded via your links</p>
              </div>
              <div className="workspace-tone-indigo rounded-2xl p-2.5"><Users className="h-5 w-5" /></div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Conversion</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{total > 0 ? Math.round((totalRegistrations / total) * 10) / 10 : 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">Avg registrations per link</p>
              </div>
              <div className="workspace-tone-amber rounded-2xl p-2.5"><Hash className="h-5 w-5" /></div>
            </div>
          </div>
        </div>
      </section>

      {/* Create Modal */}
      {createOpen && (
        <section className="workspace-panel-surface rounded-[28px] p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Create Referral Link</h2>
            <button onClick={() => setCreateOpen(false)} className="rounded-lg p-1 hover:bg-secondary/80"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Label (optional)</label>
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. LinkedIn Campaign" className="h-10 rounded-xl" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Max Registrations (0 = unlimited)</label>
              <Input type="number" value={newMaxUses} onChange={(e) => setNewMaxUses(e.target.value)} placeholder="0" min={0} className="h-10 rounded-xl" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Expiry Date (optional)</label>
              <Input type="date" value={newExpiresAt} onChange={(e) => setNewExpiresAt(e.target.value)} className="h-10 rounded-xl" />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create Link
            </button>
          </div>
        </section>
      )}

      {/* Search */}
      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div className="max-w-xl">
          <TableToolbar
            search={search}
            onSearchChange={(v) => { setSearch(v); pagination.resetPage(); }}
            searchPlaceholder="Search by code or label..."
            onExportCsv={handleExportCsv}
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
          />
        </div>
      </section>

      {/* Links list */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-sky-600" /></div>
      ) : links.length === 0 ? (
        <section className="workspace-empty-state rounded-[28px] p-10 text-center">
          <Link2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/55" />
          <p className="text-sm font-medium text-foreground">No referral links yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create your first referral link to start onboarding employers.</p>
        </section>
      ) : (
        <section className="space-y-4">
          {links.map((link) => {
            const status = linkStatus(link);
            const isExpanded = expandedId === link._id;
            return (
              <div key={link._id} className="workspace-panel-surface rounded-[28px] p-5 transition-all duration-200">
                {/* Link header */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="workspace-tone-sky flex h-11 w-11 items-center justify-center rounded-2xl">
                      <Link2 className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-sm font-semibold text-foreground">{link.code}</p>
                        {link.label && <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"><Tag className="h-2.5 w-2.5" />{link.label}</span>}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Created {formatDate(link.createdAt)}</span>
                        {link.expiresAt && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Expires {formatDate(link.expiresAt)}</span>}
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {link.usedCount}{link.maxUses > 0 ? `/${link.maxUses}` : ""} used</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={status === "active" ? "active" : status === "expired" ? "expired" : "inactive"} />
                    <button
                      onClick={() => handleCopy(link.code)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground hover:border-primary/25 hover:text-primary"
                    >
                      {copyMap[link.code] ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copyMap[link.code] ? "Copied!" : "Copy Link"}
                    </button>
                    <button
                      onClick={() => handleToggleActive(link)}
                      className={`inline-flex h-8 items-center rounded-lg border px-2.5 text-xs font-medium ${link.isActive ? "border-amber-200 text-amber-600 hover:bg-amber-50" : "border-green-200 text-green-600 hover:bg-green-50"}`}
                    >
                      {link.isActive ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : link._id)}
                      className="inline-flex h-8 items-center rounded-lg border border-border px-2 text-muted-foreground hover:text-foreground"
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded: registrations */}
                {isExpanded && (
                  <div className="mt-5 border-t border-border pt-5">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Registrations ({link.registrations.length})</p>
                    {link.registrations.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No registrations yet for this link.</p>
                    ) : (
                      <div className="space-y-2">
                        {link.registrations.map((reg, i) => (
                          <div key={i} className="flex items-center gap-3 rounded-xl bg-secondary/40 px-4 py-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                              <Building2 className="h-4 w-4" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-foreground">{reg.companyName}</p>
                              <p className="text-xs text-muted-foreground">{reg.email}</p>
                            </div>
                            <div className="text-right text-xs text-muted-foreground">
                              {reg.country && <p>{reg.city ? `${reg.city}, ` : ""}{reg.country}</p>}
                              <p>{formatDate(reg.registeredAt)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      <PaginationControls
        page={pagination.page}
        totalPages={totalPages}
        total={total}
        limit={pagination.limit}
        onPageChange={pagination.setPage}
        onLimitChange={pagination.setLimit}
      />
    </div>
  );
}
