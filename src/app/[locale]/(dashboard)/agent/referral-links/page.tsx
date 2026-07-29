"use client";

import { useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DateTimePicker } from "@/components/ui/date-time-picker";
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
  Tag,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";

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
  const t = useTranslations("agentReferralLinks");
  const tc = useTranslations("common");
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
    const ok = await confirmDialog(t("deleteConfirmMessage"));
    if (!ok) return;
    await deleteMutation.mutateAsync(id);
  };

  // Stats
  const activeLinks = links.filter((l) => linkStatus(l) === "active").length;
  const totalRegistrations = links.reduce((s, l) => s + l.usedCount, 0);

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("tableHeaderCode"), key: "code" },
    { header: t("tableHeaderLabel"), key: "label" },
    { header: tc("active"), key: "isActive", formatter: (v) => v ? t("exportYes") : t("exportNo") },
    { header: t("tableHeaderUsed"), key: "usedCount" },
    { header: t("tableHeaderMaxUses"), key: "maxUses" },
    { header: tc("date"), key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "" },
    { header: t("tableHeaderExpires"), key: "expiresAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: links as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "agent-referral-links",
    title: t("pageTitle"),
  });

  return (
    <div className="page-container space-y-6">
      {ConfirmDialogNode}

      <DashboardPageHeader
        icon={Link2}
        eyebrow={t("agentWorkspaceBadge")}
        title={t("pageTitle")}
        description={t("heroDescription")}
        summary={{
          label: t("overviewLabel"),
          value: t("linksCount", { count: total }),
          note: t("registrationsCount", { count: totalRegistrations }),
        }}
        actions={
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              {t("newReferralLinkButton")}
            </button>
        }
        metrics={[
          { label: t("statTotalLinks"), value: total, note: t("statTotalLinksDesc"), icon: Link2 },
          { label: tc("active"), value: activeLinks, note: t("statActiveDesc"), icon: Check },
          { label: t("statRegistrations"), value: totalRegistrations, note: t("statRegistrationsDesc"), icon: Users },
          { label: t("statConversion"), value: total > 0 ? Math.round((totalRegistrations / total) * 10) / 10 : 0, note: t("statConversionDesc"), icon: Hash },
        ]}
      />

      {/* Create Modal */}
      {createOpen && (
        <section className="workspace-panel-surface rounded-2xl p-4 sm:rounded-[28px] sm:p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">{t("createModalTitle")}</h2>
            <button onClick={() => setCreateOpen(false)} className="rounded-lg p-1 hover:bg-secondary/80"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("formLabelLabel")}</label>
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder={t("formLabelPlaceholder")} className="h-10 rounded-xl" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("formMaxRegistrationsLabel")}</label>
              <Input type="number" value={newMaxUses} onChange={(e) => setNewMaxUses(e.target.value)} placeholder="0" min={0} className="h-10 rounded-xl" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("formExpiryDateLabel")}</label>
              <DateTimePicker mode="date" value={newExpiresAt} onChange={setNewExpiresAt} className="h-10 rounded-xl" />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {t("createLinkButton")}
            </button>
          </div>
        </section>
      )}

      {/* Search */}
      <section className="workspace-panel-surface rounded-2xl p-3.5 sm:rounded-[28px] sm:p-5">
        <div className="max-w-xl">
          <TableToolbar
            search={search}
            onSearchChange={(v) => { setSearch(v); pagination.resetPage(); }}
            searchPlaceholder={t("searchPlaceholder")}
            onExportCsv={handleExportCsv}
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
          />
        </div>
      </section>

      {/* Links list */}
      {isLoading ? (
        <section className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="workspace-panel-surface rounded-2xl p-4 sm:rounded-[28px] sm:p-5">
              <div className="flex items-center gap-3">
                <Skeleton className="h-11 w-11 rounded-2xl" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            </div>
          ))}
        </section>
      ) : links.length === 0 ? (
        <section className="workspace-empty-state rounded-[28px] p-10 text-center">
          <Link2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/55" />
          <p className="text-sm font-medium text-foreground">{t("emptyStateTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("emptyStateDescription")}</p>
        </section>
      ) : (
        <section className="space-y-4">
          {links.map((link) => {
            const status = linkStatus(link);
            const isExpanded = expandedId === link._id;
            return (
              <div key={link._id} className="workspace-panel-surface rounded-2xl p-4 sm:rounded-[28px] sm:p-5 transition-all duration-200">
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
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {t("labelCreated")} {formatDate(link.createdAt)}</span>
                        {link.expiresAt && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {t("labelExpires")} {formatDate(link.expiresAt)}</span>}
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {link.usedCount}{link.maxUses > 0 ? `/${link.maxUses}` : ""} {t("labelUsed")}</span>
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
                      {copyMap[link.code] ? t("copiedFeedback") : t("copyLinkButton")}
                    </button>
                    <button
                      onClick={() => handleToggleActive(link)}
                      className={`inline-flex h-8 items-center rounded-lg border px-2.5 text-xs font-medium ${link.isActive ? "border-status-shortlisted/20 text-status-shortlisted hover:bg-status-shortlisted/10" : "border-status-selected/20 text-status-selected hover:bg-status-selected/10"}`}
                    >
                      {link.isActive ? t("disableButton") : t("enableButton")}
                    </button>
                    {link.usedCount === 0 && link.registrations.length === 0 && (
                      <button
                        onClick={() => handleDelete(link._id)}
                        disabled={deleteMutation.isPending}
                        title={t("deleteButtonTitle")}
                        className="inline-flex h-8 items-center rounded-lg border border-status-rejected/20 px-2.5 text-xs font-medium text-status-rejected hover:bg-status-rejected/10 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
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
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("registrationsLabel", { count: link.registrations.length })}</p>
                    {link.registrations.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("noRegistrationsYet")}</p>
                    ) : (
                      <div className="space-y-2">
                        {link.registrations.map((reg, i) => (
                          <div key={i} className="flex items-center gap-3 rounded-xl bg-secondary/40 px-4 py-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-status-applied-bg text-status-applied">
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
