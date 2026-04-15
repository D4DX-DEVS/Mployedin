"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DollarSign, CalendarDays, Clock3, CircleCheckBig, ArrowRight, Eye, X, Sparkles, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { useOffers, useWithdrawOffer } from "@/hooks/useOffers";
import type { Offer, OfferStatus } from "@/hooks/useOffers";

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
  const { locale } = useParams<{ locale: string }>();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [statusFilter, setStatusFilter] = useState("all");
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [detailOffer, setDetailOffer] = useState<Offer | null>(null);

  const { data, isLoading: loading, error, refetch } = useOffers({ page, limit, status: statusFilter });
  const withdrawMutation = useWithdrawOffer();

  const offers = data?.offers ?? [];
  const total = data?.pagination?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  useEffect(() => {
    document.title = "Offers · MPLOYEDIN";
  }, []);

  useEffect(() => { setPage(1); }, [statusFilter]);

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

  function formatDate(value?: string): string {
    if (!value) return "Not set";
    return new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatSalary(offer: Offer): string {
    return `${offer.salary.currency} ${offer.salary.amount.toLocaleString()}`;
  }

  return (
    <div className="page-container space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-sky-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_38%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(239,246,255,0.94))] p-6 shadow-[0_24px_60px_-36px_rgba(2,132,199,0.35)] sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              Offer workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">
              Manage candidate offers with a cleaner decision view.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Track open packages, watch expiring decisions, and revisit accepted or withdrawn offers from one polished workspace.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-left backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current results</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{total} tracked offers</p>
              <p className="text-xs text-slate-500">Pending, accepted, expired, and withdrawn decisions in one place.</p>
            </div>
            <Button
              asChild
              className="h-11 gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700"
            >
              <Link href={`/${locale}/employer/applications`}>
                Open Pipeline
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Pending",
              value: pendingCount,
              note: "Pending offers in the current results set.",
              icon: Clock3,
              tone: "text-amber-600",
              chip: "bg-amber-50",
            },
            {
              label: "Accepted",
              value: acceptedCount,
              note: "Accepted offers visible in the current results set.",
              icon: CircleCheckBig,
              tone: "text-emerald-600",
              chip: "bg-emerald-50",
            },
            {
              label: "Expiring soon",
              value: expiringSoonCount,
              note: "Current results with two days or less remaining.",
              icon: CalendarDays,
              tone: "text-sky-600",
              chip: "bg-sky-50",
            },
            {
              label: "Responded",
              value: respondedCount,
              note: "Offers on this page that already have a response.",
              icon: FileText,
              tone: "text-violet-600",
              chip: "bg-violet-50",
            },
          ].map(({ label, value, note, icon: Icon, tone, chip }) => (
            <div key={label} className="rounded-2xl border border-white/80 bg-white/80 p-4 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
                  <p className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">{value}</p>
                </div>
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${chip}`}>
                  <Icon className={`h-5 w-5 ${tone}`} />
                </span>
              </div>
              <p className="mt-3 text-sm leading-5 text-slate-500">{note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.28)] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Filter decisions</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Focus on the offers that need action now.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Status is the only server-backed filter on this page, so the view stays honest while still giving you a sharper workspace.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <SearchableSelect
              className="w-full min-w-[220px] sm:w-60"
              options={STATUS_OPTIONS}
              value={statusFilter}
              onValueChange={setStatusFilter}
              placeholder="All statuses"
            />
          </div>
        </div>
      </section>

      {error ? (
        <section className="rounded-[28px] border border-red-200 bg-white p-6 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.22)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-600">Offer list</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Unable to load offers right now</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                {error instanceof Error ? error.message : "The offer workspace could not load. Try again in a moment."}
              </p>
            </div>
            <Button className="h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        </section>
      ) : loading ? (
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.22)] sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Offer list</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Loading offers</h2>
            </div>
          </div>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-slate-50" />
            ))}
          </div>
        </section>
      ) : offers.length === 0 ? (
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.22)]">
          <div className="flex flex-col items-center py-14 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-sky-50 text-sky-600">
              <DollarSign className="h-7 w-7" />
            </div>
            <h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">No offers in this view yet</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">
              As soon as offers are sent from your hiring pipeline, they will land here with status tracking, expiry visibility, and candidate context.
            </p>
            <Button asChild className="mt-6 h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700">
              <Link href={`/${locale}/employer/applications`}>Review applications</Link>
            </Button>
          </div>
        </section>
      ) : (
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.22)] sm:p-6">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Offer list</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Review each package before it ages out.</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Candidate, role, compensation, and expiry details stay together so follow-up decisions are quicker.
              </p>
            </div>
            <p className="text-sm text-slate-500">{offers.length} offers on this page</p>
          </div>

          <div className="mt-5 overflow-x-auto rounded-3xl border border-slate-100">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                  <TableHead className="min-w-[220px]">Candidate</TableHead>
                  <TableHead className="min-w-[180px]">Role</TableHead>
                  <TableHead>Salary</TableHead>
                  <TableHead>Start date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {offers.map((offer) => (
                  <TableRow key={offer._id} className={isExpiring(offer) ? "bg-amber-50/60" : "bg-white"}>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-semibold text-slate-900">
                          {offer.jobSeekerId?.name || `Candidate #${offer._id.slice(-4)}`}
                        </p>
                        <p className="text-xs text-slate-500">Offer created {formatDate(offer.createdAt)}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium text-slate-900">{offer.jobId?.title || "Untitled role"}</p>
                        {offer.jobId?.location ? (
                          <p className="text-xs text-slate-500">{offer.jobId.location}</p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-slate-900">{formatSalary(offer)}</p>
                      <p className="text-xs text-slate-500">/{offer.salary.period === "monthly" ? "mo" : "yr"}</p>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{formatDate(offer.startDate)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusColor(offer.status)}>
                        {isExpired(offer) ? "Expired" : offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-slate-600">
                        {formatDate(offer.expiresAt)}
                        {isExpiring(offer) ? (
                          <span className="mt-1 block text-xs font-semibold text-amber-600">Expiring soon</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" className="h-8 rounded-xl px-3 text-xs font-semibold"
                          onClick={() => setDetailOffer(offer)}>
                          <Eye className="me-1 h-3.5 w-3.5" />
                          View
                        </Button>
                        {offer.status === "pending" && !isExpired(offer) ? (
                          <Button size="sm" variant="ghost"
                            className="h-8 rounded-xl px-3 text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => setWithdrawingId(offer._id)}>
                            <X className="me-1 h-3.5 w-3.5" />
                            Withdraw
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
          <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_90px_-36px_rgba(15,23,42,0.5)]">
            <div className="border-b border-slate-100 px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Offer action</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Withdraw this offer?</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Are you sure? The candidate will be notified.
              </p>
            </div>
            <div className="flex justify-end gap-2 px-6 py-5">
              <Button variant="ghost" className="rounded-xl" onClick={() => setWithdrawingId(null)}>Cancel</Button>
              <Button variant="destructive" className="rounded-xl" onClick={() => handleWithdraw(withdrawingId)}>
                Withdraw Offer
              </Button>
            </div>
          </div>
        </div>
      )}

      {detailOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_90px_-36px_rgba(15,23,42,0.5)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Offer detail</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{detailOffer.jobId?.title}</h2>
                <p className="mt-1 text-sm text-slate-500">Review package terms, notes, and candidate response details.</p>
              </div>
              <Button size="sm" variant="ghost" className="h-9 w-9 rounded-full p-0" onClick={() => setDetailOffer(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-5 px-6 py-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Candidate</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">
                    {detailOffer.jobSeekerId?.name || `#${detailOffer._id.slice(-4)}`}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Status</p>
                  <Badge variant="outline" className={`mt-2 ${getStatusColor(detailOffer.status)}`}>
                    {detailOffer.status.charAt(0).toUpperCase() + detailOffer.status.slice(1)}
                  </Badge>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Salary</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">
                    {detailOffer.salary.currency} {detailOffer.salary.amount.toLocaleString()} / {detailOffer.salary.period}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Start date</p>
                  <p className="mt-2 text-sm text-slate-700">{formatDate(detailOffer.startDate)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Sent on</p>
                  <p className="mt-2 text-sm text-slate-700">{formatDate(detailOffer.createdAt)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Expires</p>
                  <p className="mt-2 text-sm text-slate-700">{formatDate(detailOffer.expiresAt)}</p>
                </div>
              </div>
              {detailOffer.benefits && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Benefits</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{detailOffer.benefits}</p>
                </div>
              )}
              {detailOffer.notes && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Notes</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{detailOffer.notes}</p>
                </div>
              )}
              {detailOffer.respondedAt && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Responded</p>
                  <p className="mt-2 text-sm text-slate-700">{formatDate(detailOffer.respondedAt)}</p>
                </div>
              )}
              {detailOffer.declineReason && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-600">Decline reason</p>
                  <p className="mt-2 text-sm leading-6 text-red-700">{detailOffer.declineReason}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
