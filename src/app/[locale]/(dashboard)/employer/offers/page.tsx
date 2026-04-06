"use client";

import { useEffect, useState, useCallback } from "react";
import { DollarSign, Calendar, Clock, X, Send, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/shared/PageHeader";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";

type OfferStatus = "pending" | "accepted" | "declined" | "expired" | "withdrawn";

interface Offer {
  _id: string;
  jobId: { _id: string; title: string; location?: string };
  applicationId: { _id: string; status: string };
  jobSeekerId: { _id: string; name?: string };
  salary: { amount: number; currency: string; period: "monthly" | "annually" };
  startDate: string;
  benefits?: string;
  notes?: string;
  status: OfferStatus;
  expiresAt: string;
  respondedAt?: string;
  declineReason?: string;
  createdAt: string;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
  { value: "expired", label: "Expired" },
  { value: "withdrawn", label: "Withdrawn" },
];

function getStatusColor(status: OfferStatus): string {
  switch (status) {
    case "pending": return "bg-amber-100 text-amber-700 border-amber-300";
    case "accepted": return "bg-emerald-100 text-emerald-700 border-emerald-300";
    case "declined": return "bg-red-100 text-red-700 border-red-300";
    case "expired": return "bg-gray-100 text-gray-600 border-gray-300";
    case "withdrawn": return "bg-orange-100 text-orange-700 border-orange-300";
    default: return "bg-gray-100 text-gray-600 border-gray-300";
  }
}

export default function EmployerOffersPage() {
  const pagination = usePagination();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [detailOffer, setDetailOffer] = useState<Offer | null>(null);

  useEffect(() => {
    document.title = "Offers · MPLOYEDIN";
  }, []);

  const fetchOffers = useCallback(async () => {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/offers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setOffers(data.offers);
        pagination.updateTotal(data.pagination?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, pagination.page, pagination.limit]);

  useEffect(() => { fetchOffers(); }, [fetchOffers]);
  useEffect(() => { pagination.resetPage(); }, [statusFilter]);

  async function handleWithdraw(offerId: string) {
    try {
      const res = await fetch(`/api/offers/${offerId}`, { method: "DELETE" });
      if (res.ok) {
        setWithdrawingId(null);
        fetchOffers();
      }
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

  return (
    <div className="page-container">
      <PageHeader
        title="Offers"
        description={`${pagination.total} total offers${pendingCount ? ` · ${pendingCount} pending` : ""}${acceptedCount ? ` · ${acceptedCount} accepted` : ""}`}
      />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card-base animate-pulse h-20" />
          ))}
        </div>
      ) : offers.length === 0 ? (
        <div className="card-base text-center py-16">
          <DollarSign className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="font-semibold mb-1">No offers sent</h3>
          <p className="text-sm text-muted-foreground">
            When you send offers to candidates from the pipeline, they will appear here
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm shadow-black/[0.03]">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Candidate</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Salary</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {offers.map((offer) => (
                <TableRow key={offer._id} className={isExpiring(offer) ? "bg-amber-50/50" : undefined}>
                  <TableCell className="font-medium">
                    {offer.jobSeekerId?.name || `Candidate #${offer._id.slice(-4)}`}
                  </TableCell>
                  <TableCell className="text-muted-foreground truncate max-w-[180px]">
                    {offer.jobId?.title}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">
                      {offer.salary.currency} {offer.salary.amount.toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      /{offer.salary.period === "monthly" ? "mo" : "yr"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {new Date(offer.startDate).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getStatusColor(offer.status)}>
                      {isExpired(offer) ? "Expired" : offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-muted-foreground">
                      {new Date(offer.expiresAt).toLocaleDateString()}
                      {isExpiring(offer) && (
                        <span className="text-amber-600 font-medium block">Expiring soon</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 text-xs"
                        onClick={() => setDetailOffer(offer)}>
                        <Eye className="w-3 h-3 me-1" /> View
                      </Button>
                      {offer.status === "pending" && !isExpired(offer) && (
                        <Button size="sm" variant="ghost"
                          className="h-7 text-xs text-destructive hover:bg-destructive/10"
                          onClick={() => setWithdrawingId(offer._id)}>
                          <X className="w-3 h-3 me-1" /> Withdraw
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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

      {/* Withdraw Confirmation Modal */}
      {withdrawingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-lg border border-border shadow-lg max-w-sm w-full mx-4">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold">Withdraw Offer</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Are you sure? The candidate will be notified.
              </p>
            </div>
            <div className="px-6 py-4 flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setWithdrawingId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => handleWithdraw(withdrawingId)}>
                Withdraw Offer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Offer Detail Modal */}
      {detailOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-8">
          <div className="bg-background rounded-lg border border-border shadow-lg max-w-lg w-full mx-4">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Offer Details</h2>
                <p className="text-sm text-muted-foreground">{detailOffer.jobId?.title}</p>
              </div>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setDetailOffer(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Candidate</p>
                  <p className="font-medium text-sm">
                    {detailOffer.jobSeekerId?.name || `#${detailOffer._id.slice(-4)}`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Status</p>
                  <Badge variant="outline" className={getStatusColor(detailOffer.status)}>
                    {detailOffer.status.charAt(0).toUpperCase() + detailOffer.status.slice(1)}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Salary</p>
                  <p className="font-medium text-sm">
                    {detailOffer.salary.currency} {detailOffer.salary.amount.toLocaleString()} / {detailOffer.salary.period}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Start Date</p>
                  <p className="text-sm">{new Date(detailOffer.startDate).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Sent On</p>
                  <p className="text-sm">{new Date(detailOffer.createdAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Expires</p>
                  <p className="text-sm">{new Date(detailOffer.expiresAt).toLocaleDateString()}</p>
                </div>
              </div>
              {detailOffer.benefits && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Benefits</p>
                  <p className="text-sm">{detailOffer.benefits}</p>
                </div>
              )}
              {detailOffer.notes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm">{detailOffer.notes}</p>
                </div>
              )}
              {detailOffer.respondedAt && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Responded</p>
                  <p className="text-sm">{new Date(detailOffer.respondedAt).toLocaleDateString()}</p>
                </div>
              )}
              {detailOffer.declineReason && (
                <div className="bg-destructive/10 p-3 rounded">
                  <p className="text-xs font-medium text-destructive mb-1">Decline Reason</p>
                  <p className="text-sm">{detailOffer.declineReason}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
