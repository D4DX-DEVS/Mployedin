"use client";

import { useState, useCallback, Fragment } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { endOfDay, parseISO } from "date-fns";
import { Input } from "@/components/ui/input";
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
  linkStatus,
} from "@/hooks/useReferralLinks";
import {
  Calendar,
  Check,
  Copy,
  Link2,
  Loader2,
  Plus,
  Power,
  PowerOff,
  Trash2,
  Users,
  X,
  Mail,
  MapPin,
} from "lucide-react";
import { useTableExport } from "@/hooks/useTableExport";
import { InlineFilterBar, InlineFilterSearch } from "@/components/shared/InlineFilterBar";
import { RowActions } from "@/components/shared/RowActions";
import { RowExpandToggle, isRowToggleClick } from "@/components/shared/RowExpandToggle";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableBodySkeleton } from "@/components/ui/loading";
import { EmptyState } from "@/components/shared/EmptyState";
import type { ExportColumn } from "@/lib/export";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { referralUrlFor, type ReferralAudience } from "@/lib/referrals/url";
import { registrationDisplayName } from "@/lib/referrals/display";
import { formatListDate } from "@/lib/ui/intlFormat";

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
  const [newAudience, setNewAudience] = useState<ReferralAudience>("employer");

  const filters = { page: pagination.page, limit: pagination.limit, search };

  const { data, isLoading } = useReferralLinks(filters);
  const createMutation = useCreateReferralLink();
  const updateMutation = useUpdateReferralLink();
  const deleteMutation = useDeleteReferralLink();

  const links = data?.links ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 0;

  const handleCopy = useCallback((link: ReferralLinkItem) => {
    navigator.clipboard.writeText(referralUrlFor(link, locale || "en", window.location.origin));
    setCopyMap((m) => ({ ...m, [link.code]: true }));
    setTimeout(() => setCopyMap((m) => ({ ...m, [link.code]: false })), 2000);
  }, [locale]);

  const handleCreate = async () => {
    await createMutation.mutateAsync({
      label: newLabel || undefined,
      maxUses: newMaxUses ? parseInt(newMaxUses) : undefined,
      // The picked day is the last day the link works. Sent bare, "2026-09-30"
      // parsed as UTC midnight: today was refused and every link died a day early.
      expiresAt: newExpiresAt ? endOfDay(parseISO(newExpiresAt)).toISOString() : undefined,
      audience: newAudience,
    });
    setCreateOpen(false);
    setNewLabel("");
    setNewMaxUses("");
    setNewExpiresAt("");
    setNewAudience("employer");
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
    { header: tc("date"), key: "createdAt", formatter: (v) => v ? formatListDate(new Date(String(v))) : "" },
    { header: t("tableHeaderExpires"), key: "expiresAt", formatter: (v) => v ? formatListDate(new Date(String(v))) : "" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: links as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "agent-referral-links",
    title: t("pageTitle"),
  });

  return (
    <div className="page-container">
      {ConfirmDialogNode}

      <WorkspaceHeader
        title={t("pageTitle")}
        context={t("heroDescription")}
        actions={
          <button
            onClick={() => setCreateOpen(true)}
            aria-label={t("newReferralLinkButton")}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:px-4"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t("newReferralLinkButton")}</span>
          </button>
        }
        metrics={[
          { label: t("statTotalLinks"), value: total, icon: Link2, tone: "primary" },
          { label: tc("active"), value: activeLinks, icon: Check, tone: "success" },
          { label: t("statRegistrations"), value: totalRegistrations, icon: Users, tone: "info" },
        ]}
      />

      {/* Create Modal */}
      {createOpen && (
        <section className="workspace-panel-surface rounded-2xl sm:rounded-3xl panel-body">
          <div className="flex items-center justify-between">
            <h2 className="heading-section font-semibold text-foreground">{t("createModalTitle")}</h2>
            <button onClick={() => setCreateOpen(false)} className="rounded-lg p-1 hover:bg-secondary/80"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <fieldset className="sm:col-span-3">
              <legend className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("audienceLabel")}</legend>
              <div className="flex flex-wrap gap-2">
                {(["employer", "job_seeker"] as const).map((value) => (
                  <label
                    key={value}
                    className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${newAudience === value ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground"}`}
                  >
                    <input
                      type="radio"
                      name="referral-audience"
                      value={value}
                      checked={newAudience === value}
                      onChange={() => setNewAudience(value)}
                      className="accent-primary"
                    />
                    {value === "job_seeker" ? t("audienceJobSeeker") : t("audienceEmployer")}
                  </label>
                ))}
              </div>
            </fieldset>
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
              <DateTimePicker mode="date" minDate={new Date()} value={newExpiresAt} onChange={setNewExpiresAt} className="h-10 rounded-xl" />
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

      {/* Filters */}
      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
        onClear={search ? () => { setSearch(""); pagination.resetPage(); } : undefined}
      >
        <InlineFilterSearch
          value={search}
          onChange={(v) => { setSearch(v); pagination.resetPage(); }}
          placeholder={t("searchPlaceholder")}
        />
      </InlineFilterBar>

      {/* Links table */}
      <section className="workspace-panel-surface overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="min-w-[120px]">{t("tableHeaderCode")}</TableHead>
                <TableHead className="w-[100px]">{tc("status")}</TableHead>
                <TableHead>{t("tableHeaderLabel")}</TableHead>
                <TableHead>{t("tableHeaderUsed")}</TableHead>
                <TableHead>{t("tableHeaderExpires")}</TableHead>
                <TableHead className="text-right">{tc("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableBodySkeleton rows={5} cols={6} />
              ) : links.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-12">
                    <EmptyState
                      title={t("emptyStateTitle")}
                      description={t("emptyStateDescription")}
                      icon={Link2}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                links.map((link) => {
                  const status = linkStatus(link);
                  const isExpanded = expandedId === link._id;
                  return (
                    <Fragment key={link._id}>
                      <TableRow
                        className="group cursor-pointer"
                        onClick={(event) => {
                          const cardMode =
                            event.currentTarget.hasAttribute("data-mobile-collapsible") &&
                            (typeof window.matchMedia !== "function" || window.matchMedia("(max-width: 639px)").matches);
                          if (cardMode) return;
                          if (!isRowToggleClick(event)) return;
                          setExpandedId(isExpanded ? null : link._id);
                        }}
                      >
                        <TableCell className="font-mono text-sm font-medium">{link.code}</TableCell>
                        <TableCell>
                          <StatusBadge status={status === "active" ? "active" : status === "expired" ? "expired" : "inactive"} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{link.label || "—"}</TableCell>
                        <TableCell className="text-sm">{link.usedCount}{link.maxUses > 0 ? `/${link.maxUses}` : ""}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3 shrink-0" aria-hidden="true" />
                            {link.expiresAt ? formatListDate(new Date(link.expiresAt)) : "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            <RowActions
                              name={link.code}
                              quick={[
                                {
                                  key: "copy",
                                  label: copyMap[link.code] ? t("copiedFeedback") : t("copyLinkButton"),
                                  icon: copyMap[link.code] ? Check : Copy,
                                  onSelect: () => handleCopy(link),
                                },
                              ]}
                              menu={[
                                {
                                  key: "toggle",
                                  label: link.isActive ? t("disableButton") : t("enableButton"),
                                  icon: link.isActive ? PowerOff : Power,
                                  destructive: link.isActive,
                                  onSelect: () => { void handleToggleActive(link); },
                                },
                                ...(link.usedCount === 0 && link.registrations.length === 0 ? [{
                                  key: "delete",
                                  label: tc("delete"),
                                  icon: Trash2,
                                  destructive: true,
                                  onSelect: () => { void handleDelete(link._id); },
                                }] : []),
                              ]}
                            />
                            <RowExpandToggle
                              expanded={isExpanded}
                              onToggle={() => setExpandedId(isExpanded ? null : link._id)}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${link._id}-detail`} className="hover:bg-transparent">
                          <TableCell colSpan={6} className="bg-secondary/30 px-6 py-4">
                            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              {t("registrationsLabel", { count: link.registrations.length })}
                            </p>
                            {link.registrations.length === 0 ? (
                              <p className="text-sm text-muted-foreground">{t("noRegistrationsYet")}</p>
                            ) : (
                              <div className="space-y-2">
                                {link.registrations.map((reg, i) => (
                                  <div key={i} className="flex items-center gap-3 rounded-xl bg-background/60 px-4 py-3">
                                    <UserAvatar name={registrationDisplayName(reg)} className="h-8 w-8 shrink-0" colorful />
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-sm font-medium text-foreground">{registrationDisplayName(reg)}</p>
                                      <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                                        <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                                        <span className="truncate">{reg.email}</span>
                                      </p>
                                    </div>
                                    <div className="shrink-0 text-right text-xs text-muted-foreground">
                                      {reg.country && (
                                        <p className="flex items-center justify-end gap-1">
                                          <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                                          {reg.city ? `${reg.city}, ` : ""}{reg.country}
                                        </p>
                                      )}
                                      <p>{formatListDate(new Date(reg.registeredAt))}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </section>

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
