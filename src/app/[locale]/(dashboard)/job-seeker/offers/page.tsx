"use client";

import { useEffect, useState, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, X, Calendar, DollarSign, FileDown, ArrowLeftRight, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListSkeleton } from "@/components/shared/ListSkeleton";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { useDebounce } from "@/hooks/useDebounce";
import { toast } from "sonner";
import type { ExportColumn } from "@/lib/export";
import { csrfFetch } from "@/lib/security/csrf-client";

interface OfferJob {
  _id: string;
  title: string;
  location: string | { isRemote?: boolean; city?: string; country?: string };
}

interface Offer {
  _id: string;
  jobId: OfferJob;
  salary: { amount: number; currency: string; period: "monthly" | "annually" };
  startDate: string;
  benefits?: string;
  notes?: string;
  status: "pending" | "accepted" | "declined" | "expired" | "withdrawn" | "countered";
  expiresAt: string;
  respondedAt?: string;
  declineReason?: string;
  counterOffer?: {
    amount: number;
    currency: string;
    period: "monthly" | "annually";
    note?: string;
    proposedAt?: string;
  };
}

const STATUS_TABS = [
  "all",
  "pending",
  "accepted",
  "declined",
  "expired",
  "countered",
] as const;

export default function OffersPage() {
  const t = useTranslations("jobSeekerOffers");
  const locale = useLocale();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [counteringId, setCounteringId] = useState<string | null>(null);
  const [counterForm, setCounterForm] = useState({ amount: "", currency: "AED", period: "monthly", note: "" });
  const [signatureName, setSignatureName] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const debouncedSearch = useDebounce(searchTerm, 400);
  const pagination = usePagination();
  const { paginationParams, updateTotal } = pagination;

  useEffect(() => {
    document.title = t("documentTitle");
  }, [t]);

  const formatDate = useCallback((date: string) => new Date(date).toLocaleDateString(locale), [locale]);

  const fetchOffers = useCallback(async () => {
    setLoading(true);
    try {
      const params = paginationParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/offers?${params}`);
      if (!res.ok) {
        throw new Error("Failed to fetch offers");
      }

      const data = await res.json();
      const nextOffers = data.offers ?? [];
      setOffers(nextOffers);
      updateTotal(data.pagination?.total ?? data.total ?? nextOffers.length);
    } catch (err) {
      setOffers([]);
      updateTotal(0);
      toast.error(t("errors.fetchFailed"));
    } finally {
      setLoading(false);
    }
  }, [paginationParams, updateTotal, debouncedSearch, statusFilter, t]);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  async function handleAcceptOffer(offerId: string) {
    if (!signatureName.trim()) {
      toast.error(t("errors.signatureRequired"));
      return;
    }
    try {
      const res = await csrfFetch(`/api/offers/${offerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "accepted", signatureName: signatureName.trim() }),
      });

      if (!res.ok) {
        throw new Error("Failed to accept offer");
      }

      setOffers((prev) =>
        prev.map((o) => (o._id === offerId ? { ...o, status: "accepted" } : o))
      );
      setAcceptingId(null);
      setSignatureName("");
      setRespondingId(null);
    } catch (err) {
      console.error("Error accepting offer:", err);
      toast.error(t("errors.acceptFailed"));
    }
  }

  async function handleDeclineOffer(offerId: string) {
    if (!declineReason.trim()) {
      toast.error(t("errors.declineReasonRequired"));
      return;
    }

    try {
      const res = await csrfFetch(`/api/offers/${offerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "declined",
          declineReason: declineReason.trim(),
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to decline offer");
      }

      setOffers((prev) =>
        prev.map((o) => (o._id === offerId ? { ...o, status: "declined" } : o))
      );
      setRespondingId(null);
      setDeclineReason("");
    } catch (err) {
      console.error("Error declining offer:", err);
      toast.error(t("errors.declineFailed"));
    }
  }

  async function handleCounterOffer(offerId: string) {
    const amount = Number(counterForm.amount);
    if (!amount || amount <= 0) {
      toast.error(t("counter.errors.amount"));
      return;
    }
    if (!/^[A-Za-z]{3}$/.test(counterForm.currency)) {
      toast.error(t("counter.errors.currency"));
      return;
    }
    try {
      const res = await csrfFetch(`/api/offers/${offerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "countered",
          counterOffer: {
            amount,
            currency: counterForm.currency.toUpperCase(),
            period: counterForm.period,
            note: counterForm.note.trim() || undefined,
          },
        }),
      });
      if (!res.ok) {
        throw new Error("Failed to submit counter-offer");
      }
      toast.success(t("counter.success"));
      setCounteringId(null);
      setCounterForm({ amount: "", currency: "AED", period: "monthly", note: "" });
      await fetchOffers();
    } catch (err) {
      console.error("Error submitting counter-offer:", err);
      toast.error(t("counter.errors.failed"));
    }
  }

  const getStatusBadgeVariant = (
    status: string
  ): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "pending":
        return "secondary";
      case "accepted":
        return "default";
      case "countered":
        return "outline";
      case "declined":
      case "withdrawn":
        return "destructive";
      case "expired":
        return "outline";
      default:
        return "outline";
    }
  };

  const isExpired = (offer: Offer) =>
    new Date(offer.expiresAt) < new Date() && offer.status === "pending";

  const statusLabel = (status: Offer["status"]) => t(`status.${status}`);
  const periodLabel = (period: Offer["salary"]["period"]) =>
    period === "monthly" ? t("period.month") : t("period.year");

  const exportData = offers.map((o) => ({
    jobTitle: o.jobId?.title ?? "",
    salary: `${o.salary.currency} ${o.salary.amount.toLocaleString(locale)} / ${periodLabel(o.salary.period)}`,
    startDate: formatDate(o.startDate),
    status: statusLabel(o.status),
    expiresAt: formatDate(o.expiresAt),
    benefits: o.benefits ?? "",
  }));

  const exportColumns = [
    { header: t("export.jobTitle"), key: "jobTitle" },
    { header: t("export.salary"), key: "salary" },
    { header: t("export.startDate"), key: "startDate" },
    { header: t("export.status"), key: "status" },
    { header: t("export.expiresAt"), key: "expiresAt" },
    { header: t("export.benefits"), key: "benefits" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: exportData as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "my-offers",
    title: t("export.title"),
  });

  return (
    <div className="page-container">
      <PageHeader title={t("header.title")} description={t("header.description")} />

      <TableToolbar
        search={searchTerm}
        onSearchChange={(v) => { setSearchTerm(v); pagination.resetPage(); }}
        searchPlaceholder={t("searchPlaceholder")}
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
        className="mb-4"
      />

      {/* Status filter tabs */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
        {STATUS_TABS.map((status) => (
          <Button
            key={status}
            variant={statusFilter === status ? "default" : "outline"}
            size="sm"
            onClick={() => { setStatusFilter(status); pagination.resetPage(); }}
            className="whitespace-nowrap"
          >
            {t(`status.${status}`)}
          </Button>
        ))}
      </div>

      {loading ? (
        <ListSkeleton count={3} layout="list" itemClassName="h-32" className="space-y-3" />
      ) : offers.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={t("empty")}
        />
      ) : (
        <div className="space-y-4">
          {offers.map((offer) => (
            <div key={offer._id} className="card-base space-y-3 sm:space-y-4 panel-body">
              <div className="flex items-start justify-between gap-2 sm:gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base sm:text-lg truncate">{offer.jobId.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {typeof offer.jobId.location === "object" && offer.jobId.location ? (offer.jobId.location.isRemote ? t("remote") : [offer.jobId.location.city, offer.jobId.location.country].filter(Boolean).join(", ") || "—") : (offer.jobId.location ?? "—")}
                  </p>
                </div>
                <Badge variant={getStatusBadgeVariant(offer.status)}>
                  {statusLabel(offer.status)}
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">{t("labels.salary")}</p>
                    <p className="font-medium">
                      {offer.salary.currency} {offer.salary.amount.toLocaleString(locale)} /{" "}
                      {periodLabel(offer.salary.period)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">{t("labels.startDate")}</p>
                    <p className="font-medium">
                      {formatDate(offer.startDate)}
                    </p>
                  </div>
                </div>
              </div>

              {offer.benefits && (
                <div>
                  <p className="text-sm font-medium mb-1">{t("labels.benefits")}</p>
                  <p className="text-sm text-muted-foreground">{offer.benefits}</p>
                </div>
              )}

              {offer.notes && (
                <div>
                  <p className="text-sm font-medium mb-1">{t("labels.additionalNotes")}</p>
                  <p className="text-sm text-muted-foreground">{offer.notes}</p>
                </div>
              )}

              <div className="text-xs text-muted-foreground">
                {t("expiresOn", { date: formatDate(offer.expiresAt) })}
                {isExpired(offer) && ` ${t("expired")}`}
              </div>

              {offer.status === "pending" && !isExpired(offer) && (
                <div className="pt-2 border-t">
                  {respondingId === offer._id ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium">
                          {t("decline.reasonLabel")}
                        </label>
                        <Textarea
                          placeholder={t("decline.reasonPlaceholder")}
                          value={declineReason}
                          onChange={(e) => setDeclineReason(e.target.value)}
                          className="mt-1 min-h-20"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeclineOffer(offer._id)}
                          disabled={!declineReason.trim()}
                        >
                          <X className="w-4 h-4 mr-2" />
                          {t("actions.confirmDecline")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRespondingId(null);
                            setDeclineReason("");
                          }}
                        >
                          {t("actions.cancel")}
                        </Button>
                      </div>
                    </div>
                  ) : acceptingId === offer._id ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium">
                          {t("accept.signatureLabel")}
                        </label>
                        <p className="text-xs text-muted-foreground mb-1">
                          {t("accept.signatureHint")}
                        </p>
                        <Input
                          placeholder={t("accept.signaturePlaceholder")}
                          value={signatureName}
                          onChange={(e) => setSignatureName(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleAcceptOffer(offer._id)}
                          disabled={!signatureName.trim()}
                        >
                          <Check className="w-4 h-4 mr-2" />
                          {t("accept.confirmAccept")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setAcceptingId(null);
                            setSignatureName("");
                          }}
                        >
                          {t("actions.cancel")}
                        </Button>
                      </div>
                    </div>
                  ) : counteringId === offer._id ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-1">
                          <label className="text-sm font-medium">{t("counter.currencyLabel")}</label>
                          <Input
                            value={counterForm.currency}
                            maxLength={3}
                            onChange={(e) => setCounterForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                            className="mt-1"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-sm font-medium">{t("counter.amountLabel")}</label>
                          <Input
                            type="number"
                            min={0}
                            value={counterForm.amount}
                            onChange={(e) => setCounterForm((f) => ({ ...f, amount: e.target.value }))}
                            className="mt-1"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium">{t("counter.noteLabel")}</label>
                        <Textarea
                          placeholder={t("counter.notePlaceholder")}
                          value={counterForm.note}
                          onChange={(e) => setCounterForm((f) => ({ ...f, note: e.target.value }))}
                          className="mt-1 min-h-20"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleCounterOffer(offer._id)}
                          disabled={!counterForm.amount.trim()}
                        >
                          <ArrowLeftRight className="w-4 h-4 mr-2" />
                          {t("counter.submit")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setCounteringId(null);
                            setCounterForm({ amount: "", currency: "AED", period: "monthly", note: "" });
                          }}
                        >
                          {t("actions.cancel")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          setAcceptingId(offer._id);
                          setSignatureName("");
                        }}
                        className="flex-1 sm:flex-none"
                      >
                        <Check className="w-4 h-4 mr-2" />
                        {t("actions.acceptOffer")}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setCounteringId(offer._id);
                          setCounterForm({
                            amount: String(offer.salary.amount),
                            currency: offer.salary.currency,
                            period: offer.salary.period,
                            note: "",
                          });
                        }}
                        className="flex-1 sm:flex-none"
                      >
                        <ArrowLeftRight className="w-4 h-4 mr-2" />
                        {t("counter.action")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRespondingId(offer._id)}
                        className="flex-1 sm:flex-none"
                      >
                        <X className="w-4 h-4 mr-2" />
                        {t("actions.decline")}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {offer.status === "accepted" && (
                <div className="pt-2 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(`/api/offers/${offer._id}/letter/pdf`, "_blank", "noopener")}
                  >
                    <FileDown className="w-4 h-4 mr-2" />
                    {t("actions.downloadLetter")}
                  </Button>
                </div>
              )}

              {offer.status === "declined" && offer.declineReason && (
                <div className="bg-destructive/10 p-3 rounded text-sm">
                  <p className="font-medium text-destructive-foreground">
                    {t("status.declined")}
                  </p>
                  <p className="text-muted-foreground">{offer.declineReason}</p>
                </div>
              )}

              {offer.status === "countered" && offer.counterOffer && (
                <div className="rounded border border-indigo-200 bg-indigo-50 p-3 text-sm dark:border-indigo-900/60 dark:bg-indigo-950/30">
                  <p className="flex items-center gap-2 font-medium text-indigo-900 dark:text-indigo-300">
                    <ArrowLeftRight className="h-4 w-4" />
                    {t("counter.pendingTitle")}
                  </p>
                  <p className="mt-1 text-indigo-800 dark:text-indigo-200">
                    {offer.counterOffer.currency} {offer.counterOffer.amount.toLocaleString(locale)} /{" "}
                    {periodLabel(offer.counterOffer.period)}
                  </p>
                  {offer.counterOffer.note && (
                    <p className="mt-1 text-indigo-700/90 dark:text-indigo-300/80">{offer.counterOffer.note}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        limit={pagination.limit}
        onPageChange={pagination.setPage}
        onLimitChange={pagination.setLimit}
      />
    </div>
  );
}
