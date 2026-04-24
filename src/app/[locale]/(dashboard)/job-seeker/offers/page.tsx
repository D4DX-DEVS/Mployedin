"use client";

import { useEffect, useState, useCallback } from "react";
import { Check, X, Calendar, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { useDebounce } from "@/hooks/useDebounce";
import { toast } from "sonner";
import type { ExportColumn } from "@/lib/export";

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
  status: "pending" | "accepted" | "declined" | "expired" | "withdrawn";
  expiresAt: string;
  respondedAt?: string;
  declineReason?: string;
}

export default function OffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 400);
  const pagination = usePagination();

  useEffect(() => {
    document.title = "My Offers · MPLOYEDIN";
  }, []);

  const fetchOffers = useCallback(async () => {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/offers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setOffers(data.offers);
        pagination.updateTotal(data.pagination?.total ?? data.total ?? data.offers?.length ?? 0);
      }
    } catch (err) {
      console.error("Error fetching offers:", err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, debouncedSearch]);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  async function handleAcceptOffer(offerId: string) {
    try {
      const res = await fetch(`/api/offers/${offerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "accepted" }),
      });

      if (res.ok) {
        setOffers((prev) =>
          prev.map((o) => (o._id === offerId ? { ...o, status: "accepted" } : o))
        );
        setRespondingId(null);
      }
    } catch (err) {
      console.error("Error accepting offer:", err);
    }
  }

  async function handleDeclineOffer(offerId: string) {
    if (!declineReason.trim()) {
      toast.error("Please provide a reason for declining");
      return;
    }

    try {
      const res = await fetch(`/api/offers/${offerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "declined",
          declineReason: declineReason.trim(),
        }),
      });

      if (res.ok) {
        setOffers((prev) =>
          prev.map((o) => (o._id === offerId ? { ...o, status: "declined" } : o))
        );
        setRespondingId(null);
        setDeclineReason("");
      }
    } catch (err) {
      console.error("Error declining offer:", err);
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

  const exportData = offers.map((o) => ({
    jobTitle: o.jobId?.title ?? "",
    salary: `${o.salary.currency} ${o.salary.amount.toLocaleString()} / ${o.salary.period === "monthly" ? "month" : "year"}`,
    startDate: new Date(o.startDate).toLocaleDateString(),
    status: o.status,
    expiresAt: new Date(o.expiresAt).toLocaleDateString(),
    benefits: o.benefits ?? "",
  }));

  const exportColumns = [
    { header: "Job Title", key: "jobTitle" },
    { header: "Salary", key: "salary" },
    { header: "Start Date", key: "startDate" },
    { header: "Status", key: "status" },
    { header: "Expires At", key: "expiresAt" },
    { header: "Benefits", key: "benefits" },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: exportData as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "my-offers",
    title: "My Offers",
  });

  return (
    <div className="page-container">
      <PageHeader title="Job Offers" description="Offers you have received" />

      <TableToolbar
        search={searchTerm}
        onSearchChange={(v) => { setSearchTerm(v); pagination.resetPage(); }}
        searchPlaceholder="Search by job title\u2026"
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
        className="mb-4"
      />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card-base animate-pulse h-32" />
          ))}
        </div>
      ) : offers.length === 0 ? (
        <div className="card-base text-center py-16">
          <p className="text-muted-foreground">No offers received yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {offers.map((offer) => (
            <div key={offer._id} className="card-base p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{offer.jobId.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {typeof offer.jobId.location === "object" && offer.jobId.location ? (offer.jobId.location.isRemote ? "Remote" : [offer.jobId.location.city, offer.jobId.location.country].filter(Boolean).join(", ") || "—") : (offer.jobId.location ?? "—")}
                  </p>
                </div>
                <Badge variant={getStatusBadgeVariant(offer.status)}>
                  {offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">Salary</p>
                    <p className="font-medium">
                      {offer.salary.currency} {offer.salary.amount.toLocaleString()} /{" "}
                      {offer.salary.period === "monthly" ? "month" : "year"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">Start Date</p>
                    <p className="font-medium">
                      {new Date(offer.startDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>

              {offer.benefits && (
                <div>
                  <p className="text-sm font-medium mb-1">Benefits</p>
                  <p className="text-sm text-muted-foreground">{offer.benefits}</p>
                </div>
              )}

              {offer.notes && (
                <div>
                  <p className="text-sm font-medium mb-1">Additional Notes</p>
                  <p className="text-sm text-muted-foreground">{offer.notes}</p>
                </div>
              )}

              <div className="text-xs text-muted-foreground">
                Expires on {new Date(offer.expiresAt).toLocaleDateString()}
                {isExpired(offer) && " (Expired)"}
              </div>

              {offer.status === "pending" && !isExpired(offer) && (
                <div className="pt-2 border-t">
                  {respondingId === offer._id ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium">
                          Reason for declining (required)
                        </label>
                        <Textarea
                          placeholder="Share your reason for declining this offer..."
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
                          Confirm Decline
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRespondingId(null);
                            setDeclineReason("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleAcceptOffer(offer._id)}
                        className="flex-1"
                      >
                        <Check className="w-4 h-4 mr-2" />
                        Accept Offer
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRespondingId(offer._id)}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Decline
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {offer.status === "declined" && offer.declineReason && (
                <div className="bg-destructive/10 p-3 rounded text-sm">
                  <p className="font-medium text-destructive-foreground">
                    Declined
                  </p>
                  <p className="text-muted-foreground">{offer.declineReason}</p>
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
