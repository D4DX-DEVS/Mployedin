"use client";

/**
 * Plan requests from customers. There is no payment gateway yet, so a
 * customer's "Request Gold" lands here; Approve puts them on the plan and
 * issues the invoice to settle offline, Decline tells them no.
 */
import { useState } from "react";
import { Check, Inbox, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { formatCurrency } from "@/lib/currency";
import { formatListDate } from "@/lib/ui/intlFormat";

export interface UpgradeRequestRow {
  _id: string;
  userId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  targetRole: "employer" | "job_seeker";
  fromPlanName?: string;
  toPlanName: string;
  toPlanPrice: number;
  toPlanCurrency: string;
  status: "pending" | "approved" | "declined" | "cancelled";
  createdAt: string;
  decidedAt?: string;
  decisionNote?: string;
}

interface ListResponse {
  data: UpgradeRequestRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const STATUSES = ["pending", "approved", "declined", "cancelled", "all"] as const;
type StatusFilter = (typeof STATUSES)[number];

export const upgradeRequestsKey = ["admin", "upgrade-requests"] as const;

async function fetchRequests(status: StatusFilter, page: number, pageSize: number): Promise<ListResponse> {
  const qs = new URLSearchParams({ status, page: String(page), pageSize: String(pageSize) });
  const res = await fetch(`/api/subscriptions/upgrade-requests?${qs}`);
  if (!res.ok) throw new Error("load");
  return res.json();
}

/** Open request count for the tab badge. */
export function usePendingUpgradeCount() {
  return useQuery({
    queryKey: [...upgradeRequestsKey, "pending-count"],
    queryFn: async () => (await fetchRequests("pending", 1, 10)).total,
    staleTime: 30_000,
  });
}

const STATUS_TONE: Record<UpgradeRequestRow["status"], string> = {
  pending: "border-amber-500/30 text-amber-700",
  approved: "border-emerald-500/30 text-emerald-700",
  declined: "border-red-500/30 text-red-700",
  cancelled: "border-border text-muted-foreground",
};

export function UpgradeRequestsPanel() {
  const t = useTranslations("adminUpgradeRequests");
  const qc = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [decision, setDecision] = useState<{ row: UpgradeRequestRow; action: "approve" | "decline" } | null>(null);
  const [note, setNote] = useState("");

  const list = useQuery({
    queryKey: [...upgradeRequestsKey, status, page, pageSize],
    queryFn: () => fetchRequests(status, page, pageSize),
    placeholderData: (prev) => prev,
  });

  const decide = useMutation({
    mutationFn: async (input: { id: string; action: "approve" | "decline"; note?: string }) => {
      const res = await fetch(`/api/subscriptions/upgrade-requests/${input.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: input.action, note: input.note || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? t("decideError"));
      return data as { invoiceId?: string };
    },
    onSuccess: (data, input) => {
      toast.success(input.action === "approve" ? (data.invoiceId ? t("approvedInvoiced") : t("approved")) : t("declined"));
      setDecision(null);
      setNote("");
      void qc.invalidateQueries({ queryKey: upgradeRequestsKey });
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = list.data?.data ?? [];

  return (
    <section className="workspace-panel-surface space-y-4 rounded-3xl panel-body" aria-labelledby="upgrade-requests-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="upgrade-requests-title" className="font-semibold">{t("title")}</h3>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="w-full sm:w-44">
          <Label htmlFor="upgrade-status" className="sr-only">{t("statusFilter")}</Label>
          <Select value={status} onValueChange={(v) => { setStatus(v as StatusFilter); setPage(1); }}>
            <SelectTrigger id="upgrade-status" className="min-h-11 sm:min-h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`status_${s}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {list.isError ? (
        <ErrorState title={t("loadError")} onRetry={() => void list.refetch()} />
      ) : list.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={status === "pending" ? t("emptyPending") : t("empty")}
          description={status === "pending" ? t("emptyPendingBody") : undefined}
          action={status !== "all" ? (
            <Button variant="outline" size="sm" onClick={() => { setStatus("all"); setPage(1); }}>{t("showAll")}</Button>
          ) : undefined}
        />
      ) : (
        <ul className="divide-y divide-border/60 rounded-2xl border border-border/60 bg-card">
          {rows.map((r) => (
            <li key={r._id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3 text-sm">
              <div className="min-w-0 flex-1 basis-56">
                <p className="truncate font-medium">{r.customerName ?? t("deletedAccount")}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.targetRole === "employer" ? t("roleEmployer") : t("roleSeeker")}
                  {r.customerEmail ? ` · ${r.customerEmail}` : ""}
                </p>
              </div>
              <div className="min-w-0 basis-48">
                <p>{t("move", { from: r.fromPlanName ?? t("noPlan"), to: r.toPlanName })}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {r.toPlanPrice > 0 ? formatCurrency(r.toPlanPrice, r.toPlanCurrency, "code") : t("free")} · {formatListDate(r.createdAt)}
                </p>
              </div>
              {r.status === "pending" ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setDecision({ row: r, action: "decline" })}>
                    <X className="size-4" aria-hidden="true" />{t("decline")}
                  </Button>
                  <Button size="sm" className="min-h-11 sm:min-h-9" onClick={() => setDecision({ row: r, action: "approve" })}>
                    <Check className="size-4" aria-hidden="true" />{t("approve")}
                  </Button>
                </div>
              ) : (
                <Badge variant="outline" className={STATUS_TONE[r.status]}>{t(`status_${r.status}`)}</Badge>
              )}
            </li>
          ))}
        </ul>
      )}

      {list.data && list.data.total > 0 && (
        <PaginationControls
          page={page}
          totalPages={list.data.totalPages}
          total={list.data.total}
          limit={pageSize}
          onPageChange={setPage}
          onLimitChange={(n: number) => { setPageSize(n); setPage(1); }}
        />
      )}

      <Dialog open={decision !== null} onOpenChange={(open) => { if (!open && !decide.isPending) { setDecision(null); setNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision?.action === "approve"
                ? t("approveTitle", { name: decision.row.customerName ?? t("deletedAccount"), plan: decision.row.toPlanName })
                : t("declineTitle", { plan: decision?.row.toPlanName ?? "" })}
            </DialogTitle>
            <DialogDescription>
              {decision?.action === "approve"
                ? decision.row.toPlanPrice > 0
                  ? t("approveBodyPaid", { price: formatCurrency(decision.row.toPlanPrice, decision.row.toPlanCurrency, "code") })
                  : t("approveBodyFree")
                : t("declineBody")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="upgrade-note">{t("noteLabel")}</Label>
            <Textarea id="upgrade-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" disabled={decide.isPending} onClick={() => { setDecision(null); setNote(""); }}>{t("cancel")}</Button>
            <Button
              variant={decision?.action === "decline" ? "destructive" : "default"}
              disabled={decide.isPending}
              onClick={() => decision && decide.mutate({ id: decision.row._id, action: decision.action, note })}
            >
              {decide.isPending ? t("saving") : decision?.action === "approve" ? t("approveConfirm") : t("declineConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
