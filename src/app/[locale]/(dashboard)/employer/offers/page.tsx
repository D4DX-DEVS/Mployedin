"use client";

import { useEffect, useState, useRef } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { DollarSign, CalendarDays, Clock3, CircleCheckBig, Eye, X, FileText, FileDown, ChevronDown } from "lucide-react";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { useOffers, useWithdrawOffer } from "@/hooks/useOffers";
import { useTableExport } from "@/hooks/useTableExport";
import type { Offer, OfferStatus } from "@/hooks/useOffers";
import type { ExportColumn } from "@/lib/export";

function getStatusColor(status: OfferStatus): string {
  switch (status) {
    case "pending": return "bg-status-shortlisted-bg text-status-shortlisted border-status-shortlisted/20 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30";
    case "accepted": return "bg-status-selected-bg text-emerald-700 border-status-selected/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30";
    case "declined": return "bg-status-rejected-bg text-status-rejected border-status-rejected/20 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30";
    case "expired": return "bg-secondary/75 text-muted-foreground border-border dark:bg-slate-500/80 dark:text-muted-foreground dark:border-slate-700";
    case "withdrawn": return "bg-status-shortlisted-bg text-status-shortlisted border-status-shortlisted/20 dark:bg-amber-500/15 dark:text-orange-300 dark:border-orange-500/30";
    default: return "bg-secondary/75 text-muted-foreground border-border dark:bg-slate-500/80 dark:text-muted-foreground dark:border-slate-700";
  }
}

export default function EmployerOffersPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const searchParams = useSearchParams();
  const t = useTranslations("employerOffers");
  const tc = useTranslations("employerCommon");

  const STATUS_OPTIONS: { value: string; label: string }[] = [
    { value: "all", label: t("allOffers") },
    { value: "pending", label: t("pending") },
    { value: "accepted", label: t("accepted") },
    { value: "declined", label: t("declined") },
    { value: "expired", label: t("expired") },
    { value: "withdrawn", label: t("withdrawn") },
  ];

  const [page, setPageState] = useState(() => Number(searchParams.get("page")) || 1);

  function setPage(next: number) {
    setPageState(next);
    const params = new URLSearchParams(window.location.search);
    if (next > 1) params.set("page", String(next)); else params.delete("page");
    router.replace(`?${params.toString()}`, { scroll: false });
  }
  const [limit, setLimit] = useState(10);
  const [statusFilter, setStatusFilter] = useState("all");
  const [jobFilter, setJobFilter] = useState(searchParams.get("jobId") ?? "all");
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [detailOffer, setDetailOffer] = useState<Offer | null>(null);
  const [expandedOfferId, setExpandedOfferId] = useState<string | null>(null);
  const [jobOptions, setJobOptions] = useState<{ value: string; label: string }[]>([{ value: "all", label: t("allJobs") }]);

  const { data, isLoading: loading, error, refetch } = useOffers({ page, limit, status: statusFilter, jobId: jobFilter !== "all" ? jobFilter : undefined });
  const withdrawMutation = useWithdrawOffer();

  const offers = data?.offers ?? [];
  const total = data?.pagination?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  useEffect(() => {
    document.title = `${t("title")} · MPLOYEDIN`;
  }, [t]);

  // Fetch employer jobs for the filter dropdown
  useEffect(() => {
    fetch("/api/jobs?limit=100&fields=title")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!data) return;
        const jobs = data.jobs ?? data.items ?? [];
        const opts = jobs.map((j: { _id: string; title: string }) => ({ value: j._id, label: j.title }));
        setJobOptions([{ value: "all", label: t("allJobs") }, ...opts]);
      })
      .catch(() => {});
  }, []);

  // Reset page when filters change (skip the initial mount so a page restored from the URL survives)
  const skipFilterResetRef = useRef(true);
  useEffect(() => {
    if (skipFilterResetRef.current) { skipFilterResetRef.current = false; return; }
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, jobFilter]);

  async function handleWithdraw(offerId: string) {
    try {
      await withdrawMutation.mutateAsync(offerId);
      setWithdrawingId(null);
    } catch (err) {
      console.error("Error withdrawing offer:", err);
    }
  }

  const isExpiring = (offer: Offer) => {
    if (offer.status !== "pending") return false;
    const daysLeft = Math.ceil((new Date(offer.expiresAt).getTime() - Date.now()) / 86400000);
    return daysLeft <= 2 && daysLeft > 0;
  };

  const isExpired = (offer: Offer) =>
    new Date(offer.expiresAt) < new Date() && offer.status === "pending";

  const pendingCount = offers.filter((o) => o.status === "pending").length;
  const acceptedCount = offers.filter((o) => o.status === "accepted").length;
  const expiringSoonCount = offers.filter((offer) => isExpiring(offer)).length;
  const respondedCount = offers.filter((offer) => offer.respondedAt).length;

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("candidate"), key: "jobSeekerId", formatter: (_v, r) => { const o = r as unknown as Offer; return candidateName(o); } },
    { header: t("role"), key: "jobId", formatter: (_v, r) => (r as Record<string, any>).jobId?.title || t("untitledRole") },
    { header: t("salary"), key: "salary", formatter: (_v, r) => { const o = r as Record<string, any>; return `${o.salary?.currency} ${o.salary?.amount?.toLocaleString()}`; } },
    { header: t("startDate"), key: "startDate", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : t("notSet") },
    { header: t("status"), key: "status", formatter: (v) => String(v ?? "—") },
    { header: t("expired"), key: "expiresAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : t("notSet") },
    { header: t("createdAt"), key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: offers as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "offers",
    title: t("title"),
  });

  function formatDate(value?: string): string {
    if (!value) return t("notSet");
    return new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatSalary(offer: Offer): string {
    if (!offer.salary?.amount) return t("notDisclosed");
    return `${offer.salary.currency ?? "AED"} ${offer.salary.amount.toLocaleString()}`;
  }

  function candidateName(offer: Offer): string {
    return offer.jobSeekerId?.userId?.name || offer.jobSeekerId?.fullName || `${t("candidate")} #${offer._id.slice(-4)}`;
  }

  return (
    <div className="page-container space-y-6">
      <DashboardPageHeader
        icon={DollarSign}
        eyebrow={t("pending")}
        title={t("pending")}
        metrics={[
          { label: t("pending"), value: pendingCount, note: t("pendingNote"), icon: Clock3 },
          { label: t("accepted"), value: acceptedCount, note: t("acceptedNote"), icon: CircleCheckBig },
          { label: t("expired"), value: expiringSoonCount, note: t("expiringNote"), icon: CalendarDays },
          { label: t("responded"), value: respondedCount, note: t("respondedNote"), icon: FileText },
        ]}
      />

      <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("filterDecisions")}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("filterTitle")}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("filterDescription")}
            </p>
          </div>

          {/* Both selects share one row — full-width stacking pushed the offer
              list a whole screen down on phones. */}
          <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap sm:gap-3">
            <SearchableSelect
              className="w-full min-w-0 sm:w-60"
              options={jobOptions}
              value={jobFilter}
              onValueChange={setJobFilter}
              placeholder={t("allJobs")}
            />
            <SearchableSelect
              className="w-full min-w-0 sm:w-60"
              options={STATUS_OPTIONS}
              value={statusFilter}
              onValueChange={setStatusFilter}
              placeholder={t("allStatuses")}
            />
          </div>
        </div>
      </section>

      {error ? (
        <section className="workspace-panel-surface rounded-[28px] border border-red-500/20 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-status-rejected">{t("offerList")}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{tc("somethingWentWrong")}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {error instanceof Error ? error.message : t("offerListDesc")}
              </p>
            </div>
            <Button className="h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90" onClick={() => void refetch()}>
              {tc("tryAgain")}
            </Button>
          </div>
        </section>
      ) : loading ? (
        <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("offerList")}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{tc("loading")}</h2>
            </div>
          </div>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-background/60" />
            ))}
          </div>
        </section>
      ) : offers.length === 0 ? (
        <section className="workspace-panel-surface rounded-[28px] p-6">
          <div className="flex flex-col items-center py-14 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-status-applied-bg text-status-applied">
              <DollarSign className="h-7 w-7" />
            </div>
            <h2 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">{t("noOffers")}</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
              {t("noOffersDesc")}
            </p>
            <Button asChild className="mt-6 h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              <Link href={`/${locale}/employer/applications`}>{t("openPipeline")}</Link>
            </Button>
          </div>
        </section>
      ) : (
        <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
          {/* Export sits on the heading row and the filter blurb (already shown
              verbatim in the filter card above) is desktop-only — together they
              cost ~120px of phone height for nothing. */}
          <div className="flex flex-row items-start justify-between gap-3 border-b border-border pb-3 sm:items-end sm:pb-5">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("offerList")}</p>
              <h2 className="mt-1 text-base font-semibold tracking-tight text-foreground sm:mt-2 sm:text-xl">{t("offerListDesc")}</h2>
              <p className="mt-2 hidden text-sm leading-6 text-muted-foreground sm:block">
                {t("filterDescription")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground sm:mt-2 sm:text-sm">{offers.length} {t("offersCount")}</p>
            </div>
            <TableToolbar
              onExportCsv={handleExportCsv}
              onExportExcel={handleExportExcel}
              onExportPdf={handleExportPdf}
              className="shrink-0"
            />
          </div>

          {/* Phones get compact expandable rows. The shared <Table> stacks every
              cell into a labelled block, which turned one offer into a screenful. */}
          <ul className="mt-3 space-y-1.5 sm:hidden">
            {offers.map((offer) => {
              const isOpen = expandedOfferId === offer._id;
              return (
                <li
                  key={offer._id}
                  className={`rounded-xl border border-border/60 ${isExpiring(offer) ? "bg-amber-500/10" : "bg-background/70"}`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedOfferId(isOpen ? null : offer._id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-foreground">{candidateName(offer)}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{offer.jobId?.title || t("untitledRole")}</p>
                    </div>
                    <Badge variant="outline" className={`${getStatusColor(offer.status)} shrink-0 px-1.5 py-0 text-[10px]`}>
                      {isExpired(offer) ? t("expired") : t(offer.status)}
                    </Badge>
                    <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>

                  {isOpen && (
                    <div className="border-t border-border/60 px-2.5 py-2 text-[11px]">
                      <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
                        <dt className="text-muted-foreground">{t("salary")}</dt>
                        <dd className="text-end font-medium text-foreground">
                          {formatSalary(offer)} <span className="font-normal text-muted-foreground">{offer.salary.period === "monthly" ? t("perMonth") : t("perYear")}</span>
                        </dd>
                        <dt className="text-muted-foreground">{t("startDate")}</dt>
                        <dd className="text-end text-foreground">{formatDate(offer.startDate)}</dd>
                        <dt className="text-muted-foreground">{t("expired")}</dt>
                        <dd className="text-end text-foreground">{formatDate(offer.expiresAt)}</dd>
                        <dt className="text-muted-foreground">{t("createdAt")}</dt>
                        <dd className="text-end text-foreground">{formatDate(offer.createdAt)}</dd>
                      </dl>
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="outline" className="h-8 flex-1 rounded-lg text-[11px] font-semibold"
                          onClick={() => setDetailOffer(offer)}>
                          <Eye className="me-1 h-3.5 w-3.5" />
                          {tc("view")}
                        </Button>
                        {offer.status === "pending" && !isExpired(offer) ? (
                          <Button size="sm" variant="outline"
                            className="h-8 flex-1 rounded-lg text-[11px] font-semibold text-status-rejected"
                            onClick={() => setWithdrawingId(offer._id)}>
                            <X className="me-1 h-3.5 w-3.5" />
                            {t("withdraw")}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-5 hidden overflow-x-auto rounded-3xl border border-border/60 sm:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-background/60 hover:bg-background/60">
                  <TableHead className="min-w-[220px]">{t("candidate")}</TableHead>
                  <TableHead className="min-w-[180px]">{t("role")}</TableHead>
                  <TableHead>{t("salary")}</TableHead>
                  <TableHead>{t("startDate")}</TableHead>
                  <TableHead className="text-right">{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {offers.map((offer) => (
                  <TableRow key={offer._id} className={isExpiring(offer) ? "bg-amber-500/10" : "bg-transparent"}>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-semibold text-foreground">
                          {candidateName(offer)}
                        </p>
                        <p className="text-xs text-muted-foreground">{t("createdAt")} {formatDate(offer.createdAt)}</p>
                        <Badge variant="outline" className={getStatusColor(offer.status)}>
                          {isExpired(offer) ? t("expired") : t(offer.status)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">{offer.jobId?.title || t("untitledRole")}</p>
                        {offer.jobId?.location ? (
                          <p className="text-xs text-muted-foreground">
                            {typeof offer.jobId.location === "string"
                              ? offer.jobId.location
                              : [(offer.jobId.location as Record<string, string>)?.city, (offer.jobId.location as Record<string, string>)?.country].filter(Boolean).join(", ") || "—"}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-foreground">{formatSalary(offer)}</p>
                      <p className="text-xs text-muted-foreground">{offer.salary.period === "monthly" ? t("perMonth") : t("perYear")}</p>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        <span className="block">{formatDate(offer.startDate)}</span>
                        <span className="mt-1 block text-xs">{t("expired")}: {formatDate(offer.expiresAt)}</span>
                        {isExpiring(offer) ? (
                          <span className="mt-1 block text-xs font-semibold text-status-shortlisted">{t("expired")}</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" className="h-8 rounded-xl px-3 text-xs font-semibold"
                          onClick={() => setDetailOffer(offer)}>
                          <Eye className="me-1 h-3.5 w-3.5" />
                          {tc("view")}
                        </Button>
                        {offer.status === "pending" && !isExpired(offer) ? (
                          <Button size="sm" variant="ghost"
                            className="h-8 rounded-xl px-3 text-xs font-semibold text-status-rejected hover:bg-status-rejected-bg hover:text-status-rejected"
                            onClick={() => setWithdrawingId(offer._id)}>
                            <X className="me-1 h-3.5 w-3.5" />
                            {t("withdraw")}
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <PaginationControls
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={(l) => { setLimit(l); setPage(1); }}
      />

      {withdrawingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-border bg-background shadow-[0_30px_90px_-36px_rgba(15,23,42,0.5)]">
            <div className="border-b border-border/60 px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("offerAction")}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("withdrawConfirm")}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t("withdrawConfirmDesc")}
              </p>
            </div>
            <div className="flex justify-end gap-2 px-6 py-5">
              <Button variant="ghost" className="rounded-xl" onClick={() => setWithdrawingId(null)}>{tc("cancel")}</Button>
              <Button variant="destructive" className="rounded-xl" disabled={withdrawMutation.isPending} onClick={() => handleWithdraw(withdrawingId)}>
                {withdrawMutation.isPending ? t("withdrawing") : t("withdrawOffer")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {detailOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-border bg-background shadow-[0_30px_90px_-36px_rgba(15,23,42,0.5)]">
            <div className="flex items-start justify-between gap-4 border-b border-border/60 px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("offerDetail")}</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{detailOffer.jobId?.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("offerDetailDesc")}</p>
              </div>
              <Button size="sm" variant="ghost" className="h-9 w-9 rounded-full p-0" onClick={() => setDetailOffer(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-5 px-6 py-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("candidate")}</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    {candidateName(detailOffer)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("status")}</p>
                  <Badge variant="outline" className={`mt-2 ${getStatusColor(detailOffer.status)}`}>
                    {t(detailOffer.status)}
                  </Badge>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("salary")}</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    {detailOffer.salary.currency} {detailOffer.salary.amount.toLocaleString()} / {detailOffer.salary.period}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("startDate")}</p>
                  <p className="mt-2 text-sm text-foreground/85">{formatDate(detailOffer.startDate)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("createdAt")}</p>
                  <p className="mt-2 text-sm text-foreground/85">{formatDate(detailOffer.createdAt)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("expires")}</p>
                  <p className="mt-2 text-sm text-foreground/85">{formatDate(detailOffer.expiresAt)}</p>
                </div>
              </div>
              {detailOffer.benefits && (
                <div className="rounded-2xl border border-border bg-background/60 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("benefitsLabel")}</p>
                  <p className="mt-2 text-sm leading-6 text-foreground/85">{detailOffer.benefits}</p>
                </div>
              )}
              {detailOffer.notes && (
                <div className="rounded-2xl border border-border bg-background/60 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("notesLabel")}</p>
                  <p className="mt-2 text-sm leading-6 text-foreground/85">{detailOffer.notes}</p>
                </div>
              )}
              {detailOffer.respondedAt && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("responded")}</p>
                  <p className="mt-2 text-sm text-foreground/85">{formatDate(detailOffer.respondedAt)}</p>
                </div>
              )}
              {detailOffer.declineReason && (
                <div className="rounded-2xl border border-status-rejected/20 bg-status-rejected-bg px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-status-rejected">{t("declineReason")}</p>
                  <p className="mt-2 text-sm leading-6 text-status-rejected">{detailOffer.declineReason}</p>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => window.open(`/api/offers/${detailOffer._id}/letter/pdf`, "_blank", "noopener")}
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  {t("downloadLetter")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
